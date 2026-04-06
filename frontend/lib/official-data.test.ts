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
});
