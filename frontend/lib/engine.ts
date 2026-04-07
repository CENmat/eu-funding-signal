import demoDataset from "@/lib/demo-dataset.json";
import type {
  CandidatePartner,
  ConfidenceLabel,
  DemoDataset,
  Organisation,
  OrganisationDetail,
  ProbabilityView,
  Project,
  RankedCoordinator,
  ScenarioComparison,
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

type SearchFilters = {
  programme?: string;
  actionType?: string;
  openOnly?: boolean;
  includeRecentClosed?: boolean;
  yearRange?: [number, number];
  deadlineWindowDays?: number;
  budgetRange?: [number, number];
  coordinatorCountry?: string;
  consortiumSizeRange?: [number, number];
};

type SearchRequest = {
  query: string;
  filters?: SearchFilters;
  approvedExpansions?: string[];
  candidatePartners?: CandidatePartner[];
};

type SearchResponse = {
  query: string;
  normalizedQuery: string;
  suggestedExpansions: Array<{ term: string; reason: string; selectedDefault: boolean }>;
  acceptedExpansions: string[];
  results: SearchResult[];
};

type TopicContext = {
  topic: Topic;
  analogs: Project[];
  baseline?: number;
  coordinatorRanks: RankedCoordinator[];
  countryCounts: Map<string, number>;
  roleCounts: Map<string, number>;
  commonCountryCombinations: Array<{ label: string; count: number }>;
};

const projectById = new Map(dataset.projects.map((project) => [project.id, project]));
const topicById = new Map(dataset.topics.map((topic) => [topic.id, topic]));
const organisationById = new Map(
  dataset.organisations.map((organisation) => [organisation.id, organisation]),
);
const aliasByLowerName = new Map(
  dataset.organisationAliases.map((alias) => [alias.alias.toLowerCase(), alias.organisationId]),
);

const topicDocuments = dataset.topics.map((topic) => ({
  id: topic.id,
  tokens: tokenize(composeTopicText(topic)),
  embedding: embedText(composeTopicText(topic)),
}));

const projectDocuments = dataset.projects.map((project) => ({
  id: project.id,
  tokens: tokenize(composeProjectText(project)),
  embedding: embedText(composeProjectText(project)),
}));

const collaborationGraph = buildCollaborationGraph();

export function getDemoDataset(): DemoDataset {
  return dataset;
}

export function searchDemoData(request: SearchRequest): SearchResponse {
  const normalizedQuery = normalizeText(request.query);
  const suggestedExpansions = suggestExpansions(normalizedQuery);
  const acceptedExpansions = request.approvedExpansions?.length
    ? request.approvedExpansions
    : suggestedExpansions.filter((term) => term.selectedDefault).map((term) => term.term);

  const expandedQuery = [normalizedQuery, ...acceptedExpansions].filter(Boolean).join(" ");
  const queryTokens = tokenize(expandedQuery);
  const queryEmbedding = embedText(expandedQuery);

  const results = dataset.topics
    .filter((topic) => applyTopicFilters(topic, request.filters))
    .map((topic) =>
      buildRankedResult({
        topic,
        normalizedQuery,
        queryTokens,
        queryEmbedding,
        acceptedExpansions,
        candidatePartners: request.candidatePartners ?? [],
      }),
    )
    .sort((left, right) => right.finalScore - left.finalScore)
    .map((result, index) => ({ ...result, rank: index + 1 }));

  return {
    query: request.query,
    normalizedQuery,
    suggestedExpansions,
    acceptedExpansions,
    results,
  };
}

export function getTopicDetail(topicId: string, query?: string): TopicDetail | undefined {
  const topic = topicById.get(topicId);
  if (!topic) {
    return undefined;
  }

  const search = searchDemoData({
    query: query || topic.keywords.slice(0, 2).join(" "),
    filters: { includeRecentClosed: true, openOnly: false },
  });
  const result = search.results.find((entry) => entry.topic.id === topicId);
  if (!result) {
    return undefined;
  }

  const context = buildTopicContext(topic, query || topic.keywords.join(" "), []);
  const coordinatorCountryDistribution = [...context.countryCounts.entries()]
    .map(([country, count]) => ({ country, count }))
    .sort((left, right) => right.count - left.count);
  const commonRolePatterns = [...context.roleCounts.entries()]
    .map(([role, count]) => ({ role, count }))
    .sort((left, right) => right.count - left.count);

  return {
    ...result,
    topHistoricalCoordinators: context.coordinatorRanks,
    coordinatorCountryDistribution,
    commonRolePatterns,
    commonCountryCombinations: context.commonCountryCombinations,
  };
}

export function getOrganisationDetail(
  organisationId: string,
  query?: string,
): OrganisationDetail | undefined {
  const organisation = organisationById.get(organisationId);
  if (!organisation) {
    return undefined;
  }

  const involvedProjects = dataset.projects.filter(
    (project) =>
      project.coordinatorOrgId === organisationId ||
      project.participantOrgIds.includes(organisationId),
  );
  const relevantTopics = dataset.topics
    .filter((topic) => {
      if (!query) {
        return true;
      }
      const similarity = semanticSimilarity(query, composeTopicText(topic));
      return similarity > 0.48;
    })
    .slice(0, 4);
  const collaboratorCounts = new Map<string, number>();
  for (const project of involvedProjects) {
    for (const participant of [project.coordinatorOrgId, ...project.participantOrgIds]) {
      if (participant !== organisationId) {
        collaboratorCounts.set(participant, (collaboratorCounts.get(participant) ?? 0) + 1);
      }
    }
  }

  const evidence = [
    {
      label: organisation.name,
      url: organisation.sourceUrl,
      note: "Public organisation profile evidence from the seeded CORDIS-style layer.",
    },
    ...involvedProjects.slice(0, 3).map((project) => ({
      label: project.title,
      url: project.sourceUrl,
      note: "Relevant funded analogue involving this organisation.",
    })),
  ];

  return {
    organisation,
    matchedAliases: dataset.organisationAliases
      .filter((alias) => alias.organisationId === organisationId)
      .map((alias) => alias.alias),
    pastCoordinationCount: organisation.pastCoordinationCount,
    pastParticipationCount: organisation.pastParticipationCount,
    relevantProgrammes: Array.from(new Set(involvedProjects.map((project) => project.programme))),
    relevantTopics,
    totalKnownFundingExposureEur: organisation.totalKnownFundingEur,
    networkCentrality: calculateNetworkCentrality(organisationId),
    frequentCollaborators: [...collaboratorCounts.entries()]
      .map(([collaboratorId, count]) => ({
        organisationId: collaboratorId,
        organisationName: organisationById.get(collaboratorId)?.name ?? collaboratorId,
        count,
      }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 5),
    evidence,
  };
}

export function compareScenario(
  query: string,
  candidates: CandidatePartner[],
): ScenarioComparison {
  const search = searchDemoData({ query, candidatePartners: candidates });
  const bestTopic = search.results[0];
  const context = buildTopicContext(bestTopic.topic, query, candidates);
  const matchedCandidates = candidates.map((candidate) => {
    const match = matchCandidateToOrganisation(candidate);
    const score = match
      ? scoreCandidateCoordinator(match.organisation, context, candidates)
      : 38 + (candidate.country ? 6 : 0) + (candidate.role ? 8 : 0);
    return {
      name: candidate.name,
      matchedOrganisationId: match?.organisation.id,
      score,
      deltaVsBest: 0,
      rationale: buildCandidateRationale(candidate, match?.organisation, context),
    };
  });

  matchedCandidates.sort((left, right) => right.score - left.score);
  const bestScore = matchedCandidates[0]?.score ?? 0;

  return {
    query,
    bestCoordinatorId: matchedCandidates[0]?.matchedOrganisationId,
    bestCoordinatorName: matchedCandidates[0]?.name,
    recommendedCountryPattern: bestTopic.consortiumCountryMix,
    missingRoles: computeMissingRoles(candidates),
    rankedCandidates: matchedCandidates.map((candidate) => ({
      ...candidate,
      deltaVsBest: round(candidate.score - bestScore, 1),
    })),
  };
}

export function getAdminSnapshot() {
  return {
    dataSources: dataset.dataSources,
    scoreWeights: dataset.scoreWeights,
    featureFlags: dataset.featureFlags,
    refreshLogs: dataset.refreshLogs,
    synonymGroups: Object.entries(dataset.synonyms).map(([term, values]) => ({
      term,
      values,
      count: values.length,
    })),
  };
}

function buildRankedResult(args: {
  topic: Topic;
  normalizedQuery: string;
  queryTokens: string[];
  queryEmbedding: number[];
  acceptedExpansions: string[];
  candidatePartners: CandidatePartner[];
}): SearchResult {
  const context = buildTopicContext(args.topic, args.normalizedQuery, args.candidatePartners);
  const opportunityBreakdown = scoreOpportunity(
    args.topic,
    args.queryTokens,
    args.queryEmbedding,
    context.analogs,
  );
  const bestCoordinators = context.coordinatorRanks.slice(0, 5);
  const coordinatorBreakdown = scoreCoordinator(bestCoordinators[0], context, args.candidatePartners);
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
  const missingRoles = computeMissingRoles(args.candidatePartners);
  const commonCountryMix = context.commonCountryCombinations[0]?.label.split(" + ") ?? [
    ...context.countryCounts.keys(),
  ].slice(0, 4);

  return {
    topic: args.topic,
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
    recommendedCoordinators: bestCoordinators,
    recommendedCountries: [...context.countryCounts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 4)
      .map(([country]) => country),
    consortiumCountryMix: commonCountryMix,
    suggestedRoles:
      missingRoles.length > 0
        ? missingRoles
        : [...context.roleCounts.entries()]
            .sort((left, right) => right[1] - left[1])
            .slice(0, 5)
            .map(([role]) => role),
    similarProjects: context.analogs.slice(0, 5),
    redFlags: buildRedFlags(args.topic, coverageScore, args.candidatePartners, probability),
    nextSteps: buildNextSteps(args.topic, bestCoordinators, commonCountryMix),
    reasonsToPursue: buildReasonsToPursue(opportunityScore, coordinatorScore, consortiumScore, coverageScore),
    reasonsNotToPursue: buildReasonsNotToPursue(args.topic, coverageScore, missingRoles, probability),
    improvementLevers: buildImprovementLevers(missingRoles, bestCoordinators, coverageScore),
    supportingEvidence: buildSupportingEvidence(args.topic, context, probability),
    explainFormula:
      "Final score = 0.45*Opportunity + 0.30*Coordinator + 0.20*Consortium + 0.05*Coverage. Country is secondary to topic fit, coordinator history, and consortium completeness.",
    countryEvidenceSummary: buildCountryEvidenceSummary(context.countryCounts),
  };
}

function buildTopicContext(
  topic: Topic,
  query: string,
  candidatePartners: CandidatePartner[],
): TopicContext {
  const analogs = rankAnalogs(query, topic);
  const baseline = lookupBaseline(topic);
  const coordinatorRanks = rankCoordinators(topic, analogs, candidatePartners, query);
  const countryCounts = new Map<string, number>();
  const roleCounts = new Map<string, number>();
  const comboCounts = new Map<string, number>();

  for (const project of analogs) {
    const coordinator = organisationById.get(project.coordinatorOrgId);
    if (coordinator) {
      countryCounts.set(coordinator.country, (countryCounts.get(coordinator.country) ?? 0) + 2);
    }
    for (const country of project.countries) {
      countryCounts.set(country, (countryCounts.get(country) ?? 0) + 1);
    }
    for (const role of project.roleMix) {
      roleCounts.set(role, (roleCounts.get(role) ?? 0) + 1);
    }
    const combo = [...project.countries].sort().slice(0, 4).join(" + ");
    comboCounts.set(combo, (comboCounts.get(combo) ?? 0) + 1);
  }

  return {
    topic,
    analogs,
    baseline,
    coordinatorRanks,
    countryCounts,
    roleCounts,
    commonCountryCombinations: [...comboCounts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 5),
  };
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
        "No official public baseline success rate was available for this programme slice, so the app shows a relative index rather than a percentage.",
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
  const p10 = percentile(samples, 0.1) * 100;
  const median = percentile(samples, 0.5) * 100;
  const p90 = percentile(samples, 0.9) * 100;

  return {
    mode: "public_probability",
    baseline: round(baseline * 100, 1),
    p10: round(p10, 1),
    median: round(median, 1),
    p90: round(p90, 1),
    confidenceLabel,
    explanation:
      "Bounded Monte Carlo adjustment around the official public baseline success rate, using topic fit, coordinator history, consortium fit, and evidence coverage.",
  };
}

function scoreOpportunity(
  topic: Topic,
  queryTokens: string[],
  queryEmbedding: number[],
  analogs: Project[],
) {
  const baseLexical = lexicalScore(queryTokens, tokenize(composeTopicText(topic)));
  const keywordLexical = lexicalScore(queryTokens, tokenize(topic.keywords.join(" ")));
  const keywordExactBoost = queryTokens.some((token) =>
    topic.keywords.some((keyword) => normalizeText(keyword).includes(token)),
  )
    ? 0.18
    : 0;
  const lexical = clamp(baseLexical * 0.72 + keywordLexical * 0.28 + keywordExactBoost, 0, 1);
  const semantic = cosineSimilarity(queryEmbedding, embedText(composeTopicText(topic)));
  const analogAlignment =
    analogs.slice(0, 3).reduce((accumulator, project) => {
      return accumulator + semanticSimilarity(composeTopicText(topic), composeProjectText(project));
    }, 0) / Math.max(1, Math.min(3, analogs.length));
  const actionTypeFit = inferActionTypeFit(queryTokens, topic.actionType);
  const trlFit = inferTrlFit(queryTokens, topic);

  return {
    lexical: round(lexical, 3),
    semantic: round(semantic, 3),
    analogAlignment: round(analogAlignment, 3),
    actionTypeFit: round(actionTypeFit, 3),
    trlFit: round(trlFit, 3),
  };
}

function scoreCoordinator(
  bestCoordinator: RankedCoordinator | undefined,
  context: TopicContext,
  candidatePartners: CandidatePartner[],
) {
  if (!bestCoordinator) {
    return {
      topicCoordinations: 0.45,
      programmeCoordinations: 0.45,
      actionTypeCoordinations: 0.45,
      recency: 0.45,
      fundingExperience: 0.45,
      networkCentrality: 0.45,
      candidateConsortiumFit: 0.45,
    };
  }

  const organisation = organisationById.get(bestCoordinator.organisationId);
  if (!organisation) {
    return {
      topicCoordinations: 0.45,
      programmeCoordinations: 0.45,
      actionTypeCoordinations: 0.45,
      recency: 0.45,
      fundingExperience: 0.45,
      networkCentrality: 0.45,
      candidateConsortiumFit: 0.45,
    };
  }

  const topicCoordinations = clamp(
    context.analogs.filter((project) => project.coordinatorOrgId === organisation.id).length / 4,
    0,
    1,
  );
  const programmeCoordinations = clamp(
    dataset.projects.filter(
      (project) =>
        project.programme === context.topic.programme && project.coordinatorOrgId === organisation.id,
    ).length / 4,
    0,
    1,
  );
  const actionTypeCoordinations = clamp(
    dataset.projects.filter(
      (project) =>
        project.actionType === context.topic.actionType && project.coordinatorOrgId === organisation.id,
    ).length / 4,
    0,
    1,
  );
  const recency =
    context.analogs
      .filter((project) => project.coordinatorOrgId === organisation.id)
      .reduce((accumulator, project) => accumulator + recencyWeight(project.endDate), 0) /
      Math.max(1, context.analogs.filter((project) => project.coordinatorOrgId === organisation.id).length) || 0.45;
  const maxFunding = Math.max(...dataset.organisations.map((entry) => entry.totalKnownFundingEur));
  const fundingExperience = clamp(
    Math.log10(organisation.totalKnownFundingEur) / Math.log10(maxFunding),
    0,
    1,
  );
  const networkCentrality = calculateNetworkCentrality(organisation.id);
  const candidateConsortiumFit =
    candidatePartners.length > 0
      ? clamp(scorePartnerCompatibility(organisation.id, candidatePartners), 0, 1)
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
  const analogSizes = context.analogs.map((project) => project.participantOrgIds.length + 1);
  const averageAnalogSize =
    analogSizes.reduce((accumulator, size) => accumulator + size, 0) / Math.max(1, analogSizes.length);
  const candidateSize = candidatePartners.length || averageAnalogSize;
  const shapeSimilarity = 1 - clamp(Math.abs(candidateSize - averageAnalogSize) / 6, 0, 0.8);
  const missingRoles = computeMissingRoles(candidatePartners);
  const roleCompleteness = candidatePartners.length > 0 ? 1 - missingRoles.length / REQUIRED_ROLES.length : 0.82;
  const collaborationStrength =
    candidatePartners.length > 1
      ? clamp(
          candidatePartners.reduce((accumulator, partner, index) => {
            const current = matchCandidateToOrganisation(partner)?.organisation.id;
            if (!current) {
              return accumulator;
            }
            for (const other of candidatePartners.slice(index + 1)) {
              const match = matchCandidateToOrganisation(other)?.organisation.id;
              if (match) {
                accumulator += collaborationGraph.get(current)?.get(match) ?? 0;
              }
            }
            return accumulator;
          }, 0) / 6,
          0,
          1,
        )
      : 0.68;
  const countryPatternFit =
    candidatePartners.length > 0
      ? clamp(scoreCountryPattern(candidatePartners, context.commonCountryCombinations), 0, 1)
      : 0.79;
  const eligibilityFit =
    candidatePartners.length === 0
      ? 0.82
      : new Set(candidatePartners.map((candidate) => candidate.country)).size >= 3
        ? 0.92
        : 0.38;
  const diversityBonus =
    candidatePartners.length > 0
      ? clamp(new Set(candidatePartners.map((candidate) => candidate.country)).size / 5, 0.25, 1)
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

function scoreCoverage(topic: Topic, analogs: Project[], baseline?: number) {
  const density = clamp(analogs.length / 5, 0, 1);
  const recency =
    analogs.reduce((accumulator, project) => accumulator + recencyWeight(project.endDate), 0) /
    Math.max(1, analogs.length);
  const completeness = topic.description && topic.eligibilityText && topic.keywords.length >= 4 ? 0.92 : 0.68;
  const baselineAvailability = baseline ? 1 : 0.42;

  return round((density * 0.45 + recency * 0.25 + completeness * 0.2 + baselineAvailability * 0.1) * 100, 1);
}

function rankAnalogs(query: string, topic: Topic) {
  const reference = `${query} ${topic.title} ${topic.description}`;
  return [...dataset.projects]
    .map((project) => ({
      project,
      score:
        semanticSimilarity(reference, composeProjectText(project)) * 0.6 +
        lexicalScore(tokenize(reference), tokenize(composeProjectText(project))) * 0.4,
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 10)
    .map((entry) => entry.project);
}

function rankCoordinators(
  topic: Topic,
  analogs: Project[],
  candidatePartners: CandidatePartner[],
  query: string,
) {
  return dataset.organisations
    .map((organisation) => {
      const score = scoreCandidateCoordinator(organisation, { topic, analogs } as TopicContext, candidatePartners, query);
      return {
        organisationId: organisation.id,
        organisationName: organisation.name,
        country: organisation.country,
        score: round(score, 1),
        rationale: buildCoordinatorRationale(organisation, analogs, candidatePartners),
      };
    })
    .sort((left, right) => right.score - left.score);
}

function scoreCandidateCoordinator(
  organisation: Organisation,
  context: Pick<TopicContext, "topic" | "analogs">,
  candidatePartners: CandidatePartner[],
  query?: string,
) {
  const similarTopicCount = context.analogs.filter((project) => project.coordinatorOrgId === organisation.id).length;
  const sameProgrammeCount = dataset.projects.filter(
    (project) => project.programme === context.topic.programme && project.coordinatorOrgId === organisation.id,
  ).length;
  const sameActionCount = dataset.projects.filter(
    (project) => project.actionType === context.topic.actionType && project.coordinatorOrgId === organisation.id,
  ).length;
  const topicalFit = semanticSimilarity(
    query ? `${query} ${context.topic.title}` : context.topic.title,
    `${organisation.name} ${organisation.description} ${organisation.domains.join(" ")}`,
  );
  const recency =
    context.analogs
      .filter((project) => project.coordinatorOrgId === organisation.id)
      .reduce((accumulator, project) => accumulator + recencyWeight(project.endDate), 0) || 0.4;
  const centrality = calculateNetworkCentrality(organisation.id);
  const partnerCompatibility =
    candidatePartners.length > 0 ? scorePartnerCompatibility(organisation.id, candidatePartners) : 0.72;
  const fundingWeight = clamp(
    Math.log10(organisation.totalKnownFundingEur) / Math.log10(214000000),
    0,
    1,
  );

  return (
    clamp(similarTopicCount / 4, 0, 1) * 26 +
    clamp(sameProgrammeCount / 5, 0, 1) * 15 +
    clamp(sameActionCount / 5, 0, 1) * 10 +
    clamp(recency / 2, 0, 1) * 12 +
    centrality * 12 +
    topicalFit * 15 +
    fundingWeight * 5 +
    partnerCompatibility * 5
  );
}

function buildCoordinatorRationale(
  organisation: Organisation,
  analogs: Project[],
  candidatePartners: CandidatePartner[],
) {
  const rationale = [
    `${organisation.pastCoordinationCount} public coordination(s) in adjacent funded areas.`,
    `${organisation.country} appears in the most relevant analogue consortiums, but only as a secondary signal.`,
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
  context: TopicContext,
) {
  if (!organisation) {
    return [
      "No strong historical canonical match was found, so the score leans on the supplied role and country metadata.",
      "Adding evidence of similar EU project coordination would improve confidence.",
    ];
  }

  const analogCoordinations = context.analogs.filter(
    (project) => project.coordinatorOrgId === organisation.id,
  ).length;

  return [
    `Matched to ${organisation.name} (${organisation.country}).`,
    `${analogCoordinations} closely related analogue coordination(s) were found.`,
    `${organisation.organisationType} profile aligns with ${context.topic.actionType} leadership patterns.`,
    candidate.role ? `Supplied role "${candidate.role}" was included in the fit calculation.` : "Role fit inferred from public organisation profile.",
  ];
}

function buildRedFlags(
  topic: Topic,
  coverageScore: number,
  candidatePartners: CandidatePartner[],
  probability: ProbabilityView,
) {
  const flags: string[] = [];
  const deadlineGap = daysUntil(topic.deadline);
  if (deadlineGap < 90) {
    flags.push(`Deadline is only ${deadlineGap} days away, which raises delivery and consortium-closing risk.`);
  }
  if (coverageScore < 58) {
    flags.push("Public analogue coverage is thin, so recommendations are more directional than stable.");
  }
  if (candidatePartners.length > 0 && computeMissingRoles(candidatePartners).length > 1) {
    flags.push("The supplied consortium is missing at least two role archetypes common in historical winners.");
  }
  if (probability.mode === "relative_index") {
    flags.push("No official public baseline success rate was available, so the app cannot show a probability percentage.");
  }
  return flags;
}

function buildNextSteps(
  topic: Topic,
  bestCoordinators: RankedCoordinator[],
  countryMix: string[],
) {
  return [
    `Verify expected outcomes, admissibility, and exact eligibility wording on the official topic page for ${topic.topicId}.`,
    `Shortlist the top ${Math.min(5, bestCoordinators.length)} coordinator options and confirm which one can mobilise the right work-package leads.`,
    "Review the top analogous funded projects and extract concrete consortium and work-package patterns.",
    `Target a country mix close to ${countryMix.join(", ")} unless eligibility or market logic suggests a stronger alternative.`,
    "Fill missing role gaps early, especially end-user, certification, or pilot-site functions where relevant.",
    "Prepare an outreach list and coordinator comparison note before opening full proposal drafting.",
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
      ? "High topic fit against current open call language and historical analogue content."
      : "The topic still has a credible thematic match, even if not the strongest in the portfolio.",
    coordinatorScore > 70
      ? "Public coordinator patterns are strong and repeatable in this thematic area."
      : "Coordinator options exist, but leadership quality will matter more than average.",
    coverageScore > 65
      ? "Evidence density is healthy enough to make the ranking explainable."
      : "Even limited evidence still provides a usable directional signal.",
  ];
  if (consortiumScore > 70) {
    reasons.push("Consortium shape patterns are well understood from public analogues.");
  }
  return reasons.slice(0, 3);
}

function buildReasonsNotToPursue(
  topic: Topic,
  coverageScore: number,
  missingRoles: string[],
  probability: ProbabilityView,
) {
  const reasons = [];
  if (coverageScore < 58) {
    reasons.push("Sparse public analogue density reduces confidence in the ranking and coordinator advice.");
  }
  if (missingRoles.length > 0) {
    reasons.push(`Current consortium picture is missing ${missingRoles.join(", ")} role coverage.`);
  }
  if (daysUntil(topic.deadline) < 100) {
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

function buildSupportingEvidence(topic: Topic, context: TopicContext, probability: ProbabilityView) {
  const evidence = [
    {
      label: topic.topicId,
      url: topic.sourceUrl,
      note: "Current open-topic source.",
    },
    ...context.analogs.slice(0, 3).map((project) => ({
      label: project.title,
      url: project.sourceUrl,
      note: "Relevant funded analogue from the public CORDIS-style history layer.",
    })),
  ];
  if (probability.mode === "public_probability") {
    evidence.push({
      label: `${topic.programme} ${topic.actionType} success baseline`,
      url:
        dataset.programmeStats.find(
          (stat) => stat.programme === topic.programme && stat.actionType === topic.actionType,
        )?.sourceUrl ?? dataset.dataSources[1].landingUrl,
      note: "Official public dashboard baseline used to anchor the probability band.",
    });
  }
  return evidence.slice(0, 5);
}

function buildCountryEvidenceSummary(countryCounts: Map<string, number>) {
  const topCountries = [...countryCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4)
    .map(([country, count]) => `${country} (${count})`);

  return `Country evidence is treated as a secondary pattern. The strongest analogue presence was ${topCountries.join(", ")}, but topic fit, coordinator history, and role coverage carry more weight.`;
}

function lookupBaseline(topic: Topic) {
  return dataset.programmeStats.find(
    (stat) => stat.programme === topic.programme && stat.actionType === topic.actionType,
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

function suggestExpansions(query: string) {
  const selected = new Set<string>();
  const suggestions: Array<{ term: string; reason: string; selectedDefault: boolean }> = [];
  const queryTokens = tokenize(query);

  for (const [key, values] of Object.entries(dataset.synonyms)) {
    if (query.includes(key) || queryTokens.some((token) => key.includes(token))) {
      for (const value of values) {
        if (!selected.has(value)) {
          selected.add(value);
          suggestions.push({
            term: value,
            reason: `Synonym group for "${key}".`,
            selectedDefault: true,
          });
        }
      }
    }
  }

  const nearestTopics = [...dataset.topics]
    .map((topic) => ({
      topic,
      score: semanticSimilarity(query, composeTopicText(topic)),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 3);

  for (const item of nearestTopics) {
    for (const keyword of item.topic.keywords.slice(0, 3)) {
      if (!selected.has(keyword) && !query.includes(keyword)) {
        selected.add(keyword);
        suggestions.push({
          term: keyword,
          reason: `Observed in closely matched topic ${item.topic.topicId}.`,
          selectedDefault: item.score > 0.6,
        });
      }
    }
  }

  const nearestProjects = [...dataset.projects]
    .map((project) => ({
      project,
      score: semanticSimilarity(query, composeProjectText(project)),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 2);

  for (const item of nearestProjects) {
    for (const term of item.project.topicReferences.slice(0, 2)) {
      if (!selected.has(term) && !query.includes(term)) {
        selected.add(term);
        suggestions.push({
          term,
          reason: `Frequent analogue phrase from ${item.project.title}.`,
          selectedDefault: false,
        });
      }
    }
  }

  return suggestions.slice(0, 8);
}

function applyTopicFilters(topic: Topic, filters?: SearchFilters) {
  if (!filters) {
    return topic.status === "open";
  }
  if (filters.openOnly !== false && !filters.includeRecentClosed && topic.status !== "open") {
    return false;
  }
  if (filters.programme && topic.programme !== filters.programme) {
    return false;
  }
  if (filters.actionType && topic.actionType !== filters.actionType) {
    return false;
  }
  if (filters.budgetRange) {
    const [minimum, maximum] = filters.budgetRange;
    if (topic.indicativeBudgetEur < minimum || topic.indicativeBudgetEur > maximum) {
      return false;
    }
  }
  if (filters.deadlineWindowDays !== undefined && daysUntil(topic.deadline) > filters.deadlineWindowDays) {
    return false;
  }
  return true;
}

function matchCandidateToOrganisation(candidate: CandidatePartner) {
  const lower = candidate.name.toLowerCase().trim();
  const aliasMatch = aliasByLowerName.get(lower);
  if (aliasMatch) {
    return {
      organisation: organisationById.get(aliasMatch)!,
      similarity: 1,
    };
  }

  let bestMatch: Organisation | undefined;
  let bestScore = 0;
  for (const organisation of dataset.organisations) {
    const score = fuzzyNameSimilarity(lower, organisation.name.toLowerCase());
    if (score > bestScore) {
      bestScore = score;
      bestMatch = organisation;
    }
  }

  return bestScore > 0.62 && bestMatch
    ? { organisation: bestMatch, similarity: bestScore }
    : undefined;
}

function computeMissingRoles(candidatePartners: CandidatePartner[]) {
  if (candidatePartners.length === 0) {
    return [];
  }

  const coverage = new Set<string>();
  for (const partner of candidatePartners) {
    const role = normalizeText(partner.role ?? "");
    const organisation = matchCandidateToOrganisation(partner)?.organisation;
    const values = [role, ...(organisation?.archetypeRoles ?? [])].map(normalizeText);
    if (values.some((value) => value.includes("research"))) {
      coverage.add("research");
    }
    if (values.some((value) => value.includes("industrial") || value.includes("market"))) {
      coverage.add("industrial actor");
    }
    if (values.some((value) => value.includes("pilot") || value.includes("demo"))) {
      coverage.add("pilot site");
    }
    if (values.some((value) => value.includes("end-user") || value.includes("deployment"))) {
      coverage.add("end-user");
    }
    if (values.some((value) => value.includes("standard") || value.includes("certification"))) {
      coverage.add("standardisation");
    }
  }

  return REQUIRED_ROLES.filter((role) => !coverage.has(role));
}

function scorePartnerCompatibility(organisationId: string, candidates: CandidatePartner[]) {
  const weights = candidates.map((candidate) => {
    const matched = matchCandidateToOrganisation(candidate)?.organisation.id;
    if (!matched) {
      return 0.46;
    }
    const edgeWeight = collaborationGraph.get(organisationId)?.get(matched) ?? 0;
    return clamp(edgeWeight / 3, 0.38, 1);
  });

  return weights.reduce((accumulator, value) => accumulator + value, 0) / Math.max(1, weights.length);
}

function scoreCountryPattern(
  candidates: CandidatePartner[],
  combinations: Array<{ label: string; count: number }>,
) {
  const candidateCountries = new Set(candidates.map((candidate) => candidate.country));
  const topCombination = combinations[0]?.label.split(" + ") ?? [];
  const overlap = topCombination.filter((country) => candidateCountries.has(country)).length;
  return overlap / Math.max(1, Math.min(candidateCountries.size, topCombination.length));
}

function buildCollaborationGraph() {
  const graph = new Map<string, Map<string, number>>();
  for (const project of dataset.projects) {
    const participants = [project.coordinatorOrgId, ...project.participantOrgIds];
    for (const source of participants) {
      if (!graph.has(source)) {
        graph.set(source, new Map());
      }
      for (const target of participants) {
        if (source === target) {
          continue;
        }
        const current = graph.get(source)!.get(target) ?? 0;
        graph.get(source)!.set(target, current + 1 + recencyWeight(project.endDate));
      }
    }
  }
  return graph;
}

function calculateNetworkCentrality(organisationId: string) {
  const neighbors = collaborationGraph.get(organisationId);
  if (!neighbors) {
    return 0.1;
  }
  const weightedDegree = [...neighbors.values()].reduce((accumulator, value) => accumulator + value, 0);
  const maxPossible = Math.max(
    1,
    ...[...collaborationGraph.values()].map((edges) =>
      [...edges.values()].reduce((accumulator, value) => accumulator + value, 0),
    ),
  );
  return clamp(weightedDegree / maxPossible, 0.1, 1);
}

function composeTopicText(topic: Topic) {
  return `${topic.title}. ${topic.description}. ${topic.keywords.join(" ")}. ${topic.programme} ${topic.actionType}`;
}

function composeProjectText(project: Project) {
  return `${project.title}. ${project.objective}. ${project.topicReferences.join(" ")}. ${project.programme} ${project.actionType}`;
}

function normalizeText(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
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
  const norm = Math.sqrt(vector.reduce((accumulator, value) => accumulator + value * value, 0)) || 1;
  return vector.map((value) => value / norm);
}

function cosineSimilarity(left: number[], right: number[]) {
  return clamp(
    left.reduce((accumulator, value, index) => accumulator + value * right[index], 0) * 0.5 + 0.5,
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
  const docTokenSet = new Set(documentTokens);
  const overlap = queryTokens.filter((token) => docTokenSet.has(token)).length;
  const idfBonus = queryTokens.reduce((accumulator, token) => {
    const topicFrequency = topicDocuments.filter((document) => document.tokens.includes(token)).length;
    const projectFrequency = projectDocuments.filter((document) => document.tokens.includes(token)).length;
    const frequency = topicFrequency + projectFrequency;
    const idf = Math.log(1 + (dataset.topics.length + dataset.projects.length) / (1 + frequency));
    return accumulator + (docTokenSet.has(token) ? idf : 0);
  }, 0);
  return clamp(overlap / queryTokens.length * 0.6 + Math.tanh(idfBonus / 8) * 0.4, 0, 1);
}

function inferActionTypeFit(queryTokens: string[], actionType: string) {
  const joined = queryTokens.join(" ");
  if (/pilot|deployment|scale|validation|demonstration/.test(joined)) {
    return actionType === "IA" || actionType === "SAP" ? 0.9 : 0.55;
  }
  if (/novel|research|interposer|chiplet|materials/.test(joined)) {
    return actionType === "RIA" ? 0.88 : 0.62;
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

function recencyWeight(dateValue: string) {
  const yearDelta = 2026 - new Date(dateValue).getUTCFullYear();
  return clamp(1 - yearDelta * 0.12, 0.25, 1);
}

function pseudoRandom(seed: number) {
  const value = Math.sin(seed) * 10000;
  return value - Math.floor(value);
}

function fuzzyNameSimilarity(left: string, right: string) {
  const leftTokens = new Set(left.split(" "));
  const rightTokens = new Set(right.split(" "));
  const shared = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const denominator = Math.max(leftTokens.size, rightTokens.size);
  const tokenScore = shared / Math.max(1, denominator);
  const charOverlap = longestCommonSubsequence(left, right) / Math.max(left.length, right.length);
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

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function logit(value: number) {
  return Math.log(value / (1 - value));
}

function sigmoid(value: number) {
  return 1 / (1 + Math.exp(-value));
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

function daysUntil(dateValue: string) {
  const ms = new Date(`${dateValue}T00:00:00Z`).getTime() - new Date("2026-04-04T00:00:00Z").getTime();
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
