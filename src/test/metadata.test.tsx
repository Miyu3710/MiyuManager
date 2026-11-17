import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WorkDetailPage } from "../features/work-detail/WorkDetailPage";
import { MetadataSourceSettings } from "../features/settings/MetadataSourceSettings";
import {
  getMetadataWorkState,
  importMetadata,
  resetMetadataPreviewState,
} from "../lib/library-api";

afterEach(() => cleanup());
beforeEach(() => resetMetadataPreviewState());

function renderWithProviders(children: ReactNode, initialEntries: string[] = ["/"]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("metadata sources", () => {
  it("syncs provider IDs after a single-source import", async () => {
    await importMetadata({
      workId: 1,
      provider: "bangumi",
      sourceId: "50756",
      selectedFields: ["release_date"],
      selectedCover: false,
    });

    const state = await getMetadataWorkState(1);
    expect(state.sourceLinks.map((link) => link.provider)).toEqual(
      expect.arrayContaining(["bangumi", "vndb", "steam"]),
    );
  });

  it("searches mock candidates and imports the default empty fields", async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(
      <Routes>
        <Route path="/work/:id" element={<WorkDetailPage />} />
      </Routes>,
      ["/work/moonlit-atelier?tab=sources"],
    );

    await user.click(await screen.findByRole("tab", { name: "搜索导入" }));
    expect(
      await screen.findByPlaceholderText("标题、别名，或 Steam AppID / 商店链接"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "搜索" }));
    await waitFor(() => expect(container.querySelector(".metadata-candidate")).not.toBeNull());
    await user.click(container.querySelector(".metadata-candidate") as HTMLElement);
    await waitFor(() =>
      expect(container.querySelectorAll(".metadata-preview-row").length).toBeGreaterThan(0),
    );

    const importButton = screen.getByRole("button", { name: /导入 \d+ 个字段/ });
    expect(importButton).not.toBeDisabled();
    await user.click(importButton);
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /导入 \d+ 个字段/ })).not.toBeInTheDocument(),
    );
    expect(container.querySelector(".metadata-ledger")).toBeNull();
  });

  it("moves providers in the configured priority order", async () => {
    const user = userEvent.setup();
    renderWithProviders(<MetadataSourceSettings />);

    await waitFor(() => expect(screen.getAllByRole("button", { name: /下移/ }).length).toBe(5));
    const names = () =>
      Array.from(document.querySelectorAll(".settings-source-name b")).map(
        (element) => element.textContent,
      );
    expect(names()).toEqual(["VNDB", "Bangumi", "Kungal / NextMoe", "Hikarinagi", "Steam"]);

    await user.click(screen.getByRole("button", { name: "下移 VNDB" }));
    await waitFor(() =>
      expect(names()).toEqual(["Bangumi", "VNDB", "Kungal / NextMoe", "Hikarinagi", "Steam"]),
    );

    await user.click(screen.getAllByRole("button", { name: "停用" })[0] as HTMLElement);
    await waitFor(() =>
      expect(document.querySelector(".settings-source-state .ds-tag")?.textContent).toBe("停用"),
    );
  });

  it("shows multi-source conflicts and a cover gallery", async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(
      <Routes>
        <Route path="/work/:id" element={<WorkDetailPage />} />
      </Routes>,
      ["/work/moonlit-atelier?tab=sources"],
    );

    expect(await screen.findByRole("tab", { name: "多源匹配" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "开始多源匹配" }));
    await waitFor(() =>
      expect(container.querySelectorAll(".merge-source").length).toBeGreaterThan(2),
    );
    expect(container.querySelectorAll(".merge-field").length).toBeGreaterThan(0);
    expect(container.querySelectorAll(".merge-cover").length).toBeGreaterThan(0);
    expect(screen.getAllByText("冲突").length).toBeGreaterThan(0);
  });

  it("lets the user reorder a single field source", async () => {
    const user = userEvent.setup();
    renderWithProviders(<MetadataSourceSettings />);

    await screen.findByText("字段优先级");
    const preferred = () => document.querySelector(".settings-field-priority__preferred b");
    await waitFor(() => expect(preferred()).not.toBeNull());
    expect(preferred()?.textContent).toBe("Bangumi");
    await user.click(screen.getByRole("button", { name: /^标题首选/ }));
    await user.click(screen.getByRole("button", { name: "下移标题的 Bangumi" }));
    await waitFor(() => expect(preferred()?.textContent).toBe("VNDB"));
  });

  it("switches every field to the global source order", async () => {
    const user = userEvent.setup();
    renderWithProviders(<MetadataSourceSettings />);

    await screen.findByText("字段优先级");
    const preferred = () => document.querySelector(".settings-field-priority__preferred b");
    await waitFor(() => expect(preferred()?.textContent).toBe("Bangumi"));
    await user.click(screen.getByRole("switch", { name: "统一使用来源顺序" }));
    await waitFor(() => expect(preferred()?.textContent).toBe("VNDB"));
    await user.click(screen.getByRole("switch", { name: "统一使用来源顺序" }));
    await waitFor(() => expect(preferred()?.textContent).toBe("Bangumi"));
  });
});
