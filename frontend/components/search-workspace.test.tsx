import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SearchWorkspace } from "@/components/search-workspace";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

describe("SearchWorkspace", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("starts blank without hidden defaults or preset keyword buttons", () => {
    render(<SearchWorkspace />);

    expect(screen.getByLabelText("Keyword, phrase, or search string")).toHaveValue("");
    expect(screen.getByLabelText("Deadline window (days)")).toHaveValue("");
    expect(screen.getByPlaceholderText("Organisation name")).toHaveValue("");
    expect(screen.queryByDisplayValue("imec")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("Fraunhofer IZM")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "interposer" })).not.toBeInTheDocument();
  });
});
