import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScanImportDialog } from "../features/library/ScanImportDialog";
import type { ScanView } from "../features/library/useLibraryScan";
import type { ScanCandidate } from "../lib/library-types";

afterEach(() => cleanup());

const baseCandidate = {
  fileSizeBytes: 120_000,
  sizeBytes: 2_400_000,
  sizeIsEstimate: false,
  confidence: "high" as const,
  reason: "常见主程序名 · 目录含游戏资源",
  alreadyImported: false,
};

const candidates: ScanCandidate[] = [
  {
    ...baseCandidate,
    id: "candidate-1",
    exeKey: "candidate-1",
    exePath: "C:\\Games\\月影工房\\game.exe",
    workingDir: "C:\\Games\\月影工房",
    rootPath: "C:\\Games",
    suggestedTitle: "月影工房",
  },
  {
    ...baseCandidate,
    id: "candidate-2",
    exeKey: "candidate-2",
    exePath: "C:\\Games\\海边的咖啡露台\\game.exe",
    workingDir: "C:\\Games\\海边的咖啡露台",
    rootPath: "C:\\Games",
    suggestedTitle: "海边的咖啡露台",
  },
  {
    ...baseCandidate,
    id: "candidate-3",
    exeKey: "candidate-3",
    exePath: "C:\\Games\\月影工房\\game_zh.exe",
    workingDir: "C:\\Games\\月影工房",
    rootPath: "C:\\Games",
    suggestedTitle: "月影工房 汉化版",
  },
  {
    ...baseCandidate,
    id: "candidate-4",
    exeKey: "candidate-4",
    exePath: "C:\\Games\\旧档案\\old.exe",
    workingDir: "C:\\Games\\旧档案",
    rootPath: "C:\\Games",
    suggestedTitle: "旧档案",
    alreadyImported: true,
  },
];

const reviewState: ScanView = {
  status: "review",
  rootPath: "C:\\Games",
  candidates,
  cancelled: false,
  stats: null,
};

describe("scan import dialog", () => {
  it("keeps selection and name edits stable when toggling checkboxes", async () => {
    const user = userEvent.setup();
    const onImport = vi.fn();
    render(
      <ScanImportDialog
        state={reviewState}
        importing={false}
        onCancel={vi.fn()}
        onClose={vi.fn()}
        onRetry={vi.fn()}
        onPickAnother={vi.fn()}
        onImport={onImport}
      />,
    );

    const first = screen.getByRole("checkbox", { name: "选择 月影工房" });
    const second = screen.getByRole("checkbox", { name: "选择 海边的咖啡露台" });
    expect(first).not.toBeChecked();
    expect(second).not.toBeChecked();
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes.at(-1)).toHaveAccessibleName("选择 旧档案");
    expect(boxes.at(-1)).toBeDisabled();
    await user.click(first);
    expect(first).toBeChecked();
    await user.click(first);
    expect(first).not.toBeChecked();

    await user.click(first);
    await user.click(second);
    await user.click(second);
    const name = screen.getByRole("textbox", { name: "显示名称 月影工房" });
    await user.clear(name);
    await user.type(name, "月影工房 汉化版");
    await user.selectOptions(screen.getByRole("combobox", { name: "主程序 月影工房" }), "1");
    await user.click(screen.getByRole("button", { name: /导入选中/ }));

    expect(onImport).toHaveBeenCalledTimes(1);
    expect(onImport.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({
        exePath: "C:\\Games\\月影工房\\game_zh.exe",
        displayName: "月影工房 汉化版",
      }),
    ]);
  });
});
