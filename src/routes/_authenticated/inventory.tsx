import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adjustProductStockByBarcode, listInventory } from "@/lib/data";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Camera, RotateCcw, ScanLine, Search, ShoppingCart, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => ({ meta: [{ title: "Inventory — SportsWear Inventory" }] }),
  component: Inventory,
});

type DetectedBarcode = { rawValue: string };

type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => {
  detect: (source: HTMLVideoElement) => Promise<DetectedBarcode[]>;
};

type WindowWithBarcodeDetector = Window & {
  BarcodeDetector?: BarcodeDetectorConstructor;
};

type StockAdjustment = {
  isPending: boolean;
  mutate: (variables: { barcode: string; mode: "remove" | "return" }) => void;
};

function Inventory() {
  const [q, setQ] = useState("");
  const [scanCode, setScanCode] = useState("");
  const [scanMode, setScanMode] = useState<"remove" | "return">("remove");
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const scanInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scanCooldownRef = useRef("");
  const adjustStockRef = useRef<StockAdjustment | null>(null);
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["inventory"],
    queryFn: async () => listInventory(),
  });
  const filtered = useMemo(
    () =>
      (data ?? []).filter(
        (p) => !q || p.name.toLowerCase().includes(q.toLowerCase()) || p.barcode.includes(q),
      ),
    [data, q],
  );

  const adjustStock = useMutation({
    mutationFn: async ({ barcode, mode }: { barcode: string; mode: "remove" | "return" }) =>
      adjustProductStockByBarcode({ data: { barcode, mode } }),
    onSuccess: (result) => {
      if (result.status === "updated") {
        const action = result.mode === "return" ? "Returned" : "Removed";
        toast.success(
          `${action} ${result.product.name}: ${result.product.previous_quantity} -> ${result.product.quantity}`,
        );
      } else if (result.status === "out_of_stock") {
        toast.warning(`${result.product.name} is out of stock`);
      } else {
        toast.error(`No product found for ${result.barcode}`);
      }

      setScanCode("");
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["archive"] });
      qc.invalidateQueries({ queryKey: ["reports"] });
      qc.invalidateQueries({ queryKey: ["sold-products-report"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      requestAnimationFrame(() => scanInputRef.current?.focus());
    },
    onError: (e: Error) => toast.error(e.message),
  });

  adjustStockRef.current = adjustStock;

  useEffect(() => {
    if (!cameraActive) return;

    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;

    const stopCamera = () => {
      stopped = true;
      if (frame) cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
    };

    const startCamera = async () => {
      setCameraError("");
      const barcodeWindow = window as WindowWithBarcodeDetector;
      if (!barcodeWindow.BarcodeDetector) {
        setCameraError("Camera scanning is not supported by this browser.");
        setCameraActive(false);
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });

        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        const detector = new barcodeWindow.BarcodeDetector({
          formats: [
            "qr_code",
            "ean_13",
            "ean_8",
            "code_128",
            "code_39",
            "code_93",
            "upc_a",
            "upc_e",
          ],
        });

        const detect = async () => {
          if (stopped || !videoRef.current) return;
          if (!adjustStockRef.current?.isPending) {
            try {
              const codes = await detector.detect(videoRef.current);
              const code = codes[0]?.rawValue?.trim();
              if (code && scanCooldownRef.current !== code) {
                scanCooldownRef.current = code;
                setScanCode(code);
                adjustStockRef.current?.mutate({ barcode: code, mode: scanMode });
                window.setTimeout(() => {
                  if (scanCooldownRef.current === code) scanCooldownRef.current = "";
                }, 1600);
              }
            } catch {
              setCameraError("Could not read the code. Try better light or move closer.");
            }
          }
          frame = requestAnimationFrame(detect);
        };

        detect();
      } catch {
        setCameraError("Camera permission was blocked or no camera was found.");
        setCameraActive(false);
      }
    };

    startCamera();
    return stopCamera;
  }, [cameraActive, scanMode]);

  const handleScan = () => {
    const barcode = scanCode.trim();
    if (!barcode || adjustStock.isPending) return;
    adjustStock.mutate({ barcode, mode: scanMode });
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
        <p className="text-sm text-muted-foreground">Stock levels across all products</p>
      </div>
      <Card className="p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="space-y-1.5">
            <div className="text-sm font-medium">Action</div>
            <ToggleGroup
              type="single"
              value={scanMode}
              onValueChange={(value) => {
                if (value === "remove" || value === "return") setScanMode(value);
              }}
              className="justify-start"
            >
              <ToggleGroupItem value="remove" aria-label="Remove one item">
                <ShoppingCart className="size-4 mr-1.5" />
                Remove
              </ToggleGroupItem>
              <ToggleGroupItem value="return" aria-label="Add one item">
                <RotateCcw className="size-4 mr-1.5" />
                Add
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <label htmlFor="stock-scan" className="text-sm font-medium">
              Barcode
            </label>
            <div className="relative">
              <ScanLine className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="stock-scan"
                ref={scanInputRef}
                className="pl-9 font-mono"
                placeholder="Scan barcode"
                value={scanCode}
                autoComplete="off"
                onChange={(e) => setScanCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleScan();
                  }
                }}
              />
            </div>
          </div>
          <Button
            type="button"
            variant={cameraActive ? "secondary" : "outline"}
            className="md:w-36"
            onClick={() => setCameraActive((active) => !active)}
          >
            {cameraActive ? <X className="size-4" /> : <Camera className="size-4" />}
            {cameraActive ? "Close" : "Camera"}
          </Button>
          <Button
            className="md:w-32"
            disabled={!scanCode.trim() || adjustStock.isPending}
            onClick={handleScan}
          >
            {adjustStock.isPending ? "Saving..." : scanMode === "return" ? "Add" : "Remove"}
          </Button>
        </div>
        {(cameraActive || cameraError) && (
          <div className="mt-4 overflow-hidden rounded-md border bg-muted/20">
            {cameraActive ? (
              <div className="relative aspect-[4/3] max-h-[460px] bg-black">
                <video ref={videoRef} className="size-full object-cover" playsInline muted />
                <div className="pointer-events-none absolute inset-x-[18%] top-1/2 h-28 -translate-y-1/2 rounded-md border-2 border-primary shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
              </div>
            ) : null}
            {cameraError ? (
              <div className="border-t px-3 py-2 text-sm text-destructive">{cameraError}</div>
            ) : null}
          </div>
        )}
      </Card>
      <div className="relative w-full sm:max-w-md">
        <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">No items.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr className="text-left">
                  <th className="p-3 font-medium">Barcode</th>
                  <th className="p-3 font-medium">Product</th>
                  <th className="p-3 font-medium text-right">Current</th>
                  <th className="p-3 font-medium text-right">Minimum</th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3 font-medium">Last updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((p) => {
                  const status =
                    p.quantity === 0
                      ? {
                          label: "Out of stock",
                          cls: "bg-destructive/15 text-destructive border-destructive/30",
                        }
                      : p.quantity <= p.min_stock
                        ? {
                            label: "Low stock",
                            cls: "bg-warning/15 text-warning border-warning/30",
                          }
                        : {
                            label: "Available",
                            cls: "bg-success/15 text-success border-success/30",
                          };
                  return (
                    <tr key={p.id} className="hover:bg-muted/30">
                      <td className="p-3 font-mono text-xs text-muted-foreground">{p.barcode}</td>
                      <td className="p-3 font-medium">{p.name}</td>
                      <td className="p-3 text-right tabular-nums">{p.quantity}</td>
                      <td className="p-3 text-right tabular-nums text-muted-foreground">
                        {p.min_stock}
                      </td>
                      <td className="p-3">
                        <Badge variant="outline" className={status.cls}>
                          {status.label}
                        </Badge>
                      </td>
                      <td className="p-3 text-muted-foreground text-xs">
                        {new Date(p.updated_at).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
