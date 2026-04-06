"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { loadAdminSnapshot, loadDemoDataset } from "@/lib/api";
import { CaveatBanner } from "@/components/caveat-banner";
import type { AdminSnapshot } from "@/lib/types";

const LOCAL_STORAGE_KEYS = {
  weights: "efs:weights",
  flags: "efs:flags",
  synonyms: "efs:synonyms",
};

export function AdminWorkspace() {
  const dataset = loadDemoDataset();
  type ScoreWeights = AdminSnapshot["scoreWeights"];
  const snapshot = useQuery<AdminSnapshot>({
    queryKey: ["admin-snapshot"],
    queryFn: () => loadAdminSnapshot(),
  });
  const [weights, setWeights] = useState<ScoreWeights>(() => {
    if (typeof window === "undefined") {
      return dataset.scoreWeights;
    }
    const stored = localStorage.getItem(LOCAL_STORAGE_KEYS.weights);
    return stored ? JSON.parse(stored) : dataset.scoreWeights;
  });
  const [flags, setFlags] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") {
      return dataset.featureFlags;
    }
    const stored = localStorage.getItem(LOCAL_STORAGE_KEYS.flags);
    return stored ? JSON.parse(stored) : dataset.featureFlags;
  });
  const [synonyms, setSynonyms] = useState(() => {
    if (typeof window === "undefined") {
      return JSON.stringify(dataset.synonyms, null, 2);
    }
    return (
      localStorage.getItem(LOCAL_STORAGE_KEYS.synonyms) ??
      JSON.stringify(dataset.synonyms, null, 2)
    );
  });
  const [uploadMessage, setUploadMessage] = useState("No file uploaded yet.");
  const [rebuildMessage, setRebuildMessage] = useState("");

  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_KEYS.weights, JSON.stringify(weights));
  }, [weights]);

  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_KEYS.flags, JSON.stringify(flags));
  }, [flags]);

  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_KEYS.synonyms, synonyms);
  }, [synonyms]);

  return (
    <div className="space-y-6">
      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-teal-700">Data operations</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
            Source status and controls
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Demo mode persists edits in the browser and simulates index rebuilds. The backend and
            ETL commands in the repo enable real refresh workflows.
          </p>
        </div>

        <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-600">
                Search index
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Rebuilds the hybrid lexical and vector layer from cached sources.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setRebuildMessage("Demo mode: index rebuild simulated. Use backend CLI `refresh-all` for real runs.")
              }
              className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              <RefreshCw className="h-4 w-4" />
              Rebuild index
            </button>
          </div>
          {rebuildMessage ? <p className="mt-4 text-sm text-emerald-700">{rebuildMessage}</p> : null}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-6">
          <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
            <h3 className="text-lg font-semibold text-slate-950">Data source status</h3>
            <div className="mt-4 space-y-3">
              {snapshot.data?.dataSources.map((source) => (
                <a
                  key={source.id}
                  href={source.landingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-teal-300 hover:bg-teal-50"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-slate-950">{source.name}</p>
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
                      {source.status}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">Last refresh {source.lastRefreshAt}</p>
                </a>
              ))}
            </div>
          </div>

          <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
            <h3 className="text-lg font-semibold text-slate-950">Manual uploads</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Upload CSV, TSV, XLSX, or JSON manually when public download URLs change.
            </p>
            <label className="mt-4 flex cursor-pointer items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-sm text-slate-600 transition hover:border-teal-300 hover:bg-teal-50">
              <input
                type="file"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  setUploadMessage(
                    file
                      ? `Loaded ${file.name}. In demo mode the file is previewed only; the backend import routes perform real ingestion.`
                      : "No file uploaded yet.",
                  );
                }}
              />
              Click to select a source file
            </label>
            <p className="mt-4 text-sm text-slate-700">{uploadMessage}</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
            <h3 className="text-lg font-semibold text-slate-950">Scoring weights editor</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {Object.entries(weights).map(([key, value]) => (
                <label key={key} className="space-y-2 text-sm text-slate-700">
                  <span className="capitalize">{key}</span>
                  <input
                    type="number"
                    step="0.01"
                    value={value}
                    onChange={(event) =>
                      setWeights((current) => ({ ...current, [key]: Number(event.target.value) }))
                    }
                    className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3"
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
            <h3 className="text-lg font-semibold text-slate-950">Feature flags</h3>
            <div className="mt-4 space-y-3">
              {Object.entries(flags).map(([key, value]) => (
                <label
                  key={key}
                  className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
                >
                  <span>{key}</span>
                  <input
                    type="checkbox"
                    checked={value}
                    onChange={(event) =>
                      setFlags((current) => ({ ...current, [key]: event.target.checked }))
                    }
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
            <h3 className="text-lg font-semibold text-slate-950">Synonym dictionary editor</h3>
            {snapshot.data?.synonymGroups.length ? (
              <textarea
                value={synonyms}
                onChange={(event) => setSynonyms(event.target.value)}
                className="mt-4 h-72 w-full rounded-3xl border border-slate-300 bg-slate-50 px-4 py-4 font-mono text-sm"
              />
            ) : (
              <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                Predefined synonym expansions are disabled in live search mode. The app now uses only the
                text the user typed.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
        <h3 className="text-lg font-semibold text-slate-950">Refresh logs</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm text-slate-700">
            <thead className="text-xs uppercase tracking-[0.16em] text-slate-500">
              <tr>
                <th className="pb-3">Source</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">Message</th>
                <th className="pb-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.data?.refreshLogs.map((entry) => (
                <tr key={entry.id} className="border-t border-slate-100 align-top">
                  <td className="py-3 pr-4">{entry.source}</td>
                  <td className="py-3 pr-4">{entry.status}</td>
                  <td className="py-3 pr-4">{entry.message}</td>
                  <td className="py-3">{entry.createdAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <CaveatBanner text={dataset.meta.caveat} />
    </div>
  );
}
