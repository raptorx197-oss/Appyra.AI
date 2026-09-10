import { getStaffSession } from "@/lib/auth";
import LoginForm from "@/components/dashboard/LoginForm";
import DashboardClient from "@/components/dashboard/DashboardClient";

export default async function DashboardPage() {
  const session = await getStaffSession();
  if (!session) return <LoginForm />;
  return <DashboardClient restaurantName={session.restaurantName} email={session.email} />;
}
