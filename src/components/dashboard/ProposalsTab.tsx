"use client";

import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/apiClient";
import StatusBadge from "@/components/StatusBadge";

type Proposal = {
  id: string;
  capability: string;
  payload: { menuItemId: string; newPrice: number; previousPrice: number; itemName: string };
  status: string;
  resolvedAt: string | null;
  createdAt: string;
};

export default function ProposalsTab() {
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api<Proposal[]>("/api/ai/proposals").then(setProposals).catch((e) => setError(errorMessage(e)));
  }

  useEffect(load, []);

  async function act(id: string, action: "approve" | "reject") {
    try {
      await api(`/api/ai/proposals/${id}/${action}`, { method: "POST" });
      load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  if (error) return <p className="text-red-600">{error}</p>;
  if (!proposals) return <p className="text-stone-500">Loading…</p>;

  return (
    <div>
      <p className="mb-4 max-w-2xl text-sm text-stone-500">
        The AI can propose a price change but never applies it — only a staff member clicking Approve here does. This is enforced structurally
        (src/lib/ai/core.ts&rsquo;s <code>approveProposal</code>), not by convention.
      </p>
      <div className="space-y-3">
        {proposals.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-stone-200 bg-white p-4">
            <div>
              <p className="font-medium text-stone-900">
                {p.payload.itemName}: {p.payload.previousPrice.toFixed(2)} → {p.payload.newPrice.toFixed(2)} ETB
              </p>
              <p className="text-xs text-stone-400">Proposed {new Date(p.createdAt).toLocaleString()}</p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={p.status} />
              {p.status === "awaiting_approval" && (
                <>
                  <button onClick={() => act(p.id, "approve")} className="rounded-md bg-green-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-800">
                    Approve
                  </button>
                  <button onClick={() => act(p.id, "reject")} className="rounded-md bg-stone-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-700">
                    Reject
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
        {proposals.length === 0 && <p className="text-stone-400">No proposals yet — try asking the assistant to change a price.</p>}
      </div>
    </div>
  );
}
