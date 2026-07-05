import type { ReceiptWithItems } from "@/server/receipts";
import { money } from "@/lib/format";

export function ReceiptPrintView({ receipt }: { receipt: ReceiptWithItems }) {
  const createdAt = new Date(receipt.created_at);
  const totalQuantity = receipt.items.reduce((sum, item) => sum + item.quantity, 0);
  const showCashSummary = receipt.cash_paid > 0;

  return (
    <div
      id="receipt-print-area"
      className="mx-auto max-w-xs bg-white p-4 font-mono text-xs text-black"
    >
      <div className="text-center space-y-0.5">
        <div className="text-base font-bold">ORIGINAL SPORT</div>
        <div>MOF: 3256725-601</div>
        <div>Tyre-Shawaker St-Next to Oriental</div>
        <div>03/471489</div>
      </div>

      <div className="my-2 border-t border-dashed border-black" />

      <div className="flex justify-between">
        <span>Invoice #</span>
        <span>{receipt.invoice_number}</span>
      </div>
      <div className="flex justify-between">
        <span>Date</span>
        <span>{createdAt.toLocaleDateString()}</span>
      </div>
      <div className="flex justify-between">
        <span>Time</span>
        <span>{createdAt.toLocaleTimeString()}</span>
      </div>
      <div className="flex justify-between">
        <span>Currency Name</span>
        <span>USD</span>
      </div>

      <div className="my-2 border-t border-dashed border-black" />

      <table className="w-full">
        <thead>
          <tr className="border-b border-black text-left">
            <th className="py-1 pr-1 font-normal">Qty</th>
            <th className="py-1 pr-1 font-normal">Description</th>
            <th className="py-1 pr-1 text-right font-normal">Price</th>
            <th className="py-1 text-right font-normal">Total</th>
          </tr>
        </thead>
        <tbody>
          {receipt.items.map((item) => (
            <tr key={item.id}>
              <td className="py-0.5 pr-1 align-top">{item.quantity}</td>
              <td className="py-0.5 pr-1 align-top">{item.description}</td>
              <td className="py-0.5 pr-1 text-right align-top">{item.unit_price.toFixed(2)}</td>
              <td className="py-0.5 text-right align-top">{item.total.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="my-2 border-t border-dashed border-black" />

      <div className="flex justify-between">
        <span>Qty</span>
        <span>Discount</span>
        <span>Total TTC</span>
      </div>
      <div className="flex justify-between font-semibold">
        <span>{totalQuantity}</span>
        <span>{receipt.discount.toFixed(2)}</span>
        <span>{receipt.total.toFixed(2)}</span>
      </div>
      <div className="flex justify-between">
        <span>V.A.T {receipt.vat_rate}%</span>
        <span>{receipt.vat_amount.toFixed(2)}</span>
      </div>

      <div className="my-2 border-t border-dashed border-black" />

      <div className="flex justify-between text-sm font-bold">
        <span>NET USD</span>
        <span>{money(receipt.total)}</span>
      </div>

      {showCashSummary && (
        <>
          <div className="my-2 border-t border-dashed border-black" />

          <div className="flex justify-between font-semibold">
            <span>Paid USD</span>
            <span>{receipt.cash_paid.toFixed(2)}</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>Change USD</span>
            <span>{receipt.cash_exchange.toFixed(2)}</span>
          </div>
        </>
      )}
    </div>
  );
}
