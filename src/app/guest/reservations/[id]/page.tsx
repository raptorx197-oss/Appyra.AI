import { notFound } from "next/navigation";
import Link from "next/link";
import { getDb } from "@/lib/db";
import { getRestaurantById } from "@/lib/queries";
import { ReservationStatus } from "@/lib/types";
import StatusBadge from "@/components/StatusBadge";

export default async function GuestReservationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const reservation = db
    .prepare(
      `select id, status, reservation_date as reservationDate, reservation_time as reservationTime,
              guest_count as guestCount, restaurant_id as restaurantId
       from reservations where id = ?`
    )
    .get(id) as
    | { id: string; status: ReservationStatus; reservationDate: string; reservationTime: string; guestCount: number; restaurantId: string }
    | undefined;

  if (!reservation) notFound();
  const restaurant = getRestaurantById(reservation.restaurantId);

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <Link href="/guest" className="text-sm text-amber-800 hover:underline">
        &larr; Look up another
      </Link>
      <div className="mt-4 rounded-lg border border-stone-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-stone-900">Reservation status</h1>
          <StatusBadge status={reservation.status} />
        </div>
        {restaurant && <p className="mt-1 text-sm text-stone-500">{restaurant.name}</p>}
        <dl className="mt-4 space-y-1 text-sm text-stone-700">
          <div className="flex justify-between">
            <dt className="text-stone-500">Date</dt>
            <dd>{reservation.reservationDate}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-stone-500">Time</dt>
            <dd>{reservation.reservationTime}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-stone-500">Guests</dt>
            <dd>{reservation.guestCount}</dd>
          </div>
        </dl>
        <p className="mt-4 text-xs text-stone-400">Reservation ID: {reservation.id}</p>
      </div>
    </div>
  );
}
