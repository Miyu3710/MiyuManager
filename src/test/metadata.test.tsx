import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { WorkDetailPage } from "../features/work-detail/WorkDetailPage";
import { MetadataSourceSettings } from "../features/settings/MetadataSourceSettings";

afterEach(() => cleanup());

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
  it("searches mock candidates and imports the default empty fields", async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(
      <Routes>
        <Route path="/work/:id" element={<WorkDetailPage />} />
      </Routes>,
      ["/work/moonlit-atelier?tab=sources"],
    );

    expect(await screen.findByRole("heading", { name: "搜索并导入元数据" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "搜索" }));
    await waitFor(() => expect(container.querySelector(".metadata-candidate")).not.toBeNull());
    await user.click(container.querySelector(".metadata-candidate") as HTMLElement);
    await waitFor(() =>
      expect(container.querySelectorAll(".metadata-preview-row").length).toBeGreaterThan(0),
    );

    const importButton = screen.getByRole("button", { name: /导入 \d+ 个字段/ });
    expect(importButton).not.toBeDisabled();
    await user.click(importButton);
    await waitFor(() => expect(container.querySelector(".metadata-claim-chip")).not.toBeNull());
  });

  it("moves providers in the configured priority order", async () => {
    const user = userEvent.setup();
    renderWithProviders(<MetadataSourceSettings />);

    await waitFor(() => expect(screen.getAllByRole("button", { name: /下移/ }).length).toBe(2));
    const names = () =>
      Array.from(document.querySelectorAll(".settings-source-name b")).map(
        (element) => element.textContent,
      );
    expect(names()).toEqual(["VNDB", "Bangumi"]);

    await user.click(screen.getByRole("button", { name: "下移 VNDB" }));
    await waitFor(() => expect(names()).toEqual(["Bangumi", "VNDB"]));

    await user.click(screen.getAllByRole("button", { name: "停用" })[0] as HTMLElement);
    await waitFor(() =>
      expect(document.querySelector(".settings-source-state .ds-tag")?.textContent).toBe("停用"),
    );
  });
});
