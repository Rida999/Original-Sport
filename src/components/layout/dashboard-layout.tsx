import { type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Package,
  Archive,
  Warehouse,
  BarChart3,
  Receipt,
  Menu,
  Moon,
  Sun,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { signOut } from "@/lib/auth";
import logo from "@/assets/logo.png";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/products", label: "Products", icon: Package },
  { to: "/archive", label: "Archive", icon: Archive },
  { to: "/inventory", label: "Inventory", icon: Warehouse },
  { to: "/receipts", label: "Receipts", icon: Receipt },
  { to: "/reports", label: "Reports", icon: BarChart3 },
] as const;

const THEME_STORAGE_KEY = "original-sport-theme";

const getInitialNightMode = () => {
  if (typeof window === "undefined") return false;
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "dark") return true;
  if (stored === "light") return false;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
};

export function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [nightMode, setNightMode] = useState(getInitialNightMode);

  const isActive = (to: string) => pathname === to || pathname.startsWith(to + "/");

  const handleSignOut = () => {
    signOut();
    window.location.href = "/signin";
  };

  useEffect(() => {
    document.documentElement.classList.toggle("dark", nightMode);
    window.localStorage.setItem(THEME_STORAGE_KEY, nightMode ? "dark" : "light");
  }, [nightMode]);

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-60 border-r border-sidebar-border bg-sidebar flex-col transition-transform md:translate-x-0 md:flex",
          open ? "translate-x-0 flex" : "-translate-x-full md:translate-x-0",
        )}
      >
        <div className="h-24 flex items-center justify-center border-b border-sidebar-border p-2">
          <img
            src={logo}
            alt="Original Sport"
            className="h-full w-full object-contain dark:invert"
          />
        </div>
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {nav.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
                isActive(to)
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Mobile overlay */}
      {open && (
        <div onClick={() => setOpen(false)} className="fixed inset-0 z-30 bg-black/40 md:hidden" />
      )}

      <div className="flex-1 flex flex-col min-w-0 md:pl-60">
        <header className="h-14 border-b border-border flex items-center px-4 md:px-6 gap-3">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(true)}>
            <Menu className="size-5" />
          </Button>
          <div className="text-sm text-muted-foreground capitalize">
            {pathname.replace("/", "").split("/")[0] || "Dashboard"}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ml-auto h-9 gap-2"
            aria-label={nightMode ? "Switch to day mode" : "Switch to night mode"}
            onClick={() => setNightMode((enabled) => !enabled)}
          >
            {nightMode ? <Sun className="size-4" /> : <Moon className="size-4" />}
            <span className="hidden sm:inline">{nightMode ? "Day" : "Night"}</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 gap-2 hover:border-destructive/40 hover:text-destructive"
            onClick={handleSignOut}
          >
            <LogOut className="size-4" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </header>
        <main className="flex-1 p-4 md:p-6 2xl:p-10 max-w-[1920px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
