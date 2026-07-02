import { createFileRoute, Outlet } from "@tanstack/react-router";

import { DashboardLayout } from "@/components/layout/dashboard-layout";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: () => (
    <DashboardLayout>
      <Outlet />
    </DashboardLayout>
  ),
});
