import { type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Package,
  Tags,
  Boxes,
  Warehouse,
  Truck,
  BarChart3,
  Settings,
  Package2,
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useState } from "react";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/products", label: "Products", icon: Package },
  { to: "/categories", label: "Categories", icon: Tags },
  { to: "/brands", label: "Brands", icon: Boxes },
  { to: "/inventory", label: "Inventory", icon: Warehouse },
  { to: "/suppliers", label: "Suppliers", icon: Truck },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  const isActive = (to: string) => pathname === to || pathname.startsWith(to + "/");

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-60 border-r border-sidebar-border bg-sidebar flex-col transition-transform lg:translate-x-0 lg:flex",
          open ? "translate-x-0 flex" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div className="h-14 flex items-center gap-2 px-4 border-b border-sidebar-border">
          <div className="size-7 rounded-md bg-primary/15 grid place-items-center">
            <Package2 className="size-4 text-primary" />
          </div>
          <span className="text-sm font-semibold tracking-tight text-sidebar-foreground">
            SportsWear
          </span>
        </div>
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {nav.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                isActive(to)
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
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
        <div onClick={() => setOpen(false)} className="fixed inset-0 z-30 bg-black/40 lg:hidden" />
      )}

      <div className="flex-1 flex flex-col min-w-0 lg:pl-60">
        <header className="h-14 border-b border-border flex items-center px-4 lg:px-6 gap-3">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)}>
            <Menu className="size-5" />
          </Button>
          <div className="text-sm text-muted-foreground capitalize">
            {pathname.replace("/", "").split("/")[0] || "Dashboard"}
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-6 max-w-screen-2xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
