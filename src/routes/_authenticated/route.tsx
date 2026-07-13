import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { isSignedIn } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: () => {
    if (!isSignedIn()) {
      throw redirect({ to: "/signin" });
    }
  },
  component: () => (
    <DashboardLayout>
      <Outlet />
    </DashboardLayout>
  ),
});
