export type PublicMenuItem = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  isAvailable: boolean;
};

export type PublicMenuCategory = {
  id: string;
  name: string;
  items: PublicMenuItem[];
};

export type PublicRestaurant = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  phone: string | null;
  hours: Record<string, { open: string; close: string }> | null;
  isTemporarilyClosed: boolean;
  temporaryClosureNote: string | null;
};

export type ReservationStatus = "pending" | "confirmed" | "cancelled" | "no_show" | "completed";
export type OrderStatus = "pending" | "accepted" | "ready" | "completed" | "cancelled";
