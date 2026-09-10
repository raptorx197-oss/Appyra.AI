"use client";

import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/apiClient";

type LogEntry = {
  id: string;
  toolName: string;
  requestedArgs: unknown;
  authorizationLevel: string;
  executionStatus: string;
  resultSummary: string | null;
  createdAt: string;
};

const STATUS_COLOR: Record<string, string> = {
  succeeded: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-700",
  blocked: "bg-stone-200 text-stone-700",
};

export default function LogTab() {
  const [rows, setRows] = useState<LogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<LogEntry[]>("/api/ai/log").then(setRows).catch((e) => setError(errorMessage(e)));
  }, []);

  if (error) return <p className="text-red-600">{error}</p>;
  if (!rows) return <p className="text-stone-500">Loading…</p>;

  return (
    <div>
      <p className="mb-4 max-w-2xl text-sm text-stone-500">
        Every assistant tool call, successful or not, is written here permanently — this table has no update or delete path anywhere in the app, and the
        database rejects both at the trigger level even if one were added by mistake.
      </p>
      <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-left text-xs uppercase text-stone-500">
            <tr>
              <th className="px-4 py-2">When</th>
              <th className="px-4 py-2">Tool</th>
              <th className="px-4 py-2">Authorization</th>
              <th className="px-4 py-2">Result</th>
              <th className="px-4 py-2">Summary</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2 text-xs text-stone-400">{new Date(r.createdAt).toLocaleString()}</td>
                <td className="px-4 py-2 font-mono text-xs">{r.toolName}</td>
                <td className="px-4 py-2 text-xs">{r.authorizationLevel}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[r.executionStatus] ?? "bg-stone-100"}`}>{r.executionStatus}</span>
                </td>
                <td className="px-4 py-2 text-stone-600">{r.resultSummary}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-stone-400">
                  No activity yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
