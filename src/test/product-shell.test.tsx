import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { AppShell } from "../app/AppShell";
import { CollectionsPage } from "../features/collections/CollectionsPage";
import { OnboardingPage } from "../features/onboarding/OnboardingPage";

afterEach(() => {
  cleanup();
  window.localStorage.removeItem("miyu-preferences-preview");
  window.localStorage.removeItem("miyu-recent-searches");
});

function renderWithProviders(children: ReactNode, initialEntries: string[] = ["/"]) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("C8 product shell", () => {
  it("creates a collection and opens it", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/collections" element={<CollectionsPage />} />
        <Route path="/collections/:id" element={<CollectionsPage />} />
      </Routes>,
      ["/collections"],
    );

    expect(await screen.findByRole("heading", { level: 1, name: "收藏集" })).toBeInTheDocument();
    expect(await screen.findByText("深夜推荐")).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: /新建收藏集/ })[0]!);
    const name = await screen.findByLabelText("收藏集名称");
    await user.type(name, "测试收藏集");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "测试收藏集" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /添加作品/ }).length).toBeGreaterThan(0);
  });

  it("opens global search with Ctrl+K and navigates to a work", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<div>home content</div>} />
          <Route path="work/:id" element={<div>work detail content</div>} />
        </Route>
      </Routes>,
    );

    await user.keyboard("{Control>}k{/Control}");
    const input = await screen.findByRole("combobox", { name: "全局搜索" });
    await waitFor(() => expect(input).toHaveFocus());
    await user.type(input, "月影");
    const option = await screen.findByRole("option", { name: /月影工房/ });
    await user.click(option);

    expect(await screen.findByText("work detail content")).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem("miyu-recent-searches") ?? "[]")).toContain(
      "月影",
    );
  });

  it("completes the first-run flow with the mock library", async () => {
    const user = userEvent.setup();
    renderWithProviders(<OnboardingPage />, ["/onboarding"]);

    await user.click(await screen.findByRole("button", { name: /开始设置/ }));
    await user.click(screen.getByRole("button", { name: /选择目录并扫描/ }));

    const importButton = await screen.findByRole(
      "button",
      { name: /确认并导入/ },
      { timeout: 4000 },
    );
    await user.click(importButton);
    expect(
      await screen.findByRole("heading", { name: "选择要启用的来源" }, { timeout: 3000 }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "稍后设置来源" }));
    expect(
      await screen.findByRole("heading", { name: "游戏库已经准备好了" }, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(window.localStorage.getItem("miyu-preferences-preview")).toContain(
      '"onboardingCompleted":true',
    );
  });
});
