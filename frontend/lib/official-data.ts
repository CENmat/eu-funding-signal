import demoDataset from "@/lib/demo-dataset.json";
import type {
  AdminSnapshot,
  CandidatePartner,
  ConfidenceLabel,
  DemoDataset,
  Organisation,
  OrganisationDetail,
  ProbabilityView,
  Project,
  RankedCoordinator,
  ScenarioComparison,
  SearchResponse,
  SearchResult,
  Topic,
  TopicDetail,
} from "@/lib/types";

const dataset = demoDataset as DemoDataset;
const EMBEDDING_DIM = 48;
const REQUIRED_ROLES = [
  "research",
  "industrial actor",
  "pilot site",
  "end-user",
  "standardisation",
];
const TERM_STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "into",
  "that",
  "this",
  "will",
  "their",
  "these",
  "those",
  "about",
  "under",
  "based",
  "using",
  "than",
  "where",
  "which",
  "have",
  "shall",
  "such",
  "they",
  "them",
  "across",
  "would",
  "could",
  "should",
]);
const SEDIA_SEARCH_ENDPOINT = "https://api.tech.ec.europa.eu/search-api/prod/rest/search";
const CORDIS_SEARCH_ENDPOINT = "https://cordis.europa.eu/api/search/results";
const CORDIS_SEARCH_FIELDS = [
  "title",
  "id",
  "code",
  "rcn",
  "startDate",
  "endDate",
  "teaser",
  "contentUpdateDate",
  "acronym",
  "country",
  "frameworkProgramme",
].join(",");
const STORAGE_KEYS = {
  topicDetails: "efs:live-topic-details",
  organisationDetails: "efs:live-organisation-details",
};

type SearchFilters = {
  programme?: string;
  actionType?: string;
  includeRecentClosed?: boolean;
  deadlineWindowDays?: number | string;
  minimumBudget?: number | string;
  maximumBudget?: number | string;
  coordinatorCountry?: string;
  minimumConsortiumSize?: number | string;
  maximumConsortiumSize?: number | string;
};

type SearchRequest = {
  query: string;
  filters?: Record<string, unknown>;
  approvedExpansions?: string[];
  candidatePartners?: CandidatePartner[];
};

type SupportingTerm = {
  term: string;
  reason: string;
  selectedDefault: boolean;
};

type RawSediaResult = {
  summary?: string | null;
  url?: string;
  weight?: number;
  metadata?: Record<string, string[]>;
};

type ParsedAction = {
  plannedOpeningDate?: string;
  deadlineDates?: string[];
  status?: {
    id?: number;
    abbreviation?: string;
    description?: string;
  };
  types?: Array<{
    typeOfAction?: string;
  }>;
};

type LiveTopic = Topic & {
  statusTag: "open" | "forthcoming" | "closed";
  openingDate?: string;
};

type CordisSearchResult = {
  id: string;
  title?: string;
  acronym?: string;
  coordinatedIn?: string;
  teaser?: string;
};

type ParticipantEvidence = {
  organisationId: string;
  organisationName: string;
  country: string;
  organisationType: string;
  isCoordinator: boolean;
  ecContributionEur: number;
  shortName?: string;
};

type AnalogueProject = Project & {
  participantDetails: ParticipantEvidence[];
};

type LiveRegistry = {
  organisations: Organisation[];
  organisationsById: Map<string, Organisation>;
  aliasesById: Map<string, string[]>;
  aliasIndex: Map<string, string>;
  organisationProjects: Map<string, AnalogueProject[]>;
  collaborationGraph: Map<string, Map<string, number>>;
  allProjects: AnalogueProject[];
};

type TopicContext = {
  analogs: AnalogueProject[];
  coordinatorRanks: RankedCoordinator[];
  countryCounts: Map<string, number>;
  roleCounts: Map<string, number>;
  commonCountryCombinations: Array<{ label: string; count: number }>;
  baseline?: number;
  registry: LiveRegistry;
  averageConsortiumSize: number;
};

const responseCache = new Map<string, Promise<SearchResponse>>();
const sediaSearchCache = new Map<string, Promise<RawSediaResult[]>>();
const cordisSearchCache = new Map<string, Promise<CordisSearchResult[]>>();
const cordisXmlCache = new Map<string, Promise<AnalogueProject | undefined>>();
const topicDetailCache = new Map<string, TopicDetail>();
const organisationDetailCache = new Map<string, OrganisationDetail>();

export async function searchOfficialData(request: SearchRequest): Promise<SearchResponse> {
  const cacheKey = JSON.stringify({
    query: request.query.trim(),
    filters: request.filters ?? {},
    approvedExpansions: request.approvedExpansions ?? [],
    candidates: request.candidatePartners ?? [],
  });

  const cached = responseCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const promise = buildOfficialSearchResponse(request);
  responseCache.set(cacheKey, promise);
  return promise;
}

export async function getOfficialTopicDetail(
  topicId: string,
  query?: string,
): Promise<TopicDetail | undefined> {
  const cached = readCachedTopicDetail(topicId);
  if (cached) {
    return cached;
  }

  await searchOfficialData({
    query: query ?? topicId,
    filters: { includeRecentClosed: true },
  });

  return readCachedTopicDetail(topicId);
}

export async function getOfficialOrganisationDetail(
  organisationId: string,
  query?: string,
): Promise<OrganisationDetail | undefined> {
  const cached = readCachedOrganisationDetail(organisationId);
  if (cached) {
    return cached;
  }

  await searchOfficialData({
    query: query ?? organisationId,
    filters: { includeRecentClosed: true },
  });

  return readCachedOrganisationDetail(organisationId);
}

export async function compareOfficialScenario(
  query: string,
  candidates: CandidatePartner[],
): Promise<ScenarioComparison> {
  const response = await searchOfficialData({
    query,
    candidatePartners: candidates,
    filters: { includeRecentClosed: true },
  });
  const bestTopic = response.results[0];
  if (!bestTopic) {
    return {
      query,
      recommendedCountryPattern: [],
      missingRoles: computeMissingRoles(candidates, () => undefined),
      rankedCandidates: [],
    };
  }

  const topicDetail = readCachedTopicDetail(bestTopic.topic.id);
  const registry = buildLiveRegistryFromCaches();

  const matchedCandidates = candidates.map((candidate) => {
    const detail = readCachedOrganisationDetail(
      bestTopic.recommendedCoordinators.find(
        (entry) => normalizeText(entry.organisationName) === normalizeText(candidate.name),
      )?.organisationId ?? "",
    );

    const matchedOrganisationId =
      bestTopic.recommendedCoordinators.find(
        (entry) =>
          normalizeText(entry.organisationName).includes(normalizeText(candidate.name)) ||
          normalizeText(candidate.name).includes(normalizeText(entry.organisationName)),
      )?.organisationId ?? detail?.organisation.id;
    const matchedOrganisation =
      matchedOrganisationId ? readCachedOrganisationDetail(matchedOrganisationId)?.organisation : undefined;

    const score = matchedOrganisation
      ? scoreCandidateCoordinator(
          matchedOrganisation,
          bestTopic.topic,
          topicDetail?.similarProjects as AnalogueProject[] | undefined,
          candidates,
          query,
          topicDetail?.topHistoricalCoordinators,
          registry,
        )
      : 34 + (candidate.country ? 6 : 0) + (candidate.role ? 8 : 0);

    return {
      name: candidate.name,
      matchedOrganisationId,
      score: round(score, 1),
      deltaVsBest: 0,
      rationale: buildCandidateRationale(candidate, matchedOrganisation, bestTopic),
    };
  });

  matchedCandidates.sort((left, right) => right.score - left.score);
  const bestScore = matchedCandidates[0]?.score ?? 0;

  return {
    query,
    bestCoordinatorId: matchedCandidates[0]?.matchedOrganisationId,
    bestCoordinatorName: matchedCandidates[0]?.name,
    recommendedCountryPattern: bestTopic.consortiumCountryMix,
    missingRoles: computeMissingRoles(candidates, (candidate) =>
      matchCandidateToOrganisation(candidate, registry),
    ),
    rankedCandidates: matchedCandidates.map((candidate) => ({
      ...candidate,
      deltaVsBest: round(candidate.score - bestScore, 1),
    })),
  };
}

export async function getOfficialAdminSnapshot(): Promise<AdminSnapshot> {
  return {
    dataSources: [
      {
        id: "sedia-live",
        name: "Funding & Tenders public search",
        status: "Live",
        landingUrl:
          "https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-search",
        lastRefreshAt: new Date().toISOString(),
      },
      {
        id: "cordis-live",
        name: "CORDIS public project search",
        status: "Live",
        landingUrl: "https://cordis.europa.eu/projects",
        lastRefreshAt: new Date().toISOString(),
      },
      {
        id: "dashboard-cache",
        name: "Programme dashboard baseline cache",
        status: "Partial",
        landingUrl:
          "https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/programmes/programme-dashboards",
        lastRefreshAt:
          dataset.programmeStats
            .map((entry) => entry.fetchTimestamp)
            .sort()
            .at(-1) ?? new Date().toISOString(),
      },
    ],
    scoreWeights: dataset.scoreWeights,
    featureFlags: {
      livePublicData: true,
      backendRequired: false,
      officialDashboardBaselineCache: true,
    },
    refreshLogs: [
      {
        id: "live-search",
        source: "Funding & Tenders / CORDIS",
        status: "OK",
        message: "Live search uses only the user-typed query; predefined synonym expansions are disabled.",
        createdAt: new Date().toISOString(),
      },
    ],
    synonymGroups: [],
  };
}

async function buildOfficialSearchResponse(request: SearchRequest): Promise<SearchResponse> {
  const query = request.query.trim();
  const normalizedQuery = normalizeText(query);
  const filters = coerceFilters(request.filters);

  const suggestedExpansions: SupportingTerm[] = [];
  const acceptedExpansions: string[] = [];

  const initialTopicHits = await fetchSediaTopics(query, []);
  const liveTopics = normalizeSediaTopics(initialTopicHits);
  const candidateProjects = await fetchCordisProjects(query, []);
  const registry = buildLiveRegistry(candidateProjects);
  const queryTokens = tokenize(query);
  const queryEmbedding = embedText(query);

  const results = liveTopics
    .map((topic) =>
      buildLiveResult({
        topic,
        registry,
        query,
        queryTokens,
        queryEmbedding,
        candidatePartners: request.candidatePartners ?? [],
      }),
    )
    .filter((result) => passesTopicalGuard(query, result))
    .filter((result) => applyResultFilters(result, filters))
    .sort((left, right) => right.finalScore - left.finalScore)
    .map((result, index) => ({ ...result, rank: index + 1 }));

  rememberOrganisationDetails(
    registry,
    candidateProjects,
    results.map((result) => result.topic),
    query,
  );

  return {
    query,
    normalizedQuery,
    suggestedExpansions,
    acceptedExpansions,
    results,
  };
}

function buildLiveResult(args: {
  topic: LiveTopic;
  registry: LiveRegistry;
  query: string;
  queryTokens: string[];
  queryEmbedding: number[];
  candidatePartners: CandidatePartner[];
}): SearchResult {
  const context = buildTopicContext(
    args.topic,
    args.query,
    args.registry,
    args.candidatePartners,
  );
  const opportunityBreakdown = scoreOpportunity(
    args.topic,
    args.queryTokens,
    args.queryEmbedding,
    context.analogs,
  );
  const bestCoordinator = context.coordinatorRanks[0];
  const coordinatorBreakdown = scoreCoordinator(
    bestCoordinator,
    args.topic,
    context,
    args.candidatePartners,
  );
  const consortiumBreakdown = scoreConsortium(context, args.candidatePartners);
  const coverageScore = scoreCoverage(args.topic, context.analogs, context.baseline);

  const opportunityScore =
    (opportunityBreakdown.lexical * 0.28 +
      opportunityBreakdown.semantic * 0.34 +
      opportunityBreakdown.analogAlignment * 0.22 +
      opportunityBreakdown.actionTypeFit * 0.1 +
      opportunityBreakdown.trlFit * 0.06) *
    100;
  const coordinatorScore =
    (coordinatorBreakdown.topicCoordinations * 0.22 +
      coordinatorBreakdown.programmeCoordinations * 0.16 +
      coordinatorBreakdown.actionTypeCoordinations * 0.12 +
      coordinatorBreakdown.recency * 0.16 +
      coordinatorBreakdown.fundingExperience * 0.12 +
      coordinatorBreakdown.networkCentrality * 0.12 +
      coordinatorBreakdown.candidateConsortiumFit * 0.1) *
    100;
  const consortiumScore =
    (consortiumBreakdown.shapeSimilarity * 0.24 +
      consortiumBreakdown.roleCompleteness * 0.24 +
      consortiumBreakdown.collaborationStrength * 0.16 +
      consortiumBreakdown.countryPatternFit * 0.16 +
      consortiumBreakdown.eligibilityFit * 0.12 +
      consortiumBreakdown.diversityBonus * 0.08) *
    100;
  const finalScore =
    opportunityScore * dataset.scoreWeights.opportunity +
    coordinatorScore * dataset.scoreWeights.coordinator +
    consortiumScore * dataset.scoreWeights.consortium +
    coverageScore * dataset.scoreWeights.coverage;
  const probability = buildProbabilityView(
    args.topic,
    finalScore,
    opportunityScore,
    coordinatorScore,
    consortiumScore,
    coverageScore,
    context.baseline,
  );

  const recommendedCountries = [...context.countryCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4)
    .map(([country]) => country);
  const missingRoles = computeMissingRoles(args.candidatePartners, (candidate) =>
    matchCandidateToOrganisation(candidate, args.registry),
  );
  const consortiumCountryMix =
    context.commonCountryCombinations[0]?.label.split(" + ").filter(Boolean) ??
    recommendedCountries.slice(0, 4);
  const similarProjects = context.analogs.slice(0, 5).map(stripProjectEvidence);

  const result: SearchResult = {
    topic: stripLiveTopic(args.topic),
    rank: 0,
    finalScore: round(finalScore, 1),
    opportunityScore: round(opportunityScore, 1),
    coordinatorScore: round(coordinatorScore, 1),
    consortiumScore: round(consortiumScore, 1),
    coverageScore: round(coverageScore, 1),
    scoreBreakdown: {
      opportunity: opportunityBreakdown,
      coordinator: coordinatorBreakdown,
      consortium: consortiumBreakdown,
    },
    probability,
    recommendedCoordinators: context.coordinatorRanks.slice(0, 5),
    recommendedCountries,
    consortiumCountryMix,
    suggestedRoles:
      missingRoles.length > 0
        ? missingRoles
        : [...context.roleCounts.entries()]
            .sort((left, right) => right[1] - left[1])
            .slice(0, 5)
            .map(([role]) => role),
    similarProjects,
    redFlags: buildRedFlags(args.topic, coverageScore, args.candidatePartners, probability),
    nextSteps: buildNextSteps(args.topic, context.coordinatorRanks, consortiumCountryMix),
    reasonsToPursue: buildReasonsToPursue(
      opportunityScore,
      coordinatorScore,
      consortiumScore,
      coverageScore,
    ),
    reasonsNotToPursue: buildReasonsNotToPursue(
      args.topic,
      coverageScore,
      missingRoles,
      probability,
    ),
    improvementLevers: buildImprovementLevers(
      missingRoles,
      context.coordinatorRanks,
      coverageScore,
    ),
    supportingEvidence: buildSupportingEvidence(args.topic, context, probability),
    explainFormula:
      "Final score = 0.45*Opportunity + 0.30*Coordinator + 0.20*Consortium + 0.05*Coverage. Country is a secondary signal after topic fit, coordinator history, and consortium completeness.",
    countryEvidenceSummary: buildCountryEvidenceSummary(context.countryCounts),
  };

  const detail: TopicDetail = {
    ...result,
    topHistoricalCoordinators: context.coordinatorRanks,
    coordinatorCountryDistribution: [...context.countryCounts.entries()]
      .map(([country, count]) => ({ country, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 10),
    commonRolePatterns: [...context.roleCounts.entries()]
      .map(([role, count]) => ({ role, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 10),
    commonCountryCombinations: context.commonCountryCombinations,
  };

  rememberTopicDetail(detail);
  return result;
}

function buildTopicContext(
  topic: LiveTopic,
  query: string,
  registry: LiveRegistry,
  candidatePartners: CandidatePartner[],
): TopicContext {
  const analogs = rankAnalogs(query, topic, registry.allProjects).slice(0, 10);
  const coordinatorRanks = rankCoordinators(topic, analogs, registry, candidatePartners, query);
  const countryCounts = new Map<string, number>();
  const roleCounts = new Map<string, number>();
  const comboCounts = new Map<string, number>();

  for (const project of analogs) {
    const coordinator = registry.organisationsById.get(project.coordinatorOrgId);
    if (coordinator?.country) {
      countryCounts.set(coordinator.country, (countryCounts.get(coordinator.country) ?? 0) + 2);
    }
    for (const country of project.countries) {
      countryCounts.set(country, (countryCounts.get(country) ?? 0) + 1);
    }
    for (const role of project.roleMix) {
      roleCounts.set(role, (roleCounts.get(role) ?? 0) + 1);
    }
    const combo = [...new Set(project.countries)].sort().slice(0, 4).join(" + ");
    if (combo) {
      comboCounts.set(combo, (comboCounts.get(combo) ?? 0) + 1);
    }
  }

  const baseline = lookupBaseline(topic);
  const averageConsortiumSize =
    analogs.reduce((sum, project) => sum + project.participantDetails.length, 0) / Math.max(1, analogs.length);

  return {
    analogs,
    coordinatorRanks,
    countryCounts,
    roleCounts,
    commonCountryCombinations: [...comboCounts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 5),
    baseline,
    registry,
    averageConsortiumSize,
  };
}

async function fetchSediaTopics(query: string, expansions: string[]): Promise<RawSediaResult[]> {
  const searchTexts = unique(
    [
      query,
      query.includes(" ") ? `"${query}"` : "",
      expansions.length > 0 ? [query, ...expansions.slice(0, 2)].join(" ") : "",
    ].filter(Boolean),
  );

  const results = await Promise.all(searchTexts.map((text) => fetchSediaSearch(text)));
  return results.flat();
}

async function fetchSediaSearch(text: string): Promise<RawSediaResult[]> {
  const key = `sedia:${text}`;
  const cached = sediaSearchCache.get(key);
  if (cached) {
    return cached;
  }

  const promise = (async () => {
    const url = `${SEDIA_SEARCH_ENDPOINT}?apiKey=SEDIA&text=${encodeURIComponent(text)}&pageSize=30&pageNumber=1`;
    const response = await fetch(url, {
      method: "POST",
    });
    if (!response.ok) {
      throw new Error(`SEDIA search failed for "${text}" (${response.status})`);
    }
    const payload = (await response.json()) as { results?: RawSediaResult[] };
    return payload.results ?? [];
  })();

  sediaSearchCache.set(key, promise);
  return promise;
}

function normalizeSediaTopics(rawResults: RawSediaResult[]): LiveTopic[] {
  const merged = new Map<string, RawSediaResult>();

  for (const item of rawResults) {
    const identifier =
      firstString(item.metadata?.identifier) ?? extractTopicIdFromUrl(item.url) ?? item.summary ?? "";
    if (!identifier) {
      continue;
    }
    if (!looksLikeTopic(item)) {
      continue;
    }

    const existing = merged.get(identifier);
    if (!existing) {
      merged.set(identifier, item);
      continue;
    }
    merged.set(identifier, mergeRawTopic(existing, item));
  }

  return [...merged.values()]
    .map((item) => normalizeSediaTopic(item))
    .filter((topic): topic is LiveTopic => Boolean(topic))
    .sort((left, right) => {
      const statusDelta = statusPriority(left.statusTag) - statusPriority(right.statusTag);
      if (statusDelta !== 0) {
        return statusDelta;
      }
      return daysUntil(left.deadline) - daysUntil(right.deadline);
    });
}

function looksLikeTopic(item: RawSediaResult) {
  const identifier = firstString(item.metadata?.identifier) ?? extractTopicIdFromUrl(item.url);
  const callId = firstString(item.metadata?.callIdentifier);
  return Boolean(identifier && callId);
}

function mergeRawTopic(left: RawSediaResult, right: RawSediaResult): RawSediaResult {
  const mergedMetadata = { ...(left.metadata ?? {}) };
  for (const [key, value] of Object.entries(right.metadata ?? {})) {
    mergedMetadata[key] = unique([...(mergedMetadata[key] ?? []), ...value]);
  }

  return {
    ...left,
    summary: right.summary && (right.summary.length > (left.summary?.length ?? 0)) ? right.summary : left.summary,
    url:
      right.url?.includes("/portal/screen/opportunities/topic-details/")
        ? right.url
        : left.url?.includes("/portal/screen/opportunities/topic-details/")
          ? left.url
          : right.url ?? left.url,
    weight: Math.max(left.weight ?? 0, right.weight ?? 0),
    metadata: mergedMetadata,
  };
}

function normalizeSediaTopic(item: RawSediaResult): LiveTopic | undefined {
  const metadata = item.metadata ?? {};
  const identifier = firstString(metadata.identifier) ?? extractTopicIdFromUrl(item.url);
  const callIdentifier = firstString(metadata.callIdentifier);
  if (!identifier || !callIdentifier) {
    return undefined;
  }

  const parsedAction = parseAction(firstString(metadata.actions));
  const statusCode = firstString(metadata.status);
  const statusText = mapStatusCode(statusCode, parsedAction?.status?.description);
  const deadline =
    normalizeIsoDate(firstString(metadata.deadlineDate)) ??
    normalizeIsoDate(parsedAction?.deadlineDates?.[0]) ??
    normalizeIsoDate(firstDeadlineFromBudget(firstString(metadata.budgetOverview)));
  const openingDate = normalizeIsoDate(parsedAction?.plannedOpeningDate);
  const actionTypeLabel =
    firstString(metadata.typesOfAction) ??
    parsedAction?.types?.[0]?.typeOfAction ??
    inferActionTypeFromIdentifier(identifier);
  const actionType = normalizeActionType(actionTypeLabel);
  const budget = parseBudgetOverview(firstString(metadata.budgetOverview), identifier);
  const description = stripHtml(
    firstString(metadata.descriptionByte) ??
      firstString(metadata.description) ??
      item.summary ??
      "",
  );
  const eligibilityText = stripHtml(firstString(metadata.topicConditions) ?? "");
  const keywords = unique([
    ...splitTerms(firstString(metadata.keywords)),
    ...splitTerms(firstString(metadata.tags)),
    ...extractTerms(`${item.summary ?? ""} ${description}`).slice(0, 8),
  ]).slice(0, 10);
  const trl = parseTrl(`${description} ${eligibilityText}`);

  return {
    id: identifier,
    callId: callIdentifier,
    topicId: identifier,
    title: firstString(metadata.title) ?? item.summary ?? identifier,
    description,
    programme: inferProgrammeName(callIdentifier, identifier),
    actionType,
    fundingType: "grant",
    status: statusText === "closed" ? "closed" : "open",
    statusTag: statusText,
    deadline: deadline ?? fallbackDeadline(statusText),
    indicativeBudgetEur: budget,
    trlMin: trl?.min,
    trlMax: trl?.max,
    keywords,
    eligibilityText,
    sourceUrl: buildTopicUrl(identifier),
    lastFetchedAt: new Date().toISOString(),
    openingDate,
  };
}

async function fetchCordisProjects(query: string, expansions: string[]): Promise<AnalogueProject[]> {
  const searchText = [query, ...expansions.slice(0, 2)].filter(Boolean).join(" ");
  const searchResults = await fetchCordisSearch(searchText);

  const projects = await Promise.all(
    searchResults.slice(0, 10).map((result) => fetchCordisProject(result.id, result)),
  );

  return projects.filter((project): project is AnalogueProject => Boolean(project));
}

async function fetchCordisSearch(text: string): Promise<CordisSearchResult[]> {
  const key = `cordis:${text}`;
  const cached = cordisSearchCache.get(key);
  if (cached) {
    return cached;
  }

  const promise = (async () => {
    const userQuery = `contenttype='project' AND ${text}`;
    const url = `${CORDIS_SEARCH_ENDPOINT}?q=${encodeURIComponent(userQuery)}&p=1&num=10&fields=${encodeURIComponent(CORDIS_SEARCH_FIELDS)}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`CORDIS search failed for "${text}" (${response.status})`);
    }
    const payload = (await response.json()) as {
      payload?: {
        results?: CordisSearchResult[];
      };
    };
    return payload.payload?.results ?? [];
  })();

  cordisSearchCache.set(key, promise);
  return promise;
}

async function fetchCordisProject(
  projectId: string,
  searchResult?: CordisSearchResult,
): Promise<AnalogueProject | undefined> {
  const cached = cordisXmlCache.get(projectId);
  if (cached) {
    return cached;
  }

  const promise = (async () => {
    const url = `https://cordis.europa.eu/project/id/${projectId}?format=xml`;
    const response = await fetch(url);
    if (!response.ok) {
      return undefined;
    }
    const xml = await response.text();
    return parseCordisProjectXml(xml, searchResult);
  })();

  cordisXmlCache.set(projectId, promise);
  return promise;
}

function parseCordisProjectXml(
  xml: string,
  searchResult?: CordisSearchResult,
): AnalogueProject | undefined {
  if (typeof DOMParser === "undefined") {
    return undefined;
  }

  const document = new DOMParser().parseFromString(xml, "application/xml");
  const projectId = textValue(document, "id") || searchResult?.id;
  if (!projectId) {
    return undefined;
  }

  const organisations = xmlElements(document, "organization");
  const participantDetails = organisations.map((element) => {
    const legalName = textValue(element, "legalName");
    const shortName = textValue(element, "shortName");
    const country = textValue(element, "country");
    const organisationType = findOrganisationType(element);
    const ecContribution = Number(element.getAttribute("netEcContribution") ?? element.getAttribute("ecContribution") ?? "0");

    return {
      organisationId: textValue(element, "id") || `${legalName}-${country}`,
      organisationName: shortName || legalName || `Organisation ${country}`,
      country,
      organisationType,
      isCoordinator: (element.getAttribute("type") ?? "") === "coordinator",
      ecContributionEur: Number.isFinite(ecContribution) ? ecContribution : 0,
      shortName: shortName || undefined,
    };
  });

  const coordinator = participantDetails.find((participant) => participant.isCoordinator) ?? participantDetails[0];
  if (!coordinator) {
    return undefined;
  }

  const programmeElement =
    xmlElements(document, "programme").find(
      (element) => (element.getAttribute("type") ?? "") === "relatedLegalBasis",
    ) ?? xmlElements(document, "programme")[0];
  const topicElement =
    xmlElements(document, "programme").find(
      (element) => (element.getAttribute("type") ?? "") === "relatedTopic",
    ) ?? undefined;

  const programme = textValue(programmeElement, "title") || inferProgrammeName("", "", searchResult?.title);
  const topicReference = textValue(topicElement, "code") || textValue(document, "grantDoi");
  const objective = textValue(document, "objective") || searchResult?.teaser || "";
  const title = textValue(document, "title") || searchResult?.title || projectId;
  const projectText = `${title}. ${objective}`;

  return {
    id: projectId,
    title,
    objective,
    programme,
    actionType: normalizeActionType(inferActionTypeFromIdentifier(topicReference || title)),
    topicReferences: [topicReference].filter(Boolean),
    coordinatorOrgId: coordinator.organisationId,
    participantOrgIds: participantDetails
      .filter((participant) => participant.organisationId !== coordinator.organisationId)
      .map((participant) => participant.organisationId),
    countries: unique(participantDetails.map((participant) => participant.country).filter(Boolean)),
    startDate: normalizeIsoDate(textValue(document, "startDate")) ?? "2020-01-01",
    endDate: normalizeIsoDate(textValue(document, "endDate")) ?? "2020-12-31",
    euContributionEur: Number(textValue(document, "ecMaxContribution") || "0") || 0,
    activityType: coordinator.organisationType,
    roleMix: unique(
      participantDetails.flatMap((participant) =>
        inferRoles(participant.organisationType, participant.organisationName, projectText),
      ),
    ),
    sourceUrl: `https://cordis.europa.eu/project/id/${projectId}`,
    participantDetails,
  };
}

function buildLiveRegistry(projects: AnalogueProject[]): LiveRegistry {
  const organisationSeeds = new Map<
    string,
    Organisation & {
      _domains: Map<string, number>;
    }
  >();
  const aliasesById = new Map<string, Set<string>>();
  const organisationProjects = new Map<string, AnalogueProject[]>();

  for (const project of projects) {
    const projectTerms = extractTerms(`${project.title} ${project.objective}`).slice(0, 12);
    for (const participant of project.participantDetails) {
      const existing = organisationSeeds.get(participant.organisationId);
      if (!existing) {
        organisationSeeds.set(participant.organisationId, {
          id: participant.organisationId,
          name: participant.organisationName,
          country: participant.country,
          organisationType: participant.organisationType || "Organisation",
          archetypeRoles: inferRoles(
            participant.organisationType,
            participant.organisationName,
            `${project.title} ${project.objective}`,
          ),
          domains: [],
          description: "",
          pastCoordinationCount: participant.isCoordinator ? 1 : 0,
          pastParticipationCount: 1,
          totalKnownFundingEur: participant.ecContributionEur,
          sourceUrl: `https://cordis.europa.eu/search/en?q=${encodeURIComponent(participant.organisationName)}`,
          _domains: new Map(projectTerms.map((term) => [term, 1])),
        });
      } else {
        existing.pastCoordinationCount += participant.isCoordinator ? 1 : 0;
        existing.pastParticipationCount += 1;
        existing.totalKnownFundingEur += participant.ecContributionEur;
        existing.archetypeRoles = unique([
          ...existing.archetypeRoles,
          ...inferRoles(
            participant.organisationType,
            participant.organisationName,
            `${project.title} ${project.objective}`,
          ),
        ]);
        for (const term of projectTerms) {
          existing._domains.set(term, (existing._domains.get(term) ?? 0) + 1);
        }
      }

      const aliases = aliasesById.get(participant.organisationId) ?? new Set<string>();
      aliases.add(participant.organisationName);
      if (participant.shortName) {
        aliases.add(participant.shortName);
      }
      aliasesById.set(participant.organisationId, aliases);

      const involvedProjects = organisationProjects.get(participant.organisationId) ?? [];
      involvedProjects.push(project);
      organisationProjects.set(participant.organisationId, involvedProjects);
    }
  }

  const organisations = [...organisationSeeds.values()].map((entry) => {
    const domains = [...entry._domains.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 8)
      .map(([term]) => term);
    const description =
      entry.description ||
      `${entry.name} appears in ${entry.pastParticipationCount} relevant public funded project(s) with strongest signal in ${domains.slice(0, 3).join(", ")}.`;
    const { _domains, ...organisation } = entry;
    return {
      ...organisation,
      domains,
      description,
    };
  });
  const organisationsById = new Map(organisations.map((organisation) => [organisation.id, organisation]));
  const aliasIndex = new Map<string, string>();
  const serializableAliases = new Map<string, string[]>();

  for (const [organisationId, aliases] of aliasesById.entries()) {
    const values = [...aliases];
    serializableAliases.set(organisationId, values);
    for (const alias of values) {
      aliasIndex.set(normalizeText(alias), organisationId);
    }
  }

  return {
    organisations,
    organisationsById,
    aliasesById: serializableAliases,
    aliasIndex,
    organisationProjects,
    collaborationGraph: buildCollaborationGraph(projects),
    allProjects: projects,
  };
}

function rankAnalogs(query: string, topic: Topic, projects: AnalogueProject[]) {
  const reference = `${query} ${topic.title} ${topic.description} ${topic.keywords.join(" ")}`;
  return [...projects]
    .map((project) => ({
      project,
      score:
        semanticSimilarity(reference, composeProjectText(project)) * 0.6 +
        lexicalScore(tokenize(reference), tokenize(composeProjectText(project))) * 0.4,
    }))
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.project);
}

function rankCoordinators(
  topic: Topic,
  analogs: AnalogueProject[],
  registry: LiveRegistry,
  candidatePartners: CandidatePartner[],
  query: string,
) {
  return registry.organisations
    .map((organisation) => ({
      organisationId: organisation.id,
      organisationName: organisation.name,
      country: organisation.country,
      score: round(
        scoreCandidateCoordinator(
          organisation,
          topic,
          analogs,
          candidatePartners,
          query,
          undefined,
          registry,
        ),
        1,
      ),
      rationale: buildCoordinatorRationale(organisation, analogs, candidatePartners),
    }))
    .sort((left, right) => right.score - left.score);
}

function scoreCandidateCoordinator(
  organisation: Organisation,
  topic: Topic,
  analogs: AnalogueProject[] | undefined,
  candidatePartners: CandidatePartner[],
  query: string,
  rankedCoordinators?: RankedCoordinator[],
  registry?: LiveRegistry,
) {
  const analogueProjects = analogs ?? [];
  const activeRegistry = registry ?? buildLiveRegistryFromCaches();
  const similarTopicCount = analogueProjects.filter(
    (project) => project.coordinatorOrgId === organisation.id,
  ).length;
  const sameProgrammeCount = analogueProjects.filter(
    (project) =>
      normalizeText(project.programme) === normalizeText(topic.programme) &&
      project.coordinatorOrgId === organisation.id,
  ).length;
  const sameActionCount = analogueProjects.filter(
    (project) =>
      normalizeActionType(project.actionType) === normalizeActionType(topic.actionType) &&
      project.coordinatorOrgId === organisation.id,
  ).length;
  const recencyScores = analogueProjects
    .filter((project) => project.coordinatorOrgId === organisation.id)
    .map((project) => recencyWeight(project.endDate));
  const recency =
    recencyScores.reduce((sum, value) => sum + value, 0) / Math.max(1, recencyScores.length);
  const topicalFit = semanticSimilarity(
    `${query} ${topic.title}`,
    `${organisation.name} ${organisation.description} ${organisation.domains.join(" ")}`,
  );
  const maxFunding = Math.max(
    1,
    ...(rankedCoordinators?.map((entry) => entry.score) ?? [organisation.totalKnownFundingEur, 1]),
    organisation.totalKnownFundingEur,
  );
  const fundingWeight = clamp(
    Math.log10(Math.max(1, organisation.totalKnownFundingEur)) / Math.log10(Math.max(10, maxFunding)),
    0,
    1,
  );
  const centrality = calculateNetworkCentrality(
    organisation.id,
    activeRegistry.collaborationGraph,
  );
  const partnerCompatibility =
    candidatePartners.length > 0
      ? clamp(
          candidatePartners.reduce((sum, candidate) => {
            const matched = matchCandidateToOrganisation(candidate, activeRegistry);
            if (!matched) {
              return sum + 0.45;
            }
            const edgeWeight = activeRegistry.collaborationGraph.get(organisation.id)?.get(matched.id) ?? 0;
            return sum + clamp(edgeWeight / 3, 0.4, 1);
          }, 0) / Math.max(1, candidatePartners.length),
          0,
          1,
        )
      : 0.72;

  return (
    clamp(similarTopicCount / 4, 0, 1) * 26 +
    clamp(sameProgrammeCount / 4, 0, 1) * 15 +
    clamp(sameActionCount / 4, 0, 1) * 10 +
    clamp(recency, 0, 1) * 12 +
    centrality * 12 +
    topicalFit * 15 +
    fundingWeight * 5 +
    partnerCompatibility * 5
  );
}

function buildCoordinatorRationale(
  organisation: Organisation,
  analogs: AnalogueProject[],
  candidatePartners: CandidatePartner[],
) {
  const rationale = [
    `${organisation.pastCoordinationCount} public coordination(s) were observed in the retrieved analogue set.`,
    `${organisation.country} shows up in relevant analogue consortia, but country remains a secondary signal.`,
  ];
  const similarCoordinations = analogs.filter((project) => project.coordinatorOrgId === organisation.id).length;
  if (similarCoordinations > 0) {
    rationale.push(`${similarCoordinations} top analogue project(s) were coordinated by this organisation.`);
  }
  if (candidatePartners.length > 0) {
    rationale.push("Coordinator fit includes compatibility with the supplied candidate consortium.");
  }
  return rationale;
}

function buildCandidateRationale(
  candidate: CandidatePartner,
  organisation: Organisation | undefined,
  result: SearchResult,
) {
  if (!organisation) {
    return [
      "No strong historical canonical match was found in the public analogue set.",
      "The score therefore leans on the supplied role and country metadata more than on historical coordination evidence.",
    ];
  }

  return [
    `Matched to ${organisation.name} (${organisation.country}).`,
    `${organisation.pastCoordinationCount} relevant public coordination(s) were retrieved.`,
    `${organisation.organisationType} profile aligns with ${result.topic.actionType} leadership patterns.`,
    candidate.role ? `Supplied role "${candidate.role}" was included in the fit calculation.` : "Role fit was inferred from public project history.",
  ];
}

function scoreOpportunity(
  topic: Topic,
  queryTokens: string[],
  queryEmbedding: number[],
  analogs: AnalogueProject[],
) {
  const lexical = clamp(
    lexicalScore(queryTokens, tokenize(composeTopicText(topic))) * 0.7 +
      lexicalScore(queryTokens, tokenize(topic.keywords.join(" "))) * 0.3,
    0,
    1,
  );
  const semantic = semanticSimilarity(
    queryTokens.join(" "),
    `${topic.title} ${topic.description} ${topic.keywords.join(" ")}`,
  );
  const analogAlignment =
    analogs.slice(0, 3).reduce((sum, project) => {
      return sum + semanticSimilarity(composeTopicText(topic), composeProjectText(project));
    }, 0) / Math.max(1, Math.min(3, analogs.length));
  const actionTypeFit = inferActionTypeFit(queryTokens, topic.actionType);
  const trlFit = inferTrlFit(queryTokens, topic);

  return {
    lexical: round(lexical, 3),
    semantic: round(clamp((semantic + cosineSimilarity(queryEmbedding, embedText(composeTopicText(topic)))) / 2, 0, 1), 3),
    analogAlignment: round(analogAlignment, 3),
    actionTypeFit: round(actionTypeFit, 3),
    trlFit: round(trlFit, 3),
  };
}

function scoreCoordinator(
  bestCoordinator: RankedCoordinator | undefined,
  topic: Topic,
  context: TopicContext,
  candidatePartners: CandidatePartner[],
) {
  if (!bestCoordinator) {
    return {
      topicCoordinations: 0.42,
      programmeCoordinations: 0.42,
      actionTypeCoordinations: 0.42,
      recency: 0.42,
      fundingExperience: 0.42,
      networkCentrality: 0.42,
      candidateConsortiumFit: 0.42,
    };
  }

  const organisation = context.registry.organisationsById.get(bestCoordinator.organisationId);
  if (!organisation) {
    return {
      topicCoordinations: 0.42,
      programmeCoordinations: 0.42,
      actionTypeCoordinations: 0.42,
      recency: 0.42,
      fundingExperience: 0.42,
      networkCentrality: 0.42,
      candidateConsortiumFit: 0.42,
    };
  }

  const topicCoordinations = clamp(
    context.analogs.filter((project) => project.coordinatorOrgId === organisation.id).length / 4,
    0,
    1,
  );
  const programmeCoordinations = clamp(
    (context.registry.organisationProjects.get(organisation.id) ?? []).filter(
      (project) => normalizeText(project.programme) === normalizeText(topic.programme),
    ).length / 4,
    0,
    1,
  );
  const actionTypeCoordinations = clamp(
    (context.registry.organisationProjects.get(organisation.id) ?? []).filter(
      (project) => normalizeActionType(project.actionType) === normalizeActionType(topic.actionType),
    ).length / 4,
    0,
    1,
  );
  const recencyValues = context.analogs
    .filter((project) => project.coordinatorOrgId === organisation.id)
    .map((project) => recencyWeight(project.endDate));
  const recency =
    recencyValues.reduce((sum, value) => sum + value, 0) / Math.max(1, recencyValues.length);
  const maxFunding = Math.max(
    1,
    ...context.registry.organisations.map((entry) => entry.totalKnownFundingEur),
  );
  const fundingExperience = clamp(
    Math.log10(Math.max(1, organisation.totalKnownFundingEur)) / Math.log10(maxFunding),
    0,
    1,
  );
  const networkCentrality = calculateNetworkCentrality(
    organisation.id,
    context.registry.collaborationGraph,
  );
  const candidateConsortiumFit =
    candidatePartners.length > 0
      ? clamp(scorePartnerCompatibility(organisation.id, candidatePartners, context.registry), 0, 1)
      : 0.72;

  return {
    topicCoordinations: round(topicCoordinations, 3),
    programmeCoordinations: round(programmeCoordinations, 3),
    actionTypeCoordinations: round(actionTypeCoordinations, 3),
    recency: round(recency, 3),
    fundingExperience: round(fundingExperience, 3),
    networkCentrality: round(networkCentrality, 3),
    candidateConsortiumFit: round(candidateConsortiumFit, 3),
  };
}

function scoreConsortium(context: TopicContext, candidatePartners: CandidatePartner[]) {
  const candidateSize = candidatePartners.length || context.averageConsortiumSize || 4;
  const shapeSimilarity = 1 - clamp(Math.abs(candidateSize - context.averageConsortiumSize) / 6, 0, 0.8);
  const missingRoles = computeMissingRoles(candidatePartners, (candidate) =>
    matchCandidateToOrganisation(candidate, context.registry),
  );
  const roleCompleteness =
    candidatePartners.length > 0 ? 1 - missingRoles.length / REQUIRED_ROLES.length : 0.8;
  const collaborationStrength =
    candidatePartners.length > 1
      ? clamp(
          candidatePartners.reduce((sum, candidate, index) => {
            const current = matchCandidateToOrganisation(candidate, context.registry)?.id;
            if (!current) {
              return sum;
            }
            for (const other of candidatePartners.slice(index + 1)) {
              const matched = matchCandidateToOrganisation(other, context.registry)?.id;
              if (matched) {
                sum += context.registry.collaborationGraph.get(current)?.get(matched) ?? 0;
              }
            }
            return sum;
          }, 0) / 6,
          0,
          1,
        )
      : 0.66;
  const countryPatternFit =
    candidatePartners.length > 0
      ? clamp(scoreCountryPattern(candidatePartners, context.commonCountryCombinations), 0, 1)
      : 0.78;
  const eligibilityFit =
    candidatePartners.length === 0
      ? 0.82
      : new Set(candidatePartners.map((candidate) => candidate.country).filter(Boolean)).size >= 3
        ? 0.92
        : 0.42;
  const diversityBonus =
    candidatePartners.length > 0
      ? clamp(new Set(candidatePartners.map((candidate) => candidate.country).filter(Boolean)).size / 5, 0.25, 1)
      : 0.74;

  return {
    shapeSimilarity: round(shapeSimilarity, 3),
    roleCompleteness: round(roleCompleteness, 3),
    collaborationStrength: round(collaborationStrength, 3),
    countryPatternFit: round(countryPatternFit, 3),
    eligibilityFit: round(eligibilityFit, 3),
    diversityBonus: round(diversityBonus, 3),
  };
}

function scoreCoverage(topic: Topic, analogs: AnalogueProject[], baseline?: number) {
  const density = clamp(analogs.length / 5, 0, 1);
  const recency =
    analogs.reduce((sum, project) => sum + recencyWeight(project.endDate), 0) / Math.max(1, analogs.length);
  const completeness =
    topic.description.length > 160 && Boolean(topic.eligibilityText) && topic.keywords.length >= 4
      ? 0.92
      : 0.68;
  const baselineAvailability = baseline ? 1 : 0.4;

  return round((density * 0.45 + recency * 0.25 + completeness * 0.2 + baselineAvailability * 0.1) * 100, 1);
}

function buildProbabilityView(
  topic: Topic,
  finalScore: number,
  opportunityScore: number,
  coordinatorScore: number,
  consortiumScore: number,
  coverageScore: number,
  baseline?: number,
): ProbabilityView {
  const confidenceLabel = deriveConfidenceLabel(baseline, coverageScore);
  if (!baseline) {
    return {
      mode: "relative_index",
      index: round(clamp(finalScore, 18, 94), 1),
      confidenceLabel,
      explanation:
        "No official public baseline success rate was available in the public dashboard layer for this programme slice, so the app shows a relative index instead of a percentage.",
    };
  }

  const seed = hashString(`${topic.id}:${round(finalScore, 2)}`);
  const samples: number[] = [];
  for (let step = 0; step < 240; step += 1) {
    const beta = 0.28 + pseudoRandom(seed + step) * 0.24;
    const uncertaintyPenalty = (1 - coverageScore / 100) * (0.05 + pseudoRandom(seed + step * 3) * 0.12);
    const noise = (pseudoRandom(seed + step * 7) - 0.5) * 0.18;
    const scoreLift =
      ((opportunityScore - 50) * 0.42 +
        (coordinatorScore - 50) * 0.28 +
        (consortiumScore - 50) * 0.2 +
        (coverageScore - 50) * 0.1) /
      100;
    const adjustedLogit = logit(baseline) + beta * scoreLift - uncertaintyPenalty + noise;
    const probability = sigmoid(adjustedLogit);
    samples.push(clamp(probability, Math.max(0.03, baseline * 0.45), Math.min(0.72, baseline * 1.8 + 0.08)));
  }

  samples.sort((left, right) => left - right);

  return {
    mode: "public_probability",
    baseline: round(baseline * 100, 1),
    p10: round(percentile(samples, 0.1) * 100, 1),
    median: round(percentile(samples, 0.5) * 100, 1),
    p90: round(percentile(samples, 0.9) * 100, 1),
    confidenceLabel,
    explanation:
      "Bounded Monte Carlo adjustment around the public programme-dashboard baseline, using topic fit, coordinator evidence, consortium fit, and data coverage.",
  };
}

function buildRedFlags(
  topic: LiveTopic,
  coverageScore: number,
  candidatePartners: CandidatePartner[],
  probability: ProbabilityView,
) {
  const flags: string[] = [];
  if (topic.statusTag === "closed") {
    flags.push("No current open submission window was detected for this topic; treat it as historical analogue evidence.");
  }
  if (topic.statusTag === "forthcoming") {
    flags.push("The topic is forthcoming rather than open for submission today.");
  }
  const deadlineGap = daysUntil(topic.deadline);
  if (deadlineGap < 90 && topic.statusTag === "open") {
    flags.push(`Deadline is only ${deadlineGap} days away, which raises delivery and consortium-closing risk.`);
  }
  if (coverageScore < 58) {
    flags.push("Public analogue coverage is thin, so recommendations are more directional than stable.");
  }
  if (
    candidatePartners.length > 0 &&
    computeMissingRoles(candidatePartners, (candidate) =>
      matchCandidateToOrganisation(candidate, buildLiveRegistryFromCaches()),
    ).length > 1
  ) {
    flags.push("The supplied consortium is missing at least two role archetypes common in historical winners.");
  }
  if (probability.mode === "relative_index") {
    flags.push("No official public baseline success rate was available, so the app cannot show a percentage probability.");
  }
  return flags;
}

function buildNextSteps(
  topic: Topic,
  coordinators: RankedCoordinator[],
  countryMix: string[],
) {
  return [
    `Verify expected outcomes, admissibility, and exact eligibility wording on the official topic page for ${topic.topicId}.`,
    `Shortlist the top ${Math.min(5, coordinators.length)} coordinator options and confirm who can mobilise the right work-package leads.`,
    "Review the top analogous funded projects and extract concrete consortium and work-package patterns.",
    `Target a country mix close to ${countryMix.join(", ")} unless eligibility or market logic suggests a stronger alternative.`,
    "Fill missing role gaps early, especially pilot, deployment, and standardisation support where relevant.",
    "Prepare outreach messages and a coordinator comparison note before opening full proposal drafting.",
  ];
}

function buildReasonsToPursue(
  opportunityScore: number,
  coordinatorScore: number,
  consortiumScore: number,
  coverageScore: number,
) {
  const reasons = [
    opportunityScore > 72
      ? "Strong topic fit against current call language and historical analogue content."
      : "The topic still has a credible thematic match, even if not the strongest in the portfolio.",
    coordinatorScore > 70
      ? "Public coordinator patterns are strong and repeatable in this thematic area."
      : "Coordinator options exist, but leadership quality will matter more than average.",
    coverageScore > 65
      ? "Evidence density is healthy enough to make the ranking explainable."
      : "Even limited evidence still provides a usable directional signal.",
  ];
  if (consortiumScore > 70) {
    reasons.push("Consortium shape patterns are visible in the public analogue set.");
  }
  return reasons.slice(0, 3);
}

function buildReasonsNotToPursue(
  topic: LiveTopic,
  coverageScore: number,
  missingRoles: string[],
  probability: ProbabilityView,
) {
  const reasons = [];
  if (topic.statusTag !== "open") {
    reasons.push("The best thematic match may not currently be open for submission.");
  }
  if (coverageScore < 58) {
    reasons.push("Sparse public analogue density reduces confidence in the ranking and coordinator advice.");
  }
  if (missingRoles.length > 0) {
    reasons.push(`Current consortium picture is missing ${missingRoles.join(", ")} role coverage.`);
  }
  if (daysUntil(topic.deadline) < 100 && topic.statusTag === "open") {
    reasons.push("The remaining time window is short for a complex multi-country consortium build.");
  }
  if (probability.mode === "public_probability" && probability.p90 < 18) {
    reasons.push("Even the upper public-data band remains modest after bounded adjustments.");
  }
  if (probability.mode === "relative_index" && probability.index < 55) {
    reasons.push("Relative win-likelihood is only moderate and may not justify immediate bid effort.");
  }
  return reasons.slice(0, 3);
}

function buildImprovementLevers(
  missingRoles: string[],
  coordinators: RankedCoordinator[],
  coverageScore: number,
) {
  const levers = [];
  if (missingRoles.length > 0) {
    levers.push(`Add partners that cover ${missingRoles.slice(0, 2).join(" and ")} gaps.`);
  }
  if (coordinators[0]) {
    levers.push(`Stress-test ${coordinators[0].organisationName} as coordinator against your preferred lead.`);
  }
  if (coverageScore < 60) {
    levers.push("Collect more manual evidence from recent public projects before committing full bid resources.");
  }
  levers.push("Tighten work-package logic around deployment, validation, and exploitation roles.");
  return levers.slice(0, 3);
}

function buildSupportingEvidence(
  topic: LiveTopic,
  context: TopicContext,
  probability: ProbabilityView,
) {
  const evidence = [
    {
      label: topic.topicId,
      url: topic.sourceUrl,
      note: "Current topic source from the EU Funding & Tenders Portal.",
    },
    ...context.analogs.slice(0, 4).map((project) => ({
      label: project.title,
      url: project.sourceUrl,
      note: "Relevant funded analogue from public CORDIS project data.",
    })),
  ];
  if (probability.mode === "public_probability") {
    evidence.push({
      label: `${topic.programme} ${topic.actionType} baseline`,
      url:
        dataset.programmeStats.find(
          (entry) =>
            normalizeText(entry.programme) === normalizeText(topic.programme) &&
            normalizeActionType(entry.actionType) === normalizeActionType(topic.actionType),
        )?.sourceUrl ??
        "https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/programmes/programme-dashboards",
      note: "Public programme-dashboard baseline used to anchor the probability band.",
    });
  }
  return evidence.slice(0, 5);
}

function buildCountryEvidenceSummary(countryCounts: Map<string, number>) {
  const topCountries = [...countryCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4)
    .map(([country, count]) => `${country} (${count})`);

  return `Country evidence is treated as a secondary pattern. The strongest analogue presence was ${topCountries.join(", ") || "not strong enough to distinguish"}, but topic fit, coordinator history, and role coverage carry more weight.`;
}

function rememberOrganisationDetails(
  registry: LiveRegistry,
  projects: AnalogueProject[],
  relevantTopics: Topic[],
  query: string,
) {
  for (const organisation of registry.organisations) {
    const involvedProjects = registry.organisationProjects.get(organisation.id) ?? [];
    const collaboratorCounts = new Map<string, number>();
    for (const project of involvedProjects) {
      const participants = project.participantDetails.map((participant) => participant.organisationId);
      for (const participantId of participants) {
        if (participantId === organisation.id) {
          continue;
        }
        collaboratorCounts.set(participantId, (collaboratorCounts.get(participantId) ?? 0) + 1);
      }
    }

    const detail: OrganisationDetail = {
      organisation,
      matchedAliases: registry.aliasesById.get(organisation.id) ?? [],
      pastCoordinationCount: organisation.pastCoordinationCount,
      pastParticipationCount: organisation.pastParticipationCount,
      relevantProgrammes: unique(involvedProjects.map((project) => project.programme)).slice(0, 6),
      relevantTopics: relevantTopics
        .filter((topic) => semanticSimilarity(query, composeTopicText(topic)) > 0.3)
        .slice(0, 4),
      totalKnownFundingExposureEur: organisation.totalKnownFundingEur,
      networkCentrality: calculateNetworkCentrality(organisation.id, registry.collaborationGraph),
      frequentCollaborators: [...collaboratorCounts.entries()]
        .map(([organisationId, count]) => ({
          organisationId,
          organisationName: registry.organisationsById.get(organisationId)?.name ?? organisationId,
          count,
        }))
        .sort((left, right) => right.count - left.count)
        .slice(0, 5),
      evidence: [
        {
          label: organisation.name,
          url: organisation.sourceUrl,
          note: "Synthetic organisation profile built from public CORDIS project records.",
        },
        ...involvedProjects.slice(0, 4).map((project) => ({
          label: project.title,
          url: project.sourceUrl,
          note: "Relevant funded project involving this organisation.",
        })),
      ],
    };

    rememberOrganisationDetail(detail);
  }
}

function rememberTopicDetail(detail: TopicDetail) {
  topicDetailCache.set(detail.topic.id, detail);
  safeStorageMerge(STORAGE_KEYS.topicDetails, detail.topic.id, detail);
}

function rememberOrganisationDetail(detail: OrganisationDetail) {
  organisationDetailCache.set(detail.organisation.id, detail);
  safeStorageMerge(STORAGE_KEYS.organisationDetails, detail.organisation.id, detail);
}

function readCachedTopicDetail(topicId: string) {
  const inMemory = topicDetailCache.get(topicId);
  if (inMemory) {
    return inMemory;
  }
  const fromStorage = safeStorageRead<Record<string, TopicDetail>>(STORAGE_KEYS.topicDetails)?.[topicId];
  if (fromStorage) {
    topicDetailCache.set(topicId, fromStorage);
  }
  return fromStorage;
}

function readCachedOrganisationDetail(organisationId: string) {
  const inMemory = organisationDetailCache.get(organisationId);
  if (inMemory) {
    return inMemory;
  }
  const fromStorage =
    safeStorageRead<Record<string, OrganisationDetail>>(STORAGE_KEYS.organisationDetails)?.[organisationId];
  if (fromStorage) {
    organisationDetailCache.set(organisationId, fromStorage);
  }
  return fromStorage;
}

function buildLiveRegistryFromCaches(): LiveRegistry {
  const details = [
    ...organisationDetailCache.values(),
    ...Object.values(safeStorageRead<Record<string, OrganisationDetail>>(STORAGE_KEYS.organisationDetails) ?? {}),
  ];
  const organisations = uniqueBy(details.map((detail) => detail.organisation), (entry) => entry.id);
  const organisationsById = new Map(organisations.map((organisation) => [organisation.id, organisation]));
  return {
    organisations,
    organisationsById,
    aliasesById: new Map(
      details.map((detail) => [detail.organisation.id, detail.matchedAliases]),
    ),
    aliasIndex: new Map(
      details.flatMap((detail) =>
        detail.matchedAliases.map((alias) => [normalizeText(alias), detail.organisation.id] as const),
      ),
    ),
    organisationProjects: new Map(),
    collaborationGraph: new Map(),
    allProjects: [],
  };
}

function applyResultFilters(result: SearchResult, filters: SearchFilters) {
  if (!filters.includeRecentClosed && result.topic.status === "closed") {
    return false;
  }
  if (!filters.includeRecentClosed && isPastDeadline(result.topic.deadline)) {
    return false;
  }
  if (filters.programme && normalizeText(result.topic.programme) !== normalizeText(filters.programme)) {
    return false;
  }
  if (filters.actionType && normalizeActionType(result.topic.actionType) !== normalizeActionType(filters.actionType)) {
    return false;
  }
  const minimumBudget = numberValue(filters.minimumBudget);
  if (minimumBudget !== undefined && result.topic.indicativeBudgetEur < minimumBudget) {
    return false;
  }
  const maximumBudget = numberValue(filters.maximumBudget);
  if (maximumBudget !== undefined && result.topic.indicativeBudgetEur > maximumBudget) {
    return false;
  }
  const deadlineWindowDays = numberValue(filters.deadlineWindowDays);
  if (
    deadlineWindowDays !== undefined &&
    result.topic.status === "open" &&
    daysUntil(result.topic.deadline) > deadlineWindowDays
  ) {
    return false;
  }
  if (
    filters.coordinatorCountry &&
    !result.recommendedCountries.includes(String(filters.coordinatorCountry).toUpperCase())
  ) {
    return false;
  }
  return true;
}

function passesTopicalGuard(query: string, result: SearchResult) {
  const lexical = lexicalScore(tokenize(query), tokenize(composeTopicText(result.topic)));
  const semantic = semanticSimilarity(query, composeTopicText(result.topic));
  return lexical >= 0.08 || semantic >= 0.6;
}

function computeMissingRoles(
  candidatePartners: CandidatePartner[],
  resolver: (candidate: CandidatePartner) => Organisation | undefined,
) {
  if (candidatePartners.length === 0) {
    return [];
  }

  const coverage = new Set<string>();
  for (const partner of candidatePartners) {
    const role = normalizeText(partner.role ?? "");
    const organisation = resolver(partner);
    const values = [role, organisation?.organisationType ?? "", ...(organisation?.archetypeRoles ?? [])].map(normalizeText);
    if (values.some((value) => value.includes("research") || value.includes("university") || value.includes("institute"))) {
      coverage.add("research");
    }
    if (values.some((value) => value.includes("industrial") || value.includes("company") || value.includes("sme") || value.includes("market"))) {
      coverage.add("industrial actor");
    }
    if (values.some((value) => value.includes("pilot") || value.includes("demo") || value.includes("validation") || value.includes("test"))) {
      coverage.add("pilot site");
    }
    if (values.some((value) => value.includes("end-user") || value.includes("authority") || value.includes("operator") || value.includes("deployment"))) {
      coverage.add("end-user");
    }
    if (values.some((value) => value.includes("standard") || value.includes("certification") || value.includes("association") || value.includes("regulatory"))) {
      coverage.add("standardisation");
    }
  }

  return REQUIRED_ROLES.filter((role) => !coverage.has(role));
}

function matchCandidateToOrganisation(candidate: CandidatePartner, registry: LiveRegistry) {
  const name = normalizeText(candidate.name);
  const aliasHit = registry.aliasIndex.get(name);
  if (aliasHit) {
    return registry.organisationsById.get(aliasHit);
  }

  let bestMatch: Organisation | undefined;
  let bestScore = 0;
  for (const organisation of registry.organisations) {
    const score = fuzzyNameSimilarity(name, normalizeText(organisation.name));
    if (score > bestScore) {
      bestScore = score;
      bestMatch = organisation;
    }
  }

  return bestScore > 0.6 ? bestMatch : undefined;
}

function scorePartnerCompatibility(
  organisationId: string,
  candidates: CandidatePartner[],
  registry: LiveRegistry,
) {
  const weights = candidates.map((candidate) => {
    const matched = matchCandidateToOrganisation(candidate, registry)?.id;
    if (!matched) {
      return 0.46;
    }
    const edgeWeight = registry.collaborationGraph.get(organisationId)?.get(matched) ?? 0;
    return clamp(edgeWeight / 3, 0.38, 1);
  });

  return weights.reduce((sum, value) => sum + value, 0) / Math.max(1, weights.length);
}

function scoreCountryPattern(
  candidates: CandidatePartner[],
  combinations: Array<{ label: string; count: number }>,
) {
  const candidateCountries = new Set(
    candidates.map((candidate) => candidate.country.toUpperCase()).filter(Boolean),
  );
  const topCombination = combinations[0]?.label.split(" + ") ?? [];
  const overlap = topCombination.filter((country) => candidateCountries.has(country)).length;
  return overlap / Math.max(1, Math.min(candidateCountries.size, topCombination.length));
}

function lookupBaseline(topic: Topic) {
  return dataset.programmeStats.find(
    (entry) =>
      normalizeText(entry.programme) === normalizeText(topic.programme) &&
      normalizeActionType(entry.actionType) === normalizeActionType(topic.actionType),
  )?.successRate;
}

function deriveConfidenceLabel(baseline: number | undefined, coverageScore: number): ConfidenceLabel {
  if (baseline && coverageScore >= 72) {
    return "High";
  }
  if (coverageScore >= 56) {
    return "Medium";
  }
  return "Low";
}

function inferProgrammeName(callIdentifier?: string, identifier?: string, title?: string) {
  const reference = `${callIdentifier ?? ""} ${identifier ?? ""} ${title ?? ""}`.toUpperCase();
  if (reference.includes("HORIZON-CL4")) {
    return "Horizon Europe Cluster 4";
  }
  if (reference.includes("HORIZON-CL5")) {
    return "Horizon Europe Cluster 5";
  }
  if (reference.includes("HORIZON-CL6")) {
    return "Horizon Europe Cluster 6";
  }
  if (reference.includes("HORIZON-CL2")) {
    return "Horizon Europe Cluster 2";
  }
  if (reference.includes("HORIZON-JU-CHIPS") || reference.includes("DIGITAL-JU-CHIPS")) {
    return "Chips Joint Undertaking";
  }
  if (reference.includes("CLEANH2")) {
    return "Clean Hydrogen Joint Undertaking";
  }
  if (reference.startsWith("LIFE")) {
    return "LIFE Circular Economy";
  }
  if (reference.startsWith("DIGITAL")) {
    return "Digital Europe Programme";
  }
  if (reference.includes("ERC")) {
    return "European Research Council";
  }
  if (reference.includes("HORIZON")) {
    return "Horizon Europe";
  }
  return "EU Programme";
}

function normalizeActionType(value: string) {
  const upper = value.toUpperCase();
  if (upper.includes("RIA") || upper.includes("RESEARCH AND INNOVATION")) {
    return "RIA";
  }
  if (upper.includes("IA") || upper.includes("INNOVATION ACTION")) {
    return "IA";
  }
  if (upper.includes("CSA") || upper.includes("COORDINATION AND SUPPORT")) {
    return "CSA";
  }
  if (upper.includes("SAP") || upper.includes("STANDARD ACTION")) {
    return "SAP";
  }
  if (upper.includes("ERC")) {
    return "ERC";
  }
  return value.split(" ")[0] || "Grant";
}

function parseAction(value?: string) {
  const parsed = safeJsonParse<ParsedAction[]>(value);
  return parsed?.[0];
}

function parseBudgetOverview(value?: string, identifier?: string): number {
  const parsed = safeJsonParse<{
    budgetTopicActionMap?: Record<
      string,
      Array<{
        action?: string;
        budgetYearMap?: Record<string, string | number>;
        maxContribution?: number;
        expectedGrants?: number;
      }>
    >;
  }>(value);
  if (!parsed?.budgetTopicActionMap) {
    return 0;
  }

  for (const actions of Object.values(parsed.budgetTopicActionMap)) {
    for (const action of actions) {
      if (identifier && action.action && !action.action.includes(identifier)) {
        continue;
      }
      const yearBudget = Object.values(action.budgetYearMap ?? {}).reduce<number>((sum, rawValue) => {
        const numeric = Number(rawValue);
        return Number.isFinite(numeric) ? sum + numeric : sum;
      }, 0);
      if (yearBudget > 0) {
        return yearBudget;
      }
      if (action.maxContribution && action.expectedGrants) {
        return action.maxContribution * action.expectedGrants;
      }
    }
  }

  return 0;
}

function firstDeadlineFromBudget(value?: string) {
  const parsed = safeJsonParse<{
    budgetTopicActionMap?: Record<string, Array<{ deadlineDates?: string[] }>>;
  }>(value);
  if (!parsed?.budgetTopicActionMap) {
    return undefined;
  }

  for (const actions of Object.values(parsed.budgetTopicActionMap)) {
    for (const action of actions) {
      if (action.deadlineDates?.[0]) {
        return action.deadlineDates[0];
      }
    }
  }

  return undefined;
}

function mapStatusCode(rawStatus?: string, fallbackText?: string) {
  switch (rawStatus) {
    case "31094502":
      return "open";
    case "31094501":
      return "forthcoming";
    case "31094503":
      return "closed";
    default:
      if ((fallbackText ?? "").toLowerCase().includes("forthcoming")) {
        return "forthcoming";
      }
      if ((fallbackText ?? "").toLowerCase().includes("open")) {
        return "open";
      }
      return "closed";
  }
}

function statusPriority(status: LiveTopic["statusTag"]) {
  if (status === "open") {
    return 0;
  }
  if (status === "forthcoming") {
    return 1;
  }
  return 2;
}

function inferActionTypeFromIdentifier(identifier?: string) {
  const upper = (identifier ?? "").toUpperCase();
  if (upper.includes("RIA")) {
    return "RIA";
  }
  if (upper.includes("IA")) {
    return "IA";
  }
  if (upper.includes("CSA")) {
    return "CSA";
  }
  if (upper.includes("SAP")) {
    return "SAP";
  }
  return "Grant";
}

function inferRoles(organisationType: string, organisationName: string, projectText: string) {
  const reference = normalizeText(`${organisationType} ${organisationName} ${projectText}`);
  const roles = new Set<string>();
  if (/university|research|institute|academy|higher education|laboratory|centre/.test(reference)) {
    roles.add("research");
  }
  if (/company|industry|industrial|sme|manufacturer|enterprise|ltd|gmbh|sa\b|bv\b|nv\b/.test(reference)) {
    roles.add("industrial actor");
  }
  if (/pilot|demonstration|demo|validation|testbed|hospital|city|municipality|operator|school|construction/.test(reference)) {
    roles.add("pilot site");
  }
  if (/authority|agency|operator|association|network|cluster|deployment|end user|city/.test(reference)) {
    roles.add("end-user");
  }
  if (/standard|certification|regulatory|association|norm|compliance/.test(reference)) {
    roles.add("standardisation");
  }
  if (roles.size === 0) {
    roles.add("industrial actor");
  }
  return [...roles];
}

function findOrganisationType(element: Element) {
  const category = xmlElements(element, "category").find(
    (node) => (node.getAttribute("classification") ?? "") === "organizationActivityType",
  );
  return textValue(category, "title") || "Organisation";
}

function textValue(scope: Document | Element | undefined, localName: string) {
  if (!scope) {
    return "";
  }
  const match = xmlElements(scope, localName)[0];
  return match?.textContent?.trim() ?? "";
}

function xmlElements(scope: Document | Element, localName: string) {
  return Array.from(scope.getElementsByTagNameNS("*", localName));
}

function stripProjectEvidence(project: AnalogueProject): Project {
  return {
    id: project.id,
    title: project.title,
    objective: project.objective,
    programme: project.programme,
    actionType: project.actionType,
    topicReferences: project.topicReferences,
    coordinatorOrgId: project.coordinatorOrgId,
    participantOrgIds: project.participantOrgIds,
    countries: project.countries,
    startDate: project.startDate,
    endDate: project.endDate,
    euContributionEur: project.euContributionEur,
    activityType: project.activityType,
    roleMix: project.roleMix,
    sourceUrl: project.sourceUrl,
  };
}

function stripLiveTopic(topic: LiveTopic): Topic {
  return {
    id: topic.id,
    callId: topic.callId,
    topicId: topic.topicId,
    title: topic.title,
    description: topic.description,
    programme: topic.programme,
    actionType: topic.actionType,
    fundingType: topic.fundingType,
    status: topic.status,
    deadline: topic.deadline,
    indicativeBudgetEur: topic.indicativeBudgetEur,
    trlMin: topic.trlMin,
    trlMax: topic.trlMax,
    keywords: topic.keywords,
    eligibilityText: topic.eligibilityText,
    sourceUrl: topic.sourceUrl,
    lastFetchedAt: topic.lastFetchedAt,
  };
}

function buildTopicUrl(topicId: string) {
  return `https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/${topicId}`;
}

function extractTopicIdFromUrl(url?: string) {
  if (!url) {
    return undefined;
  }
  const match = url.match(/topic-details\/([^/?#.]+)/);
  return match?.[1];
}

function composeTopicText(topic: Topic) {
  return `${topic.title}. ${topic.description}. ${topic.keywords.join(" ")}. ${topic.programme} ${topic.actionType}`;
}

function composeProjectText(project: Project) {
  return `${project.title}. ${project.objective}. ${project.topicReferences.join(" ")}. ${project.programme} ${project.actionType}`;
}

function coerceFilters(value?: Record<string, unknown>): SearchFilters {
  return {
    programme: stringValue(value?.programme),
    actionType: stringValue(value?.actionType),
    includeRecentClosed: Boolean(value?.includeRecentClosed),
    deadlineWindowDays: value?.deadlineWindowDays as number | string | undefined,
    minimumBudget: value?.minimumBudget as number | string | undefined,
    maximumBudget: value?.maximumBudget as number | string | undefined,
    coordinatorCountry: stringValue(value?.coordinatorCountry),
    minimumConsortiumSize: value?.minimumConsortiumSize as number | string | undefined,
    maximumConsortiumSize: value?.maximumConsortiumSize as number | string | undefined,
  };
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : undefined;
}

function splitTerms(value?: string) {
  return (value ?? "")
    .split(/[;,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function extractTerms(text: string) {
  const counts = new Map<string, number>();
  for (const token of tokenize(text)) {
    if (token.length < 4 || TERM_STOPWORDS.has(token)) {
      continue;
    }
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([token]) => token);
}

function parseTrl(text: string) {
  const rangeMatch = text.match(/TRL\s*(\d)\s*[-to]+\s*(\d)/i);
  if (rangeMatch) {
    return { min: Number(rangeMatch[1]), max: Number(rangeMatch[2]) };
  }
  const singleMatch = text.match(/TRL\s*(\d)/i);
  if (singleMatch) {
    const value = Number(singleMatch[1]);
    return { min: value, max: value };
  }
  return undefined;
}

function fallbackDeadline(status: LiveTopic["statusTag"]) {
  if (status === "forthcoming") {
    const date = new Date();
    date.setUTCMonth(date.getUTCMonth() + 6);
    return date.toISOString().slice(0, 10);
  }
  if (status === "open") {
    const date = new Date();
    date.setUTCMonth(date.getUTCMonth() + 3);
    return date.toISOString().slice(0, 10);
  }
  return "2024-01-01";
}

function isPastDeadline(value: string) {
  const deadline = new Date(`${value}T23:59:59Z`);
  return deadline.getTime() < Date.now();
}

function normalizeIsoDate(value?: string) {
  if (!value) {
    return undefined;
  }
  const match = value.match(/\d{4}-\d{2}-\d{2}/);
  return match?.[0];
}

function stripHtml(value: string) {
  if (typeof document !== "undefined") {
    const container = document.createElement("div");
    container.innerHTML = value;
    return container.textContent?.replace(/\s+/g, " ").trim() ?? "";
  }

  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#xa0;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeJsonParse<T>(value?: string) {
  if (!value) {
    return undefined;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function safeStorageMerge<T>(key: string, id: string, value: T) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const current = safeStorageRead<Record<string, T>>(key) ?? {};
    current[id] = value;
    sessionStorage.setItem(key, JSON.stringify(current));
  } catch {
    // Ignore storage quota pressure and keep the in-memory cache alive.
  }
}

function safeStorageRead<T>(key: string) {
  if (typeof window === "undefined") {
    return undefined;
  }
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) {
      return undefined;
    }
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

function normalizeText(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: string) {
  return normalizeText(text)
    .split(" ")
    .filter((token) => token.length > 1);
}

function embedText(text: string) {
  const vector = new Array<number>(EMBEDDING_DIM).fill(0);
  for (const token of tokenize(text)) {
    const base = hashString(token);
    for (let index = 0; index < EMBEDDING_DIM; index += 1) {
      const value = Math.sin(base * (index + 1) * 0.0001) + Math.cos((base + index) * 0.0002);
      vector[index] += value;
    }
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / norm);
}

function cosineSimilarity(left: number[], right: number[]) {
  return clamp(
    left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0) * 0.5 + 0.5,
    0,
    1,
  );
}

function semanticSimilarity(left: string, right: string) {
  return cosineSimilarity(embedText(left), embedText(right));
}

function lexicalScore(queryTokens: string[], documentTokens: string[]) {
  if (queryTokens.length === 0 || documentTokens.length === 0) {
    return 0;
  }
  const tokenSet = new Set(documentTokens);
  const overlap = queryTokens.filter((token) => tokenSet.has(token)).length;
  return clamp(overlap / queryTokens.length, 0, 1);
}

function inferActionTypeFit(queryTokens: string[], actionType: string) {
  const joined = queryTokens.join(" ");
  if (/pilot|deployment|scale|validation|demonstration/.test(joined)) {
    return actionType === "IA" || actionType === "SAP" ? 0.9 : 0.58;
  }
  if (/research|materials|interposer|packaging|passport|construction/.test(joined)) {
    return actionType === "RIA" ? 0.88 : 0.64;
  }
  return 0.66;
}

function inferTrlFit(queryTokens: string[], topic: Topic) {
  const joined = queryTokens.join(" ");
  const match = joined.match(/trl\s*(\d+)/);
  if (!match || !topic.trlMin || !topic.trlMax) {
    return 0.62;
  }
  const requestedTrl = Number(match[1]);
  return requestedTrl >= topic.trlMin && requestedTrl <= topic.trlMax ? 0.92 : 0.34;
}

function buildCollaborationGraph(projects: AnalogueProject[]) {
  const graph = new Map<string, Map<string, number>>();
  for (const project of projects) {
    const participants = project.participantDetails.map((participant) => participant.organisationId);
    for (const source of participants) {
      const edges = graph.get(source) ?? new Map<string, number>();
      graph.set(source, edges);
      for (const target of participants) {
        if (source === target) {
          continue;
        }
        edges.set(target, (edges.get(target) ?? 0) + 1 + recencyWeight(project.endDate));
      }
    }
  }
  return graph;
}

function calculateNetworkCentrality(
  organisationId: string,
  graph: Map<string, Map<string, number>>,
) {
  const neighbors = graph.get(organisationId);
  if (!neighbors) {
    return 0.1;
  }
  const weightedDegree = [...neighbors.values()].reduce((sum, value) => sum + value, 0);
  const maxPossible = Math.max(
    1,
    ...[...graph.values()].map((edges) => [...edges.values()].reduce((sum, value) => sum + value, 0)),
  );
  return clamp(weightedDegree / maxPossible, 0.1, 1);
}

function fuzzyNameSimilarity(left: string, right: string) {
  const leftTokens = new Set(left.split(" "));
  const rightTokens = new Set(right.split(" "));
  const shared = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const denominator = Math.max(leftTokens.size, rightTokens.size, 1);
  const tokenScore = shared / denominator;
  const charOverlap = longestCommonSubsequence(left, right) / Math.max(left.length, right.length, 1);
  return tokenScore * 0.6 + charOverlap * 0.4;
}

function longestCommonSubsequence(left: string, right: string) {
  const matrix = Array.from({ length: left.length + 1 }, () => new Array<number>(right.length + 1).fill(0));
  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      matrix[i][j] =
        left[i - 1] === right[j - 1]
          ? matrix[i - 1][j - 1] + 1
          : Math.max(matrix[i - 1][j], matrix[i][j - 1]);
    }
  }
  return matrix[left.length][right.length];
}

function recencyWeight(dateValue: string) {
  const currentYear = new Date().getUTCFullYear();
  const yearDelta = currentYear - new Date(`${dateValue}T00:00:00Z`).getUTCFullYear();
  return clamp(1 - yearDelta * 0.12, 0.25, 1);
}

function pseudoRandom(seed: number) {
  const value = Math.sin(seed) * 10000;
  return value - Math.floor(value);
}

function percentile(values: number[], quantile: number) {
  const index = (values.length - 1) * quantile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) {
    return values[lower];
  }
  return values[lower] + (values[upper] - values[lower]) * (index - lower);
}

function logit(value: number) {
  return Math.log(value / (1 - value));
}

function sigmoid(value: number) {
  return 1 / (1 + Math.exp(-value));
}

function daysUntil(dateValue: string) {
  const currentDate = new Date();
  const targetDate = new Date(`${dateValue}T00:00:00Z`);
  const ms = targetDate.getTime() - currentDate.getTime();
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function firstString(values?: string[]) {
  return values?.find(Boolean);
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function uniqueBy<T>(values: T[], selector: (value: T) => string) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = selector(value);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
