import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { PrototypeGallery } from "../features/prototypes/gallery/PrototypeGallery";

describe("PrototypeGallery", () => {
  it("presents three distinct visual directions", () => {
    render(
      <MemoryRouter>
        <PrototypeGallery />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: /选择你的/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "游戏启动器" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "游戏收藏架" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "游玩频道" })).toBeInTheDocument();
    expect(screen.getAllByText("打开原型")).toHaveLength(3);
  });
});
