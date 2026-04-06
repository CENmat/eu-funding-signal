import { describe, expect, it } from "vitest";
import { __test__ } from "@/lib/official-data";

describe("official-data live expansion helpers", () => {
  it("does not leak demo synonym hints into live expansions", () => {
    const suggestions = __test__.suggestLiveExpansions("battery passport", [], []);
    expect(suggestions.map((entry) => entry.term)).not.toContain("digital battery passport");
  });

  it("filters noisy identifier-like and low-signal terms", () => {
    expect(__test__.isUsefulExpansionTerm("HORIZON-MISS-2026-04-CIT-NEB-B4P-CCRI-03")).toBe(false);
    expect(__test__.isUsefulExpansionTerm("should")).toBe(false);
    expect(__test__.isUsefulExpansionTerm("advanced packaging")).toBe(true);
  });
});
