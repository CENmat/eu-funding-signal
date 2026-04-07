// @ts-nocheck

import { JSDOM } from "jsdom";
import { __test__, searchOfficialData } from "../lib/official-data.ts";
import { formatDeadlineStatus } from "../lib/format.ts";

const { window } = new JSDOM("");
globalThis.DOMParser = window.DOMParser;
globalThis.document = window.document;

const defaultQueries = [
  "hydrogen",
  "battery",
  "batteries",
  "bio",
  "biotech",
  "construction",
  "circular construction",
  "water",
  "climate",
  "digital",
  "robotics",
  "manufacturing",
  "mobility",
  "energy",
  "solar",
  "recycling",
  "semiconductors",
  "materials",
  "health",
  "agriculture",
];
const queries = process.env.SMOKE_QUERIES
  ? process.env.SMOKE_QUERIES.split(",").map((query) => query.trim()).filter(Boolean)
  : defaultQueries;
const deadlineWindowDays = process.env.SMOKE_DEADLINE_WINDOW_DAYS
  ? Number(process.env.SMOKE_DEADLINE_WINDOW_DAYS)
  : undefined;

function anchorToken(query: string) {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4)
    .sort((left, right) => right.length - left.length)[0];
}

function expandToken(token: string) {
  const variants = new Set([token]);
  if (token.endsWith("ies") && token.length > 4) {
    variants.add(`${token.slice(0, -3)}y`);
  }
  if (token.endsWith("s") && !token.endsWith("ss") && token.length > 4) {
    variants.add(token.slice(0, -1));
  }
  if (token.endsWith("y") && token.length > 3) {
    variants.add(`${token.slice(0, -1)}ies`);
  }
  if (!token.endsWith("s") && token.length > 3) {
    variants.add(`${token}s`);
  }
  return [...variants];
}

function containsAnchor(query: string, values: string[]) {
  const anchor = anchorToken(query);
  if (!anchor) {
    return true;
  }
  const forms = expandToken(anchor);
  return values.some((value) => forms.some((form) => value.toLowerCase().includes(form)));
}

function looksLikeEnglishCopy(text: string) {
  return countEnglishTokenMatches(text) >= 3;
}

function looksLikeEnglishTitle(text: string) {
  return countEnglishTokenMatches(text) >= 2;
}

function countEnglishTokenMatches(text: string) {
  const englishTokens = new Set([
    "the",
    "and",
    "for",
    "with",
    "to",
    "in",
    "on",
    "of",
    "by",
    "from",
    "are",
    "is",
    "all",
    "expected",
    "outcome",
    "project",
    "results",
    "understanding",
    "avoiding",
    "advancing",
    "bridging",
    "standardising",
    "supporting",
    "open",
    "topic",
    "european",
    "innovation",
    "change",
    "climate",
    "risk",
    "assessments",
    "adaptation",
    "hydrogen",
    "battery",
    "construction",
    "water",
    "bio",
    "digital",
  ]);
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => englishTokens.has(token)).length;
}

async function main() {
  const failures: string[] = [];

  for (const query of queries) {
    const response = await searchOfficialData({
      query,
      filters: deadlineWindowDays !== undefined
        ? { deadlineWindowDays }
        : {},
    });
    const topResults = response.results.slice(0, 3);
    const topTexts = topResults.map((result) => `${result.topic.title} ${result.topic.description}`);
    const hasSourceLinks = topResults.every((result) => Boolean(result.topic.sourceUrl));
    const hasAnchoredTopMatch = containsAnchor(query, topTexts);
    const hasDeadline = topResults.every((result) => Boolean(result.topic.deadline));
    const respectsDeadlineWindow =
      deadlineWindowDays === undefined ||
      response.results.every((result) => __test__.daysUntil(result.topic.deadline) <= deadlineWindowDays);
    const topLanguage = response.results[0]?.topic.sourceLanguage;

    console.log(
      JSON.stringify(
        {
          query,
          deadlineWindowDays,
          mode: response.resultMode,
          count: response.results.length,
          topResult: response.results[0]
            ? {
                id: response.results[0].topic.id,
                title: response.results[0].topic.title,
                deadline: response.results[0].topic.deadline,
                deadlineStatus: formatDeadlineStatus(response.results[0].topic.deadline),
                sourceUrl: response.results[0].topic.sourceUrl,
                sourceLanguage: response.results[0].topic.sourceLanguage,
              }
            : undefined,
        },
        null,
        2,
      ),
    );

    if (response.results.length === 0) {
      failures.push(`${query}: no results returned`);
      continue;
    }
    if (!hasSourceLinks) {
      failures.push(`${query}: one of the top results is missing a topic source link`);
    }
    if (!hasDeadline) {
      failures.push(`${query}: one of the top results is missing a deadline`);
    }
    if (!respectsDeadlineWindow) {
      failures.push(`${query}: at least one result exceeded the deadline window`);
    }
    if (!hasAnchoredTopMatch) {
      failures.push(`${query}: top results did not retain the query anchor term`);
    }
    if (
      topLanguage &&
      topLanguage !== "en" &&
      !looksLikeEnglishTitle(response.results[0]?.topic.title ?? "")
    ) {
      failures.push(`${query}: top result title is not clearly English (${topLanguage})`);
    }
  }

  if (failures.length > 0) {
    console.error("\nSmoke test failures:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log(`\nSmoke test passed for ${queries.length} live queries.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
