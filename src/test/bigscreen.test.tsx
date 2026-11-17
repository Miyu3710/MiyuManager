import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAppearance } from "../app/useAppearance";
import { BigScreenPage } from "../features/bigscreen/BigScreenPage";

afterEach(() => {
  cleanup();
  useAppearance.setState({ bigScreenHints: true });
});

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
    expect(hint?.textContent).toContain("LT/RT");
    expect(hint?.textContent).toContain("SELECT");
    expect(hint?.textContent).not.toContain("X");
  });

  it("keeps only the clock in the big-screen topbar", async () => {
    renderBigScreen();
    await screen.findByRole("heading", { level: 1, name: "月影工房" });
    const topbar = document.querySelector(".bigscreen-topbar");
    expect(topbar).not.toBeNull();
    expect(topbar?.textContent).toMatch(/\d{2}:\d{2}/);
    expect(topbar?.textContent).not.toContain("馆藏");
    expect(topbar?.textContent).not.toContain("本周");
    expect(topbar?.textContent).not.toContain("手柄已连接");
    expect(topbar?.textContent).not.toContain("键盘模式");
  });

  it("keeps the shelf count beside the heading and marks the current cover", async () => {
    renderBigScreen();
    await screen.findByRole("heading", { level: 1, name: "月影工房" });

    const categoryButtons = document.querySelectorAll(".bigscreen-rail__item");
    expect(categoryButtons[0]).toHaveAttribute("data-category-id", "all");
    expect(categoryButtons[0]).toHaveAccessibleName("全部游戏");

    const shelfHead = document.querySelector(".bigscreen-shelf__head");
    const count = shelfHead?.querySelector(".bigscreen-shelf__count");
    expect(shelfHead?.querySelector("h2")?.nextElementSibling).toBe(count);
    expect(count).toHaveTextContent(/\d+ 部作品/);
    expect(document.querySelector(".bigscreen-shelf__inner")).not.toBeNull();

    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute("data-bigscreen-focus", "shelf-1"),
    );
    const selected = document.querySelector(".bigscreen-card.is-selected");
    expect(selected).toHaveAttribute("aria-current", "true");
  });

  it("keeps the shelf on vertical arrows and reaches the rail with Tab", async () => {
    const user = userEvent.setup();
    renderBigScreen();
    await screen.findByRole("heading", { level: 1, name: "月影工房" });

    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute("data-bigscreen-focus", "shelf-1"),
    );
    await user.keyboard("{ArrowUp}");
    expect(document.activeElement).toHaveAttribute("data-bigscreen-focus", "shelf-1");
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toHaveAttribute("data-bigscreen-focus", "shelf-2");
    await user.keyboard("{Tab}");
    expect(document.activeElement).toHaveAttribute("data-bigscreen-focus", "category-recent");
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toHaveAttribute("data-bigscreen-focus", "shelf-2");
    expect(document.querySelector('[data-bigscreen-focus="hero-poster"]')).toBeNull();
  });

  it("does not force the focused cover to the scroll row start", async () => {
    const user = userEvent.setup();
    const scrollTo = vi.fn();
    renderBigScreen();
    await screen.findByRole("heading", { level: 1, name: "月影工房" });
    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute("data-bigscreen-focus", "shelf-1"),
    );

    const row = document.querySelector<HTMLElement>(".bigscreen-shelf__row");
    const target = document.querySelector<HTMLElement>('[data-bigscreen-focus="shelf-2"]');
    expect(row).not.toBeNull();
    expect(target).not.toBeNull();
    row!.scrollTo = scrollTo;
    row!.getBoundingClientRect = () =>
      ({ left: 0, right: 600, top: 0, bottom: 300, width: 600, height: 300 }) as DOMRect;
    target!.getBoundingClientRect = () =>
      ({ left: 700, right: 900, top: 0, bottom: 300, width: 200, height: 300 }) as DOMRect;
    target!.scrollIntoView = vi.fn();

    await user.keyboard("{ArrowRight}");
    await waitFor(() => expect(document.activeElement).toBe(target));
    await new Promise((resolve) => window.setTimeout(resolve, 60));
    expect(scrollTo).not.toHaveBeenCalled();
    expect(target!.scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
  });

  it("switches categories as soon as a rail item receives selection focus", async () => {
    const user = userEvent.setup();
    renderBigScreen();
    await screen.findByRole("heading", { level: 1, name: "月影工房" });

    const allGames = screen.getByRole("button", { name: /全部游戏/ });
    await user.click(allGames);
    await waitFor(() => expect(allGames).toHaveAttribute("aria-current", "page"));
    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute("data-bigscreen-focus", "category-all"),
    );
    expect(document.querySelector(".bigscreen-shelf")).toBeInTheDocument();
    expect(screen.queryByText("最近入库")).not.toBeInTheDocument();
  });

  it("changes category while moving in the rail without pressing A", async () => {
    const user = userEvent.setup();
    renderBigScreen();
    await screen.findByRole("heading", { level: 1, name: "月影工房" });

    await user.keyboard("{Tab}");
    expect(document.activeElement).toHaveAttribute("data-bigscreen-focus", "category-recent");
    await user.keyboard("{ArrowDown}");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /在玩/ })).toHaveAttribute("aria-current", "page"),
    );
    expect(document.activeElement).toHaveAttribute("data-bigscreen-focus", "category-playing");
  });

  it("reveals launch from the selected shelf cover without opening the menu", async () => {
    const user = userEvent.setup();
    renderBigScreen();
    await screen.findByRole("heading", { level: 1, name: "月影工房" });

    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute("data-bigscreen-focus", "shelf-1"),
    );
    expect(document.querySelector('[data-bigscreen-focus="hero-launch"]')).toBeNull();
    expect(screen.queryByRole("button", { name: /游戏详情/ })).not.toBeInTheDocument();

    await user.keyboard("{Enter}");
    const launch = await screen.findByRole("button", { name: /启动游戏/ });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(launch).toHaveAttribute("data-bigscreen-focus", "hero-launch");
    await waitFor(() => expect(document.activeElement).toBe(launch));
    const shelf = document.querySelector(".bigscreen-shelf");
    expect(shelf).toHaveClass("is-collapsed");
    expect(shelf).toHaveAttribute("aria-hidden", "true");
    expect(shelf).toHaveAttribute("inert");
    expect(document.querySelector('[data-bigscreen-focus^="shelf-"]')).toBeNull();
    expect(document.querySelector(".bigscreen-hint")?.textContent).toContain("A 启动游戏");
    expect(document.querySelector(".bigscreen-hint")?.textContent).not.toContain("LT/RT");

    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute("data-bigscreen-focus", "shelf-1"),
    );
    expect(shelf).not.toHaveClass("is-collapsed");
    expect(shelf).not.toHaveAttribute("inert");
    expect(document.querySelector(".bigscreen-hint")?.textContent).toContain("LT/RT");
  });

  it("locks the D-pad on the launch action until it is dismissed", async () => {
    const user = userEvent.setup();
    renderBigScreen();
    await screen.findByRole("heading", { level: 1, name: "月影工房" });
    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute("data-bigscreen-focus", "shelf-1"),
    );

    await user.keyboard("{Enter}");
    const launch = await screen.findByRole("button", { name: /启动游戏/ });
    await waitFor(() => expect(document.activeElement).toBe(launch));

    for (const key of ["{ArrowUp}", "{ArrowDown}", "{ArrowLeft}", "{ArrowRight}", "q", "e"]) {
      await user.keyboard(key);
      expect(document.activeElement).toBe(launch);
    }
    expect(document.querySelector(".bigscreen-shelf")).toHaveClass("is-collapsed");

    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute("data-bigscreen-focus", "shelf-1"),
    );
  });

  it("hides the bottom key legend when the setting is off", async () => {
    useAppearance.setState({ bigScreenHints: false });
    renderBigScreen();
    await screen.findByRole("heading", { level: 1, name: "月影工房" });
    expect(document.querySelector(".bigscreen-hint")).toBeNull();
  });

  it("opens search and accepts on-screen keyboard input", async () => {
    const user = userEvent.setup();
    renderBigScreen();
    await screen.findByRole("heading", { level: 1, name: "月影工房" });
    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute("data-bigscreen-focus", "shelf-1"),
    );

    await user.keyboard("f");
    const dialog = await screen.findByRole("dialog", { name: "搜索作品" });
    expect(within(dialog).queryByRole("textbox")).not.toBeInTheDocument();
    const firstKey = within(dialog).getByRole("button", { name: "1" });
    const queryView = dialog.querySelector(".bigscreen-search__query");
    await waitFor(() => expect(document.activeElement).toBe(firstKey));
    expect(queryView).toHaveTextContent("输入作品名");
    expect(within(dialog).getByRole("button", { name: "退格，X" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "空格，Y" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "清空，RB" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "关闭，B" })).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "N" }));
    expect(queryView).toHaveTextContent("N");
    await user.click(within(dialog).getByRole("button", { name: /退格/ }));
    expect(queryView).toHaveTextContent("输入作品名");

    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "搜索作品" })).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute("data-bigscreen-focus", "shelf-1"),
    );
  });

  it("filters the current shelf and replaces the category label", async () => {
    const user = userEvent.setup();
    renderBigScreen();
    await screen.findByRole("heading", { level: 1, name: "月影工房" });
    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute("data-bigscreen-focus", "shelf-1"),
    );

    await user.keyboard("f");
    const dialog = await screen.findByRole("dialog", { name: "搜索作品" });
    for (const key of ["L", "U", "N", "A", "R"]) {
      await user.click(within(dialog).getByRole("button", { name: key }));
    }

    await waitFor(() =>
      expect(document.querySelector("#bigscreen-shelf-title")).toHaveTextContent(
        "“LUNAR”的搜索结果",
      ),
    );
    expect(document.querySelectorAll(".bigscreen-card")).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "月影工房" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "搜索作品" })).not.toBeInTheDocument(),
    );
    expect(document.querySelector("#bigscreen-shelf-title")).toHaveTextContent("“LUNAR”的搜索结果");
  });

  it("keeps an empty search after closing the keyboard", async () => {
    const user = userEvent.setup();
    renderBigScreen();
    await screen.findByRole("heading", { level: 1, name: "月影工房" });
    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute("data-bigscreen-focus", "shelf-1"),
    );

    await user.keyboard("f");
    const dialog = await screen.findByRole("dialog", { name: "搜索作品" });
    for (const key of ["Z", "Z", "Z"]) {
      await user.click(within(dialog).getByRole("button", { name: key }));
    }
    await waitFor(() =>
      expect(document.querySelector(".bigscreen-state--empty")).toHaveTextContent("没有找到作品"),
    );

    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "搜索作品" })).not.toBeInTheDocument(),
    );

    expect(document.querySelector(".bigscreen-state--empty")).toHaveTextContent("没有找到作品");
    expect(document.querySelector(".bigscreen-state--empty")).toHaveTextContent("“ZZZ”");
    expect(document.querySelector(".bigscreen-rail__item.is-active")).toHaveAttribute(
      "data-category-id",
      "recent",
    );
    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute("data-bigscreen-focus", "empty-all"),
    );

    await user.keyboard("f");
    const reopened = await screen.findByRole("dialog", { name: "搜索作品" });
    expect(reopened.querySelector(".bigscreen-search__query")).toHaveTextContent("ZZZ");
  });

  it("keeps search results when the keyboard closes from the category rail", async () => {
    const user = userEvent.setup();
    renderBigScreen();
    await screen.findByRole("heading", { level: 1, name: "月影工房" });

    await user.click(screen.getByRole("button", { name: "最近启动" }));
    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute("data-bigscreen-focus", "category-recent"),
    );

    await user.keyboard("f");
    const dialog = await screen.findByRole("dialog", { name: "搜索作品" });
    for (const key of ["L", "U", "N", "A", "R"]) {
      await user.click(within(dialog).getByRole("button", { name: key }));
    }
    await waitFor(() =>
      expect(document.querySelector("#bigscreen-shelf-title")).toHaveTextContent(
        "“LUNAR”的搜索结果",
      ),
    );

    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "搜索作品" })).not.toBeInTheDocument(),
    );

    expect(document.querySelector("#bigscreen-shelf-title")).toHaveTextContent("“LUNAR”的搜索结果");
    expect(document.querySelector(".bigscreen-rail__item.is-active")).toHaveAttribute(
      "data-category-id",
      "recent",
    );
    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute("data-bigscreen-focus", "shelf-1"),
    );
  });

  it("opens search from the controller Select button", async () => {
    const originalGetGamepads = navigator.getGamepads;
    const pressedButtons = new Set<number>();
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: () => [
        {
          id: "Fake Select Controller",
          index: 0,
          connected: true,
          mapping: "standard",
          axes: [0, 0, 0, 0],
          buttons: Array.from({ length: 17 }, (_, index) => {
            const down = pressedButtons.has(index);
            return { pressed: down, touched: down, value: down ? 1 : 0 };
          }),
        },
      ],
    });

    try {
      renderBigScreen();
      await screen.findByRole("heading", { level: 1, name: "月影工房" });
      pressedButtons.add(8);
      const dialog = await screen.findByRole("dialog", { name: "搜索作品" });
      expect(within(dialog).queryByRole("textbox")).not.toBeInTheDocument();
      await waitFor(() =>
        expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "1" })),
      );
      pressedButtons.delete(8);

      const user = userEvent.setup();
      const queryView = dialog.querySelector(".bigscreen-search__query");
      await user.click(within(dialog).getByRole("button", { name: "N" }));
      expect(queryView).toHaveTextContent("N");

      pressedButtons.add(2);
      await waitFor(() => expect(queryView).toHaveTextContent("输入作品名"));
      pressedButtons.delete(2);

      await user.click(within(dialog).getByRole("button", { name: "N" }));
      pressedButtons.add(3);
      await waitFor(() => expect(queryView?.textContent).toBe("N "));
      pressedButtons.delete(3);

      pressedButtons.add(5);
      await waitFor(() => expect(queryView).toHaveTextContent("输入作品名"));
      pressedButtons.delete(5);
    } finally {
      if (originalGetGamepads) {
        Object.defineProperty(navigator, "getGamepads", {
          configurable: true,
          value: originalGetGamepads,
        });
      } else {
        delete (navigator as { getGamepads?: unknown }).getGamepads;
      }
    }
  });

  it("opens the Y game menu, supports its status view, and restores focus on close", async () => {
    const user = userEvent.setup();
    renderBigScreen();
    await screen.findByRole("heading", { level: 1, name: "月影工房" });
    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute("data-bigscreen-focus", "shelf-1"),
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
      expect(document.activeElement).toHaveAttribute("data-bigscreen-focus", "shelf-1"),
    );
  });

  it("opens the Start control menu with the five actions", async () => {
    const user = userEvent.setup();
    renderBigScreen();
    await screen.findByRole("heading", { level: 1, name: "月影工房" });

    await user.keyboard("x");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "大屏控制菜单" })).not.toBeInTheDocument();

    await user.keyboard("m");
    expect(await screen.findByRole("dialog", { name: "大屏控制菜单" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "返回" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "刷新游戏库" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "隐藏按键提示" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "退出大屏幕模式" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "关闭 Miyu" })).toBeInTheDocument();
    expect(screen.queryByText("显示器")).not.toBeInTheDocument();
    expect(screen.queryByText("手柄")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute("data-bigscreen-focus", "control-back"),
    );

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(document.querySelector(".bigscreen-control")).toHaveClass("is-closing");
      expect(document.querySelector(".bigscreen-control-backdrop")).toHaveClass("is-closing");
    });
    expect(screen.getByRole("dialog", { name: "大屏控制菜单" })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "大屏控制菜单" })).not.toBeInTheDocument(),
    );
  });

  it("toggles the key legend from the control menu", async () => {
    const user = userEvent.setup();
    renderBigScreen();
    await screen.findByRole("heading", { level: 1, name: "月影工房" });
    expect(document.querySelector(".bigscreen-hint")).not.toBeNull();

    await user.keyboard("m");
    await screen.findByRole("dialog", { name: "大屏控制菜单" });
    await user.click(screen.getByRole("button", { name: "隐藏按键提示" }));

    await waitFor(() => expect(document.querySelector(".bigscreen-hint")).toBeNull());
    expect(useAppearance.getState().bigScreenHints).toBe(false);
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "大屏控制菜单" })).not.toBeInTheDocument(),
    );
  });

  it("asks before closing Miyu", async () => {
    const user = userEvent.setup();
    renderBigScreen();
    await screen.findByRole("heading", { level: 1, name: "月影工房" });

    await user.keyboard("m");
    await screen.findByRole("dialog", { name: "大屏控制菜单" });
    await user.click(screen.getByRole("button", { name: "关闭 Miyu" }));

    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute("data-bigscreen-focus", "control-quit-cancel"),
    );
    expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "关闭 Miyu" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute("data-bigscreen-focus", "control-back"),
    );
    expect(screen.getByRole("dialog", { name: "大屏控制菜单" })).toBeInTheDocument();
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
