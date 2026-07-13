import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adjustProductStockByBarcode, listInventory, restoreReceiptStock } from "@/server/inventory";
import {
  createReceipt,
  getDraftReceipt,
  listRecentReceipts,
  saveDraftReceipt,
} from "@/server/receipts";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Camera,
  ChevronDown,
  Printer,
  RotateCcw,
  ScanLine,
  Search,
  ShoppingCart,
  Trash2,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type TouchEvent,
  type TouchList as ReactTouchList,
} from "react";
import { toast } from "sonner";
import { money } from "@/lib/format";

type ReceiptLine = {
  product_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
};

type ReceiptDraft = {
  items: ReceiptLine[];
  cashPaid: string;
  discountMode: "none" | "preset" | "custom";
  discountPercent: number;
  customDiscountPercent: string;
  discountOverride: string;
  totalOverride: string;
  changeOverride: string;
};

export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => ({ meta: [{ title: "Inventory — SportsWear Inventory" }] }),
  component: Inventory,
});

type StockAdjustment = {
  isPending: boolean;
  mutate: (variables: { article_number: string; mode: "remove" | "return" }) => void;
};

const DEFAULT_CAMERA_ZOOM = 1.8;
const MIN_CAMERA_ZOOM = 1;
const MAX_CAMERA_ZOOM = 3.5;

type ZoomTrackCapabilities = MediaTrackCapabilities & {
  zoom?: { min?: number; max?: number };
};

type ZoomTrackConstraints = MediaTrackConstraintSet & {
  zoom?: number;
};

const clampCameraZoom = (zoom: number) =>
  Math.min(MAX_CAMERA_ZOOM, Math.max(MIN_CAMERA_ZOOM, zoom));

const touchDistance = (touches: ReactTouchList) => {
  const first = touches.item(0);
  const second = touches.item(1);
  if (!first || !second) return 0;
  return Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
};

const cameraConstraints = (deviceId: string | undefined, zoom: number): MediaTrackConstraints =>
  ({
    ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: "environment" } }),
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    advanced: [{ zoom } as ZoomTrackConstraints],
  }) as MediaTrackConstraints;

const applyCameraZoom = async (stream: MediaStream, zoom: number) => {
  const [track] = stream.getVideoTracks();
  if (!track) return;
  const capabilities = track.getCapabilities?.() as ZoomTrackCapabilities | undefined;
  const maxZoom = capabilities?.zoom?.max;
  if (!maxZoom) return;
  await track.applyConstraints({
    advanced: [{ zoom: Math.min(zoom, maxZoom) } as ZoomTrackConstraints],
  });
};

const textCodeFromOcr = (text: string) => {
  const cleaned = text
    .toUpperCase()
    .split(/[\s\n\r]+/)
    .map((part) => part.replace(/[^A-Z0-9-]/g, ""))
    .filter((part) => part.length >= 3 && part.length <= 40 && /\d/.test(part));
  return cleaned[0] ?? "";
};

const discountOptions = [5, 10, 15] as const;
const RECEIPT_DRAFT_KEY = "original-sport-receipt-draft";

const readReceiptDraft = (): ReceiptDraft | null => {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(RECEIPT_DRAFT_KEY);
    if (!raw) return null;

    const draft = JSON.parse(raw) as Partial<ReceiptDraft>;
    const items = Array.isArray(draft.items)
      ? draft.items.filter(
          (item): item is ReceiptLine =>
            typeof item.description === "string" &&
            typeof item.quantity === "number" &&
            typeof item.unit_price === "number",
        )
      : [];
    const discountMode =
      draft.discountMode === "preset" || draft.discountMode === "custom"
        ? draft.discountMode
        : "none";

    return {
      items,
      cashPaid: typeof draft.cashPaid === "string" ? draft.cashPaid : "",
      discountMode,
      discountPercent: Number(draft.discountPercent) || 0,
      customDiscountPercent:
        typeof draft.customDiscountPercent === "string" ? draft.customDiscountPercent : "",
      discountOverride:
        typeof draft.discountOverride === "string" ? draft.discountOverride : "",
      totalOverride: typeof draft.totalOverride === "string" ? draft.totalOverride : "",
      changeOverride: typeof draft.changeOverride === "string" ? draft.changeOverride : "",
    };
  } catch {
    return null;
  }
};

function Inventory() {
  const [q, setQ] = useState("");
  const [brandFilter, setBrandFilter] = useState("all");
  const [scanCode, setScanCode] = useState("");
  const [scanMode, setScanMode] = useState<"remove" | "return">("remove");
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [cameraZoom, setCameraZoom] = useState(DEFAULT_CAMERA_ZOOM);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scanCooldownRef = useRef("");
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraZoomRef = useRef(DEFAULT_CAMERA_ZOOM);
  const pinchDistanceRef = useRef(0);
  const adjustStockRef = useRef<StockAdjustment | null>(null);
  const printWindowRef = useRef<Window | null>(null);
  const lastPushedDraftRef = useRef("");
  const [receiptItems, setReceiptItems] = useState<ReceiptLine[]>(
    () => readReceiptDraft()?.items ?? [],
  );
  const [cashPaid, setCashPaid] = useState(() => readReceiptDraft()?.cashPaid ?? "");
  const [discountMode, setDiscountMode] = useState<"none" | "preset" | "custom">(
    () => readReceiptDraft()?.discountMode ?? "none",
  );
  const [discountPercent, setDiscountPercent] = useState(
    () => readReceiptDraft()?.discountPercent ?? 0,
  );
  const [customDiscountPercent, setCustomDiscountPercent] = useState(
    () => readReceiptDraft()?.customDiscountPercent ?? "",
  );
  // The percent buttons just fill this in as a suggestion - typing directly
  // in the discount amount field (e.g. to round it) overrides that.
  const [discountOverride, setDiscountOverride] = useState(
    () => readReceiptDraft()?.discountOverride ?? "",
  );
  // Total/Change display the live-computed value until the field is edited
  // directly (e.g. to round it), at which point the typed value takes over.
  const [totalOverride, setTotalOverride] = useState(
    () => readReceiptDraft()?.totalOverride ?? "",
  );
  const [changeOverride, setChangeOverride] = useState(
    () => readReceiptDraft()?.changeOverride ?? "",
  );
  const [recentReceiptsOpen, setRecentReceiptsOpen] = useState(false);
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["inventory"],
    queryFn: async () => listInventory(),
  });
  const { data: recentReceipts } = useQuery({
    queryKey: ["recent-receipts"],
    queryFn: async () => listRecentReceipts(),
  });
  // Shared with any other device (e.g. a monitor) looking at this same page -
  // whichever device scans pushes here, everyone else picks it up on poll.
  const { data: draftReceipt } = useQuery({
    queryKey: ["draft-receipt"],
    queryFn: async () => getDraftReceipt(),
    refetchInterval: 1500,
  });
  const syncDraft = useMutation({
    mutationFn: async (items: ReceiptLine[]) => saveDraftReceipt({ data: { items } }),
  });
  const pushDraft = (items: ReceiptLine[]) => {
    lastPushedDraftRef.current = JSON.stringify(items);
    syncDraft.mutate(items);
  };
  const brandOptions = useMemo(() => {
    const brands = new Set<string>();
    for (const p of data ?? []) {
      if (p.sub_brand) brands.add(p.sub_brand);
    }
    return Array.from(brands).sort((a, b) => a.localeCompare(b));
  }, [data]);
  const filtered = useMemo(
    () =>
      (data ?? []).filter((p) => {
        if (brandFilter !== "all" && p.sub_brand !== brandFilter) return false;
        if (!q) return true;
        return (
          p.name.toLowerCase().includes(q.toLowerCase()) ||
          p.barcode.includes(q) ||
          p.article_number?.includes(q)
        );
      }),
    [data, q, brandFilter],
  );
  const receiptSubtotal = receiptItems.reduce(
    (sum, item) => sum + item.quantity * item.unit_price,
    0,
  );
  const receiptItemCount = receiptItems.reduce((sum, item) => sum + item.quantity, 0);
  const activeDiscountPercent =
    discountMode === "custom" ? Number(customDiscountPercent) || 0 : discountPercent;
  const suggestedDiscount = Math.min(
    receiptSubtotal,
    Math.max(0, receiptSubtotal * (activeDiscountPercent / 100)),
  );
  const discountAmount =
    discountOverride.trim() !== ""
      ? Math.min(receiptSubtotal, Math.max(0, Number(discountOverride) || 0))
      : suggestedDiscount;
  const suggestedTotal = Math.max(0, receiptSubtotal - discountAmount);
  const receiptTotal =
    totalOverride.trim() !== "" ? Math.max(0, Number(totalOverride) || 0) : suggestedTotal;
  const suggestedChange = Math.max(0, (Number(cashPaid) || 0) - receiptTotal);
  const changeDue =
    changeOverride.trim() !== "" ? Math.max(0, Number(changeOverride) || 0) : suggestedChange;

  const applyDiscountPercent = (mode: "none" | "preset" | "custom", percent: number) => {
    setDiscountMode(mode);
    setDiscountPercent(percent);
    if (mode === "custom") return;
    const suggestion = Math.min(receiptSubtotal, Math.max(0, receiptSubtotal * (percent / 100)));
    setDiscountOverride(suggestion > 0 ? suggestion.toFixed(2) : "");
  };

  const applyDiscountPercent = (mode: "none" | "preset" | "custom", percent: number) => {
    setDiscountMode(mode);
    setDiscountPercent(percent);
    if (mode === "custom") return;
    const suggestion = Math.min(receiptSubtotal, Math.max(0, receiptSubtotal * (percent / 100)));
    setDiscountOverride(suggestion > 0 ? suggestion.toFixed(2) : "");
  };

  const resetReceipt = () => {
    setReceiptItems([]);
    pushDraft([]);
    setCashPaid("");
    setDiscountMode("none");
    setDiscountPercent(0);
    setCustomDiscountPercent("");
    setDiscountOverride("");
    setTotalOverride("");
    setChangeOverride("");
  };

  const invalidateStockQueries = () => {
    qc.invalidateQueries({ queryKey: ["inventory"] });
    qc.invalidateQueries({ queryKey: ["products"] });
    qc.invalidateQueries({ queryKey: ["archive"] });
    qc.invalidateQueries({ queryKey: ["reports"] });
    qc.invalidateQueries({ queryKey: ["sold-products-report"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
  };

  const adjustStock = useMutation({
    mutationFn: async ({
      article_number,
      mode,
    }: {
      article_number: string;
      mode: "remove" | "return";
    }) => adjustProductStockByArticleNumber({ data: { article_number, mode } }),
    onSuccess: (result) => {
      if (result.status === "updated") {
        const action = result.mode === "return" ? "Returned" : "Removed";
        toast.success(
          `${action} ${result.product.name}: ${result.product.previous_quantity} -> ${result.product.quantity}`,
        );
        setCameraActive(false);

        if (result.mode === "remove") {
          const product = result.product;
          setReceiptItems((prev) => {
            const idx = prev.findIndex((item) => item.product_id === product.id);
            const next =
              idx === -1
                ? [
                    ...prev,
                    {
                      product_id: product.id,
                      description: product.name,
                      quantity: 1,
                      unit_price: Number(product.selling_price),
                    },
                  ]
                : prev.map((line, lineIndex) =>
                    lineIndex === idx ? { ...line, quantity: line.quantity + 1 } : line,
                  );
            pushDraft(next);
            return next;
          });
        }
      } else if (result.status === "out_of_stock") {
        toast.warning(`${result.product.name} is out of stock`);
      } else {
        toast.error(`No product found for ${result.article_number}`);
      }

      setScanCode("");
      invalidateStockQueries();
      requestAnimationFrame(() => scanInputRef.current?.focus());
    },
    onError: (e: Error) => toast.error(e.message),
  });

  adjustStockRef.current = adjustStock;
  cameraZoomRef.current = cameraZoom;

  const returnReceiptStock = useMutation({
    mutationFn: async (items: { product_id: string | null; quantity: number }[]) =>
      restoreReceiptStock({ data: { items } }),
    onSuccess: () => {
      invalidateStockQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveReceipt = useMutation({
    mutationFn: async () =>
      createReceipt({
        data: {
          items: receiptItems,
          customer_name: null,
          discount: discountAmount,
          total: receiptTotal,
          cash_paid: Number(cashPaid) || 0,
          cash_exchange: changeDue,
        },
      }),
    onSuccess: (receipt) => {
      toast.success(`Receipt #${receipt.invoice_number} saved`);
      const printUrl = `/print/receipt/${receipt.id}`;
      if (printWindowRef.current) {
        printWindowRef.current.location.href = printUrl;
      } else {
        window.open(printUrl, "_blank");
      }
      resetReceipt();
      invalidateStockQueries();
      qc.invalidateQueries({ queryKey: ["recent-receipts"] });
    },
    onError: (e: Error) => {
      printWindowRef.current?.close();
      toast.error(e.message);
    },
  });

  const clearReceipt = async () => {
    if (receiptItems.length === 0 || returnReceiptStock.isPending) return;
    const result = await returnReceiptStock.mutateAsync(receiptItems);
    resetReceipt();
    if (result.restored > 0) {
      toast.success(`Returned ${result.restored} item(s) to inventory`);
    }
  };

  const removeOneReceiptItem = async (item: ReceiptLine, index: number) => {
    if (returnReceiptStock.isPending) return;
    const result = await returnReceiptStock.mutateAsync([
      { product_id: item.product_id, quantity: 1 },
    ]);
    setReceiptItems((prev) => {
      const next = prev.flatMap((line, lineIndex) => {
        if (lineIndex !== index) return [line];
        if (line.quantity <= 1) return [];
        return [{ ...line, quantity: line.quantity - 1 }];
      });
      pushDraft(next);
      return next;
    });
    if (result.restored > 0) {
      toast.success("Returned 1 item to inventory");
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    const hasDraft =
      receiptItems.length > 0 ||
      cashPaid.trim().length > 0 ||
      discountMode !== "none" ||
      discountPercent > 0 ||
      customDiscountPercent.trim().length > 0 ||
      discountOverride.trim().length > 0 ||
      totalOverride.trim().length > 0 ||
      changeOverride.trim().length > 0;

    if (!hasDraft) {
      window.localStorage.removeItem(RECEIPT_DRAFT_KEY);
      return;
    }

    window.localStorage.setItem(
      RECEIPT_DRAFT_KEY,
      JSON.stringify({
        items: receiptItems,
        cashPaid,
        discountMode,
        discountPercent,
        customDiscountPercent,
        discountOverride,
        totalOverride,
        changeOverride,
      } satisfies ReceiptDraft),
    );
  }, [
    cashPaid,
    changeOverride,
    customDiscountPercent,
    discountMode,
    discountOverride,
    discountPercent,
    receiptItems,
    totalOverride,
  ]);

  useEffect(() => {
    if (!draftReceipt) return;
    const fetched = JSON.stringify(draftReceipt.items);
    // Skip if this is just the poll echoing back what we ourselves last
    // pushed - only adopt it when some other device changed the shared draft.
    if (fetched === lastPushedDraftRef.current) return;
    if (fetched === JSON.stringify(receiptItems)) return;
    lastPushedDraftRef.current = fetched;
    setReceiptItems(draftReceipt.items);
  }, [draftReceipt]);

  useEffect(() => {
    const stream = cameraStreamRef.current;
    if (stream) void applyCameraZoom(stream, cameraZoom);
  }, [cameraZoom]);

  useEffect(() => {
    if (!cameraActive) return;

    let stream: MediaStream | null = null;
    let ocrTimer = 0;
    let ocrBusy = false;
    let stopped = false;

    const stopCamera = () => {
      stopped = true;
      if (ocrTimer) window.clearInterval(ocrTimer);
      cameraStreamRef.current = null;
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
    };

    const startCamera = async () => {
      setCameraError("");

      try {
        if (!videoRef.current) return;

        const devices = await navigator.mediaDevices.enumerateDevices();
        const backCamera = devices.find((device) => /back|rear|environment/i.test(device.label));
        stream = await navigator.mediaDevices.getUserMedia({
          video: cameraConstraints(backCamera?.deviceId, cameraZoomRef.current),
          audio: false,
        });
        cameraStreamRef.current = stream;
        await applyCameraZoom(stream, cameraZoomRef.current);
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const { recognize } = await import("tesseract.js");

        const scanText = async () => {
          if (stopped || ocrBusy || !videoRef.current || adjustStockRef.current?.isPending) {
            return;
          }
          const video = videoRef.current;
          if (!video.videoWidth || !video.videoHeight) return;

          ocrBusy = true;
          try {
            const canvas = document.createElement("canvas");
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const context = canvas.getContext("2d");
            if (!context) return;
            const zoom = cameraZoomRef.current;
            const sourceWidth = video.videoWidth / zoom;
            const sourceHeight = video.videoHeight / zoom;
            const sourceX = (video.videoWidth - sourceWidth) / 2;
            const sourceY = (video.videoHeight - sourceHeight) / 2;
            context.drawImage(
              video,
              sourceX,
              sourceY,
              sourceWidth,
              sourceHeight,
              0,
              0,
              canvas.width,
              canvas.height,
            );
            const result = await recognize(canvas, "eng");
            const code = textCodeFromOcr(result.data.text);
            if (code && scanCooldownRef.current !== code) {
              scanCooldownRef.current = code;
              setScanCode(code);
              adjustStockRef.current?.mutate({ article_number: code, mode: scanMode });
              window.setTimeout(() => {
                if (scanCooldownRef.current === code) scanCooldownRef.current = "";
              }, 2200);
            }
          } catch {
            setCameraError("Could not read the text. Try better light or move closer.");
          } finally {
            ocrBusy = false;
          }
        };

        await scanText();
        ocrTimer = window.setInterval(scanText, 2200);
      } catch {
        setCameraError("Camera permission was blocked or no camera was found.");
        setCameraActive(false);
      }
    };

    startCamera();
    return stopCamera;
  }, [cameraActive, scanMode]);

  const handleScan = () => {
    const articleNumber = scanCode.trim();
    if (!articleNumber || adjustStock.isPending) return;
    if (!/^[A-Za-z0-9 ]{1,20}$/.test(articleNumber)) {
      toast.error("Article number must be 20 characters or less with no special characters.");
      return;
    }
    adjustStock.mutate({ article_number: articleNumber, mode: scanMode });
  };

  const handleCameraTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length === 2) {
      pinchDistanceRef.current = touchDistance(event.touches);
    }
  };

  const handleCameraTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 2) return;
    event.preventDefault();
    const nextDistance = touchDistance(event.touches);
    const previousDistance = pinchDistanceRef.current || nextDistance;
    if (!nextDistance || !previousDistance) return;
    pinchDistanceRef.current = nextDistance;
    setCameraZoom((zoom) => clampCameraZoom(zoom * (nextDistance / previousDistance)));
  };

  const handleCameraTouchEnd = () => {
    pinchDistanceRef.current = 0;
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
              <ToggleGroupItem value="remove" aria-label="Sell one item">
                <ShoppingCart className="size-4 mr-1.5" />
                Sell
              </ToggleGroupItem>
              <ToggleGroupItem value="return" aria-label="Return one item">
                <RotateCcw className="size-4 mr-1.5" />
                Return
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="min-w-0 flex-1 max-w-sm space-y-1.5">
            <label htmlFor="stock-scan" className="text-sm font-medium">
              Article number
            </label>
            <div className="relative">
              <ScanLine className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="stock-scan"
                ref={scanInputRef}
                className="pl-9 font-mono"
                placeholder="Scan text"
                value={scanCode}
                autoComplete="off"
                inputMode="numeric"
                maxLength={20}
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
            {adjustStock.isPending ? "Saving..." : scanMode === "return" ? "Return" : "Sell"}
          </Button>
        </div>
        {(cameraActive || cameraError) && (
          <div className="mt-4 overflow-hidden rounded-md border bg-muted/20">
            {cameraActive ? (
              <div
                className="relative aspect-[4/3] max-h-[460px] touch-none bg-black"
                onTouchEnd={handleCameraTouchEnd}
                onTouchMove={handleCameraTouchMove}
                onTouchStart={handleCameraTouchStart}
              >
                <video
                  ref={videoRef}
                  className="size-full object-cover"
                  playsInline
                  style={{ transform: `scale(${Math.max(1, cameraZoom / 1.35)})` }}
                  muted
                />
                <div className="pointer-events-none absolute right-3 top-3 rounded-md bg-black/65 px-2 py-1 text-xs font-medium text-white">
                  {cameraZoom.toFixed(1)}x
                </div>
                <div className="pointer-events-none absolute inset-x-[10%] top-1/2 h-32 -translate-y-1/2 rounded-md border-2 border-primary shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
              </div>
            ) : null}
            {cameraError ? (
              <div className="border-t px-3 py-2 text-sm text-destructive">{cameraError}</div>
            ) : null}
          </div>
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">Receipt</div>
            <p className="text-xs text-muted-foreground">
              Items removed via scan are added here. Save to print.
            </p>
          </div>
          {receiptItems.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={returnReceiptStock.isPending}
              onClick={() => void clearReceipt()}
            >
              <Trash2 className="size-4 mr-1.5" />
              {returnReceiptStock.isPending ? "Returning..." : "Clear"}
            </Button>
          )}
        </div>

        {receiptItems.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            No items scanned yet.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground">
                  <tr className="text-left">
                    <th className="py-1 pr-2 font-medium">Qty</th>
                    <th className="py-1 pr-2 font-medium">Description</th>
                    <th className="py-1 pr-2 text-right font-medium">Price</th>
                    <th className="py-1 pr-2 text-right font-medium">Total</th>
                    <th className="py-1 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {receiptItems.map((item, index) => (
                    <tr key={item.product_id ?? item.description}>
                      <td className="py-1.5 pr-2 tabular-nums">{item.quantity}</td>
                      <td className="py-1.5 pr-2">{item.description}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">
                        {money(item.unit_price)}
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">
                        {money(item.quantity * item.unit_price)}
                      </td>
                      <td className="py-1.5 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={returnReceiptStock.isPending}
                          onClick={() => void removeOneReceiptItem(item, index)}
                        >
                          <RotateCcw className="size-4 mr-1.5" />
                          Remove 1
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-4 text-sm font-semibold">
              <span>Items: {receiptItemCount}</span>
              <span>Subtotal: {money(receiptSubtotal)}</span>
            </div>
            <div className="space-y-2">
              <Label>Apply discount</Label>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={discountMode === "none" ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    applyDiscountPercent("none", 0);
                    setCustomDiscountPercent("");
                  }}
                >
                  None
                </Button>
                {discountOptions.map((percent) => (
                  <Button
                    key={percent}
                    type="button"
                    variant={
                      discountMode === "preset" && discountPercent === percent
                        ? "default"
                        : "outline"
                    }
                    size="sm"
                    onClick={() => {
                      applyDiscountPercent("preset", percent);
                      setCustomDiscountPercent("");
                    }}
                  >
                    {percent}%
                  </Button>
                ))}
                <Button
                  type="button"
                  variant={discountMode === "custom" ? "default" : "outline"}
                  size="sm"
                  onClick={() => applyDiscountPercent("custom", 0)}
                >
                  Custom
                </Button>
              </div>
              {discountMode === "custom" && (
                <Input
                  className="max-w-40"
                  inputMode="decimal"
                  min="0"
                  max="100"
                  placeholder="Percent"
                  type="number"
                  value={customDiscountPercent}
                  onChange={(e) => {
                    setCustomDiscountPercent(e.target.value);
                    const pct = Number(e.target.value) || 0;
                    const suggestion = Math.min(
                      receiptSubtotal,
                      Math.max(0, receiptSubtotal * (pct / 100)),
                    );
                    setDiscountOverride(suggestion > 0 ? suggestion.toFixed(2) : "");
                  }}
                />
              )}
              <div className="space-y-1.5">
                <Label htmlFor="discount-amount">Discount amount</Label>
                <Input
                  id="discount-amount"
                  className="max-w-40"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  type="number"
                  value={discountOverride}
                  onChange={(e) => setDiscountOverride(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Percent buttons fill this in - edit it directly to round.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Label htmlFor="total-amount" className="text-sm font-semibold">
                Total
              </Label>
              <Input
                id="total-amount"
                className="max-w-28 text-right font-semibold"
                inputMode="decimal"
                step="0.01"
                min="0"
                type="number"
                value={totalOverride !== "" ? totalOverride : suggestedTotal.toFixed(2)}
                onChange={(e) => setTotalOverride(e.target.value)}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cash-paid">Cash paid (optional)</Label>
                <Input
                  id="cash-paid"
                  type="number"
                  step="0.01"
                  value={cashPaid}
                  onChange={(e) => setCashPaid(e.target.value)}
                />
              </div>
            </div>
            {cashPaid.trim().length > 0 && (
              <div className="flex items-center justify-end gap-2">
                <Label htmlFor="change-amount" className="text-sm font-semibold">
                  Change
                </Label>
                <Input
                  id="change-amount"
                  className="max-w-28 text-right font-semibold"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  type="number"
                  value={changeOverride !== "" ? changeOverride : suggestedChange.toFixed(2)}
                  onChange={(e) => setChangeOverride(e.target.value)}
                />
              </div>
            )}
            <Button
              type="button"
              className="w-full sm:w-auto"
              disabled={saveReceipt.isPending || returnReceiptStock.isPending}
              onClick={() => {
                // Open the tab synchronously within the click handler - Safari
                // blocks window.open() called later from an async onSuccess.
                printWindowRef.current = window.open("about:blank", "_blank");
                saveReceipt.mutate();
              }}
            >
              <Printer className="size-4 mr-1.5" />
              {saveReceipt.isPending ? "Saving…" : "Save & Print"}
            </Button>
          </>
        )}
      </Card>

      {recentReceipts && recentReceipts.length > 0 && (
        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium">Recent receipts</div>
              <p className="text-xs text-muted-foreground">
                {recentReceipts.length} saved receipt(s)
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setRecentReceiptsOpen((open) => !open)}
            >
              <ChevronDown
                className={`size-4 transition-transform ${recentReceiptsOpen ? "rotate-180" : ""}`}
              />
              {recentReceiptsOpen ? "Hide" : "Show"}
            </Button>
          </div>
          {recentReceiptsOpen && (
            <div className="divide-y divide-border">
              {recentReceipts.map((receipt) => (
                <div key={receipt.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <span className="font-medium">#{receipt.invoice_number}</span>{" "}
                    <span className="text-muted-foreground">
                      {receipt.item_count} item(s) · {money(receipt.total)} ·{" "}
                      {new Date(receipt.created_at).toLocaleString()}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => window.open(`/print/receipt/${receipt.id}`, "_blank")}
                  >
                    <Printer className="size-4 mr-1.5" />
                    Print
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative w-full sm:max-w-md">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Select value={brandFilter} onValueChange={setBrandFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="All brands" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All brands</SelectItem>
            {brandOptions.map((brand) => (
              <SelectItem key={brand} value={brand}>
                {brand}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">No items.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr className="text-left">
                  <th className="p-3 font-medium">Article number</th>
                  <th className="p-3 font-medium">Product</th>
                  <th className="p-3 font-medium">Brand</th>
                  <th className="p-3 font-medium text-right">Retail Price</th>
                  <th className="p-3 font-medium text-right">Current</th>
                  <th className="p-3 font-medium">Last updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((p) => (
                    <tr key={p.id} className="hover:bg-muted/30">
                      <td className="p-3 font-mono text-xs text-muted-foreground">
                        {p.article_number}
                      </td>
                      <td className="p-3 font-medium">{p.name}</td>
                      <td className="p-3 text-muted-foreground">{p.sub_brand ?? "-"}</td>
                      <td className="p-3 text-right tabular-nums">{money(p.selling_price)}</td>
                      <td className="p-3 text-right tabular-nums">{p.quantity}</td>
                      <td className="p-3 text-muted-foreground text-xs">
                        {new Date(p.updated_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
