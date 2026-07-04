import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { getReceipt } from "@/server/receipts";
import { ReceiptPrintView } from "@/components/inventory/receipt-print-view";

export const Route = createFileRoute("/print/receipt/$id")({
  ssr: false,
  head: () => ({ meta: [{ title: "Print receipt" }] }),
  component: PrintReceiptPage,
});

// A standalone page with nothing but the receipt on it - no sidebar, no other
// content to hide. Printing this directly sidesteps the fragile
// visibility:hidden trick, which some browsers (notably Safari) don't
// reliably honor for print output with flex/grid-heavy pages.
function PrintReceiptPage() {
  const { id } = Route.useParams();
  const printedRef = useRef(false);
  const { data: receipt, isError } = useQuery({
    queryKey: ["print-receipt", id],
    queryFn: async () => getReceipt({ data: { id } }),
  });

  useEffect(() => {
    if (!receipt || printedRef.current) return;
    printedRef.current = true;
    const timer = window.setTimeout(() => window.print(), 150);
    return () => window.clearTimeout(timer);
  }, [receipt]);

  if (isError || receipt === null) {
    return <div className="p-6 text-center text-sm text-muted-foreground">Receipt not found.</div>;
  }
  if (!receipt) {
    return <div className="p-6 text-center text-sm text-muted-foreground">Loading receipt…</div>;
  }

  return <ReceiptPrintView receipt={receipt} />;
}
