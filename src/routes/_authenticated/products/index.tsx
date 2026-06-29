import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Search, Trash2, Pencil } from "lucide-react";
import { useState, useMemo } from "react";
import { money } from "@/lib/format";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/products/")({
  head: () => ({ meta: [{ title: "Products — SportsWear Inventory" }] }),
  component: ProductsList,
});

function ProductsList() {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,barcode,name,selling_price,purchase_price,quantity,min_stock,status,images,brand:brands(name),category:categories(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    const term = q.toLowerCase().trim();
    if (!term) return data;
    return data.filter((p) =>
      [p.name, p.barcode, p.brand?.name, p.category?.name].filter(Boolean).some((v) => String(v).toLowerCase().includes(term))
    );
  }, [data, q]);

  const bulkDelete = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selected);
      const { error } = await supabase.from("products").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`${selected.size} product(s) deleted`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((p) => p.id)));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
          <p className="text-sm text-muted-foreground">{data?.length ?? 0} total</p>
        </div>
        <div className="flex gap-2">
          {selected.size > 0 && (
            <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-4 mr-1.5" /> Delete ({selected.size})
            </Button>
          )}
          <Button asChild size="sm"><Link to="/products/new"><Plus className="size-4 mr-1.5" /> Add product</Link></Button>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search by name, barcode, brand…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr className="text-left">
                <th className="p-3 w-8">
                  <Checkbox checked={selected.size > 0 && selected.size === filtered.length} onCheckedChange={toggleAll} />
                </th>
                <th className="p-3 font-medium">Product</th>
                <th className="p-3 font-medium">Barcode</th>
                <th className="p-3 font-medium">Brand</th>
                <th className="p-3 font-medium">Category</th>
                <th className="p-3 font-medium text-right">Price</th>
                <th className="p-3 font-medium text-right">Stock</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading && Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}><td colSpan={9} className="p-3"><Skeleton className="h-8" /></td></tr>
              ))}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={9} className="p-10 text-center text-muted-foreground">No products. <Link to="/products/new" className="text-primary hover:underline">Add your first</Link>.</td></tr>
              )}
              {filtered.map((p) => {
                const status = p.quantity === 0 ? "Out of stock" : p.quantity <= p.min_stock ? "Low stock" : "Available";
                const variant = p.quantity === 0 ? "destructive" : p.quantity <= p.min_stock ? "warning" : "default";
                return (
                  <tr key={p.id} className="hover:bg-muted/30">
                    <td className="p-3"><Checkbox checked={selected.has(p.id)} onCheckedChange={() => toggle(p.id)} /></td>
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        <div className="size-9 rounded-md bg-muted overflow-hidden shrink-0">
                          {p.images?.[0] && <img src={p.images[0]} alt="" className="size-full object-cover" />}
                        </div>
                        <span className="font-medium">{p.name}</span>
                      </div>
                    </td>
                    <td className="p-3 font-mono text-xs text-muted-foreground">{p.barcode}</td>
                    <td className="p-3">{p.brand?.name ?? "—"}</td>
                    <td className="p-3">{p.category?.name ?? "—"}</td>
                    <td className="p-3 text-right tabular-nums">{money(p.selling_price)}</td>
                    <td className="p-3 text-right tabular-nums">{p.quantity}</td>
                    <td className="p-3">
                      <StatusBadge variant={variant}>{status}</StatusBadge>
                    </td>
                    <td className="p-3">
                      <Button size="icon" variant="ghost" onClick={() => navigate({ to: "/products/$id", params: { id: p.id } })}>
                        <Pencil className="size-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selected.size} product(s)?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => bulkDelete.mutate()}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatusBadge({ variant, children }: { variant: string; children: React.ReactNode }) {
  const cls =
    variant === "destructive" ? "bg-destructive/15 text-destructive border-destructive/30"
    : variant === "warning" ? "bg-warning/15 text-warning border-warning/30"
    : "bg-success/15 text-success border-success/30";
  return <Badge variant="outline" className={cls}>{children}</Badge>;
}
