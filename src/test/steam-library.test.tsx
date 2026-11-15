import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SteamLibraryDialog } from "../features/library/SteamLibraryDialog";

afterEach(() => cleanup());

describe("Steam library scan dialog", () => {
  it("shows detected Steam games and imports a selected one", async () => {
    const user = userEvent.setup();
    const onImported = vi.fn();
    render(<SteamLibraryDialog open onClose={() => undefined} onImported={onImported} />);

    await screen.findByRole("heading", { name: "选择要入库的 Steam 游戏" }, { timeout: 3000 });
    expect(document.querySelectorAll(".steam-game")).toHaveLength(2);
    expect(screen.getByText("CLANNAD")).toBeInTheDocument();
    expect(screen.getByText("月影工房")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "清空" }));
    await user.click(screen.getByLabelText("选择 CLANNAD"));
    await user.click(screen.getByRole("button", { name: "导入 1 部" }));
    await waitFor(() => expect(screen.getByText("Steam 游戏已入库")).toBeInTheDocument());
    expect(onImported).toHaveBeenCalled();
  });
});
