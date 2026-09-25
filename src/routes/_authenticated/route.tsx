import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { DashboardLayout } from "@/components/layout/dashboard-layout";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: ({ context }) => {
    if (!context.user) {
      throw redirect({ to: "/signin" });
    }
  },
  component: () => ( 
    <DashboardLayout>
      <Outlet />
    </DashboardLayout>
  ),
});
