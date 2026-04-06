import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CaveatBanner } from "@/components/caveat-banner";

describe("CaveatBanner", () => {
  it("renders the caveat text", () => {
    render(<CaveatBanner text="Decision support only." />);
    expect(screen.getByText("Decision support only.")).toBeInTheDocument();
    expect(screen.getByText("Decision-support caveat")).toBeInTheDocument();
  });
});

