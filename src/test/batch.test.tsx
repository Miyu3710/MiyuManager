import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BatchScrapeDialog } from "../features/metadata/BatchScrapeDialog";
import type { BatchApplyResult, BatchWorkResult, MergePreview } from "../lib/library-types";
import { previewMetadataBatchForUi } from "../lib/library-api";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function previewFor(index: number): MergePreview {
  const title = `测试作品 ${index + 1}`;
  return {
    workId: index + 1,
    title,
    query: title,
    matched: [
      {
        provider: "vndb",
        providerName: "VNDB",
        sourceId: `v${index + 1}`,
        title,
        originalTitle: title,
        year: 2020,
        score: 1,
        priority: 10,
      },
    ],
    errors: [],
    fields: [
      {
        field: "title",
        label: "标题",
        current: "",
        candidates: [
          {
            provider: "vndb",
            providerName: "VNDB",
            sourceId: `v${index + 1}`,
            value: title,
            priority: 10,
          },
        ],
        defaultSelected: true,
        conflict: false,
      },
    ],
    covers: [
      {
        provider: "vndb",
        providerName: "VNDB",
        sourceId: `v${index + 1}`,
        url: `https://example.com/${index + 1}.jpg`,
        kind: "cover",
        priority: 10,
        defaultSelected: true,
      },
    ],
  };
}

const proposals: BatchWorkResult[] = Array.from({ length: 50 }, (_, index) => ({
  jobId: "preview-batch",
  workId: index + 1,
  title: `测试作品 ${index + 1}`,
  status: "proposed",
  preview: previewFor(index),
  error: null,
}));

const applyResult: BatchApplyResult = {
  total: 50,
  appliedWorks: 50,
  failedWorks: 0,
  skippedWorks: 0,
  appliedFields: 50,
  coverApplied: 50,
  works: proposals.map((proposal) => ({
    workId: proposal.workId,
    title: proposal.title,
    status: "applied",
    applied: ["title"],
    skippedNonEmpty: [],
    coverApplied: true,
    errors: [],
  })),
};

vi.mock("../lib/library-api", () => ({
  listMetadataProviders: vi.fn(async () => [
    {
      id: "vndb",
      name: "VNDB",
      description: "测试来源",
      fields: ["title", "cover"],
      priority: 10,
      enabled: true,
      requiresAuth: false,
      authKind: "none",
      connected: true,
      accountName: null,
    },
  ]),
  previewMetadataBatchForUi: vi.fn(async () => proposals),
  startMetadataBatch: vi.fn(async () => ({ jobId: "preview-batch" })),
  pauseMetadataBatch: vi.fn(async () => true),
  cancelMetadataBatch: vi.fn(async () => true),
  applyMetadataBatch: vi.fn(async () => applyResult),
}));

describe("batch scraping dialog", () => {
  it("keeps 50 proposals operable and applies them", async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <BatchScrapeDialog
          open
          workIds={Array.from({ length: 50 }, (_, index) => index + 1)}
          onClose={() => undefined}
          onApplied={() => undefined}
        />
      </QueryClientProvider>,
    );

    await screen.findByText("批量补全元数据");
    await user.click(screen.getByRole("button", { name: "开始匹配" }));
    await waitFor(() => expect(document.querySelectorAll(".batch-work")).toHaveLength(50));
    expect(document.querySelector(".batch-review__summary")?.textContent).toContain("50 部有提案");
    await user.click(screen.getByRole("button", { name: "应用 50 部" }));
    await screen.findByText("已应用 50 部作品");
  });

  it("retries only the failed works", async () => {
    const user = userEvent.setup();
    const batchPreview = vi.mocked(previewMetadataBatchForUi);
    batchPreview.mockResolvedValueOnce([
      proposals[0]!,
      {
        jobId: "preview-batch",
        workId: 2,
        title: "失败作品",
        status: "failed",
        preview: null,
        error: "来源暂时不可用",
      },
    ]);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <BatchScrapeDialog
          open
          workIds={[1, 2]}
          onClose={() => undefined}
          onApplied={() => undefined}
        />
      </QueryClientProvider>,
    );

    await screen.findByText("批量补全元数据");
    await user.click(screen.getByRole("button", { name: "开始匹配" }));
    await waitFor(() => expect(document.querySelectorAll(".batch-work")).toHaveLength(2));
    expect(screen.getByText("来源暂时不可用")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "重试失败项" }));
    await waitFor(() => expect(batchPreview).toHaveBeenLastCalledWith([2], expect.any(Array)));
  });
});
