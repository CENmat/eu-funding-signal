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

  it("expands scientific shorthand like co2 into public-searchable variants", () => {
    const variants = __test__.buildDirectSearchVariants("co2");

    expect(variants).toContain("co2");
    expect(variants).toContain("carbon");
    expect(variants).toContain("carbon dioxide");
    expect(variants).toContain("decarbonisation");
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

  it("does not auto-fallback to closed topics unless the user enabled closed analogues", () => {
    expect(
      __test__.shouldUseClosedFallback(
        { includeRecentClosed: false },
        "climate",
        [
          {
            topic: {
              id: "HORIZON-CL5-2026-07-D1-02",
              callId: "HORIZON-CL5-2026-07",
              topicId: "HORIZON-CL5-2026-07-D1-02",
              title: "Advancing European climate risk assessments",
              description: "Climate risk assessment topic",
              programme: "Horizon Europe Cluster 5",
              actionType: "RIA",
              fundingType: "grant",
              status: "open",
              deadline: "2026-04-15",
              indicativeBudgetEur: 15000000,
              keywords: ["climate", "risk"],
              sourceUrl: "https://example.com/topic",
              lastFetchedAt: "2026-04-07T00:00:00Z",
            },
            rank: 1,
            finalScore: 67.2,
            opportunityScore: 71.1,
            coordinatorScore: 47.5,
            consortiumScore: 82,
            coverageScore: 63,
            scoreBreakdown: {
              opportunity: {
                lexical: 0.31,
                semantic: 0.7,
                analogAlignment: 0.65,
                actionTypeFit: 0.66,
                trlFit: 0.62,
              },
              coordinator: {
                topicCoordinations: 0.42,
                programmeCoordinations: 0.42,
                actionTypeCoordinations: 0.42,
                recency: 0.42,
                fundingExperience: 0.42,
                networkCentrality: 0.42,
                candidateConsortiumFit: 0.72,
              },
              consortium: {
                shapeSimilarity: 0.8,
                roleCompleteness: 0.8,
                collaborationStrength: 0.66,
                countryPatternFit: 0.78,
                eligibilityFit: 0.82,
                diversityBonus: 0.74,
              },
            },
            probability: {
              mode: "relative_index",
              index: 67.2,
              confidenceLabel: "Medium",
              explanation: "No baseline",
            },
            recommendedCoordinators: [],
            recommendedCountries: [],
            consortiumCountryMix: [],
            suggestedRoles: [],
            similarProjects: [],
            redFlags: [],
            nextSteps: [],
            reasonsToPursue: [],
            reasonsNotToPursue: [],
            improvementLevers: [],
            supportingEvidence: [],
            explainFormula: "formula",
            countryEvidenceSummary: "summary",
          },
        ],
        [
          {
            topic: {
              id: "LIFE-2022-SAP-CLIMA-GOV",
              callId: "LIFE-2022-SAP-CLIMA",
              topicId: "LIFE-2022-SAP-CLIMA-GOV",
              title: "Climate Governance and Information",
              description: "Closed topic",
              programme: "LIFE",
              actionType: "SAP",
              fundingType: "grant",
              status: "closed",
              deadline: "2022-10-04",
              indicativeBudgetEur: 0,
              keywords: ["climate"],
              sourceUrl: "https://example.com/closed",
              lastFetchedAt: "2026-04-07T00:00:00Z",
            },
            rank: 1,
            finalScore: 40,
            opportunityScore: 40,
            coordinatorScore: 40,
            consortiumScore: 40,
            coverageScore: 40,
            scoreBreakdown: {
              opportunity: {
                lexical: 0.1,
                semantic: 0.1,
                analogAlignment: 0.1,
                actionTypeFit: 0.1,
                trlFit: 0.1,
              },
              coordinator: {
                topicCoordinations: 0.1,
                programmeCoordinations: 0.1,
                actionTypeCoordinations: 0.1,
                recency: 0.1,
                fundingExperience: 0.1,
                networkCentrality: 0.1,
                candidateConsortiumFit: 0.1,
              },
              consortium: {
                shapeSimilarity: 0.1,
                roleCompleteness: 0.1,
                collaborationStrength: 0.1,
                countryPatternFit: 0.1,
                eligibilityFit: 0.1,
                diversityBonus: 0.1,
              },
            },
            probability: {
              mode: "relative_index",
              index: 40,
              confidenceLabel: "Low",
              explanation: "No baseline",
            },
            recommendedCoordinators: [],
            recommendedCountries: [],
            consortiumCountryMix: [],
            suggestedRoles: [],
            similarProjects: [],
            redFlags: [],
            nextSteps: [],
            reasonsToPursue: [],
            reasonsNotToPursue: [],
            improvementLevers: [],
            supportingEvidence: [],
            explainFormula: "formula",
            countryEvidenceSummary: "summary",
          },
        ],
      ),
    ).toBe(false);
  });
});
