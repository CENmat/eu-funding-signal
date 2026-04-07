import {
  compareScenario,
  getAdminSnapshot,
  getDemoDataset,
  getOrganisationDetail,
  getTopicDetail,
  searchDemoData,
} from "@/lib/engine";
import {
  compareOfficialScenario,
  clearOfficialSearchCaches,
  getOfficialAdminSnapshot,
  getOfficialOrganisationDetail,
  getOfficialTopicDetail,
  searchOfficialData,
} from "@/lib/official-data";
import type {
  AdminSnapshot,
  CandidatePartner,
  OrganisationDetail,
  ScenarioComparison,
  SearchResponse,
  TopicDetail,
} from "@/lib/types";

const appMode = process.env.NEXT_PUBLIC_APP_MODE ?? "live_public";
const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, init);
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function loadSearchResults(input: {
  query: string;
  approvedExpansions?: string[];
  candidatePartners?: CandidatePartner[];
  filters?: Record<string, unknown>;
}): Promise<SearchResponse> {
  if (appMode === "demo") {
    return searchDemoData(input) as SearchResponse;
  }

  if (appMode === "live_public") {
    return searchOfficialData(input);
  }

  return fetchJson<SearchResponse>("/api/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
}

export async function loadTopicDetail(topicId: string, query?: string): Promise<TopicDetail | undefined> {
  if (appMode === "demo") {
    return getTopicDetail(topicId, query) as TopicDetail | undefined;
  }

  if (appMode === "live_public") {
    return getOfficialTopicDetail(topicId, query);
  }

  const suffix = query ? `?query=${encodeURIComponent(query)}` : "";
  return fetchJson<TopicDetail>(`/api/topics/${topicId}${suffix}`);
}

export async function loadOrganisationDetail(
  organisationId: string,
  query?: string,
): Promise<OrganisationDetail | undefined> {
  if (appMode === "demo") {
    return getOrganisationDetail(organisationId, query) as OrganisationDetail | undefined;
  }

  if (appMode === "live_public") {
    return getOfficialOrganisationDetail(organisationId, query);
  }

  const suffix = query ? `?query=${encodeURIComponent(query)}` : "";
  return fetchJson<OrganisationDetail>(`/api/organisations/${organisationId}${suffix}`);
}

export async function loadScenarioComparison(
  query: string,
  candidates: CandidatePartner[],
): Promise<ScenarioComparison> {
  if (appMode === "demo") {
    return compareScenario(query, candidates) as ScenarioComparison;
  }

  if (appMode === "live_public") {
    return compareOfficialScenario(query, candidates);
  }

  return fetchJson<ScenarioComparison>("/api/scenario/compare", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, candidates }),
  });
}

export async function loadAdminSnapshot(): Promise<AdminSnapshot> {
  if (appMode === "demo") {
    return getAdminSnapshot() as AdminSnapshot;
  }

  if (appMode === "live_public") {
    return getOfficialAdminSnapshot();
  }

  return fetchJson<AdminSnapshot>("/api/admin/status");
}

export function loadDemoDataset() {
  return getDemoDataset();
}

export function getAppMode() {
  return appMode;
}

export function clearSearchCaches() {
  if (appMode === "live_public") {
    clearOfficialSearchCaches();
  }
}
