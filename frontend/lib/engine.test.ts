import { describe, expect, it } from "vitest";
import { searchDemoData } from "@/lib/engine";

describe("searchDemoData", () => {
  it("prioritises the interposer topic for an interposer query", () => {
    const result = searchDemoData({ query: "interposer" });
    expect(result.results[0]?.topic.id).toBe("topic_interposer_2026");
  });
});
