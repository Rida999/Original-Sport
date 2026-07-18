import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { CalendarDays, Download, Printer, Receipt, ShoppingBag, TrendingUp } from "lucide-react";
import { useState } from "react";

import { getSalesReport, type SalesReportPeriod } from "@/server/reports";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { money } from "@/lib/format";
import { isSuperAdmin } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/reports")({
  beforeLoad: () => {
    if (!isSuperAdmin()) {
      throw redirect({ to: "/dashboard" });
    }
  },
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

const localDateInputValue = (date = new Date()) => {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 10);
};

const dateFromInputValue = (value: string) => new Date(`${value}T00:00:00`);
const formatDayLabel = (value: string) => {
  const date = dateFromInputValue(value);
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
};
const startOfWeek = (date: Date) => {
  const weekStart = new Date(date);
  const day = weekStart.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  weekStart.setDate(weekStart.getDate() + diff);
  weekStart.setHours(0, 0, 0, 0);
  return weekStart;
};
const weekInputValue = (date = new Date()) => localDateInputValue(startOfWeek(date));
const formatWeekLabel = (value: string) => {
  const start = startOfWeek(dateFromInputValue(value));
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return `${formatDayLabel(localDateInputValue(start))} - ${formatDayLabel(
    localDateInputValue(end),
  )}`;
};
const monthInputValue = (date = new Date()) => localDateInputValue(date).slice(0, 7);
const currentYear = new Date().getFullYear();
type ReportPickerMode = "day" | "week" | "month" | "year";
const formatReportDateTime = (value: string) =>
  new Intl.DateTimeFormat("en-GB", {
    dateStyle: "short",
    timeStyle: "short",
    hour12: false,
    timeZone: "Asia/Beirut",
  }).format(new Date(value));

function Reports() {
  const [period, setPeriod] = useState<SalesReportPeriod>("today");
  const [selectedDate, setSelectedDate] = useState(localDateInputValue);
  const [selectedWeekDate, setSelectedWeekDate] = useState(localDateInputValue);
  const [selectedMonth, setSelectedMonth] = useState(monthInputValue);
  const [selectedYear, setSelectedYear] = useState(String(currentYear));
  const [pickerMode, setPickerMode] = useState<ReportPickerMode>("day");
  const [dateDialogOpen, setDateDialogOpen] = useState(false);
  const currentDateValue = localDateInputValue();
  const currentWeekValue = weekInputValue();
  const currentMonthValue = monthInputValue();
  const isCurrentDayReport = period === "date" && selectedDate === currentDateValue;
  const isCurrentWeekReport =
    period === "custom_week" &&
    weekInputValue(dateFromInputValue(selectedWeekDate)) === currentWeekValue;
  const isCurrentMonthReport = period === "custom_month" && selectedMonth === currentMonthValue;
  const isCurrentYearReport = period === "custom_year" && selectedYear === String(currentYear);
  const isPreviousReportActive =
    (period === "date" && !isCurrentDayReport) ||
    (period === "custom_week" && !isCurrentWeekReport) ||
    (period === "custom_month" && !isCurrentMonthReport) ||
    (period === "custom_year" && !isCurrentYearReport);
  const reportDate =
    period === "custom_week"
      ? selectedWeekDate
      : period === "custom_month"
        ? `${selectedMonth}-01`
        : period === "custom_year"
          ? `${selectedYear}-01-01`
          : selectedDate;
  const { data: report, isLoading } = useQuery({
    queryKey: ["sales-report", period, reportDate],
    queryFn: async () => getSalesReport({ data: { period, date: reportDate } }),
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
      product.article_number,
      product.quantity_sold,
      product.selling_price,
      product.total_sales,
      formatReportDateTime(product.last_sold_at),
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `sales-${
      period === "date" || period === "custom_month" || period === "custom_year"
        ? reportDate
        : period
    }-${localDateInputValue()}.csv`;
    anchor.click();
  };

  const summary = report?.summary;
  const activePeriodLabel =
    period === "date"
      ? `Day: ${formatDayLabel(selectedDate)}`
      : period === "custom_week"
        ? isCurrentWeekReport
          ? "this week"
          : `Week: ${formatWeekLabel(selectedWeekDate)}`
        : period === "custom_month"
          ? `Month: ${dateFromInputValue(`${selectedMonth}-01`).toLocaleDateString(undefined, {
              month: "long",
              year: "numeric",
            })}`
          : period === "custom_year"
            ? selectedYear === String(currentYear)
              ? "this year"
              : `Year: ${selectedYear}`
            : period === "year"
              ? "this year"
              : periodOptions.find((option) => option.value === period)?.label;
  const selectedDateLabel = dateFromInputValue(selectedDate).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const selectedWeekLabel = formatWeekLabel(selectedWeekDate);
  const selectedMonthLabel = dateFromInputValue(`${selectedMonth}-01`).toLocaleDateString(
    undefined,
    {
      month: "long",
      year: "numeric",
    },
  );
  const selectedReportLabel =
    pickerMode === "day"
      ? selectedDateLabel
      : pickerMode === "week"
        ? selectedWeekLabel
        : pickerMode === "month"
          ? selectedMonthLabel
          : selectedYear;

  const viewSelectedReport = () => {
    if (pickerMode === "day") {
      setPeriod(selectedDate === currentDateValue ? "today" : "date");
    } else if (pickerMode === "week") {
      setPeriod(
        weekInputValue(dateFromInputValue(selectedWeekDate)) === currentWeekValue
          ? "week"
          : "custom_week",
      );
    } else if (pickerMode === "month") {
      setPeriod(selectedMonth === currentMonthValue ? "month" : "custom_month");
    } else {
      setPeriod(selectedYear === String(currentYear) ? "year" : "custom_year");
    }
    setDateDialogOpen(false);
  };

  const setPreviousPreset = () => {
    const date = new Date();
    if (pickerMode === "day") {
      date.setDate(date.getDate() - 1);
      setSelectedDate(localDateInputValue(date));
      return;
    }
    if (pickerMode === "week") {
      date.setDate(date.getDate() - 7);
      setSelectedWeekDate(localDateInputValue(date));
      return;
    }
    if (pickerMode === "month") {
      date.setMonth(date.getMonth() - 1);
      setSelectedMonth(monthInputValue(date));
      return;
    }
    setSelectedYear(String(currentYear - 1));
  };

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
              variant={
                period === option.value ||
                (option.value === "today" && isCurrentDayReport) ||
                (option.value === "week" && isCurrentWeekReport) ||
                (option.value === "month" && isCurrentMonthReport) ||
                (option.value === "year" && isCurrentYearReport)
                  ? "default"
                  : "outline"
              }
              onClick={() => setPeriod(option.value)}
            >
              {option.label}
            </Button>
          ))}
          <Button
            type="button"
            size="sm"
            variant={isPreviousReportActive ? "default" : "outline"}
            onClick={() => setDateDialogOpen(true)}
          >
            <CalendarDays className="size-4 mr-1.5" />
            Previous report
          </Button>
          <Button onClick={exportCsv} size="sm" variant="outline" disabled={!report}>
            <Download className="size-4 mr-1.5" /> Export
          </Button>
        </div>
      </div>

      <Dialog open={dateDialogOpen} onOpenChange={setDateDialogOpen}>
        <DialogContent className="max-w-[94vw] gap-0 overflow-hidden p-0 sm:max-w-xl">
          <div className="border-b bg-muted/30 px-5 py-4">
            <DialogHeader className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <CalendarDays className="size-5" />
                </div>
                <div>
                  <DialogTitle>Select previous report date</DialogTitle>
                  <DialogDescription>
                    Pick a day, week, month, or year to review its sales, receipts, and sold
                    products.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
          </div>
          <div className="p-4 sm:p-5">
            <div className="mb-3 grid grid-cols-4 gap-2 rounded-lg bg-muted p-1">
              {(["day", "week", "month", "year"] as const).map((mode) => (
                <Button
                  key={mode}
                  type="button"
                  size="sm"
                  variant={pickerMode === mode ? "default" : "ghost"}
                  onClick={() => setPickerMode(mode)}
                >
                  {mode === "day"
                    ? "Day"
                    : mode === "week"
                      ? "Week"
                      : mode === "month"
                        ? "Month"
                        : "Year"}
                </Button>
              ))}
            </div>
            <div className="flex min-h-[340px] items-center justify-center rounded-lg border bg-background p-2 shadow-sm sm:p-3">
              {pickerMode === "day" ? (
                <Calendar
                  mode="single"
                  selected={dateFromInputValue(selectedDate)}
                  disabled={{ after: new Date() }}
                  captionLayout="dropdown"
                  className="rounded-md [--cell-size:2.25rem] sm:[--cell-size:2.65rem]"
                  onSelect={(date) => {
                    if (!date) return;
                    setSelectedDate(localDateInputValue(date));
                  }}
                />
              ) : pickerMode === "week" ? (
                <div className="w-full max-w-xs space-y-3">
                  <div>
                    <div className="text-sm font-medium">Select week</div>
                    <p className="text-xs text-muted-foreground">
                      Choose any date inside the week you want.
                    </p>
                  </div>
                  <Input
                    type="date"
                    value={selectedWeekDate}
                    max={localDateInputValue()}
                    onChange={(event) => setSelectedWeekDate(event.target.value)}
                  />
                  <div className="rounded-md bg-muted/50 px-3 py-2 text-sm font-medium">
                    {selectedWeekLabel}
                  </div>
                </div>
              ) : pickerMode === "month" ? (
                <div className="w-full max-w-xs space-y-3">
                  <div>
                    <div className="text-sm font-medium">Select month</div>
                    <p className="text-xs text-muted-foreground">
                      Choose any previous month or the current month.
                    </p>
                  </div>
                  <Input
                    type="month"
                    value={selectedMonth}
                    max={monthInputValue()}
                    onChange={(event) => setSelectedMonth(event.target.value)}
                  />
                </div>
              ) : (
                <div className="w-full max-w-xs space-y-3">
                  <div>
                    <div className="text-sm font-medium">Select year</div>
                    <p className="text-xs text-muted-foreground">
                      Choose a previous year or the current year.
                    </p>
                  </div>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min="2000"
                    max={currentYear}
                    value={selectedYear}
                    onChange={(event) =>
                      setSelectedYear(event.target.value.slice(0, 4) || String(currentYear))
                    }
                  />
                </div>
              )}
            </div>
            <div className="mt-3 flex flex-col gap-3 rounded-lg border bg-muted/25 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="text-xs font-medium uppercase text-muted-foreground">
                  Selected report
                </div>
                <div className="truncate text-base font-semibold sm:text-lg">
                  {selectedReportLabel}
                </div>
              </div>
              <div className="flex gap-2 sm:shrink-0">
                <Button type="button" size="sm" onClick={viewSelectedReport}>
                  View report
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={setPreviousPreset}>
                  Previous {pickerMode}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
            <p className="text-xs text-muted-foreground">
              Receipt totals for {activePeriodLabel ?? "the selected period"}
            </p>
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
                        {product.article_number}
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
                      {receipt.item_count} item(s) · {formatReportDateTime(receipt.created_at)}
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
