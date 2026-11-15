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

afterEach(() => cleanup());

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
  it("renders the recent game hero without fabricated in-game progress", async () => {
    renderWithProviders(<HomePage />);

    expect(await screen.findByRole("heading", { level: 1, name: "月影工房" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /启动游戏/ })).toBeInTheDocument();
    expect(screen.queryByText(/攻略进度|第 6 章|42%/)).not.toBeInTheDocument();
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

    await user.click(screen.getByRole("button", { name: "编辑资料" }));
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

  it("opens the launch configuration with executable, arguments and wrapper fields", async () => {
    renderWithProviders(
      <Routes>
        <Route path="/work/:id" element={<WorkDetailPage />} />
      </Routes>,
      ["/work/moonlit-atelier?tab=launch"],
    );

    expect(await screen.findByLabelText("可执行文件")).toHaveValue("D:\\Games\\月影工房\\game.exe");
    expect(screen.getByLabelText("工作目录")).toBeInTheDocument();
    expect(screen.getByLabelText("包装器程序（可选）")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /保存并启动/ })).toBeInTheDocument();
  });

  it("focuses the first edit field and closes the dialog with Escape", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/work/:id" element={<WorkDetailPage />} />
      </Routes>,
      ["/work/moonlit-atelier"],
    );

    await user.click(await screen.findByRole("button", { name: "编辑资料" }));
    const title = await screen.findByLabelText("标题");
    await waitFor(() => expect(title).toHaveFocus());
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
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
