import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import {
  deleteProducts,
  importProducts,
  listImportBatches,
  listProducts,
  undoImportBatch,
  type ProductGender,
  type ProductInput,
} from "@/server/products";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  ChevronDown,
  FileClock,
  FileUp,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import { useState, useMemo, useRef } from "react";
import { money, slugify, stripBracketedNumber } from "@/lib/format";
import { toast } from "sonner";
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

type ImportRow = Record<string, unknown> & { __rowNum__?: number };
type WorkbookWithFiles = XLSX.WorkBook & {
  files?: Record<string, { content?: Uint8Array | string; name?: string }>;
};

const cell = (row: ImportRow, key: string) => String(row[key] ?? "").trim();

const numberCell = (row: ImportRow, key: string) => {
  const raw = row[key];
  if (typeof raw === "number") return raw;
  const parsed = Number(
    String(raw ?? "")
      .replace(/,/g, "")
      .trim(),
  );
  return Number.isFinite(parsed) ? parsed : 0;
};

const genderCell = (gender: string, ageGroup: string): ProductGender | null => {
  const value = gender.toLowerCase();
  const age = ageGroup.toLowerCase();
  if (value.includes("female")) return "women";
  if (value.includes("male")) return "men";
  if (value.includes("unisex")) return "unisex";
  if (age.includes("junior") || age.includes("kid")) return "kids";
  return null;
};

const unique = (values: string[]) =>
  Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)));

const formatGender = (gender: ProductGender | null | undefined) => {
  if (!gender) return "—";
  return gender.charAt(0).toUpperCase() + gender.slice(1);
};

const textFromFileContent = (content: Uint8Array | string | undefined) => {
  if (!content) return "";
  if (typeof content === "string") return content;
  return new TextDecoder().decode(content);
};

const bytesFromFileContent = (content: Uint8Array | string | undefined) => {
  if (!content) return new Uint8Array();
  if (typeof content !== "string") return content;
  const bytes = new Uint8Array(content.length);
  for (let i = 0; i < content.length; i += 1) bytes[i] = content.charCodeAt(i) & 0xff;
  return bytes;
};

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
};

const mimeFromBytes = (bytes: Uint8Array, path: string) => {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (path.toLowerCase().endsWith(".webp")) return "image/webp";
  return "image/jpeg";
};

const normalizeXlsxPath = (baseDir: string, target: string) => {
  const parts = `${baseDir}/${target}`.split("/");
  const resolved: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") resolved.pop();
    else resolved.push(part);
  }
  return resolved.join("/");
};

const extractEmbeddedImagesByRow = (workbook: WorkbookWithFiles) => {
  const files = workbook.files;
  const imagesByRow = new Map<number, string>();
  if (!files) return imagesByRow;

  const drawingPath = Object.keys(files).find((path) =>
    path.match(/^xl\/drawings\/drawing\d+\.xml$/),
  );
  if (!drawingPath) return imagesByRow;

  const relsPath = drawingPath.replace("xl/drawings/", "xl/drawings/_rels/") + ".rels";
  const drawingXml = textFromFileContent(files[drawingPath]?.content);
  const relsXml = textFromFileContent(files[relsPath]?.content);
  if (!drawingXml || !relsXml) return imagesByRow;

  const parser = new DOMParser();
  const drawingDoc = parser.parseFromString(drawingXml, "application/xml");
  const relsDoc = parser.parseFromString(relsXml, "application/xml");
  const relTargets = new Map<string, string>();

  for (const rel of Array.from(relsDoc.getElementsByTagName("Relationship"))) {
    const id = rel.getAttribute("Id");
    const target = rel.getAttribute("Target");
    if (id && target) relTargets.set(id, target);
  }

  const anchors = [
    ...Array.from(
      drawingDoc.getElementsByTagNameNS(
        "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing",
        "twoCellAnchor",
      ),
    ),
    ...Array.from(
      drawingDoc.getElementsByTagNameNS(
        "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing",
        "oneCellAnchor",
      ),
    ),
  ];

  for (const anchor of anchors) {
    const from = anchor.getElementsByTagNameNS(
      "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing",
      "from",
    )[0];
    const rowText = from
      ?.getElementsByTagNameNS(
        "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing",
        "row",
      )[0]
      ?.textContent?.trim();
    const colText = from
      ?.getElementsByTagNameNS(
        "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing",
        "col",
      )[0]
      ?.textContent?.trim();
    const rowNumber = Number(rowText);
    const colNumber = Number(colText);
    if (!Number.isInteger(rowNumber) || colNumber !== 0) continue;

    const blip = anchor.getElementsByTagNameNS(
      "http://schemas.openxmlformats.org/drawingml/2006/main",
      "blip",
    )[0];
    const relId = blip?.getAttributeNS(
      "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
      "embed",
    );
    const target = relId ? relTargets.get(relId) : null;
    if (!target) continue;

    const mediaPath = normalizeXlsxPath("xl/drawings", target);
    const bytes = bytesFromFileContent(files[mediaPath]?.content);
    if (bytes.length === 0) continue;

    imagesByRow.set(
      rowNumber,
      `data:${mimeFromBytes(bytes, mediaPath)};base64,${bytesToBase64(bytes)}`,
    );
  }

  return imagesByRow;
};

export const Route = createFileRoute("/_authenticated/products/")({
  head: () => ({ meta: [{ title: "Products — SportsWear Inventory" }] }),
  component: ProductsList,
});

function ProductsList() {
  const [q, setQ] = useState("");
  const [brandFilter, setBrandFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmUndoImport, setConfirmUndoImport] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importHistoryOpen, setImportHistoryOpen] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: async () => listProducts(),
  });
  const { data: importBatches } = useQuery({
    queryKey: ["import-batches"],
    queryFn: async () => listImportBatches(),
  });

  const brandOptions = useMemo(() => {
    const brands = new Set<string>();
    for (const p of data ?? []) {
      if (p.sub_brand) brands.add(p.sub_brand);
    }
    return Array.from(brands).sort((a, b) => a.localeCompare(b));
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const term = q.toLowerCase().trim();
    return data.filter((p) => {
      if (brandFilter !== "all" && p.sub_brand !== brandFilter) return false;
      if (!term) return true;
      return [
        p.name,
        p.model_name,
        p.article_number,
        p.barcode,
        p.product_type,
        p.product_line,
        p.category?.name,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term));
    });
  }, [data, q, brandFilter]);
  const totalStock = useMemo(
    () => (data ?? []).reduce((sum, product) => sum + Number(product.quantity || 0), 0),
    [data],
  );

  const handleImport = async (file: File | null) => {
    if (!file) return;
    setImporting(true);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), {
        type: "array",
        bookFiles: true,
      }) as WorkbookWithFiles;
      const embeddedImagesByRow = extractEmbeddedImagesByRow(workbook);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<ImportRow>(sheet, { defval: "" });
      const validRows = rows.filter(
        (row) => cell(row, "Article Number") && cell(row, "Model Name"),
      );
      if (validRows.length === 0)
        throw new Error(
          "No product rows found. Expected columns like Article Number, Model Name, Qty, and Retail/Unit.",
        );

      const categoryNames = unique(
        validRows.map((row) => stripBracketedNumber(cell(row, "Product Type"))),
      );

      const products: ProductInput[] = validRows.map((row) => {
        const articleNumber = cell(row, "Article Number");
        const modelName = cell(row, "Model Name");
        const keyCategory = cell(row, "Key Category");
        const productType = stripBracketedNumber(cell(row, "Product Type"));
        const quantity = Math.max(0, Math.round(numberCell(row, "Qty")));
        const sellingPrice = Math.max(0, numberCell(row, "Retail/Unit"));
        const ageGroup = cell(row, "Age Group");
        const gender = cell(row, "Gender");
        const sourceThumbnail = cell(row, "Thumbnail");
        const embeddedImage = embeddedImagesByRow.get(row.__rowNum__ ?? -1);
        const images = embeddedImage ? [embeddedImage] : sourceThumbnail ? [sourceThumbnail] : [];

        return {
          barcode: articleNumber,
          article_number: articleNumber,
          name: modelName,
          model_name: modelName,
          category_id: productType ? slugify(productType) : null,
          key_category: keyCategory || null,
          age_group: ageGroup || null,
          gender: genderCell(gender, ageGroup),
          sport: cell(row, "Corporate Marketing Line") || null,
          marketing_line: cell(row, "Corporate Marketing Line") || null,
          product_division: cell(row, "Product Division") || null,
          product_line: cell(row, "Product Line") || null,
          product_type: productType || null,
          sub_brand: cell(row, "Brand") || null,
          source_thumbnail: sourceThumbnail || embeddedImage || null,
          purchase_price: 0,
          selling_price: sellingPrice,
          quantity,
          min_stock: 5,
          images,
          status: quantity === 0 ? "out_of_stock" : "available",
        };
      });

      await importProducts({ data: { products, categories: categoryNames, fileName: file.name } });

      toast.success(`Imported ${products.length} product(s)`);
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["archive"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["reports"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["import-batches"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setImporting(false);
      if (importRef.current) importRef.current.value = "";
    }
  };

  const bulkDelete = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selected);
      await deleteProducts({ data: { ids } });
    },
    onSuccess: () => {
      toast.success(`${selected.size} product(s) deleted`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["archive"] });
      qc.invalidateQueries({ queryKey: ["sold-products-report"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const undoImport = useMutation({
    mutationFn: async (id: string) => undoImportBatch({ data: { id } }),
    onSuccess: () => {
      toast.success("Import undone");
      setConfirmUndoImport(null);
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["archive"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["reports"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["import-batches"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((p) => p.id)));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
          <p className="text-sm text-muted-foreground">
            {totalStock} items in stock - {data?.length ?? 0} products
          </p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
          <input
            ref={importRef}
            type="file"
            accept=".xlsx,.xls,.xml,.csv"
            className="hidden"
            onChange={(e) => handleImport(e.target.files?.[0] ?? null)}
          />
          <Button
            variant="outline"
            size="sm"
            className="w-full sm:w-auto"
            disabled={importing}
            onClick={() => importRef.current?.click()}
          >
            <FileUp className="size-4 mr-1.5" /> {importing ? "Importing..." : "Import Excel/XML"}
          </Button>
          {selected.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="size-4 mr-1.5" /> Delete ({selected.size})
            </Button>
          )}
          <Button asChild size="sm" className="w-full sm:w-auto">
            <Link to="/products/new">
              <Plus className="size-4 mr-1.5" /> Add product
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative w-full sm:max-w-md">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by name, article number, category..."
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

      <Collapsible open={importHistoryOpen} onOpenChange={setImportHistoryOpen}>
        <Card className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <FileClock className="size-4 text-muted-foreground" />
              <h2 className="font-semibold text-sm">Import history</h2>
              <Badge variant="outline">{importBatches?.length ?? 0}</Badge>
            </div>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="w-full sm:w-auto">
                {importHistoryOpen ? "Hide" : "Show"}
                <ChevronDown
                  className={`size-4 transition-transform ${importHistoryOpen ? "rotate-180" : ""}`}
                />
              </Button>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent>
            <div className="mt-3 border-t pt-3">
              {(importBatches ?? []).length === 0 ? (
                <div className="text-sm text-muted-foreground py-4">No imports yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] text-sm">
                    <thead className="text-left text-muted-foreground">
                      <tr>
                        <th className="py-2 pr-3 font-medium">File</th>
                        <th className="py-2 px-3 font-medium text-right">Products</th>
                        <th className="py-2 px-3 font-medium text-right">Qty added</th>
                        <th className="py-2 px-3 font-medium">Imported</th>
                        <th className="py-2 pl-3 font-medium text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {importBatches?.map((batch) => (
                        <tr key={batch.id}>
                          <td className="py-2 pr-3">
                            <div className="font-medium">{batch.file_name}</div>
                            {batch.undone_at && (
                              <div className="text-xs text-muted-foreground">
                                Undone {new Date(batch.undone_at).toLocaleString()}
                              </div>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums">{batch.item_count}</td>
                          <td className="py-2 px-3 text-right tabular-nums">
                            {batch.total_quantity}
                          </td>
                          <td className="py-2 px-3 text-muted-foreground">
                            {new Date(batch.created_at).toLocaleString()}
                          </td>
                          <td className="py-2 pl-3 text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={Boolean(batch.undone_at) || undoImport.isPending}
                              onClick={() => setConfirmUndoImport(batch.id)}
                            >
                              <RotateCcw className="size-4 mr-1.5" />
                              Undo
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr className="text-left">
                <th className="p-3 w-8">
                  <Checkbox
                    checked={selected.size > 0 && selected.size === filtered.length}
                    onCheckedChange={toggleAll}
                  />
                </th>
                <th className="p-3 font-medium">Product</th>
                <th className="p-3 font-medium">Article number</th>
                <th className="p-3 font-medium">Brand</th>
                <th className="p-3 font-medium">Category</th>
                <th className="p-3 font-medium">Gender</th>
                <th className="p-3 font-medium text-right">Retail Price</th>
                <th className="p-3 font-medium text-right">Stock</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={10} className="p-3">
                      <Skeleton className="h-8" />
                    </td>
                  </tr>
                ))}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-10 text-center text-muted-foreground">
                    No products.{" "}
                    <Link to="/products/new" className="text-primary hover:underline">
                      Add your first
                    </Link>
                    .
                  </td>
                </tr>
              )}
              {filtered.map((p) => {
                const status = p.quantity === 0 ? "Out of stock" : "Available";
                const variant = p.quantity === 0 ? "destructive" : "default";
                return (
                  <tr key={p.id} className="hover:bg-muted/30">
                    <td className="p-3">
                      <Checkbox checked={selected.has(p.id)} onCheckedChange={() => toggle(p.id)} />
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        <div className="size-10 rounded-md border bg-white p-1 overflow-hidden shrink-0">
                          {p.images?.[0] && (
                            <img src={p.images[0]} alt="" className="size-full object-contain" />
                          )}
                        </div>
                        <span className="font-medium">{p.name}</span>
                      </div>
                    </td>
                    <td className="p-3 font-mono text-xs text-muted-foreground">
                      {p.article_number ?? p.barcode}
                    </td>
                    <td className="p-3">{p.sub_brand ?? "-"}</td>
                    <td className="p-3">{p.category?.name ?? "-"}</td>
                    <td className="p-3">{formatGender(p.gender)}</td>
                    <td className="p-3 text-right tabular-nums">{money(p.selling_price)}</td>
                    <td className="p-3 text-right tabular-nums">{p.quantity}</td>
                    <td className="p-3">
                      <StatusBadge variant={variant}>{status}</StatusBadge>
                    </td>
                    <td className="p-3">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => navigate({ to: "/products/$id", params: { id: p.id } })}
                      >
                        <Pencil className="size-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selected.size} product(s)?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => bulkDelete.mutate()}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={Boolean(confirmUndoImport)}
        onOpenChange={() => setConfirmUndoImport(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Undo this import?</AlertDialogTitle>
            <AlertDialogDescription>
              This will subtract the quantities added by this import and remove the import history
              record completely.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmUndoImport) undoImport.mutate(confirmUndoImport);
              }}
            >
              Undo import
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatusBadge({ variant, children }: { variant: string; children: React.ReactNode }) {
  const cls =
    variant === "destructive"
      ? "bg-destructive/15 text-destructive border-destructive/30"
      : variant === "warning"
        ? "bg-warning/15 text-warning border-warning/30"
        : "bg-success/15 text-success border-success/30";
  return (
    <Badge variant="outline" className={cls}>
      {children}
    </Badge>
  );
}
