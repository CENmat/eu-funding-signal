import { describe, expect, it } from "vitest";
import { searchDemoData } from "@/lib/engine";

describe("searchDemoData", () => {
  it("prioritises the interposer topic for an interposer query", () => {
    const result = searchDemoData({ query: "interposer" });
    expect(result.results[0]?.topic.id).toBe("topic_interposer_2026");
  });

  it("requires a minimum number of days remaining before the deadline", () => {
    const result = searchDemoData({
      query: "interposer",
      filters: { deadlineWindowDays: 200 },
    });

    expect(result.results).toHaveLength(0);
  });

  it("treats comma-separated multi-term searches as OR queries by default", () => {
    const result = searchDemoData({
      query: "interposer, photonics",
      filters: { queryOperator: "or" },
    });

    const topicIds = result.results.map((entry) => entry.topic.id);
    expect(topicIds).toContain("topic_interposer_2026");
    expect(topicIds).toContain("topic_advanced_packaging_2026");
  });

  it("supports AND logic for multi-term searches", () => {
    const result = searchDemoData({
      query: "interposer, photonics",
      filters: { queryOperator: "and" },
    });

    expect(result.results).toHaveLength(0);
  });
});
