import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listReportProducts } from "@/lib/data";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { money } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "Reports — SportsWear Inventory" }] }),
  component: Reports,
});

function Reports() {
  const { data } = useQuery({
    queryKey: ["reports"],
    queryFn: async () => listReportProducts(),
  });

  const exportCsv = () => {
    if (!data) return;
    const headers = ["Barcode", "Name", "Quantity", "Min stock", "Purchase price", "Selling price"];
    const rows = data.map((p) => [
      p.barcode,
      p.name,
      p.quantity,
      p.min_stock,
      p.purchase_price,
      p.selling_price,
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `products-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const total = data?.reduce((sum, p) => sum + Number(p.selling_price) * p.quantity, 0) ?? 0;
  const cost = data?.reduce((sum, p) => sum + Number(p.purchase_price) * p.quantity, 0) ?? 0;
  const lowStock = data?.filter((p) => p.quantity > 0 && p.quantity <= p.min_stock).length ?? 0;
  const outOfStock = data?.filter((p) => p.quantity === 0).length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground">Inventory snapshot</p>
        </div>
        <Button onClick={exportCsv} size="sm" variant="outline">
          <Download className="size-4 mr-1.5" /> Export CSV
        </Button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Inventory value (retail)</div>
          <div className="text-2xl font-semibold mt-2">{money(total)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Inventory cost</div>
          <div className="text-2xl font-semibold mt-2">{money(cost)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Low stock items</div>
          <div className="text-2xl font-semibold mt-2 text-warning">{lowStock}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Out of stock</div>
          <div className="text-2xl font-semibold mt-2 text-destructive">{outOfStock}</div>
        </Card>
      </div>

      <Card className="p-4">
        <p className="text-sm text-muted-foreground">
          Additional report types (PDF export, sales reports) ship in the next phase.
        </p>
      </Card>
    </div>
  );
}
