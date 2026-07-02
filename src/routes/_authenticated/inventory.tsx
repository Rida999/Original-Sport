import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adjustProductStockByBarcode, listInventory } from "@/lib/data";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { RotateCcw, ScanLine, Search, ShoppingCart } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => ({ meta: [{ title: "Inventory — SportsWear Inventory" }] }),
  component: Inventory,
});

function Inventory() {
  const [q, setQ] = useState("");
  const [scanCode, setScanCode] = useState("");
  const [scanMode, setScanMode] = useState<"remove" | "return">("remove");
  const scanInputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["inventory"],
    queryFn: async () => listInventory(),
  });
  const filtered = useMemo(
    () =>
      (data ?? []).filter(
        (p) => !q || p.name.toLowerCase().includes(q.toLowerCase()) || p.barcode.includes(q),
      ),
    [data, q],
  );

  const adjustStock = useMutation({
    mutationFn: async ({ barcode, mode }: { barcode: string; mode: "remove" | "return" }) =>
      adjustProductStockByBarcode({ data: { barcode, mode } }),
    onSuccess: (result) => {
      if (result.status === "updated") {
        const action = result.mode === "return" ? "Returned" : "Removed";
        toast.success(
          `${action} ${result.product.name}: ${result.product.previous_quantity} -> ${result.product.quantity}`,
        );
      } else if (result.status === "out_of_stock") {
        toast.warning(`${result.product.name} is out of stock`);
      } else {
        toast.error(`No product found for ${result.barcode}`);
      }

      setScanCode("");
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["reports"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      requestAnimationFrame(() => scanInputRef.current?.focus());
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleScan = () => {
    const barcode = scanCode.trim();
    if (!barcode || adjustStock.isPending) return;
    adjustStock.mutate({ barcode, mode: scanMode });
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
        <p className="text-sm text-muted-foreground">Stock levels across all products</p>
      </div>
      <Card className="p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="space-y-1.5">
            <div className="text-sm font-medium">Action</div>
            <ToggleGroup
              type="single"
              value={scanMode}
              onValueChange={(value) => {
                if (value === "remove" || value === "return") setScanMode(value);
              }}
              className="justify-start"
            >
              <ToggleGroupItem value="remove" aria-label="Remove one item">
                <ShoppingCart className="size-4 mr-1.5" />
                Remove
              </ToggleGroupItem>
              <ToggleGroupItem value="return" aria-label="Add one item">
                <RotateCcw className="size-4 mr-1.5" />
                Add
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <label htmlFor="stock-scan" className="text-sm font-medium">
              Barcode
            </label>
            <div className="relative">
              <ScanLine className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="stock-scan"
                ref={scanInputRef}
                className="pl-9 font-mono"
                placeholder="Scan barcode"
                value={scanCode}
                autoComplete="off"
                onChange={(e) => setScanCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleScan();
                  }
                }}
              />
            </div>
          </div>
          <Button
            className="md:w-32"
            disabled={!scanCode.trim() || adjustStock.isPending}
            onClick={handleScan}
          >
            {adjustStock.isPending ? "Saving..." : scanMode === "return" ? "Add" : "Remove"}
          </Button>
        </div>
      </Card>
      <div className="relative max-w-md">
        <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
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
              const status =
                p.quantity === 0
                  ? {
                      label: "Out of stock",
                      cls: "bg-destructive/15 text-destructive border-destructive/30",
                    }
                  : p.quantity <= p.min_stock
                    ? { label: "Low stock", cls: "bg-warning/15 text-warning border-warning/30" }
                    : { label: "Available", cls: "bg-success/15 text-success border-success/30" };
              return (
                <tr key={p.id} className="hover:bg-muted/30">
                  <td className="p-3 font-mono text-xs text-muted-foreground">{p.barcode}</td>
                  <td className="p-3 font-medium">{p.name}</td>
                  <td className="p-3 text-right tabular-nums">{p.quantity}</td>
                  <td className="p-3 text-right tabular-nums text-muted-foreground">
                    {p.min_stock}
                  </td>
                  <td className="p-3">
                    <Badge variant="outline" className={status.cls}>
                      {status.label}
                    </Badge>
                  </td>
                  <td className="p-3 text-muted-foreground text-xs">
                    {new Date(p.updated_at).toLocaleString()}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="p-10 text-center text-muted-foreground">
                  No items.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
