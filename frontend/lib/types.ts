export type ConfidenceLabel = "High" | "Medium" | "Low";

export type CandidatePartner = {
  name: string;
  country: string;
  role?: string;
  organisationType?: string;
};

export type Topic = {
  id: string;
  callId: string;
  topicId: string;
  title: string;
  description: string;
  programme: string;
  actionType: string;
  fundingType: string;
  status: "open" | "closed";
  deadline: string;
  indicativeBudgetEur: number;
  trlMin?: number;
  trlMax?: number;
  keywords: string[];
  eligibilityText?: string;
  sourceUrl: string;
  lastFetchedAt: string;
};

export type ProgrammeStat = {
  id: string;
  programme: string;
  actionType: string;
  year: number;
  proposalCount: number;
  successRate: number;
  fundedProjectsCount: number;
  participantsCount: number;
  sourceUrl: string;
  fetchTimestamp: string;
};

export type Organisation = {
  id: string;
  name: string;
  country: string;
  organisationType: string;
  archetypeRoles: string[];
  domains: string[];
  description: string;
  pastCoordinationCount: number;
  pastParticipationCount: number;
  totalKnownFundingEur: number;
  sourceUrl: string;
};

export type Project = {
  id: string;
  title: string;
  objective: string;
  programme: string;
  actionType: string;
  topicReferences: string[];
  coordinatorOrgId: string;
  participantOrgIds: string[];
  countries: string[];
  startDate: string;
  endDate: string;
  euContributionEur: number;
  activityType: string;
  roleMix: string[];
  sourceUrl: string;
};

export type OpportunityScoreBreakdown = {
  lexical: number;
  semantic: number;
  analogAlignment: number;
  actionTypeFit: number;
  trlFit: number;
};

export type CoordinatorScoreBreakdown = {
  topicCoordinations: number;
  programmeCoordinations: number;
  actionTypeCoordinations: number;
  recency: number;
  fundingExperience: number;
  networkCentrality: number;
  candidateConsortiumFit: number;
};

export type ConsortiumScoreBreakdown = {
  shapeSimilarity: number;
  roleCompleteness: number;
  collaborationStrength: number;
  countryPatternFit: number;
  eligibilityFit: number;
  diversityBonus: number;
};

export type ProbabilityView =
  | {
      mode: "public_probability";
      baseline: number;
      p10: number;
      median: number;
      p90: number;
      confidenceLabel: ConfidenceLabel;
      explanation: string;
    }
  | {
      mode: "relative_index";
      index: number;
      confidenceLabel: ConfidenceLabel;
      explanation: string;
    };

export type SupportingEvidence = {
  label: string;
  url: string;
  note: string;
};

export type RankedCoordinator = {
  organisationId: string;
  organisationName: string;
  country: string;
  score: number;
  rationale: string[];
};

export type SearchResult = {
  topic: Topic;
  rank: number;
  finalScore: number;
  opportunityScore: number;
  coordinatorScore: number;
  consortiumScore: number;
  coverageScore: number;
  scoreBreakdown: {
    opportunity: OpportunityScoreBreakdown;
    coordinator: CoordinatorScoreBreakdown;
    consortium: ConsortiumScoreBreakdown;
  };
  probability: ProbabilityView;
  recommendedCoordinators: RankedCoordinator[];
  recommendedCountries: string[];
  consortiumCountryMix: string[];
  suggestedRoles: string[];
  similarProjects: Project[];
  redFlags: string[];
  nextSteps: string[];
  reasonsToPursue: string[];
  reasonsNotToPursue: string[];
  improvementLevers: string[];
  supportingEvidence: SupportingEvidence[];
  explainFormula: string;
  countryEvidenceSummary: string;
};

export type SearchResponse = {
  query: string;
  normalizedQuery: string;
  resultMode: "current" | "closed_fallback";
  resultNote?: string;
  suggestedExpansions: Array<{
    term: string;
    reason: string;
    selectedDefault: boolean;
  }>;
  acceptedExpansions: string[];
  results: SearchResult[];
};

export type TopicDetail = SearchResult & {
  topHistoricalCoordinators: RankedCoordinator[];
  coordinatorCountryDistribution: { country: string; count: number }[];
  commonRolePatterns: { role: string; count: number }[];
  commonCountryCombinations: { label: string; count: number }[];
};

export type OrganisationDetail = {
  organisation: Organisation;
  matchedAliases: string[];
  pastCoordinationCount: number;
  pastParticipationCount: number;
  relevantProgrammes: string[];
  relevantTopics: Topic[];
  totalKnownFundingExposureEur: number;
  networkCentrality: number;
  frequentCollaborators: { organisationId: string; organisationName: string; count: number }[];
  evidence: SupportingEvidence[];
};

export type ScenarioComparison = {
  query: string;
  bestCoordinatorId?: string;
  bestCoordinatorName?: string;
  recommendedCountryPattern: string[];
  missingRoles: string[];
  rankedCandidates: Array<{
    name: string;
    matchedOrganisationId?: string;
    score: number;
    deltaVsBest: number;
    rationale: string[];
  }>;
};

export type DataSourceStatus = {
  id: string;
  name: string;
  status: string;
  landingUrl: string;
  lastRefreshAt: string;
};

export type AdminSnapshot = {
  dataSources: DataSourceStatus[];
  scoreWeights: {
    opportunity: number;
    coordinator: number;
    consortium: number;
    coverage: number;
  };
  featureFlags: Record<string, boolean>;
  refreshLogs: Array<{
    id: string;
    source: string;
    status: string;
    message: string;
    createdAt: string;
  }>;
  synonymGroups: Array<{
    term: string;
    values: string[];
    count: number;
  }>;
};

export type DemoDataset = {
  meta: {
    appName: string;
    version: string;
    generatedAt: string;
    caveat: string;
  };
  scoreWeights: {
    opportunity: number;
    coordinator: number;
    consortium: number;
    coverage: number;
  };
  featureFlags: Record<string, boolean>;
  demoQueries: string[];
  synonyms: Record<string, string[]>;
  dataSources: DataSourceStatus[];
  organisations: Organisation[];
  organisationAliases: Array<{ alias: string; organisationId: string }>;
  topics: Topic[];
  programmeStats: ProgrammeStat[];
  projects: Project[];
  ftsRecords: Array<{
    id: string;
    beneficiaryName: string;
    subject: string;
    beneficiaryCountry: string;
    responsibleDepartment: string;
    budgetLine: string;
    programme: string;
    year: number;
    committedAmountEur: number;
    sourceUrl: string;
  }>;
  refreshLogs: Array<{
    id: string;
    source: string;
    status: string;
    message: string;
    createdAt: string;
  }>;
};
