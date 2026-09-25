import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Printer, Search, Trash2, X } from "lucide-react";
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
  getReceipt,
  listAllReceipts,
  updateReceipt,
  type ReceiptItemInput,
  type ReceiptListItem,
  type ReceiptWithItems,
} from "@/server/receipts";
import { money } from "@/lib/format";
import { Route as RootRoute } from "@/routes/__root";

export const Route = createFileRoute("/_authenticated/receipts")({
  head: () => ({ meta: [{ title: "Receipts — SportsWear Inventory" }] }),
  component: ReceiptsPage,
});

type ReceiptForm = {
  customer_name: string;
  discount: string;
  cash_paid: string;
  cash_exchange: string;
};

type ReceiptItemForm = {
  row_id: string;
  product_id: string | null;
  description: string;
  quantity: string;
  unit_price: string;
};

const emptyItem = (): ReceiptItemForm => ({
  row_id: crypto.randomUUID(),
  product_id: null,
  description: "",
  quantity: "1",
  unit_price: "0",
});

const receiptFormFromReceipt = (receipt: ReceiptWithItems): ReceiptForm => ({
  customer_name: receipt.customer_name ?? "",
  discount: String(Number(receipt.discount || 0)),
  cash_paid: String(Number(receipt.cash_paid || 0)),
  cash_exchange: String(Number(receipt.cash_exchange || 0)),
});

const receiptItemsFromReceipt = (receipt: ReceiptWithItems): ReceiptItemForm[] =>
  receipt.items.map((item) => ({
    row_id: item.id,
    product_id: item.product_id,
    description: item.description,
    quantity: String(Number(item.quantity || 0)),
    unit_price: String(Number(item.unit_price || 0)),
  }));

const MAX_NUMBER_DIGITS = 9;

const moneyInputValue = (value: string) => {
  const cleaned = value.replace(/[^0-9.]/g, "");
  const [whole, ...decimalParts] = cleaned.split(".");
  const cappedWhole = whole.slice(0, MAX_NUMBER_DIGITS);
  const decimals = decimalParts.join("").slice(0, 2);
  return cleaned.includes(".") ? cappedWhole + "." + decimals : cappedWhole;
};

const integerInputValue = (value: string) =>
  value.replace(/[^0-9]/g, "").slice(0, MAX_NUMBER_DIGITS);

const numberFromInput = (value: string) => Number(value || 0);

const itemInputFromForm = (item: ReceiptItemForm): ReceiptItemInput => ({
  product_id: item.product_id,
  description: item.description.trim(),
  quantity: Math.max(0, Math.floor(numberFromInput(item.quantity))),
  unit_price: numberFromInput(item.unit_price),
});

function ReceiptsPage() {
  const [q, setQ] = useState("");
  const [editingReceipt, setEditingReceipt] = useState<ReceiptWithItems | null>(null);
  const [deletingReceipt, setDeletingReceipt] = useState<ReceiptListItem | null>(null);
  const [loadingReceiptId, setLoadingReceiptId] = useState<string | null>(null);
  const [form, setForm] = useState<ReceiptForm>({
    customer_name: "",
    discount: "0",
    cash_paid: "0",
    cash_exchange: "0",
  });
  const [items, setItems] = useState<ReceiptItemForm[]>([emptyItem()]);
  const { user } = RootRoute.useRouteContext();
  const showTodayOnly = user?.role !== "superadmin";
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

  const subtotal = useMemo(
    () =>
      items.reduce(
        (sum, item) => sum + numberFromInput(item.quantity) * numberFromInput(item.unit_price),
        0,
      ),
    [items],
  );
  const discount = numberFromInput(form.discount);
  const discountTooHigh = discount > subtotal;
  const total = Math.max(0, subtotal - discount);

  const loadReceipt = useMutation({
    mutationFn: async (id: string) => getReceipt({ data: { id } }),
    onMutate: (id) => setLoadingReceiptId(id),
    onSuccess: (receipt) => {
      if (!receipt) {
        toast.error("Receipt not found");
        return;
      }
      setEditingReceipt(receipt);
      setForm(receiptFormFromReceipt(receipt));
      setItems(receipt.items.length > 0 ? receiptItemsFromReceipt(receipt) : [emptyItem()]);
    },
    onError: (error: Error) => toast.error(error.message),
    onSettled: () => setLoadingReceiptId(null),
  });

  const editReceipt = useMutation({
    mutationFn: async () => {
      if (!editingReceipt) throw new Error("No receipt selected.");
      const receiptItems = items.map(itemInputFromForm);
      return updateReceipt({
        data: {
          id: editingReceipt.id,
          customer_name: form.customer_name,
          discount,
          cash_paid: numberFromInput(form.cash_paid),
          cash_exchange: numberFromInput(form.cash_exchange),
          items: receiptItems,
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
    loadReceipt.mutate(receipt.id);
  };

  const updateForm = (key: keyof ReceiptForm, value: string) => {
    setForm((current) => ({
      ...current,
      [key]: key === "customer_name" ? value : moneyInputValue(value),
    }));
  };

  const updateItem = (rowId: string, key: keyof ReceiptItemForm, value: string) => {
    setItems((current) =>
      current.map((item) => {
        if (item.row_id !== rowId) return item;
        const nextValue =
          key === "quantity"
            ? integerInputValue(value)
            : key === "unit_price"
              ? moneyInputValue(value)
              : value;
        return { ...item, [key]: nextValue };
      }),
    );
  };

  const submitEdit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validItems = items
      .map(itemInputFromForm)
      .filter((item) => item.description && item.quantity > 0);
    if (validItems.length === 0) {
      toast.error("Receipt needs at least one item");
      return;
    }
    if (discountTooHigh) {
      toast.error("Discount cannot be more than subtotal");
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
                <th className="p-3 w-36 text-right">Actions</th>
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
                    <div className="flex justify-end gap-1.5">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Print receipt"
                        title="Print receipt"
                        onClick={() => window.open("/print/receipt/" + receipt.id, "_blank")}
                      >
                        <Printer className="size-4" />
                        <span className="sr-only">Print receipt</span>
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Edit receipt"
                        title="Edit receipt"
                        disabled={loadingReceiptId === receipt.id}
                        onClick={() => openEditDialog(receipt)}
                      >
                        <Pencil className="size-4" />
                        <span className="sr-only">Edit receipt</span>
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Delete receipt"
                        title="Delete receipt"
                        className="hover:text-destructive"
                        onClick={() => setDeletingReceipt(receipt)}
                      >
                        <Trash2 className="size-4" />
                        <span className="sr-only">Delete receipt</span>
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
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit receipt #{editingReceipt?.invoice_number}</DialogTitle>
            <DialogDescription>
              Change customer details, add or remove items, then save the receipt.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-5" onSubmit={submitEdit}>
            <div className="space-y-1.5">
              <Label htmlFor="receipt-customer">Customer</Label>
              <Input
                id="receipt-customer"
                value={form.customer_name}
                onChange={(event) => updateForm("customer_name", event.target.value)}
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <Label>Items</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setItems((current) => [...current, emptyItem()])}
                >
                  <Plus className="mr-1.5 size-4" />
                  Add item
                </Button>
              </div>

              <div className="space-y-2">
                {items.map((item, index) => (
                  <div
                    key={item.row_id}
                    className="grid gap-2 rounded-md border p-3 sm:grid-cols-[minmax(0,1fr)_90px_120px_44px]"
                  >
                    <div className="space-y-1.5">
                      <Label
                        htmlFor={"receipt-item-description-" + item.row_id}
                        className="text-xs"
                      >
                        Item {index + 1}
                      </Label>
                      <Input
                        id={"receipt-item-description-" + item.row_id}
                        value={item.description}
                        onChange={(event) =>
                          updateItem(item.row_id, "description", event.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={"receipt-item-quantity-" + item.row_id} className="text-xs">
                        Qty
                      </Label>
                      <Input
                        id={"receipt-item-quantity-" + item.row_id}
                        inputMode="numeric"
                        maxLength={9}
                        value={item.quantity}
                        onChange={(event) =>
                          updateItem(item.row_id, "quantity", event.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={"receipt-item-price-" + item.row_id} className="text-xs">
                        Unit price
                      </Label>
                      <Input
                        id={"receipt-item-price-" + item.row_id}
                        inputMode="decimal"
                        maxLength={12}
                        value={item.unit_price}
                        onChange={(event) =>
                          updateItem(item.row_id, "unit_price", event.target.value)
                        }
                      />
                    </div>
                    <div className="flex items-end">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label="Remove item"
                        title="Remove item"
                        className="hover:text-destructive"
                        disabled={items.length === 1}
                        onClick={() =>
                          setItems((current) => current.filter((row) => row.row_id !== item.row_id))
                        }
                      >
                        <X className="size-4" />
                        <span className="sr-only">Remove item</span>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="receipt-discount">Discount</Label>
                <Input
                  id="receipt-discount"
                  inputMode="decimal"
                  maxLength={12}
                  value={form.discount}
                  aria-invalid={discountTooHigh}
                  className={
                    discountTooHigh
                      ? "border-destructive focus-visible:ring-destructive"
                      : undefined
                  }
                  onChange={(event) => updateForm("discount", event.target.value)}
                />
                {discountTooHigh && (
                  <p className="text-xs text-destructive">Discount cannot be more than subtotal.</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="receipt-cash-paid">Cash paid</Label>
                <Input
                  id="receipt-cash-paid"
                  inputMode="decimal"
                  maxLength={12}
                  value={form.cash_paid}
                  onChange={(event) => updateForm("cash_paid", event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="receipt-cash-exchange">Change</Label>
                <Input
                  id="receipt-cash-exchange"
                  inputMode="decimal"
                  maxLength={12}
                  value={form.cash_exchange}
                  onChange={(event) => updateForm("cash_exchange", event.target.value)}
                />
              </div>
            </div>

            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular-nums">{money(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Discount</span>
                <span className="tabular-nums">{money(discount)}</span>
              </div>
              <div className="mt-2 flex justify-between border-t pt-2 font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{money(total)}</span>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingReceipt(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={editReceipt.isPending || discountTooHigh}>
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
