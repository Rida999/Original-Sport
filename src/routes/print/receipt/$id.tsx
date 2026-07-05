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
  const contentRef = useRef<HTMLDivElement>(null);
  const { data: receipt, isError } = useQuery({
    queryKey: ["print-receipt", id],
    queryFn: async () => getReceipt({ data: { id } }),
  });

  useEffect(() => {
    if (!receipt || printedRef.current || !contentRef.current) return;
    printedRef.current = true;

    // Size the printed page to the receipt's actual rendered height (plus a
    // small buffer) instead of a fixed length - otherwise every receipt prints
    // on a full fixed-length page with a big blank gap before the page ends.
    const heightPx = contentRef.current.offsetHeight;
    const heightMm = Math.ceil((heightPx * 25.4) / 96) + 5;
    const pageSizeStyle = document.createElement("style");
    pageSizeStyle.textContent = `@media print { @page { size: 80mm ${heightMm}mm; margin: 0; } }`;
    document.head.appendChild(pageSizeStyle);

    const timer = window.setTimeout(() => window.print(), 150);
    return () => window.clearTimeout(timer);
  }, [receipt]);

  if (isError || receipt === null) {
    return <div className="p-6 text-center text-sm text-muted-foreground">Receipt not found.</div>;
  }
  if (!receipt) {
    return <div className="p-6 text-center text-sm text-muted-foreground">Loading receipt…</div>;
  }

  return (
    <div ref={contentRef}>
      <ReceiptPrintView receipt={receipt} />
    </div>
  );
}
