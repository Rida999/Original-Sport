import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Package, Tags, Boxes, AlertTriangle, XCircle, Clock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — SportsWear Inventory" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [products, categories, brands, low, oos, recent, activity] = await Promise.all([
        supabase.from("products").select("*", { count: "exact", head: true }),
        supabase.from("categories").select("*", { count: "exact", head: true }),
        supabase.from("brands").select("*", { count: "exact", head: true }),
        supabase.from("products").select("id,name,quantity,min_stock").lte("quantity", 5).gt("quantity", 0).limit(5),
        supabase.from("products").select("id,name,quantity").eq("quantity", 0).limit(5),
        supabase.from("products").select("id,name,selling_price,created_at,images").order("created_at", { ascending: false }).limit(5),
        supabase.from("activity_logs").select("*").order("created_at", { ascending: false }).limit(8),
      ]);
      return {
        totalProducts: products.count ?? 0,
        totalCategories: categories.count ?? 0,
        totalBrands: brands.count ?? 0,
        lowStock: low.data ?? [],
        outOfStock: oos.data ?? [],
        recent: recent.data ?? [],
        activity: activity.data ?? [],
      };
    },
  });

  const stats = [
    { label: "Total Products", value: data?.totalProducts ?? 0, icon: Package, accent: "text-primary" },
    { label: "Categories", value: data?.totalCategories ?? 0, icon: Tags, accent: "text-primary" },
    { label: "Brands", value: data?.totalBrands ?? 0, icon: Boxes, accent: "text-primary" },
    { label: "Low Stock", value: data?.lowStock.length ?? 0, icon: AlertTriangle, accent: "text-warning" },
    { label: "Out of Stock", value: data?.outOfStock.length ?? 0, icon: XCircle, accent: "text-destructive" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Overview of your inventory</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {stats.map((s) => (
          <Card key={s.label} className="p-4">
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">{s.label}</div>
              <s.icon className={`size-4 ${s.accent}`} />
            </div>
            <div className="text-2xl font-semibold mt-2">{isLoading ? <Skeleton className="h-7 w-12" /> : s.value}</div>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-sm">Recently added products</h2>
            <Link to="/products" className="text-xs text-primary hover:underline">View all</Link>
          </div>
          {isLoading ? <Skeleton className="h-32" /> : data?.recent.length === 0 ? (
            <EmptyState label="No products yet" />
          ) : (
            <ul className="divide-y divide-border">
              {data?.recent.map((p) => (
                <li key={p.id} className="py-2 flex items-center justify-between text-sm">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="size-9 rounded-md bg-muted overflow-hidden shrink-0">
                      {p.images?.[0] && <img src={p.images[0]} alt="" className="size-full object-cover" />}
                    </div>
                    <span className="truncate">{p.name}</span>
                  </div>
                  <span className="text-muted-foreground tabular-nums">${Number(p.selling_price).toFixed(2)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="size-4 text-muted-foreground" />
            <h2 className="font-semibold text-sm">Recent activity</h2>
          </div>
          {isLoading ? <Skeleton className="h-32" /> : data?.activity.length === 0 ? (
            <EmptyState label="No activity yet" />
          ) : (
            <ul className="space-y-2 text-sm">
              {data?.activity.map((a) => (
                <li key={a.id} className="flex items-center justify-between">
                  <span><span className="text-muted-foreground">{a.action}</span> {a.entity_type}</span>
                  <span className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {(data?.lowStock.length ?? 0) > 0 && (
        <Card className="p-4">
          <h2 className="font-semibold text-sm mb-3 flex items-center gap-2"><AlertTriangle className="size-4 text-warning" /> Low stock alerts</h2>
          <ul className="divide-y divide-border">
            {data!.lowStock.map((p) => (
              <li key={p.id} className="py-2 flex items-center justify-between text-sm">
                <span>{p.name}</span>
                <span className="text-warning tabular-nums">{p.quantity} left</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return <div className="text-sm text-muted-foreground py-8 text-center">{label}</div>;
}
