from __future__ import annotations

import math
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date
from functools import cached_property
from statistics import median
from typing import Any

import networkx as nx
from rapidfuzz import fuzz, process

from eu_funding_signal.core.demo_loader import load_demo_dataset


REQUIRED_ROLES = [
    "research",
    "industrial actor",
    "pilot site",
    "end-user",
    "standardisation",
]


@dataclass
class TopicContext:
    topic: dict[str, Any]
    analogs: list[dict[str, Any]]
    baseline: float | None
    coordinator_ranks: list[dict[str, Any]]
    country_counts: Counter[str]
    role_counts: Counter[str]
    common_country_combinations: list[dict[str, Any]]


class DataEngine:
    def __init__(self, dataset: dict[str, Any] | None = None) -> None:
        self.dataset = dataset or load_demo_dataset()
        self.organisations = {entry["id"]: entry for entry in self.dataset["organisations"]}
        self.topics = {entry["id"]: entry for entry in self.dataset["topics"]}
        self.projects = {entry["id"]: entry for entry in self.dataset["projects"]}
        self.aliases = {
            entry["alias"].lower(): entry["organisationId"]
            for entry in self.dataset["organisationAliases"]
        }

    @cached_property
    def graph(self) -> nx.Graph:
        graph = nx.Graph()
        for organisation in self.dataset["organisations"]:
            graph.add_node(organisation["id"])
        for project in self.dataset["projects"]:
            participants = [project["coordinatorOrgId"], *project["participantOrgIds"]]
            recency = self._recency_weight(project["endDate"])
            for index, source in enumerate(participants):
                for target in participants[index + 1 :]:
                    weight = graph.get_edge_data(source, target, default={}).get("weight", 0.0)
                    graph.add_edge(source, target, weight=weight + 1 + recency)
        return graph

    @cached_property
    def network_centrality(self) -> dict[str, float]:
        weighted_degree = {
            node: sum(data.get("weight", 0.0) for _, _, data in self.graph.edges(node, data=True))
            for node in self.graph.nodes
        }
        max_weight = max(weighted_degree.values(), default=1.0)
        return {
            node: self._clamp(weight / max_weight if max_weight else 0.0, 0.1, 1.0)
            for node, weight in weighted_degree.items()
        }

    def search(
        self,
        query: str,
        filters: dict[str, Any] | None = None,
        approved_expansions: list[str] | None = None,
        candidate_partners: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        candidate_partners = candidate_partners or []
        normalized_query = self._normalize(query)
        suggested_expansions = self._suggest_expansions(normalized_query)
        accepted_expansions = (
            approved_expansions
            if approved_expansions
            else [entry["term"] for entry in suggested_expansions if entry["selectedDefault"]]
        )
        expanded_query = " ".join([normalized_query, *accepted_expansions]).strip()
        tokens = self._tokenize(expanded_query)
        query_embedding = self._embed(expanded_query)

        results = []
        for topic in self.dataset["topics"]:
            if not self._apply_filters(topic, filters or {}):
                continue
            context = self._build_topic_context(topic, normalized_query, candidate_partners)
            result = self._build_ranked_result(
                topic,
                context,
                tokens,
                query_embedding,
                candidate_partners,
            )
            results.append(result)

        results.sort(key=lambda item: item["finalScore"], reverse=True)
        for index, result in enumerate(results, start=1):
            result["rank"] = index

        return {
            "query": query,
            "normalizedQuery": normalized_query,
            "suggestedExpansions": suggested_expansions,
            "acceptedExpansions": accepted_expansions,
            "results": results,
        }

    def get_topic_detail(self, topic_id: str, query: str | None = None) -> dict[str, Any] | None:
        topic = self.topics.get(topic_id)
        if not topic:
            return None
        search = self.search(query or " ".join(topic["keywords"][:2]), filters={"openOnly": False, "includeRecentClosed": True})
        result = next((entry for entry in search["results"] if entry["topic"]["id"] == topic_id), None)
        if not result:
            return None
        context = self._build_topic_context(topic, query or " ".join(topic["keywords"][:2]), [])
        result["topHistoricalCoordinators"] = context.coordinator_ranks
        result["coordinatorCountryDistribution"] = [
            {"country": country, "count": count}
            for country, count in context.country_counts.most_common()
        ]
        result["commonRolePatterns"] = [
            {"role": role, "count": count}
            for role, count in context.role_counts.most_common()
        ]
        result["commonCountryCombinations"] = context.common_country_combinations
        return result

    def get_organisation_detail(self, organisation_id: str, query: str | None = None) -> dict[str, Any] | None:
        organisation = self.organisations.get(organisation_id)
        if not organisation:
            return None
        involved_projects = [
            project
            for project in self.dataset["projects"]
            if project["coordinatorOrgId"] == organisation_id
            or organisation_id in project["participantOrgIds"]
        ]
        relevant_topics = [
            topic
            for topic in self.dataset["topics"]
            if not query or self._semantic_similarity(query, self._compose_topic_text(topic)) > 0.48
        ][:4]
        collaborator_counts: Counter[str] = Counter()
        for project in involved_projects:
            for participant in [project["coordinatorOrgId"], *project["participantOrgIds"]]:
                if participant != organisation_id:
                    collaborator_counts[participant] += 1
        return {
            "organisation": organisation,
            "matchedAliases": [
                alias["alias"]
                for alias in self.dataset["organisationAliases"]
                if alias["organisationId"] == organisation_id
            ],
            "pastCoordinationCount": organisation["pastCoordinationCount"],
            "pastParticipationCount": organisation["pastParticipationCount"],
            "relevantProgrammes": sorted({project["programme"] for project in involved_projects}),
            "relevantTopics": relevant_topics,
            "totalKnownFundingExposureEur": organisation["totalKnownFundingEur"],
            "networkCentrality": self.network_centrality.get(organisation_id, 0.1),
            "frequentCollaborators": [
                {
                    "organisationId": collaborator_id,
                    "organisationName": self.organisations.get(collaborator_id, {}).get("name", collaborator_id),
                    "count": count,
                }
                for collaborator_id, count in collaborator_counts.most_common(5)
            ],
            "evidence": [
                {
                    "label": organisation["name"],
                    "url": organisation["sourceUrl"],
                    "note": "Public organisation profile evidence from the seeded CORDIS-style layer.",
                },
                *[
                    {
                        "label": project["title"],
                        "url": project["sourceUrl"],
                        "note": "Relevant funded analogue involving this organisation.",
                    }
                    for project in involved_projects[:3]
                ],
            ],
        }

    def compare_scenario(self, query: str, candidates: list[dict[str, Any]]) -> dict[str, Any]:
        search = self.search(query, candidate_partners=candidates)
        top_result = search["results"][0]
        context = self._build_topic_context(top_result["topic"], query, candidates)
        ranked = []
        for candidate in candidates:
            match = self._match_candidate(candidate)
            organisation = match[0] if match else None
            score = (
                self._score_candidate_coordinator(organisation, context, candidates, query)
                if organisation
                else 44.0
            )
            ranked.append(
                {
                    "name": candidate["name"],
                    "matchedOrganisationId": organisation["id"] if organisation else None,
                    "score": round(score, 1),
                    "deltaVsBest": 0.0,
                    "rationale": self._build_candidate_rationale(candidate, organisation, context),
                }
            )
        ranked.sort(key=lambda item: item["score"], reverse=True)
        best_score = ranked[0]["score"] if ranked else 0.0
        for entry in ranked:
            entry["deltaVsBest"] = round(entry["score"] - best_score, 1)
        return {
            "query": query,
            "bestCoordinatorId": ranked[0].get("matchedOrganisationId") if ranked else None,
            "bestCoordinatorName": ranked[0]["name"] if ranked else None,
            "recommendedCountryPattern": top_result["consortiumCountryMix"],
            "missingRoles": self._compute_missing_roles(candidates),
            "rankedCandidates": ranked,
        }

    def admin_snapshot(self) -> dict[str, Any]:
        return {
            "dataSources": self.dataset["dataSources"],
            "scoreWeights": self.dataset["scoreWeights"],
            "featureFlags": self.dataset["featureFlags"],
            "refreshLogs": self.dataset["refreshLogs"],
            "synonymGroups": [
                {"term": term, "values": values, "count": len(values)}
                for term, values in self.dataset["synonyms"].items()
            ],
        }

    def validate(self, split_year: int = 2024, k: int = 3) -> dict[str, Any]:
        future_projects = [
            project
            for project in self.dataset["projects"]
            if date.fromisoformat(project["endDate"]).year >= split_year
        ]
        hits = 0
        ndcg_sum = 0.0
        coordinator_hits = 0
        total = max(1, len(future_projects))

        for project in future_projects:
            query = " ".join(project["topicReferences"][:2]) or project["title"]
            search = self.search(query)
            relevant_topic_ids = {
                topic["id"]
                for topic in self.dataset["topics"]
                if any(
                    reference.lower() in self._compose_topic_text(topic).lower()
                    for reference in project["topicReferences"]
                )
            }
            ranked = search["results"][:k]
            ranked_ids = [entry["topic"]["id"] for entry in ranked]
            if any(topic_id in relevant_topic_ids for topic_id in ranked_ids):
                hits += 1
            relevance_vector = [
                1.0 if entry["topic"]["id"] in relevant_topic_ids else 0.0 for entry in ranked
            ]
            if relevance_vector:
                dcg = sum(value / math.log2(index + 2) for index, value in enumerate(relevance_vector))
                ideal = sum(sorted(relevance_vector, reverse=True)[:k][index] / math.log2(index + 2) for index in range(len(relevance_vector)))
                ndcg_sum += dcg / ideal if ideal else 0.0
            if ranked and ranked[0]["recommendedCoordinators"]:
                recommended_ids = [item["organisationId"] for item in ranked[0]["recommendedCoordinators"][:3]]
                if project["coordinatorOrgId"] in recommended_ids:
                    coordinator_hits += 1

        return {
            "splitYear": split_year,
            "k": k,
            "hitAtK": round(hits / total, 3),
            "ndcgAtK": round(ndcg_sum / total, 3),
            "coordinatorRecommendationHitRate": round(coordinator_hits / total, 3),
            "note": "This validation measures future funded-topic retrieval and coordinator recommendation hit rate only. It is not proposal win/loss accuracy.",
        }

    def _build_ranked_result(
        self,
        topic: dict[str, Any],
        context: TopicContext,
        query_tokens: list[str],
        query_embedding: list[float],
        candidate_partners: list[dict[str, Any]],
    ) -> dict[str, Any]:
        opportunity_breakdown = self._score_opportunity(topic, query_tokens, query_embedding, context.analogs)
        coordinator_breakdown = self._score_coordinator(context, candidate_partners)
        consortium_breakdown = self._score_consortium(context, candidate_partners)
        coverage_score = self._score_coverage(topic, context.analogs, context.baseline)

        opportunity_score = (
            opportunity_breakdown["lexical"] * 0.28
            + opportunity_breakdown["semantic"] * 0.34
            + opportunity_breakdown["analogAlignment"] * 0.22
            + opportunity_breakdown["actionTypeFit"] * 0.10
            + opportunity_breakdown["trlFit"] * 0.06
        ) * 100
        coordinator_score = (
            coordinator_breakdown["topicCoordinations"] * 0.22
            + coordinator_breakdown["programmeCoordinations"] * 0.16
            + coordinator_breakdown["actionTypeCoordinations"] * 0.12
            + coordinator_breakdown["recency"] * 0.16
            + coordinator_breakdown["fundingExperience"] * 0.12
            + coordinator_breakdown["networkCentrality"] * 0.12
            + coordinator_breakdown["candidateConsortiumFit"] * 0.10
        ) * 100
        consortium_score = (
            consortium_breakdown["shapeSimilarity"] * 0.24
            + consortium_breakdown["roleCompleteness"] * 0.24
            + consortium_breakdown["collaborationStrength"] * 0.16
            + consortium_breakdown["countryPatternFit"] * 0.16
            + consortium_breakdown["eligibilityFit"] * 0.12
            + consortium_breakdown["diversityBonus"] * 0.08
        ) * 100

        final_score = (
            opportunity_score * self.dataset["scoreWeights"]["opportunity"]
            + coordinator_score * self.dataset["scoreWeights"]["coordinator"]
            + consortium_score * self.dataset["scoreWeights"]["consortium"]
            + coverage_score * self.dataset["scoreWeights"]["coverage"]
        )
        probability = self._build_probability_view(
            topic, final_score, opportunity_score, coordinator_score, consortium_score, coverage_score, context.baseline
        )
        missing_roles = self._compute_missing_roles(candidate_partners)
        common_country_mix = (
            context.common_country_combinations[0]["label"].split(" + ")
            if context.common_country_combinations
            else list(context.country_counts.keys())[:4]
        )
        return {
            "topic": topic,
            "rank": 0,
            "finalScore": round(final_score, 1),
            "opportunityScore": round(opportunity_score, 1),
            "coordinatorScore": round(coordinator_score, 1),
            "consortiumScore": round(consortium_score, 1),
            "coverageScore": round(coverage_score, 1),
            "scoreBreakdown": {
                "opportunity": opportunity_breakdown,
                "coordinator": coordinator_breakdown,
                "consortium": consortium_breakdown,
            },
            "probability": probability,
            "recommendedCoordinators": context.coordinator_ranks[:5],
            "recommendedCountries": [country for country, _ in context.country_counts.most_common(4)],
            "consortiumCountryMix": common_country_mix,
            "suggestedRoles": missing_roles or [role for role, _ in context.role_counts.most_common(5)],
            "similarProjects": context.analogs[:5],
            "redFlags": self._build_red_flags(topic, coverage_score, candidate_partners, probability),
            "nextSteps": self._build_next_steps(topic, context.coordinator_ranks[:5], common_country_mix),
            "reasonsToPursue": self._build_reasons_to_pursue(
                opportunity_score, coordinator_score, consortium_score, coverage_score
            ),
            "reasonsNotToPursue": self._build_reasons_not_to_pursue(
                topic, coverage_score, missing_roles, probability
            ),
            "improvementLevers": self._build_improvement_levers(
                missing_roles, context.coordinator_ranks[:5], coverage_score
            ),
            "supportingEvidence": self._build_supporting_evidence(topic, context, probability),
            "explainFormula": "Final score = 0.45*Opportunity + 0.30*Coordinator + 0.20*Consortium + 0.05*Coverage. Country is secondary to topic fit, coordinator history, and consortium completeness.",
            "countryEvidenceSummary": self._build_country_evidence_summary(context.country_counts),
        }

    def _build_topic_context(
        self, topic: dict[str, Any], query: str, candidate_partners: list[dict[str, Any]]
    ) -> TopicContext:
        analogs = self._rank_analogs(query, topic)
        baseline = self._lookup_baseline(topic)
        coordinator_ranks = self._rank_coordinators(topic, analogs, candidate_partners, query)
        country_counts: Counter[str] = Counter()
        role_counts: Counter[str] = Counter()
        combo_counts: Counter[str] = Counter()
        for project in analogs:
            coordinator = self.organisations.get(project["coordinatorOrgId"])
            if coordinator:
                country_counts[coordinator["country"]] += 2
            country_counts.update(project["countries"])
            role_counts.update(project["roleMix"])
            combo_counts[" + ".join(sorted(project["countries"])[:4])] += 1
        return TopicContext(
            topic=topic,
            analogs=analogs,
            baseline=baseline,
            coordinator_ranks=coordinator_ranks,
            country_counts=country_counts,
            role_counts=role_counts,
            common_country_combinations=[
                {"label": label, "count": count} for label, count in combo_counts.most_common(5)
            ],
        )

    def _suggest_expansions(self, query: str) -> list[dict[str, Any]]:
        selected: set[str] = set()
        suggestions: list[dict[str, Any]] = []
        query_tokens = self._tokenize(query)
        for key, values in self.dataset["synonyms"].items():
            if key in query or any(token in key for token in query_tokens):
                for value in values:
                    if value not in selected:
                        selected.add(value)
                        suggestions.append(
                            {
                                "term": value,
                                "reason": f'Synonym group for "{key}".',
                                "selectedDefault": True,
                            }
                        )
        nearest_topics = sorted(
            self.dataset["topics"],
            key=lambda topic: self._semantic_similarity(query, self._compose_topic_text(topic)),
            reverse=True,
        )[:3]
        for topic in nearest_topics:
            score = self._semantic_similarity(query, self._compose_topic_text(topic))
            for keyword in topic["keywords"][:3]:
                if keyword not in selected and keyword not in query:
                    selected.add(keyword)
                    suggestions.append(
                        {
                            "term": keyword,
                            "reason": f'Observed in closely matched topic {topic["topicId"]}.',
                            "selectedDefault": score > 0.6,
                        }
                    )
        return suggestions[:8]

    def _apply_filters(self, topic: dict[str, Any], filters: dict[str, Any]) -> bool:
        if not filters:
            return topic["status"] == "open"
        if filters.get("openOnly", True) and not filters.get("includeRecentClosed") and topic["status"] != "open":
            return False
        if filters.get("programme") and topic["programme"] != filters["programme"]:
            return False
        if filters.get("actionType") and topic["actionType"] != filters["actionType"]:
            return False
        if filters.get("deadlineWindowDays"):
            if self._days_until(topic["deadline"]) > int(filters["deadlineWindowDays"]):
                return False
        minimum_budget = filters.get("minimumBudget")
        maximum_budget = filters.get("maximumBudget")
        if minimum_budget and topic["indicativeBudgetEur"] < float(minimum_budget):
            return False
        if maximum_budget and topic["indicativeBudgetEur"] > float(maximum_budget):
            return False
        return True

    def _score_opportunity(
        self,
        topic: dict[str, Any],
        query_tokens: list[str],
        query_embedding: list[float],
        analogs: list[dict[str, Any]],
    ) -> dict[str, float]:
        base_lexical = self._lexical_score(query_tokens, self._tokenize(self._compose_topic_text(topic)))
        keyword_lexical = self._lexical_score(query_tokens, self._tokenize(" ".join(topic["keywords"])))
        keyword_exact_boost = (
            0.18
            if any(
                any(token in self._normalize(keyword) for keyword in topic["keywords"])
                for token in query_tokens
            )
            else 0.0
        )
        lexical = self._clamp(base_lexical * 0.72 + keyword_lexical * 0.28 + keyword_exact_boost, 0, 1)
        semantic = self._cosine(query_embedding, self._embed(self._compose_topic_text(topic)))
        analog_alignment = sum(
            self._semantic_similarity(self._compose_topic_text(topic), self._compose_project_text(project))
            for project in analogs[:3]
        ) / max(1, min(3, len(analogs)))
        action_type_fit = self._infer_action_type_fit(" ".join(query_tokens), topic["actionType"])
        trl_fit = self._infer_trl_fit(" ".join(query_tokens), topic)
        return {
            "lexical": round(lexical, 3),
            "semantic": round(semantic, 3),
            "analogAlignment": round(analog_alignment, 3),
            "actionTypeFit": round(action_type_fit, 3),
            "trlFit": round(trl_fit, 3),
        }

    def _score_coordinator(
        self, context: TopicContext, candidate_partners: list[dict[str, Any]]
    ) -> dict[str, float]:
        best = context.coordinator_ranks[0] if context.coordinator_ranks else None
        if not best:
            return {
                "topicCoordinations": 0.45,
                "programmeCoordinations": 0.45,
                "actionTypeCoordinations": 0.45,
                "recency": 0.45,
                "fundingExperience": 0.45,
                "networkCentrality": 0.45,
                "candidateConsortiumFit": 0.45,
            }
        organisation = self.organisations[best["organisationId"]]
        topic_coordinations = self._clamp(
            sum(1 for project in context.analogs if project["coordinatorOrgId"] == organisation["id"]) / 4,
            0,
            1,
        )
        programme_coordinations = self._clamp(
            sum(
                1
                for project in self.dataset["projects"]
                if project["programme"] == context.topic["programme"]
                and project["coordinatorOrgId"] == organisation["id"]
            )
            / 4,
            0,
            1,
        )
        action_type_coordinations = self._clamp(
            sum(
                1
                for project in self.dataset["projects"]
                if project["actionType"] == context.topic["actionType"]
                and project["coordinatorOrgId"] == organisation["id"]
            )
            / 4,
            0,
            1,
        )
        recency_values = [
            self._recency_weight(project["endDate"])
            for project in context.analogs
            if project["coordinatorOrgId"] == organisation["id"]
        ]
        recency = sum(recency_values) / len(recency_values) if recency_values else 0.45
        max_funding = max(item["totalKnownFundingEur"] for item in self.dataset["organisations"])
        funding_experience = self._clamp(
            math.log10(organisation["totalKnownFundingEur"]) / math.log10(max_funding),
            0,
            1,
        )
        candidate_fit = (
            self._score_partner_compatibility(organisation["id"], candidate_partners)
            if candidate_partners
            else 0.72
        )
        return {
            "topicCoordinations": round(topic_coordinations, 3),
            "programmeCoordinations": round(programme_coordinations, 3),
            "actionTypeCoordinations": round(action_type_coordinations, 3),
            "recency": round(recency, 3),
            "fundingExperience": round(funding_experience, 3),
            "networkCentrality": round(self.network_centrality.get(organisation["id"], 0.1), 3),
            "candidateConsortiumFit": round(candidate_fit, 3),
        }

    def _score_consortium(
        self, context: TopicContext, candidate_partners: list[dict[str, Any]]
    ) -> dict[str, float]:
        analog_sizes = [len(project["participantOrgIds"]) + 1 for project in context.analogs]
        average_size = sum(analog_sizes) / max(1, len(analog_sizes))
        candidate_size = len(candidate_partners) or average_size
        shape_similarity = 1 - self._clamp(abs(candidate_size - average_size) / 6, 0, 0.8)
        missing_roles = self._compute_missing_roles(candidate_partners)
        role_completeness = (
            1 - len(missing_roles) / len(REQUIRED_ROLES) if candidate_partners else 0.82
        )
        collaboration_strength = (
            self._score_candidate_collaboration(candidate_partners)
            if len(candidate_partners) > 1
            else 0.68
        )
        country_pattern_fit = (
            self._score_country_pattern(candidate_partners, context.common_country_combinations)
            if candidate_partners
            else 0.79
        )
        eligibility_fit = (
            0.92
            if not candidate_partners
            else 0.92 if len({entry.get("country") for entry in candidate_partners if entry.get("country")}) >= 3 else 0.38
        )
        diversity_bonus = (
            self._clamp(len({entry.get("country") for entry in candidate_partners if entry.get("country")}) / 5, 0.25, 1)
            if candidate_partners
            else 0.74
        )
        return {
            "shapeSimilarity": round(shape_similarity, 3),
            "roleCompleteness": round(role_completeness, 3),
            "collaborationStrength": round(collaboration_strength, 3),
            "countryPatternFit": round(country_pattern_fit, 3),
            "eligibilityFit": round(eligibility_fit, 3),
            "diversityBonus": round(diversity_bonus, 3),
        }

    def _score_coverage(
        self, topic: dict[str, Any], analogs: list[dict[str, Any]], baseline: float | None
    ) -> float:
        density = self._clamp(len(analogs) / 5, 0, 1)
        recency = sum(self._recency_weight(project["endDate"]) for project in analogs) / max(1, len(analogs))
        completeness = 0.92 if topic.get("eligibilityText") and len(topic.get("keywords", [])) >= 4 else 0.68
        baseline_availability = 1 if baseline else 0.42
        return round((density * 0.45 + recency * 0.25 + completeness * 0.20 + baseline_availability * 0.10) * 100, 1)

    def _rank_analogs(self, query: str, topic: dict[str, Any]) -> list[dict[str, Any]]:
        reference = f"{query} {topic['title']} {topic['description']}"
        scored = []
        for project in self.dataset["projects"]:
            score = self._semantic_similarity(reference, self._compose_project_text(project)) * 0.6 + self._lexical_score(
                self._tokenize(reference), self._tokenize(self._compose_project_text(project))
            ) * 0.4
            scored.append((score, project))
        return [project for _, project in sorted(scored, key=lambda item: item[0], reverse=True)[:10]]

    def _rank_coordinators(
        self,
        topic: dict[str, Any],
        analogs: list[dict[str, Any]],
        candidate_partners: list[dict[str, Any]],
        query: str,
    ) -> list[dict[str, Any]]:
        ranks = []
        context = TopicContext(
            topic=topic,
            analogs=analogs,
            baseline=None,
            coordinator_ranks=[],
            country_counts=Counter(),
            role_counts=Counter(),
            common_country_combinations=[],
        )
        for organisation in self.dataset["organisations"]:
            score = self._score_candidate_coordinator(organisation, context, candidate_partners, query)
            ranks.append(
                {
                    "organisationId": organisation["id"],
                    "organisationName": organisation["name"],
                    "country": organisation["country"],
                    "score": round(score, 1),
                    "rationale": self._build_coordinator_rationale(organisation, analogs, candidate_partners),
                }
            )
        ranks.sort(key=lambda item: item["score"], reverse=True)
        return ranks

    def _score_candidate_coordinator(
        self,
        organisation: dict[str, Any],
        context: TopicContext,
        candidate_partners: list[dict[str, Any]],
        query: str | None = None,
    ) -> float:
        similar_topic_count = sum(
            1 for project in context.analogs if project["coordinatorOrgId"] == organisation["id"]
        )
        same_programme_count = sum(
            1
            for project in self.dataset["projects"]
            if project["programme"] == context.topic["programme"] and project["coordinatorOrgId"] == organisation["id"]
        )
        same_action_count = sum(
            1
            for project in self.dataset["projects"]
            if project["actionType"] == context.topic["actionType"] and project["coordinatorOrgId"] == organisation["id"]
        )
        topical_fit = self._semantic_similarity(
            f"{query or context.topic['title']} {context.topic['title']}",
            f"{organisation['name']} {organisation['description']} {' '.join(organisation['domains'])}",
        )
        recency = sum(
            self._recency_weight(project["endDate"])
            for project in context.analogs
            if project["coordinatorOrgId"] == organisation["id"]
        ) or 0.4
        centrality = self.network_centrality.get(organisation["id"], 0.1)
        partner_compatibility = (
            self._score_partner_compatibility(organisation["id"], candidate_partners)
            if candidate_partners
            else 0.72
        )
        funding_weight = self._clamp(
            math.log10(organisation["totalKnownFundingEur"]) / math.log10(214000000),
            0,
            1,
        )
        return (
            self._clamp(similar_topic_count / 4, 0, 1) * 26
            + self._clamp(same_programme_count / 5, 0, 1) * 15
            + self._clamp(same_action_count / 5, 0, 1) * 10
            + self._clamp(recency / 2, 0, 1) * 12
            + centrality * 12
            + topical_fit * 15
            + funding_weight * 5
            + partner_compatibility * 5
        )

    def _score_partner_compatibility(
        self, organisation_id: str, candidate_partners: list[dict[str, Any]]
    ) -> float:
        values = []
        for candidate in candidate_partners:
            match = self._match_candidate(candidate)
            if not match:
                values.append(0.46)
                continue
            neighbour = match[0]["id"]
            if self.graph.has_edge(organisation_id, neighbour):
                weight = self.graph.edges[organisation_id, neighbour]["weight"]
                values.append(self._clamp(weight / 3, 0.38, 1.0))
            else:
                values.append(0.38)
        return sum(values) / max(1, len(values))

    def _score_candidate_collaboration(self, candidate_partners: list[dict[str, Any]]) -> float:
        total = 0.0
        comparisons = 0
        matches = [self._match_candidate(candidate) for candidate in candidate_partners]
        ids = [match[0]["id"] for match in matches if match]
        for index, source in enumerate(ids):
            for target in ids[index + 1 :]:
                total += self.graph.edges[source, target]["weight"] if self.graph.has_edge(source, target) else 0.0
                comparisons += 1
        return self._clamp(total / max(1, comparisons * 3), 0, 1)

    def _score_country_pattern(
        self, candidate_partners: list[dict[str, Any]], combinations: list[dict[str, Any]]
    ) -> float:
        candidate_countries = {candidate.get("country") for candidate in candidate_partners if candidate.get("country")}
        if not candidate_countries:
            return 0.42
        top_combo = combinations[0]["label"].split(" + ") if combinations else []
        overlap = len([country for country in top_combo if country in candidate_countries])
        return overlap / max(1, min(len(candidate_countries), len(top_combo) or 1))

    def _build_probability_view(
        self,
        topic: dict[str, Any],
        final_score: float,
        opportunity_score: float,
        coordinator_score: float,
        consortium_score: float,
        coverage_score: float,
        baseline: float | None,
    ) -> dict[str, Any]:
        confidence_label = self._derive_confidence_label(baseline, coverage_score)
        if baseline is None:
            return {
                "mode": "relative_index",
                "index": round(self._clamp(final_score, 18, 94), 1),
                "confidenceLabel": confidence_label,
                "explanation": "No official public baseline success rate was available for this programme slice, so the app shows a relative index rather than a percentage.",
            }
        samples = []
        seed = abs(hash((topic["id"], round(final_score, 2))))
        for step in range(240):
            beta = 0.28 + self._pseudo_random(seed + step) * 0.24
            uncertainty_penalty = (1 - coverage_score / 100) * (
                0.05 + self._pseudo_random(seed + step * 3) * 0.12
            )
            noise = (self._pseudo_random(seed + step * 7) - 0.5) * 0.18
            score_lift = (
                (opportunity_score - 50) * 0.42
                + (coordinator_score - 50) * 0.28
                + (consortium_score - 50) * 0.20
                + (coverage_score - 50) * 0.10
            ) / 100
            adjusted_logit = self._logit(baseline) + beta * score_lift - uncertainty_penalty + noise
            probability = self._sigmoid(adjusted_logit)
            samples.append(
                self._clamp(probability, max(0.03, baseline * 0.45), min(0.72, baseline * 1.8 + 0.08))
            )
        samples.sort()
        return {
            "mode": "public_probability",
            "baseline": round(baseline * 100, 1),
            "p10": round(self._percentile(samples, 0.1) * 100, 1),
            "median": round(self._percentile(samples, 0.5) * 100, 1),
            "p90": round(self._percentile(samples, 0.9) * 100, 1),
            "confidenceLabel": confidence_label,
            "explanation": "Bounded Monte Carlo adjustment around the official public baseline success rate, using topic fit, coordinator history, consortium fit, and evidence coverage.",
        }

    def _build_red_flags(
        self,
        topic: dict[str, Any],
        coverage_score: float,
        candidate_partners: list[dict[str, Any]],
        probability: dict[str, Any],
    ) -> list[str]:
        flags: list[str] = []
        deadline_gap = self._days_until(topic["deadline"])
        if deadline_gap < 90:
            flags.append(f"Deadline is only {deadline_gap} days away, which raises delivery and consortium-closing risk.")
        if coverage_score < 58:
            flags.append("Public analogue coverage is thin, so recommendations are more directional than stable.")
        if candidate_partners and len(self._compute_missing_roles(candidate_partners)) > 1:
            flags.append("The supplied consortium is missing at least two role archetypes common in historical winners.")
        if probability["mode"] == "relative_index":
            flags.append("No official public baseline success rate was available, so the app cannot show a probability percentage.")
        return flags

    def _build_next_steps(
        self,
        topic: dict[str, Any],
        coordinators: list[dict[str, Any]],
        country_mix: list[str],
    ) -> list[str]:
        return [
            f"Verify expected outcomes, admissibility, and exact eligibility wording on the official topic page for {topic['topicId']}.",
            f"Shortlist the top {min(5, len(coordinators))} coordinator options and confirm who can mobilise the right work-package leads.",
            "Review the top analogous funded projects and extract concrete consortium and work-package patterns.",
            f"Target a country mix close to {', '.join(country_mix)} unless market logic suggests a stronger alternative.",
            "Fill missing role gaps early, especially end-user, certification, or pilot-site functions where relevant.",
            "Prepare an outreach list and coordinator comparison note before opening full proposal drafting.",
        ]

    def _build_reasons_to_pursue(
        self,
        opportunity_score: float,
        coordinator_score: float,
        consortium_score: float,
        coverage_score: float,
    ) -> list[str]:
        reasons = [
            "High topic fit against current open call language and historical analogue content."
            if opportunity_score > 72
            else "The topic still has a credible thematic match, even if not the strongest in the portfolio.",
            "Public coordinator patterns are strong and repeatable in this thematic area."
            if coordinator_score > 70
            else "Coordinator options exist, but leadership quality will matter more than average.",
            "Evidence density is healthy enough to make the ranking explainable."
            if coverage_score > 65
            else "Even limited evidence still provides a usable directional signal.",
        ]
        if consortium_score > 70:
            reasons.append("Consortium shape patterns are well understood from public analogues.")
        return reasons[:3]

    def _build_reasons_not_to_pursue(
        self,
        topic: dict[str, Any],
        coverage_score: float,
        missing_roles: list[str],
        probability: dict[str, Any],
    ) -> list[str]:
        reasons = []
        if coverage_score < 58:
            reasons.append("Sparse public analogue density reduces confidence in the ranking and coordinator advice.")
        if missing_roles:
            reasons.append(f"Current consortium picture is missing {', '.join(missing_roles)} role coverage.")
        if self._days_until(topic["deadline"]) < 100:
            reasons.append("The remaining time window is short for a complex multi-country consortium build.")
        if probability["mode"] == "public_probability" and probability["p90"] < 18:
            reasons.append("Even the upper public-data band remains modest after bounded adjustments.")
        if probability["mode"] == "relative_index" and probability["index"] < 55:
            reasons.append("Relative win-likelihood is only moderate and may not justify immediate bid effort.")
        return reasons[:3]

    def _build_improvement_levers(
        self,
        missing_roles: list[str],
        coordinators: list[dict[str, Any]],
        coverage_score: float,
    ) -> list[str]:
        levers = []
        if missing_roles:
            levers.append(f"Add partners that cover {', '.join(missing_roles[:2])} gaps.")
        if coordinators:
            levers.append(f"Stress-test {coordinators[0]['organisationName']} as coordinator against your preferred lead.")
        if coverage_score < 60:
            levers.append("Collect more manual evidence from recent public projects before committing full bid resources.")
        levers.append("Tighten work-package logic around deployment, validation, and exploitation roles.")
        return levers[:3]

    def _build_supporting_evidence(
        self, topic: dict[str, Any], context: TopicContext, probability: dict[str, Any]
    ) -> list[dict[str, str]]:
        evidence = [
            {"label": topic["topicId"], "url": topic["sourceUrl"], "note": "Current open-topic source."},
            *[
                {
                    "label": project["title"],
                    "url": project["sourceUrl"],
                    "note": "Relevant funded analogue from the public CORDIS-style history layer.",
                }
                for project in context.analogs[:3]
            ],
        ]
        if probability["mode"] == "public_probability":
            source_url = next(
                (
                    stat["sourceUrl"]
                    for stat in self.dataset["programmeStats"]
                    if stat["programme"] == topic["programme"] and stat["actionType"] == topic["actionType"]
                ),
                self.dataset["dataSources"][1]["landingUrl"],
            )
            evidence.append(
                {
                    "label": f"{topic['programme']} {topic['actionType']} success baseline",
                    "url": source_url,
                    "note": "Official public dashboard baseline used to anchor the probability band.",
                }
            )
        return evidence[:5]

    def _build_country_evidence_summary(self, country_counts: Counter[str]) -> str:
        top = ", ".join(f"{country} ({count})" for country, count in country_counts.most_common(4))
        return f"Country evidence is treated as a secondary pattern. The strongest analogue presence was {top}, but topic fit, coordinator history, and role coverage carry more weight."

    def _lookup_baseline(self, topic: dict[str, Any]) -> float | None:
        for stat in self.dataset["programmeStats"]:
            if stat["programme"] == topic["programme"] and stat["actionType"] == topic["actionType"]:
                return stat["successRate"]
        return None

    def _derive_confidence_label(self, baseline: float | None, coverage_score: float) -> str:
        if baseline and coverage_score >= 72:
            return "High"
        if coverage_score >= 56:
            return "Medium"
        return "Low"

    def _build_coordinator_rationale(
        self,
        organisation: dict[str, Any],
        analogs: list[dict[str, Any]],
        candidate_partners: list[dict[str, Any]],
    ) -> list[str]:
        rationale = [
            f"{organisation['pastCoordinationCount']} public coordination(s) in adjacent funded areas.",
            f"{organisation['country']} appears in the most relevant analogue consortiums, but only as a secondary signal.",
        ]
        similar = sum(1 for project in analogs if project["coordinatorOrgId"] == organisation["id"])
        if similar:
            rationale.append(f"{similar} top analogue project(s) were coordinated by this organisation.")
        if candidate_partners:
            rationale.append("Coordinator fit includes compatibility with the supplied candidate consortium.")
        return rationale

    def _build_candidate_rationale(
        self,
        candidate: dict[str, Any],
        organisation: dict[str, Any] | None,
        context: TopicContext,
    ) -> list[str]:
        if organisation is None:
            return [
                "No strong historical canonical match was found, so the score leans on the supplied role and country metadata.",
                "Adding evidence of similar EU project coordination would improve confidence.",
            ]
        analog_coordinations = sum(
            1 for project in context.analogs if project["coordinatorOrgId"] == organisation["id"]
        )
        return [
            f"Matched to {organisation['name']} ({organisation['country']}).",
            f"{analog_coordinations} closely related analogue coordination(s) were found.",
            f"{organisation['organisationType']} profile aligns with {context.topic['actionType']} leadership patterns.",
            f'Supplied role "{candidate.get("role")}" was included in the fit calculation.'
            if candidate.get("role")
            else "Role fit inferred from public organisation profile.",
        ]

    def _compute_missing_roles(self, candidate_partners: list[dict[str, Any]]) -> list[str]:
        if not candidate_partners:
            return []
        coverage: set[str] = set()
        for candidate in candidate_partners:
            role_values = [self._normalize(candidate.get("role", ""))]
            match = self._match_candidate(candidate)
            if match:
                role_values.extend(self._normalize(value) for value in match[0]["archetypeRoles"])
            if any("research" in value for value in role_values):
                coverage.add("research")
            if any("industrial" in value or "market" in value for value in role_values):
                coverage.add("industrial actor")
            if any("pilot" in value or "demo" in value for value in role_values):
                coverage.add("pilot site")
            if any("end-user" in value or "deployment" in value for value in role_values):
                coverage.add("end-user")
            if any("standard" in value or "certification" in value for value in role_values):
                coverage.add("standardisation")
        return [role for role in REQUIRED_ROLES if role not in coverage]

    def _match_candidate(self, candidate: dict[str, Any]) -> tuple[dict[str, Any], float] | None:
        lower = candidate["name"].lower().strip()
        if lower in self.aliases:
            organisation = self.organisations[self.aliases[lower]]
            return organisation, 1.0
        choices = {organisation["id"]: organisation["name"] for organisation in self.dataset["organisations"]}
        match = process.extractOne(lower, choices, scorer=fuzz.token_sort_ratio)
        if not match:
            return None
        organisation_id, similarity, _ = match
        if similarity < 62:
            return None
        return self.organisations[organisation_id], similarity / 100

    def _compose_topic_text(self, topic: dict[str, Any]) -> str:
        return f"{topic['title']}. {topic['description']}. {' '.join(topic['keywords'])}. {topic['programme']} {topic['actionType']}"

    def _compose_project_text(self, project: dict[str, Any]) -> str:
        return f"{project['title']}. {project['objective']}. {' '.join(project['topicReferences'])}. {project['programme']} {project['actionType']}"

    def _normalize(self, text: str) -> str:
        return " ".join("".join(char if char.isalnum() or char in {" ", "-"} else " " for char in text.lower()).split())

    def _tokenize(self, text: str) -> list[str]:
        return [token for token in self._normalize(text).split() if len(token) > 1]

    def _embed(self, text: str) -> list[float]:
        vector = [0.0] * 48
        for token in self._tokenize(text):
            base = abs(hash(token))
            for index in range(48):
                value = math.sin(base * (index + 1) * 0.0001) + math.cos((base + index) * 0.0002)
                vector[index] += value
        norm = math.sqrt(sum(value * value for value in vector)) or 1.0
        return [value / norm for value in vector]

    def _cosine(self, left: list[float], right: list[float]) -> float:
        return self._clamp(sum(a * b for a, b in zip(left, right)) * 0.5 + 0.5, 0, 1)

    def _semantic_similarity(self, left: str, right: str) -> float:
        return self._cosine(self._embed(left), self._embed(right))

    def _lexical_score(self, query_tokens: list[str], document_tokens: list[str]) -> float:
        if not query_tokens or not document_tokens:
            return 0.0
        document_set = set(document_tokens)
        overlap = sum(1 for token in query_tokens if token in document_set)
        frequency_lookup = 0.0
        corpus = [self._compose_topic_text(topic) for topic in self.dataset["topics"]] + [
            self._compose_project_text(project) for project in self.dataset["projects"]
        ]
        corpus_tokens = [set(self._tokenize(text)) for text in corpus]
        for token in query_tokens:
            frequency = sum(1 for tokens in corpus_tokens if token in tokens)
            idf = math.log(1 + len(corpus_tokens) / (1 + frequency))
            if token in document_set:
                frequency_lookup += idf
        return self._clamp((overlap / len(query_tokens)) * 0.6 + math.tanh(frequency_lookup / 8) * 0.4, 0, 1)

    def _infer_action_type_fit(self, query: str, action_type: str) -> float:
        if any(term in query for term in ["pilot", "deployment", "scale", "validation", "demonstration"]):
            return 0.9 if action_type in {"IA", "SAP"} else 0.55
        if any(term in query for term in ["novel", "research", "interposer", "chiplet", "materials"]):
            return 0.88 if action_type == "RIA" else 0.62
        return 0.66

    def _infer_trl_fit(self, query: str, topic: dict[str, Any]) -> float:
        tokens = query.split()
        for index, token in enumerate(tokens):
            if token == "trl" and index + 1 < len(tokens) and tokens[index + 1].isdigit():
                requested = int(tokens[index + 1])
                if topic.get("trlMin") is not None and topic.get("trlMax") is not None:
                    return 0.92 if topic["trlMin"] <= requested <= topic["trlMax"] else 0.34
        return 0.62

    def _recency_weight(self, date_value: str) -> float:
        year_delta = 2026 - date.fromisoformat(date_value).year
        return self._clamp(1 - year_delta * 0.12, 0.25, 1.0)

    def _days_until(self, date_value: str) -> int:
        return max(0, (date.fromisoformat(date_value) - date(2026, 4, 4)).days)

    def _percentile(self, values: list[float], quantile: float) -> float:
        if not values:
            return 0.0
        index = (len(values) - 1) * quantile
        lower = math.floor(index)
        upper = math.ceil(index)
        if lower == upper:
            return values[lower]
        return values[lower] + (values[upper] - values[lower]) * (index - lower)

    def _pseudo_random(self, seed: int) -> float:
        value = math.sin(seed) * 10000
        return value - math.floor(value)

    def _sigmoid(self, value: float) -> float:
        return 1 / (1 + math.exp(-value))

    def _logit(self, value: float) -> float:
        return math.log(value / (1 - value))

    def _clamp(self, value: float, minimum: float, maximum: float) -> float:
        return max(minimum, min(maximum, value))


engine = DataEngine()
