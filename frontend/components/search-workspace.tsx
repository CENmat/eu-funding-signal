"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Filter, Plus, Trash2, Upload } from "lucide-react";
import { getAppMode, loadDemoDataset } from "@/lib/api";
import type { CandidatePartner } from "@/lib/types";
import { CaveatBanner } from "@/components/caveat-banner";

const DATASET = loadDemoDataset();
const APP_MODE = getAppMode();
const STORAGE_KEYS = {
  filters: "efs:filters:v4",
  candidates: "efs:candidates:v2",
};

type SearchFilters = {
  queryOperator: "or" | "and";
  programme: string;
  actionType: string;
  includeRecentClosed: boolean;
  deadlineWindowDays: string;
  minimumBudget: string;
  maximumBudget: string;
  coordinatorCountry: string;
  minimumConsortiumSize: string;
  maximumConsortiumSize: string;
};

const EMPTY_CANDIDATE: CandidatePartner = {
  name: "",
  country: "",
  role: "",
  organisationType: "",
};

const DEFAULT_FILTERS: SearchFilters = {
  queryOperator: "or",
  programme: "",
  actionType: "",
  includeRecentClosed: false,
  deadlineWindowDays: "",
  minimumBudget: "",
  maximumBudget: "",
  coordinatorCountry: "",
  minimumConsortiumSize: "",
  maximumConsortiumSize: "",
};

export function SearchWorkspace() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS);
  const [candidates, setCandidates] = useState<CandidatePartner[]>([{ ...EMPTY_CANDIDATE }]);

  const programmes = useMemo(
    () => Array.from(new Set(DATASET.topics.map((topic) => topic.programme))).sort(),
    [],
  );
  const actionTypes = useMemo(
    () => Array.from(new Set(DATASET.topics.map((topic) => topic.actionType))).sort(),
    [],
  );

  const submitSearch = () => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return;
    }
    sessionStorage.setItem(STORAGE_KEYS.filters, JSON.stringify(filters));
    sessionStorage.setItem(STORAGE_KEYS.candidates, JSON.stringify(candidates.filter((candidate) => candidate.name)));
    router.push(`/results/?q=${encodeURIComponent(trimmedQuery)}`);
  };

  const importCandidates = async (file: File | null) => {
    if (!file) {
      return;
    }
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    const [header, ...rows] = lines;
    if (!header) {
      return;
    }
    const columns = header.split(",").map((value) => value.trim().toLowerCase());
    const imported = rows.map((row) => {
      const values = row.split(",").map((value) => value.trim());
      return {
        name: values[columns.indexOf("organisation name")] ?? values[0] ?? "",
        country: values[columns.indexOf("country")] ?? "",
        role: values[columns.indexOf("role")] ?? "",
        organisationType: values[columns.indexOf("organisation type")] ?? "",
      };
    });
    setCandidates(imported.filter((candidate) => candidate.name));
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.35fr_0.95fr]">
      <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-teal-700">
              Opportunity search
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
              Find the strongest open topic for your signal
            </h2>
          </div>
          <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            {APP_MODE === "live_public" ? "Live public data" : "Demo-ready"}
          </div>
        </div>

        <div className="mt-6">
          <label className="text-sm font-medium text-slate-700" htmlFor="query">
            Keyword, phrase, or search string
          </label>
          <input
            id="query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="mt-2 w-full rounded-[24px] border border-slate-300 bg-slate-50 px-5 py-4 text-lg outline-none ring-0 transition focus:border-teal-400 focus:bg-white"
            placeholder="Use commas to separate concepts, for example: semiconductor, optics, interposer"
          />
          <div className="mt-4">
            <span className="text-sm font-medium text-slate-700">Multi-term logic</span>
            <div className="mt-2 flex flex-wrap gap-3">
              <label className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700">
                <input
                  type="radio"
                  name="query-operator"
                  value="or"
                  checked={filters.queryOperator === "or"}
                  onChange={() => setFilters((current) => ({ ...current, queryOperator: "or" }))}
                />
                Match any term (OR)
              </label>
              <label className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700">
                <input
                  type="radio"
                  name="query-operator"
                  value="and"
                  checked={filters.queryOperator === "and"}
                  onChange={() => setFilters((current) => ({ ...current, queryOperator: "and" }))}
                />
                Match all terms (AND)
              </label>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              Comma-separated phrases are treated as separate concepts. OR returns topics matching any concept. AND only returns topics that cover all concepts.
            </p>
          </div>
        </div>

        <div className="mt-8 rounded-[28px] border border-slate-200 bg-slate-50 p-5">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.2em] text-slate-600">
            <Filter className="h-4 w-4" />
            Optional filters
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm text-slate-700">
              <span>Programme</span>
              <select
                value={filters.programme}
                onChange={(event) => setFilters((current) => ({ ...current, programme: event.target.value }))}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3"
              >
                <option value="">All programmes</option>
                {programmes.map((programme) => (
                  <option key={programme} value={programme}>
                    {programme}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-sm text-slate-700">
              <span>Action type</span>
              <select
                value={filters.actionType}
                onChange={(event) => setFilters((current) => ({ ...current, actionType: event.target.value }))}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3"
              >
                <option value="">All action types</option>
                {actionTypes.map((actionType) => (
                  <option key={actionType} value={actionType}>
                    {actionType}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-sm text-slate-700">
              <span>Minimum days until deadline</span>
              <input
                type="number"
                min="0"
                step="1"
                value={filters.deadlineWindowDays}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, deadlineWindowDays: event.target.value }))
                }
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3"
                placeholder="Leave blank for any deadline"
              />
              <p className="text-xs leading-5 text-slate-500">
                Leave blank for any deadline. Enter `30` to require at least 30 days remaining.
              </p>
            </label>
            <label className="space-y-2 text-sm text-slate-700">
              <span>Coordinator country</span>
              <input
                value={filters.coordinatorCountry}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, coordinatorCountry: event.target.value.toUpperCase() }))
                }
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3"
                placeholder="DE, BE, FI..."
              />
            </label>
            <label className="space-y-2 text-sm text-slate-700">
              <span>Minimum budget (EUR)</span>
              <input
                value={filters.minimumBudget}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, minimumBudget: event.target.value }))
                }
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3"
              />
            </label>
            <label className="space-y-2 text-sm text-slate-700">
              <span>Maximum budget (EUR)</span>
              <input
                value={filters.maximumBudget}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, maximumBudget: event.target.value }))
                }
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3"
              />
            </label>
          </div>
          <label className="mt-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={filters.includeRecentClosed}
              onChange={(event) =>
                setFilters((current) => ({ ...current, includeRecentClosed: event.target.checked }))
              }
            />
            Include recent closed topics for analogue evidence
          </label>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={submitSearch}
            disabled={!query.trim()}
            className="rounded-full bg-teal-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Run signal scan
          </button>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setFilters(DEFAULT_FILTERS);
              setCandidates([{ ...EMPTY_CANDIDATE }]);
            }}
            className="rounded-full border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            Reset inputs
          </button>
        </div>
      </section>

      <aside className="space-y-6">
        <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-600">
                Candidate consortium
              </p>
              <h3 className="mt-2 text-xl font-semibold text-slate-950">Scenario-ready partner list</h3>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-300 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600 transition hover:border-teal-300 hover:text-teal-800">
              <Upload className="h-4 w-4" />
              CSV upload
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(event) => importCandidates(event.target.files?.[0] ?? null)}
              />
            </label>
          </div>

          <div className="mt-5 space-y-4">
            {candidates.map((candidate, index) => (
              <div key={`${candidate.name}-${index}`} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="grid gap-3">
                  <input
                    value={candidate.name}
                    onChange={(event) =>
                      setCandidates((current) =>
                        current.map((entry, entryIndex) =>
                          entryIndex === index ? { ...entry, name: event.target.value } : entry,
                        ),
                      )
                    }
                    className="rounded-2xl border border-slate-300 bg-white px-4 py-3"
                    placeholder="Organisation name"
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      value={candidate.country}
                      onChange={(event) =>
                        setCandidates((current) =>
                          current.map((entry, entryIndex) =>
                            entryIndex === index
                              ? { ...entry, country: event.target.value.toUpperCase() }
                              : entry,
                          ),
                        )
                      }
                      className="rounded-2xl border border-slate-300 bg-white px-4 py-3"
                      placeholder="Country"
                    />
                    <input
                      value={candidate.role}
                      onChange={(event) =>
                        setCandidates((current) =>
                          current.map((entry, entryIndex) =>
                            entryIndex === index ? { ...entry, role: event.target.value } : entry,
                          ),
                        )
                      }
                      className="rounded-2xl border border-slate-300 bg-white px-4 py-3"
                      placeholder="Optional role"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <input
                      value={candidate.organisationType}
                      onChange={(event) =>
                        setCandidates((current) =>
                          current.map((entry, entryIndex) =>
                            entryIndex === index
                              ? { ...entry, organisationType: event.target.value }
                              : entry,
                          ),
                        )
                      }
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3"
                      placeholder="Optional organisation type"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setCandidates((current) =>
                          current.length > 1 ? current.filter((_, entryIndex) => entryIndex !== index) : current,
                        )
                      }
                      className="ml-3 inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-300 text-slate-500 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={() => setCandidates((current) => [...current, { ...EMPTY_CANDIDATE }])}
              className="inline-flex items-center gap-2 rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800"
            >
              <Plus className="h-4 w-4" />
              Add partner
            </button>
            <button
              type="button"
              onClick={() => router.push(`/scenario/?q=${encodeURIComponent(query)}`)}
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Open scenario compare
            </button>
          </div>
        </section>

        <CaveatBanner text={DATASET.meta.caveat} />
      </aside>
    </div>
  );
}
