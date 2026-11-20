import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { HomePage } from "../features/home/HomePage";
import { LibraryPage } from "../features/library/LibraryPage";
import { WorkDetailPage } from "../features/work-detail/WorkDetailPage";
import { CoverArt } from "../design-system/components/CoverArt";
import { StatsPage } from "../features/stats/StatsPage";
import { ScreenshotsPage } from "../features/screenshots/ScreenshotsPage";

afterEach(() => {
  cleanup();
  window.localStorage.removeItem("miyu-recent-searches");
  window.localStorage.removeItem("miyu-preferences-preview");
});

function renderWithProviders(children: ReactNode, initialEntries: string[] = ["/"]) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("main app pages", () => {
  it("opens the shared work context menu from home posters and library cards", async () => {
    const home = renderWithProviders(<HomePage />);
    await screen.findByRole("heading", { level: 2, name: "月影工房" });
    const shelfCard = home.container.querySelector(".home-shelf-card");
    expect(shelfCard).not.toBeNull();

    fireEvent.contextMenu(shelfCard!);
    expect(await screen.findByRole("menu", { name: /操作$/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /在文件夹中显示/ })).toBeInTheDocument();
    home.unmount();

    const library = renderWithProviders(<LibraryPage />, ["/library"]);
    await screen.findByRole("heading", { level: 1, name: "游戏库" });
    const libraryCard = await waitFor(() => {
      const card = library.container.querySelector(".library-card");
      expect(card).not.toBeNull();
      return card!;
    });

    fireEvent.contextMenu(libraryCard);
    expect(await screen.findByRole("menu", { name: /操作$/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /标记为/ })).toBeInTheDocument();
  });

  it("renders the recent game hero without fabricated in-game progress", async () => {
    renderWithProviders(<HomePage />);

    expect(await screen.findByRole("heading", { level: 1, name: "首页" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { level: 2, name: "月影工房" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /启动游戏/ })).toBeInTheDocument();
    expect(screen.queryByText(/攻略进度|第 6 章|42%/)).not.toBeInTheDocument();
  });

  it("shows recent searches in an inline list instead of a dialog", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("miyu-recent-searches", JSON.stringify(["月影", "白昼"]));
    renderWithProviders(<HomePage />);

    await screen.findByRole("heading", { level: 2, name: "月影工房" });
    const search = await screen.findByRole("combobox", {
      name: "搜索游戏、别名、标签或收藏集",
    });
    await user.click(search);

    expect(await screen.findByRole("listbox", { name: "搜索历史与结果" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "月影" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "删除搜索记录：月影" }));
    await waitFor(() =>
      expect(screen.queryByRole("option", { name: "月影" })).not.toBeInTheDocument(),
    );
    expect(JSON.parse(window.localStorage.getItem("miyu-recent-searches") ?? "[]")).toEqual([
      "白昼",
    ]);

    await user.click(screen.getByRole("button", { name: "清除全部搜索历史" }));
    await waitFor(() => expect(screen.queryByRole("option")).not.toBeInTheDocument());
    expect(JSON.parse(window.localStorage.getItem("miyu-recent-searches") ?? "[]")).toEqual([]);
  });

  it("filters the library from a URL query", async () => {
    renderWithProviders(<LibraryPage />, ["/library?q=星屑"]);

    expect((await screen.findAllByRole("heading", { name: "星屑唱片" })).length).toBeGreaterThan(0);
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "月影工房" })).not.toBeInTheDocument(),
    );
  });

  it("renders the detail page and edits local work metadata", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/work/:id" element={<WorkDetailPage />} />
      </Routes>,
      ["/work/moonlit-atelier"],
    );

    expect(await screen.findByRole("heading", { level: 1, name: "月影工房" })).toBeInTheDocument();
    expect(screen.getAllByText(/月影のアトリエ/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /启动游戏/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "编辑游戏资料" }));
    const title = await screen.findByLabelText("标题");
    await user.clear(title);
    await user.type(title, "月影工房 修改版");
    await user.click(screen.getByRole("button", { name: "保存资料" }));

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { level: 1, name: "月影工房 修改版" }),
      ).toBeInTheDocument(),
    );
  });

  it("auto-saves the launch configuration without footer actions", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/work/:id" element={<WorkDetailPage />} />
      </Routes>,
      ["/work/moonlit-atelier?tab=launch"],
    );

    expect(await screen.findByLabelText("可执行文件")).toHaveValue("game.exe");
    expect(screen.getByLabelText("游戏目录")).toHaveValue("D:\\Games\\月影工房");
    expect(screen.getByLabelText("游戏参数")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "启用 Locale Emulator" })).toBeDisabled();
    expect(screen.getByRole("switch", { name: "启用 Magpie" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "保存配置" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "保存并启动" })).not.toBeInTheDocument();
    expect(screen.queryByText("自动保存")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("游戏参数"), "-window");
    expect(await screen.findByText("已保存")).toBeInTheDocument();
  });

  it("enables Locale Emulator and Magpie independently", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      "miyu-preferences-preview",
      JSON.stringify({
        proxyMode: "system",
        proxyUrl: "",
        defaultMonitor: null,
        launchFullscreen: false,
        wrappers: [
          { id: "locale-emulator", path: "C:\\Tools\\LEProc.exe", args: [] },
          { id: "magpie", path: "C:\\Tools\\Magpie.exe", args: ["-t"] },
        ],
        autoUpdateCheck: true,
        updateManifestUrl: "",
        onboardingCompleted: true,
      }),
    );
    renderWithProviders(
      <Routes>
        <Route path="/work/:id" element={<WorkDetailPage />} />
      </Routes>,
      ["/work/moonlit-atelier?tab=launch"],
    );

    const localeEmulator = await screen.findByRole("switch", { name: "启用 Locale Emulator" });
    const magpie = screen.getByRole("switch", { name: "启用 Magpie" });
    expect(localeEmulator).toBeEnabled();
    expect(magpie).toBeEnabled();

    await user.click(localeEmulator);
    expect(localeEmulator).toHaveAttribute("aria-checked", "true");
    expect(magpie).toHaveAttribute("aria-checked", "false");

    await user.click(magpie);
    expect(magpie).toHaveAttribute("aria-checked", "true");
    expect(await screen.findByText(/先由 Locale Emulator 启动游戏/)).toBeInTheDocument();
  });

  it("renders real-shaped playtime stats and changes the reporting period", async () => {
    const user = userEvent.setup();
    renderWithProviders(<StatsPage />);

    expect(await screen.findByRole("heading", { level: 1, name: "统计" })).toBeInTheDocument();
    expect(screen.getByText("累计游玩")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "最近 18 周" })).toBeInTheDocument();
    expect(screen.getAllByText(/月影工房/).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "历史动态" })).toBeInTheDocument();

    const importFilter = screen.getByRole("button", { name: /^入库/ });
    await user.click(importFilter);
    expect(importFilter).toHaveAttribute("aria-pressed", "true");
    await waitFor(() =>
      expect(document.querySelectorAll(".stats-timeline__event").length).toBe(10),
    );

    await user.click(screen.getByRole("tab", { name: "本周" }));
    expect(screen.getByRole("tab", { name: "本周" })).toHaveAttribute("aria-selected", "true");
  });

  it("opens play history and backfills a manual session", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/work/:id" element={<WorkDetailPage />} />
      </Routes>,
      ["/work/moonlit-atelier?tab=sessions"],
    );

    expect(await screen.findByRole("heading", { name: "游玩记录" })).toBeInTheDocument();
    expect(screen.queryByText(/C6 接入/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /补录会话/ }));
    expect(screen.getByLabelText("开始时间")).toBeInTheDocument();
    await user.type(screen.getByLabelText("备注"), "补录测试");
    await user.click(screen.getByRole("button", { name: /保存补录/ }));

    expect(await screen.findByText("补录测试")).toBeInTheDocument();
    expect(screen.getByText("手动补录")).toBeInTheDocument();
  });

  it("shows the empty screenshot gallery and per-game screenshot tab", async () => {
    renderWithProviders(<ScreenshotsPage />, ["/screenshots"]);
    expect(await screen.findByRole("heading", { level: 1, name: "图库" })).toBeInTheDocument();
    expect(await screen.findByText("图库还是空的")).toBeInTheDocument();
    expect((await screen.findAllByText(/按 Ctrl\+Shift\+F12/)).length).toBeGreaterThan(0);

    cleanup();
    renderWithProviders(
      <Routes>
        <Route path="/work/:id" element={<WorkDetailPage />} />
      </Routes>,
      ["/work/moonlit-atelier?tab=screenshots"],
    );
    expect(await screen.findByRole("heading", { name: "截图" })).toBeInTheDocument();
    expect(await screen.findByText("还没有截图")).toBeInTheDocument();
  });

  it("opens the inline editor in the sources tab", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/work/:id" element={<WorkDetailPage />} />
      </Routes>,
      ["/work/moonlit-atelier"],
    );

    await user.click(await screen.findByRole("button", { name: "编辑游戏资料" }));
    expect(await screen.findByRole("heading", { name: "封面与资料" })).toBeInTheDocument();
    expect(screen.getByLabelText("标题")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("只修改本地资料，不会改动游戏文件。")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "更换封面" })).toHaveClass("ds-button--secondary");
    expect(screen.getByRole("button", { name: "本地图片" })).toHaveClass("ds-button--secondary");
  });

  it("falls back to the typographic cover when an image fails", async () => {
    const { container } = render(
      <CoverArt
        work={{
          title: "封面损坏的作品",
          originalTitle: "壊れた表紙",
          developer: "测试会社",
          year: 2026,
          cover: null,
          coverUrl: "http://miyu-asset.localhost/covers/missing.webp",
        }}
      />,
    );
    const image = container.querySelector("img");
    expect(image).not.toBeNull();
    fireEvent.error(image as HTMLImageElement);
    expect(screen.getByRole("img", { name: /封面占位/ })).toBeInTheDocument();
  });
});
