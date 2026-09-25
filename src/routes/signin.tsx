import { createFileRoute, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { Lock, ShieldCheck } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changeInitialPasswordFn, signInFn } from "@/server/auth";
import logo from "@/assets/logo.png";

export const Route = createFileRoute("/signin")({
  ssr: false,
  beforeLoad: ({ context }) => {
    if (context.user) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: SignInPage,
});

function SignInPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    window.localStorage.removeItem("original-sport-authenticated");
    window.localStorage.removeItem("original-sport-auth-user");
    window.localStorage.removeItem("original-sport-superadmin-password");
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      const result = await signInFn({ data: { username, password } });

      if (!result.success) {
        toast.error("Invalid username or password");
        return;
      }

      if (result.requiresPasswordChange) {
        setMustChangePassword(true);
        setNewPassword("");
        setConfirmPassword("");
        toast.info("Please choose a new private password");
        return;
      }

      await router.invalidate();
      navigate({ to: "/dashboard", replace: true });
    } catch {
      toast.error("Unable to sign in. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePasswordChange = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedPassword = newPassword.trim();

    if (trimmedPassword.length < 12) {
      toast.error("Use at least 12 characters for the new password");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("The passwords do not match");
      return;
    }

    setIsSubmitting(true);
    try {
      await changeInitialPasswordFn({ data: { password: newPassword } });
      await router.invalidate();
      toast.success("Password changed");
      navigate({ to: "/dashboard", replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to change password");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-svh bg-background px-4 py-4 sm:py-6">
      <div className="mx-auto flex min-h-[calc(100svh-2rem)] w-full max-w-sm items-center justify-center sm:min-h-[calc(100svh-3rem)] lg:max-w-5xl">
        <div className="grid w-full overflow-hidden rounded-lg border bg-card shadow-sm lg:grid-cols-[1fr_420px]">
          <div className="hidden border-r bg-muted/35 p-8 lg:flex lg:flex-col lg:justify-between">
            <div>
              <div className="flex">
                <img
                  src={logo}
                  alt="Original Sport"
                  className="h-20 w-auto object-contain mix-blend-multiply dark:mix-blend-screen dark:invert"
                />
              </div>

              <div className="mt-4 max-w-sm">
                <h1 className="text-3xl font-semibold tracking-tight">Inventory control</h1>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  Manage products, receipts, reports, and stock movement from one focused workspace.
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

          <div className="border-b bg-muted/35 px-5 py-8 lg:hidden">
            <div className="flex justify-center">
              <img
                src={logo}
                alt="Original Sport"
                className="h-20 w-auto object-contain mix-blend-multiply dark:mix-blend-screen dark:invert"
              />
            </div>
          </div>

          <Card className="rounded-none border-0 p-5 shadow-none sm:p-8">
            <div className="mb-6 sm:mb-8">
              <div className="flex items-center gap-3 lg:block">
                <div className="grid size-10 place-items-center rounded-md border bg-muted">
                  <Lock className="size-5 text-muted-foreground" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold tracking-tight sm:text-2xl lg:mt-4">
                    {mustChangePassword ? "Change password" : "Sign in"}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {mustChangePassword
                      ? "Create a private password for this account."
                      : "Enter your admin credentials."}
                  </p>
                </div>
              </div>
            </div>

            {mustChangePassword ? (
              <form className="space-y-4 sm:space-y-5" onSubmit={handlePasswordChange}>
                <div className="space-y-1.5">
                  <Label htmlFor="new-password">New password</Label>
                  <Input
                    id="new-password"
                    autoComplete="new-password"
                    autoFocus
                    className="h-12 text-base sm:h-11 sm:text-sm"
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirm-password">Confirm password</Label>
                  <Input
                    id="confirm-password"
                    autoComplete="new-password"
                    className="h-12 text-base sm:h-11 sm:text-sm"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                  />
                </div>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="h-12 w-full text-base sm:h-11 sm:text-sm"
                >
                  Save new password
                </Button>
              </form>
            ) : (
              <form className="space-y-4 sm:space-y-5" onSubmit={handleSubmit}>
                <div className="space-y-1.5">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    autoComplete="username"
                    autoFocus
                    className="h-12 text-base sm:h-11 sm:text-sm"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    autoComplete="current-password"
                    className="h-12 text-base sm:h-11 sm:text-sm"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </div>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="h-12 w-full text-base sm:h-11 sm:text-sm"
                >
                  {isSubmitting ? "Signing in…" : "Sign in"}
                </Button>
              </form>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
