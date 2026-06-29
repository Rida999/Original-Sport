import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => ({ meta: [{ title: "Inventory — SportsWear Inventory" }] }),
  component: Inventory,
});

function Inventory() {
  const [q, setQ] = useState("");
  const { data } = useQuery({
    queryKey: ["inventory"],
    queryFn: async () => (await supabase.from("products").select("id,barcode,name,quantity,min_stock,updated_at").order("updated_at", { ascending: false })).data ?? [],
  });
  const filtered = useMemo(() => (data ?? []).filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()) || p.barcode.includes(q)), [data, q]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
        <p className="text-sm text-muted-foreground">Stock levels across all products</p>
      </div>
      <div className="relative max-w-md">
        <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr className="text-left">
              <th className="p-3 font-medium">Barcode</th>
              <th className="p-3 font-medium">Product</th>
              <th className="p-3 font-medium text-right">Current</th>
              <th className="p-3 font-medium text-right">Minimum</th>
              <th className="p-3 font-medium">Status</th>
              <th className="p-3 font-medium">Last updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((p) => {
              const status = p.quantity === 0 ? { label: "Out of stock", cls: "bg-destructive/15 text-destructive border-destructive/30" }
                : p.quantity <= p.min_stock ? { label: "Low stock", cls: "bg-warning/15 text-warning border-warning/30" }
                : { label: "Available", cls: "bg-success/15 text-success border-success/30" };
              return (
                <tr key={p.id} className="hover:bg-muted/30">
                  <td className="p-3 font-mono text-xs text-muted-foreground">{p.barcode}</td>
                  <td className="p-3 font-medium">{p.name}</td>
                  <td className="p-3 text-right tabular-nums">{p.quantity}</td>
                  <td className="p-3 text-right tabular-nums text-muted-foreground">{p.min_stock}</td>
                  <td className="p-3"><Badge variant="outline" className={status.cls}>{status.label}</Badge></td>
                  <td className="p-3 text-muted-foreground text-xs">{new Date(p.updated_at).toLocaleString()}</td>
                </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={6} className="p-10 text-center text-muted-foreground">No items.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
