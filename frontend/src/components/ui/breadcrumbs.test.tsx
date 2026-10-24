import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Breadcrumbs } from "./breadcrumbs";

describe("Breadcrumbs", () => {
  it("renders breadcrumb items in order with current page indicator", () => {
    render(
      <Breadcrumbs
        items={[
          { label: "山林一覧", href: "/map" },
          { label: "白神山地", href: "/map?mountain=shirakami" },
          { label: "第3工区", current: true },
        ]}
      />,
    );

    const nav = screen.getByRole("navigation", { name: "パンくずリスト" });
    expect(nav).toBeInTheDocument();

    const link1 = screen.getByRole("link", { name: "山林一覧" });
    expect(link1).toHaveAttribute("href", "/map");

    const link2 = screen.getByRole("link", { name: "白神山地" });
    expect(link2).toHaveAttribute("href", "/map?mountain=shirakami");

    const currentItem = screen.getByText("第3工区");
    expect(currentItem).toHaveAttribute("aria-current", "page");
  });

  it("renders null when items is empty", () => {
    const { container } = render(<Breadcrumbs items={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
