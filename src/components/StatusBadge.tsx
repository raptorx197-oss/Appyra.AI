const COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  confirmed: "bg-blue-100 text-blue-800",
  accepted: "bg-blue-100 text-blue-800",
  ready: "bg-purple-100 text-purple-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-stone-200 text-stone-600",
  no_show: "bg-red-100 text-red-700",
  awaiting_approval: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-stone-200 text-stone-600",
};

export default function StatusBadge({ status }: { status: string }) {
  const cls = COLORS[status] ?? "bg-stone-100 text-stone-600";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${cls}`}>{status.replace("_", " ")}</span>;
}
