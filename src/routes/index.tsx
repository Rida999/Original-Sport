import { createFileRoute, redirect } from "@tanstack/react-router";
import { isSignedIn } from "@/lib/auth";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: () => {
    throw redirect({ to: isSignedIn() ? "/dashboard" : "/signin" });
  },
  component: () => null,
});
