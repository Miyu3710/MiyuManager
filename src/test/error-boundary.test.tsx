import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ErrorBoundary } from "../app/ErrorBoundary";

function BrokenView(): never {
  throw new Error("fixture render failure");
}

describe("ErrorBoundary", () => {
  it("shows a recoverable local fallback instead of a blank window", () => {
    render(
      <ErrorBoundary>
        <BrokenView />
      </ErrorBoundary>,
    );

    expect(screen.getByRole("heading", { name: "界面遇到问题" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /重新载入/ })).toBeInTheDocument();
    expect(screen.getByText("fixture render failure")).toBeInTheDocument();
  });
});
