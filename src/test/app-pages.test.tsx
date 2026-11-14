import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { HomePage } from "../features/home/HomePage";
import { LibraryPage } from "../features/library/LibraryPage";

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
});
