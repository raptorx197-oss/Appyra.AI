"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ReservationsTab from "./ReservationsTab";
import OrdersTab from "./OrdersTab";
import MenuTab from "./MenuTab";
import ProfileTab from "./ProfileTab";
import AssistantTab from "./AssistantTab";
import ProposalsTab from "./ProposalsTab";
import LogTab from "./LogTab";

const TABS = [
  { key: "reservations", label: "Reservations" },
  { key: "orders", label: "Orders" },
  { key: "menu", label: "Menu" },
  { key: "profile", label: "Profile" },
  { key: "assistant", label: "AI Assistant" },
  { key: "proposals", label: "Proposals" },
  { key: "log", label: "Activity Log" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function DashboardClient({ restaurantName, email }: { restaurantName: string; email: string }) {
  const [tab, setTab] = useState<TabKey>("reservations");
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">{restaurantName} — Dashboard</h1>
          <p className="text-xs text-stone-400">Signed in as {email}</p>
        </div>
        <button onClick={logout} className="rounded-md border border-stone-300 px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100">
          Log out
        </button>
      </div>

      <div className="mt-6 flex flex-wrap gap-1 border-b border-stone-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-sm font-medium ${tab === t.key ? "border-b-2 border-amber-800 text-amber-800" : "text-stone-500 hover:text-stone-800"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "reservations" && <ReservationsTab />}
        {tab === "orders" && <OrdersTab />}
        {tab === "menu" && <MenuTab />}
        {tab === "profile" && <ProfileTab />}
        {tab === "assistant" && <AssistantTab />}
        {tab === "proposals" && <ProposalsTab />}
        {tab === "log" && <LogTab />}
      </div>
    </div>
  );
}
