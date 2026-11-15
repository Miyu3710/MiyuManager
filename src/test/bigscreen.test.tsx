import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { BigScreenPage } from "../features/bigscreen/BigScreenPage";

afterEach(() => cleanup());

function renderBigScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/big-screen"]}>
        <BigScreenPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("big screen page", () => {
  it("uses the local library hero and the updated control hints", async () => {
    renderBigScreen();

    expect(await screen.findByRole("heading", { level: 1, name: "月影工房" })).toBeInTheDocument();
    expect(screen.getAllByText("最近启动").length).toBeGreaterThan(0);
    expect(screen.queryByText("最近入库")).not.toBeInTheDocument();
    expect(screen.queryByText(/C7 接入|大屏详情抽屉将在/)).not.toBeInTheDocument();
    const hint = document.querySelector(".bigscreen-hint");
    expect(hint).not.toBeNull();
    expect(hint?.textContent).toContain("Y");
    expect(hint?.textContent).toContain("START");
    expect(hint?.textContent).toContain("LB/RB");
    expect(hint?.textContent).not.toContain("X");
  });

  it("moves focus through the category rail, hero and bottom game shelf", async () => {
    const user = userEvent.setup();
    renderBigScreen();
    await screen.findByRole("heading", { level: 1, name: "月影工房" });

    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute("data-bigscreen-focus", "hero-launch"),
    );
    await user.keyboard("{ArrowLeft}");
    expect(document.activeElement).toHaveAttribute("data-bigscreen-focus", "category-recent");
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toHaveAttribute("data-bigscreen-focus", "hero-launch");
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toHaveAttribute("data-bigscreen-focus", "hero-detail");
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toHaveAttribute("data-bigscreen-focus", "hero-cover");
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toHaveAttribute("data-bigscreen-focus", "shelf-1");
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toHaveAttribute("data-bigscreen-focus", "shelf-2");
  });

  it("switches categories from the left rail and focuses the first shelf game", async () => {
    const user = userEvent.setup();
    renderBigScreen();
    await screen.findByRole("heading", { level: 1, name: "月影工房" });

    const allGames = screen.getByRole("button", { name: /全部游戏/ });
    await user.click(allGames);
    await waitFor(() => expect(allGames).toHaveAttribute("aria-current", "page"));
    await waitFor(() =>
      expect(document.activeElement?.getAttribute("data-bigscreen-focus")).toMatch(/^shelf-/),
    );
    expect(document.querySelector(".bigscreen-shelf")).toBeInTheDocument();
    expect(screen.queryByText("最近入库")).not.toBeInTheDocument();
  });

  it("opens the Y game menu, supports its status view, and restores focus on close", async () => {
    const user = userEvent.setup();
    renderBigScreen();
    await screen.findByRole("heading", { level: 1, name: "月影工房" });
    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute("data-bigscreen-focus", "hero-launch"),
    );

    await user.keyboard("c");
    const menu = await screen.findByRole("menu", { name: /月影工房 游戏菜单/ });
    expect(menu).toBeInTheDocument();
    expect(within(menu).getByText("启动游戏")).toBeInTheDocument();
    expect(within(menu).getByText("查看详情")).toBeInTheDocument();
    expect(within(menu).getByText("收藏")).toBeInTheDocument();
    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute("data-bigscreen-focus", "menu-launch"),
    );

    await user.click(screen.getByRole("menuitem", { name: /游玩状态/ }));
    expect(await screen.findByRole("menuitemradio", { name: /在玩/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: /想玩/ })).toBeInTheDocument();
    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute("data-bigscreen-focus", "menu-status-back"),
    );
    await user.keyboard("{Escape}");
    expect(await screen.findByRole("menuitem", { name: "关闭" })).toBeInTheDocument();
    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute("data-bigscreen-focus", "menu-status"),
    );

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute("data-bigscreen-focus", "hero-launch"),
    );
  });

  it("opens the Start control sidebar and keeps X unassigned", async () => {
    const user = userEvent.setup();
    renderBigScreen();
    await screen.findByRole("heading", { level: 1, name: "月影工房" });

    await user.keyboard("x");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "大屏控制菜单" })).not.toBeInTheDocument();

    await user.keyboard("m");
    expect(await screen.findByRole("dialog", { name: "大屏控制菜单" })).toBeInTheDocument();
    expect(screen.getByText("显示器")).toBeInTheDocument();
    expect(screen.getByText("手柄")).toBeInTheDocument();
    expect(screen.getByText("返回主窗口")).toBeInTheDocument();
    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute("data-bigscreen-focus", "control-display-0"),
    );

    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "大屏控制菜单" })).not.toBeInTheDocument(),
    );
  });

  it("shows a readable launch error instead of leaving the page", async () => {
    const user = userEvent.setup();
    renderBigScreen();
    await screen.findByRole("heading", { level: 1, name: "月影工房" });
    await user.keyboard("c");
    await screen.findByRole("menu", { name: /月影工房 游戏菜单/ });
    await user.click(screen.getByRole("menuitem", { name: /启动游戏/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/浏览器预览不启动本地程序/);
    expect(screen.getByRole("heading", { level: 1, name: "月影工房" })).toBeInTheDocument();
  });
});
