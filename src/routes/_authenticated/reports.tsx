import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getSoldProductsReport, listReportProducts } from "@/server/reports";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, ShoppingBag } from "lucide-react";
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
  const { data: soldReport } = useQuery({
    queryKey: ["sold-products-report"],
    queryFn: async () => getSoldProductsReport(),
  });

  const exportCsv = () => {
    if (!data) return;
    const headers = [
      "Article number",
      "Name",
      "Quantity",
      "Purchase price",
      "Selling price",
    ];
    const rows = data.map((p) => [
      p.article_number ?? p.barcode,
      p.name,
      p.quantity,
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

      <div className="grid sm:grid-cols-3 gap-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Inventory value (retail)</div>
          <div className="text-2xl font-semibold mt-2">{money(total)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Inventory cost</div>
          <div className="text-2xl font-semibold mt-2">{money(cost)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Out of stock</div>
          <div className="text-2xl font-semibold mt-2 text-destructive">{outOfStock}</div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <ShoppingBag className="size-4 text-primary" />
              Sold products
            </h2>
          </div>
          <div className="flex items-center gap-6 text-right">
            <div>
              <div className="text-xs text-muted-foreground">Total quantity</div>
              <div className="text-2xl font-semibold tabular-nums">
                {soldReport?.totalSold ?? 0}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Total price</div>
              <div className="text-2xl font-semibold tabular-nums">
                {money(soldReport?.totalSales)}
              </div>
            </div>
          </div>
        </div>

        {(soldReport?.products.length ?? 0) === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center">
            No sold products yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">Product</th>
                  <th className="py-2 px-3 font-medium">Article number</th>
                  <th className="py-2 px-3 font-medium text-right">Sold</th>
                  <th className="py-2 px-3 font-medium text-right">Unit price</th>
                  <th className="py-2 px-3 font-medium text-right">Total</th>
                  <th className="py-2 pl-3 font-medium">Last sold</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {soldReport?.products.map((product) => (
                  <tr key={product.id}>
                    <td className="py-2 pr-3 font-medium">{product.name}</td>
                    <td className="py-2 px-3 font-mono text-xs text-muted-foreground">
                      {product.article_number ?? product.barcode}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums">{product.quantity_sold}</td>
                    <td className="py-2 px-3 text-right tabular-nums">
                      {money(product.selling_price)}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums font-medium">
                      {money(product.total_sales)}
                    </td>
                    <td className="py-2 pl-3 text-muted-foreground">
                      {new Date(product.last_sold_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
