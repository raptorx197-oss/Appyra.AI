import Link from "next/link";
import { getDb } from "@/lib/db";

// Reads live restaurant state (new restaurants, closures) — must not be
// frozen into a static build-time snapshot.
export const dynamic = "force-dynamic";

type RestaurantRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  phone: string | null;
  isTemporarilyClosed: number;
};

function listActiveRestaurants(): RestaurantRow[] {
  const db = getDb();
  return db
    .prepare(
      `select id, name, slug, description, phone, is_temporarily_closed as isTemporarilyClosed
       from restaurants where is_active = 1 order by name`
    )
    .all() as RestaurantRow[];
}

export default function HomePage() {
  const restaurants = listActiveRestaurants();

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-stone-900">Restaurants on Appyra</h1>
        <p className="mt-1 text-stone-600">Browse a menu, place an order for pickup, or book a table — no account required.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {restaurants.map((r) => (
          <Link
            key={r.id}
            href={`/r/${r.slug}`}
            className="block rounded-lg border border-stone-200 bg-white p-5 shadow-sm transition hover:border-amber-700 hover:shadow-md"
          >
            <div className="flex items-start justify-between">
              <h2 className="text-lg font-medium text-stone-900">{r.name}</h2>
              {!!r.isTemporarilyClosed && (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Temporarily closed</span>
              )}
            </div>
            {r.description && <p className="mt-2 text-sm text-stone-600">{r.description}</p>}
            {r.phone && <p className="mt-3 text-xs text-stone-400">{r.phone}</p>}
          </Link>
        ))}
        {restaurants.length === 0 && <p className="text-stone-500">No restaurants yet.</p>}
      </div>
    </div>
  );
}
