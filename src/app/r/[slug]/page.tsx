import { notFound } from "next/navigation";
import { getMenuForRestaurant, getRestaurantBySlug } from "@/lib/queries";
import RestaurantClient from "./RestaurantClient";

export default async function RestaurantPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const restaurant = getRestaurantBySlug(slug);
  if (!restaurant) notFound();
  const menu = getMenuForRestaurant(restaurant.id);

  return <RestaurantClient restaurant={restaurant} menu={menu} />;
}
