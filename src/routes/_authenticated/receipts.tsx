import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Printer, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { listAllReceipts } from "@/server/receipts";
import { money } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/receipts")({
  head: () => ({ meta: [{ title: "Receipts — SportsWear Inventory" }] }),
  component: ReceiptsPage,
});

function ReceiptsPage() {
  const [q, setQ] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["all-receipts"],
    queryFn: async () => listAllReceipts(),
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    const term = q.toLowerCase().trim();
    if (!term) return data;
    return data.filter((receipt) =>
      [String(receipt.invoice_number), receipt.customer_name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [data, q]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Receipts</h1>
        <p className="text-sm text-muted-foreground">{data?.length ?? 0} total</p>
      </div>

      <div className="relative max-w-md">
        <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search by invoice # or customer name..."
          value={q}
          onChange={(event) => setQ(event.target.value)}
        />
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr className="text-left">
                <th className="p-3 font-medium">Invoice #</th>
                <th className="p-3 font-medium">Customer</th>
                <th className="p-3 font-medium text-right">Items</th>
                <th className="p-3 font-medium text-right">Total</th>
                <th className="p-3 font-medium">Date</th>
                <th className="p-3 w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading &&
                Array.from({ length: 5 }).map((_, index) => (
                  <tr key={index}>
                    <td colSpan={6} className="p-3">
                      <Skeleton className="h-8" />
                    </td>
                  </tr>
                ))}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-10 text-center text-muted-foreground">
                    No receipts yet.
                  </td>
                </tr>
              )}
              {filtered.map((receipt) => (
                <tr key={receipt.id} className="hover:bg-muted/30">
                  <td className="p-3 font-medium">#{receipt.invoice_number}</td>
                  <td className="p-3 text-muted-foreground">{receipt.customer_name || "-"}</td>
                  <td className="p-3 text-right tabular-nums">{receipt.item_count}</td>
                  <td className="p-3 text-right tabular-nums">{money(receipt.total)}</td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {new Date(receipt.created_at).toLocaleString()}
                  </td>
                  <td className="p-3">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => window.open(`/print/receipt/${receipt.id}`, "_blank")}
                    >
                      <Printer className="size-4 mr-1.5" />
                      Print
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
