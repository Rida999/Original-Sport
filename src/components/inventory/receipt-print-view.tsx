import { Instagram } from "lucide-react";
import type { ReceiptWithItems } from "@/server/receipts";
import logo from "@/assets/logo.png";

export function ReceiptPrintView({ receipt }: { receipt: ReceiptWithItems }) {
  const createdAt = new Date(receipt.created_at);
  const totalQuantity = receipt.items.reduce((sum, item) => sum + item.quantity, 0);
  const showCashSummary = receipt.cash_paid > 0;

  return (
    <div
      id="receipt-print-area"
      className="mx-auto max-w-xs bg-white p-5 font-sans text-sm font-medium text-black"
    >
      <div className="text-center space-y-1">
        <img src={logo} alt="Original Sport" className="mx-auto w-64 h-auto object-contain" />
        <div className="text-xs font-normal text-black">MOF: 3256725-601</div>
        <div className="text-xs font-normal text-black">Tyre-Hosh Main Road</div>
        <div className="text-xs font-normal text-black">03/471489</div>
      </div>

      <div className="mt-4 space-y-1 text-xs">
        <div className="flex justify-between">
          <span className="text-black">Invoice #</span>
          <span className="font-semibold">{receipt.invoice_number}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-black">Date</span>
          <span>{createdAt.toLocaleDateString()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-black">Time</span>
          <span>{createdAt.toLocaleTimeString()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-black">Currency</span>
          <span>USD</span>
        </div>
      </div>

      <div className="my-3 border-t border-black" />

      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-black text-left uppercase tracking-wide text-black">
            <th className="py-1 pr-1 font-medium">Qty</th>
            <th className="py-1 pr-1 font-medium">Description</th>
            <th className="py-1 pr-1 text-right font-medium">Price</th>
            <th className="py-1 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {receipt.items.map((item) => (
            <tr key={item.id}>
              <td className="py-1 pr-1 align-top">{item.quantity}</td>
              <td className="py-1 pr-1 align-top">{item.description}</td>
              <td className="py-1 pr-1 text-right align-top">{item.unit_price.toFixed(2)}</td>
              <td className="py-1 text-right align-top font-semibold">{item.total.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="my-3 border-t border-black" />

      <div className="space-y-1 text-xs">
        <div className="flex justify-between">
          <span className="text-black">Items</span>
          <span>{totalQuantity}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-black">Discount</span>
          <span>{receipt.discount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-black">V.A.T {receipt.vat_rate}%</span>
          <span>{receipt.vat_amount.toFixed(2)}</span>
        </div>
      </div>

      <div className="my-3 border-y-2 border-black py-3">
        <div className="flex justify-between text-2xl font-bold">
          <span>NET</span>
          <span>{receipt.total.toFixed(2)}</span>
        </div>
      </div>

      {showCashSummary && (
        <div className="space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-black">Paid</span>
            <span className="font-semibold">{receipt.cash_paid.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-black">Change</span>
            <span className="font-semibold">{receipt.cash_exchange.toFixed(2)}</span>
          </div>
        </div>
      )}

      <div className="my-3 border-t border-black" />

      <div className="text-center space-y-1 text-xs">
        <div className="font-semibold">Thank you for shopping with us!</div>
        <div className="flex items-center justify-center gap-1 text-black">
          <Instagram className="size-3.5" />
          <span>@originalsport_tyre</span>
        </div>
        <div className="mt-2 text-black">Exchange within 3 days. No refund.</div>
      </div>
    </div>
  );
}
