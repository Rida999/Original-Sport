import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { Lock, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isSignedIn, signIn } from "@/lib/auth";

export const Route = createFileRoute("/signin")({
  ssr: false,
  beforeLoad: () => {
    if (isSignedIn()) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: SignInPage,
});

function SignInPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!signIn(username, password)) {
      toast.error("Invalid username or password");
      return;
    }

    navigate({ to: "/dashboard", replace: true });
  };

  return (
    <div className="min-h-screen bg-background px-4 py-6">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-5xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-lg border bg-card shadow-sm lg:grid-cols-[1fr_420px]">
          <div className="hidden border-r bg-muted/35 p-8 lg:flex lg:flex-col lg:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="grid size-11 place-items-center rounded-md border bg-background">
                  <span className="text-xs font-black tracking-tight">OS</span>
                </div>
                <div>
                  <div className="text-lg font-black uppercase leading-none">Original</div>
                  <div className="text-lg font-light italic leading-none">Sport</div>
                </div>
              </div>

              <div className="mt-12 max-w-sm">
                <h1 className="text-3xl font-semibold tracking-tight">Inventory control</h1>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  Manage products, receipts, reports, and stock movement from one focused
                  workspace.
                </p>
              </div>
            </div>

            <div className="grid gap-3 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <ShieldCheck className="size-4 text-primary" />
                Private dashboard access
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Lock className="size-4 text-primary" />
                Protected inventory tools
              </div>
            </div>
          </div>

          <Card className="rounded-none border-0 p-6 shadow-none sm:p-8">
            <div className="mb-8">
              <div className="mb-5 flex items-center gap-3 lg:hidden">
                <div className="grid size-10 place-items-center rounded-md border bg-muted">
                  <span className="text-[11px] font-black tracking-tight">OS</span>
                </div>
                <div className="text-sm tracking-tight leading-none">
                  <span className="font-black uppercase">Original</span>{" "}
                  <span className="italic font-light">Sport</span>
                </div>
              </div>
              <div className="grid size-10 place-items-center rounded-md border bg-muted">
                <Lock className="size-5 text-muted-foreground" />
              </div>
              <h1 className="mt-4 text-2xl font-semibold tracking-tight">Sign in</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Enter your admin credentials to continue.
              </p>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-1.5">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  autoComplete="username"
                  autoFocus
                  className="h-11"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  autoComplete="current-password"
                  className="h-11"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              <Button type="submit" className="h-11 w-full">
                Sign in
              </Button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
