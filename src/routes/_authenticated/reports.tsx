import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Download, Printer, Receipt, ShoppingBag, TrendingUp } from "lucide-react";
import { useState } from "react";

import {
  getSalesReport,
  type SalesReportPeriod,
} from "@/server/reports";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { money } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "Reports — SportsWear Inventory" }] }),
  component: Reports,
});

const periodOptions: { value: SalesReportPeriod; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
];

const chartConfig = {
  income: {
    label: "Income",
    color: "var(--primary)",
  },
} satisfies ChartConfig;

function Reports() {
  const [period, setPeriod] = useState<SalesReportPeriod>("today");
  const { data: report, isLoading } = useQuery({
    queryKey: ["sales-report", period],
    queryFn: async () => getSalesReport({ data: { period } }),
  });

  const exportCsv = () => {
    if (!report) return;
    const headers = [
      "Product",
      "Article number",
      "Quantity sold",
      "Unit price",
      "Total sales",
      "Last sold",
    ];
    const rows = report.products.map((product) => [
      product.name,
      product.article_number ?? product.barcode,
      product.quantity_sold,
      product.selling_price,
      product.total_sales,
      new Date(product.last_sold_at).toLocaleString(),
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `sales-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
  };

  const summary = report?.summary;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground">Sales income and receipts overview</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {periodOptions.map((option) => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={period === option.value ? "default" : "outline"}
              onClick={() => setPeriod(option.value)}
            >
              {option.label}
            </Button>
          ))}
          <Button onClick={exportCsv} size="sm" variant="outline" disabled={!report}>
            <Download className="size-4 mr-1.5" /> Export
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Total income"
          value={money(summary?.totalIncome)}
          icon={TrendingUp}
          loading={isLoading}
        />
        <SummaryCard
          label="Receipts"
          value={summary?.receiptCount ?? 0}
          icon={Receipt}
          loading={isLoading}
        />
        <SummaryCard
          label="Items sold"
          value={summary?.totalItems ?? 0}
          icon={ShoppingBag}
          loading={isLoading}
        />
        <SummaryCard
          label="Average receipt"
          value={money(summary?.averageReceipt)}
          icon={Receipt}
          loading={isLoading}
        />
      </div>

      <Card className="p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Income graph</h2>
            <p className="text-xs text-muted-foreground">Receipt totals for the selected period</p>
          </div>
          <div className="text-sm font-semibold tabular-nums">{money(summary?.totalIncome)}</div>
        </div>
        {(report?.chart.length ?? 0) === 0 ? (
          <EmptyState label="No sales for this period." />
        ) : (
          <ChartContainer config={chartConfig} className="h-[280px] w-full">
            <BarChart data={report?.chart ?? []} margin={{ left: 8, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={18}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                width={52}
                tickFormatter={(value) => `$${value}`}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    formatter={(value) => money(Number(value))}
                    indicator="line"
                  />
                }
              />
              <Bar dataKey="income" fill="var(--color-income)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ChartContainer>
        )}
      </Card>

      <div className="grid items-stretch gap-4 xl:grid-cols-2">
        <Card className="flex min-h-[360px] flex-col overflow-hidden">
          <div className="border-b p-4">
            <h2 className="text-sm font-semibold">Top sold products</h2>
            <p className="text-xs text-muted-foreground">Ranked by quantity sold</p>
          </div>
          {(report?.products.length ?? 0) === 0 ? (
            <EmptyState label="No products sold in this period." />
          ) : (
            <div className="flex-1 overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-muted/40 text-left text-muted-foreground">
                  <tr>
                    <th className="p-3 font-medium">Product</th>
                    <th className="p-3 font-medium">Article number</th>
                    <th className="p-3 text-right font-medium">Sold</th>
                    <th className="p-3 text-right font-medium">Unit price</th>
                    <th className="p-3 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {report?.products.map((product) => (
                    <tr key={product.id} className="hover:bg-muted/30">
                      <td className="p-3 font-medium">{product.name}</td>
                      <td className="p-3 font-mono text-xs text-muted-foreground">
                        {product.article_number ?? product.barcode}
                      </td>
                      <td className="p-3 text-right tabular-nums">{product.quantity_sold}</td>
                      <td className="p-3 text-right tabular-nums">
                        {money(product.selling_price)}
                      </td>
                      <td className="p-3 text-right font-medium tabular-nums">
                        {money(product.total_sales)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="flex min-h-[360px] flex-col overflow-hidden">
          <div className="border-b p-4">
            <h2 className="text-sm font-semibold">Receipts</h2>
            <p className="text-xs text-muted-foreground">Latest receipts in this period</p>
          </div>
          {(report?.receipts.length ?? 0) === 0 ? (
            <EmptyState label="No receipts in this period." />
          ) : (
            <div className="flex-1 divide-y divide-border">
              {report?.receipts.map((receipt) => (
                <div
                  key={receipt.id}
                  className="flex items-center justify-between gap-3 p-3 text-sm"
                >
                  <div className="min-w-0">
                    <div className="font-medium">#{receipt.invoice_number}</div>
                    <div className="text-xs text-muted-foreground">
                      {receipt.item_count} item(s) · {new Date(receipt.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right font-semibold tabular-nums">
                      {money(receipt.total)}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => window.open(`/print/receipt/${receipt.id}`, "_blank")}
                    >
                      <Printer className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  loading,
}: {
  label: string;
  value: string | number;
  icon: typeof TrendingUp;
  loading: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">{label}</div>
        <Icon className="size-4 text-primary" />
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{loading ? "..." : value}</div>
    </Card>
  );
}

function EmptyState({ label }: { label: string }) {
  return <div className="p-8 text-center text-sm text-muted-foreground">{label}</div>;
}
