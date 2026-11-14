import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { HomePage } from "../features/home/HomePage";
import { LibraryPage } from "../features/library/LibraryPage";

afterEach(() => cleanup());

describe("main app pages", () => {
  it("renders the recent game hero without fabricated in-game progress", () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { level: 1, name: "月影工房" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /启动游戏/ })).toBeInTheDocument();
    expect(screen.queryByText(/攻略进度|第 6 章|42%/)).not.toBeInTheDocument();
  });

  it("filters the library from a URL query", async () => {
    render(
      <MemoryRouter initialEntries={["/library?q=星屑"]}>
        <LibraryPage />
      </MemoryRouter>,
    );

    expect((await screen.findAllByRole("heading", { name: "星屑唱片" })).length).toBeGreaterThan(0);
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "月影工房" })).not.toBeInTheDocument(),
    );
  });
});
