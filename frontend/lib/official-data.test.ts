import { describe, expect, it } from "vitest";
import { __test__ } from "@/lib/official-data";

describe("official-data SEDIA record filtering", () => {
  it("rejects procurement/tender records", () => {
    expect(
      __test__.isGrantTopicRecord({
        url: "https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/tender-details/424246ca-5b16-41b0-8bd0-355c769a396a-CN",
        metadata: {
          identifier: ["424246ca-5b16-41b0-8bd0-355c769a396a-CN"],
          callIdentifier: ["CLEANH2/2024/OP/0002"],
          cftId: ["424246ca-5b16-41b0-8bd0-355c769a396a-CN"],
          contractType: ["31095498"],
          title: ["Hydrogen Valleys Facility"],
        },
      }),
    ).toBe(false);
  });

  it("keeps actual grant topic records", () => {
    expect(
      __test__.isGrantTopicRecord({
        url: "https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/HORIZON-JTI-CLEANH2-2023-02-01",
        metadata: {
          identifier: ["HORIZON-JTI-CLEANH2-2023-02-01"],
          callIdentifier: ["HORIZON-JTI-CLEANH2-2023-1"],
          actions: [
            "[{\"types\":[{\"typeOfAction\":\"HORIZON-JU-IA HORIZON JU Innovation Actions\"}],\"status\":{\"description\":\"Closed\"}}]",
          ],
          typesOfAction: ["HORIZON JU Innovation Actions"],
          title: ["Large-scale demonstration of underground hydrogen storage"],
        },
      }),
    ).toBe(true);
  });

  it("prefers English topic variants when the same topic is returned in multiple languages", () => {
    const merged = __test__.mergeRawTopic(
      {
        summary: "Storskaliga Hydrogen Valley",
        metadata: {
          identifier: ["HORIZON-JU-CLEANH2-2026-06-01"],
          callIdentifier: ["HORIZON-JU-CLEANH2-2026-CALL-06"],
          language: ["sv"],
          title: ["Storskaliga Hydrogen Valley"],
          description: ["Svensk beskrivning"],
        },
      },
      {
        summary: "Large-scale Hydrogen Valley",
        url: "https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/HORIZON-JU-CLEANH2-2026-06-01",
        metadata: {
          identifier: ["HORIZON-JU-CLEANH2-2026-06-01"],
          callIdentifier: ["HORIZON-JU-CLEANH2-2026-CALL-06"],
          language: ["en"],
          title: ["Large-scale Hydrogen Valley"],
          description: ["English description"],
        },
      },
    );

    expect(merged.metadata?.language?.[0]).toBe("en");
    expect(merged.metadata?.title?.[0]).toBe("Large-scale Hydrogen Valley");
    expect(merged.metadata?.description?.[0]).toBe("English description");
    expect(merged.url).toContain("/topic-details/HORIZON-JU-CLEANH2-2026-06-01");
  });

  it("builds anchored current-search variants instead of unrelated fallback terms", () => {
    const variants = __test__.buildAnchoredCurrentVariants(
      "hydrogen",
      [
        {
          summary: "Large-scale Hydrogen Valley",
          metadata: {
            identifier: ["HORIZON-JU-CLEANH2-2026-06-01"],
            callIdentifier: ["HORIZON-JU-CLEANH2-2026-CALL-06"],
            status: ["31094502"],
            title: ["Large-scale Hydrogen Valley"],
            description: ["Support large-scale hydrogen valley deployment."],
            actions: [
              '[{"status":{"description":"Open"}}]',
            ],
          },
        },
      ],
      ["hydrogen"],
    );

    expect(variants).toContain("hydrogen valley");
    expect(variants.every((variant) => variant.includes("hydrogen"))).toBe(true);
  });

  it("returns signed day deltas for deadline handling", () => {
    const currentDate = new Date();
    const future = new Date(Date.UTC(
      currentDate.getUTCFullYear(),
      currentDate.getUTCMonth(),
      currentDate.getUTCDate() + 10,
    ))
      .toISOString()
      .slice(0, 10);
    const past = new Date(Date.UTC(
      currentDate.getUTCFullYear(),
      currentDate.getUTCMonth(),
      currentDate.getUTCDate() - 3,
    ))
      .toISOString()
      .slice(0, 10);

    expect(__test__.daysUntil(future)).toBe(10);
    expect(__test__.daysUntil(past)).toBe(-3);
  });
});
