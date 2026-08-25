import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Printer, Search, Trash2 } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  deleteReceipt,
  listAllReceipts,
  updateReceipt,
  type ReceiptListItem,
} from "@/server/receipts";
import { money } from "@/lib/format";
import { getCurrentUser } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/receipts")({
  head: () => ({ meta: [{ title: "Receipts — SportsWear Inventory" }] }),
  component: ReceiptsPage,
});

type ReceiptForm = {
  customer_name: string;
  discount: string;
  total: string;
  cash_paid: string;
  cash_exchange: string;
};

const receiptFormFromReceipt = (receipt: ReceiptListItem): ReceiptForm => ({
  customer_name: receipt.customer_name ?? "",
  discount: String(Number(receipt.discount || 0)),
  total: String(Number(receipt.total || 0)),
  cash_paid: String(Number(receipt.cash_paid || 0)),
  cash_exchange: String(Number(receipt.cash_exchange || 0)),
});

const moneyInputValue = (value: string) => {
  const cleaned = value.replace(/[^0-9.]/g, "");
  const [whole, ...decimalParts] = cleaned.split(".");
  const decimals = decimalParts.join("").slice(0, 2);
  return cleaned.includes(".") ? whole + "." + decimals : whole;
};

const numberFromInput = (value: string) => Number(value || 0);

function ReceiptsPage() {
  const [q, setQ] = useState("");
  const [editingReceipt, setEditingReceipt] = useState<ReceiptListItem | null>(null);
  const [deletingReceipt, setDeletingReceipt] = useState<ReceiptListItem | null>(null);
  const [form, setForm] = useState<ReceiptForm>({
    customer_name: "",
    discount: "0",
    total: "0",
    cash_paid: "0",
    cash_exchange: "0",
  });
  const currentUser = getCurrentUser();
  const showTodayOnly = currentUser !== "superadmin";
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["all-receipts"],
    queryFn: async () => listAllReceipts(),
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    const today = new Date();
    const todayDate = today.toDateString();
    const term = q.toLowerCase().trim();
    const visibleReceipts = showTodayOnly
      ? data.filter((receipt) => new Date(receipt.created_at).toDateString() === todayDate)
      : data;

    if (!term) return visibleReceipts;
    return visibleReceipts.filter((receipt) =>
      [String(receipt.invoice_number), receipt.customer_name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [data, q, showTodayOnly]);

  const editReceipt = useMutation({
    mutationFn: async () => {
      if (!editingReceipt) throw new Error("No receipt selected.");
      return updateReceipt({
        data: {
          id: editingReceipt.id,
          customer_name: form.customer_name,
          discount: numberFromInput(form.discount),
          total: numberFromInput(form.total),
          cash_paid: numberFromInput(form.cash_paid),
          cash_exchange: numberFromInput(form.cash_exchange),
        },
      });
    },
    onSuccess: async () => {
      toast.success("Receipt updated");
      setEditingReceipt(null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["all-receipts"], refetchType: "all" }),
        qc.invalidateQueries({ queryKey: ["recent-receipts"], refetchType: "all" }),
        qc.invalidateQueries({ queryKey: ["sales-report"], refetchType: "all" }),
        qc.invalidateQueries({ queryKey: ["dashboard-stats"], refetchType: "all" }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeReceipt = useMutation({
    mutationFn: async (id: string) => deleteReceipt({ data: { id } }),
    onSuccess: async () => {
      toast.success("Receipt deleted");
      setDeletingReceipt(null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["all-receipts"], refetchType: "all" }),
        qc.invalidateQueries({ queryKey: ["recent-receipts"], refetchType: "all" }),
        qc.invalidateQueries({ queryKey: ["sales-report"], refetchType: "all" }),
        qc.invalidateQueries({ queryKey: ["dashboard-stats"], refetchType: "all" }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const openEditDialog = (receipt: ReceiptListItem) => {
    setEditingReceipt(receipt);
    setForm(receiptFormFromReceipt(receipt));
  };

  const updateForm = (key: keyof ReceiptForm, value: string) => {
    setForm((current) => ({
      ...current,
      [key]: key === "customer_name" ? value : moneyInputValue(value),
    }));
  };

  const submitEdit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (numberFromInput(form.total) < 0) {
      toast.error("Total cannot be negative");
      return;
    }
    editReceipt.mutate();
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Receipts</h1>
        <p className="text-sm text-muted-foreground">
          {filtered.length} {showTodayOnly ? "today" : "total"}
        </p>
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
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr className="text-left">
                <th className="p-3 font-medium">Invoice #</th>
                <th className="p-3 font-medium">Customer</th>
                <th className="p-3 font-medium text-right">Items</th>
                <th className="p-3 font-medium text-right">Discount</th>
                <th className="p-3 font-medium text-right">Total</th>
                <th className="p-3 font-medium">Date</th>
                <th className="p-3 w-64 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading &&
                Array.from({ length: 5 }).map((_, index) => (
                  <tr key={index}>
                    <td colSpan={7} className="p-3">
                      <Skeleton className="h-8" />
                    </td>
                  </tr>
                ))}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-muted-foreground">
                    {showTodayOnly ? "No receipts for today yet." : "No receipts yet."}
                  </td>
                </tr>
              )}
              {filtered.map((receipt) => (
                <tr key={receipt.id} className="hover:bg-muted/30">
                  <td className="p-3 font-medium">#{receipt.invoice_number}</td>
                  <td className="p-3 text-muted-foreground">{receipt.customer_name || "-"}</td>
                  <td className="p-3 text-right tabular-nums">{receipt.item_count}</td>
                  <td className="p-3 text-right tabular-nums">{money(receipt.discount)}</td>
                  <td className="p-3 text-right tabular-nums">{money(receipt.total)}</td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {new Date(receipt.created_at).toLocaleString()}
                  </td>
                  <td className="p-3">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => window.open("/print/receipt/" + receipt.id, "_blank")}
                      >
                        <Printer className="size-4 mr-1.5" />
                        Print
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openEditDialog(receipt)}>
                        <Pencil className="size-4 mr-1.5" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="hover:border-destructive/40 hover:text-destructive"
                        onClick={() => setDeletingReceipt(receipt)}
                      >
                        <Trash2 className="size-4 mr-1.5" />
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog
        open={Boolean(editingReceipt)}
        onOpenChange={(open) => !open && setEditingReceipt(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit receipt #{editingReceipt?.invoice_number}</DialogTitle>
            <DialogDescription>
              Update receipt customer, discount, cash, and total values.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={submitEdit}>
            <div className="space-y-1.5">
              <Label htmlFor="receipt-customer">Customer</Label>
              <Input
                id="receipt-customer"
                value={form.customer_name}
                onChange={(event) => updateForm("customer_name", event.target.value)}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="receipt-discount">Discount</Label>
                <Input
                  id="receipt-discount"
                  inputMode="decimal"
                  value={form.discount}
                  onChange={(event) => updateForm("discount", event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="receipt-total">Total</Label>
                <Input
                  id="receipt-total"
                  inputMode="decimal"
                  value={form.total}
                  onChange={(event) => updateForm("total", event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="receipt-cash-paid">Cash paid</Label>
                <Input
                  id="receipt-cash-paid"
                  inputMode="decimal"
                  value={form.cash_paid}
                  onChange={(event) => updateForm("cash_paid", event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="receipt-cash-exchange">Change</Label>
                <Input
                  id="receipt-cash-exchange"
                  inputMode="decimal"
                  value={form.cash_exchange}
                  onChange={(event) => updateForm("cash_exchange", event.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingReceipt(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={editReceipt.isPending}>
                {editReceipt.isPending ? "Saving..." : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deletingReceipt)}
        onOpenChange={(open) => !open && setDeletingReceipt(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete receipt #{deletingReceipt?.invoice_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the receipt and its printed item lines. Product stock will not be
              changed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={removeReceipt.isPending}
              onClick={() => {
                if (deletingReceipt) removeReceipt.mutate(deletingReceipt.id);
              }}
            >
              {removeReceipt.isPending ? "Deleting..." : "Delete receipt"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
