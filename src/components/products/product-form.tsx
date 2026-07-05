import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { saveProduct } from "@/server/products";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Upload, X } from "lucide-react";

const schema = z.object({
  barcode: z.string().min(3, "Required"),
  article_number: z.string().max(100).optional(),
  name: z.string().min(2, "Required").max(200),
  model_name: z.string().max(200).optional(),
  category_id: z.string().uuid().nullable().optional(),
  key_category: z.string().max(200).optional(),
  age_group: z.string().max(100).optional(),
  gender: z.enum(["men", "women", "unisex", "kids"]).nullable().optional(),
  sport: z.string().max(100).optional(),
  marketing_line: z.string().max(200).optional(),
  product_division: z.string().max(100).optional(),
  product_line: z.string().max(200).optional(),
  product_type: z.string().max(200).optional(),
  sub_brand: z.string().max(100).optional(),
  color: z.string().max(50).optional(),
  size: z.string().max(50).optional(),
  purchase_price: z.coerce.number().min(0),
  selling_price: z.coerce.number().min(0),
  quantity: z.coerce.number().int().min(0),
  min_stock: z.coerce.number().int().min(0),
  description: z.string().max(2000).optional(),
});

type Values = z.infer<typeof schema>;

export type ProductDefault = Partial<Values> & {
  id?: string;
  images?: string[];
  category_id?: string | null;
  key_category?: string | null;
};

const readImage = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read image"));
    reader.readAsDataURL(file);
  });

export function ProductForm({ initial }: { initial?: ProductDefault }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [images, setImages] = useState<string[]>(initial?.images ?? []);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const barcodeRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      barcode: initial?.barcode ?? "",
      article_number: initial?.article_number ?? "",
      name: initial?.name ?? "",
      model_name: initial?.model_name ?? "",
      category_id: initial?.category_id ?? null,
      key_category: initial?.key_category ?? "",
      age_group: initial?.age_group ?? "",
      gender: initial?.gender ?? null,
      sport: initial?.sport ?? "",
      marketing_line: initial?.marketing_line ?? "",
      product_division: initial?.product_division ?? "",
      product_line: initial?.product_line ?? "",
      product_type: initial?.product_type ?? "",
      sub_brand: initial?.sub_brand ?? "",
      color: initial?.color ?? "",
      size: initial?.size ?? "",
      purchase_price: Number(initial?.purchase_price ?? 0),
      selling_price: Number(initial?.selling_price ?? 0),
      quantity: Number(initial?.quantity ?? 0),
      min_stock: Number(initial?.min_stock ?? 5),
      description: initial?.description ?? "",
    },
  });

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files)) {
        uploaded.push(await readImage(file));
      }
      setImages((prev) => [...prev, ...uploaded]);
      toast.success(`${uploaded.length} image(s) uploaded`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const save = useMutation({
    mutationFn: async (values: Values) => {
      const payload = {
        ...values,
        gender: values.gender || null,
        category_id: values.category_id || null,
        article_number: values.article_number || values.barcode,
        model_name: values.model_name || values.name,
        key_category: values.key_category || null,
        age_group: values.age_group || null,
        sport: values.sport || null,
        marketing_line: values.marketing_line || null,
        product_division: values.product_division || null,
        product_line: values.product_line || null,
        product_type: values.product_type || null,
        sub_brand: values.sub_brand || null,
        color: values.color || null,
        size: values.size || null,
        description: values.description || null,
        images,
        status: (values.quantity === 0 ? "out_of_stock" : "available") as
          "out_of_stock" | "available",
      };
      return saveProduct({ data: { ...payload, id: initial?.id } });
    },
    onSuccess: (_result, values) => {
      toast.success(initial?.id ? "Product updated" : "Product created");
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["archive"] });
      qc.invalidateQueries({ queryKey: ["sold-products-report"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      navigate({ to: values.quantity === 0 ? "/archive" : "/products" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <form onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-4 max-w-4xl">
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="p-5 md:col-span-2 space-y-4">
          <h2 className="font-semibold">Basics</h2>
          <div className="space-y-1.5">
            <Label htmlFor="barcode">Article number</Label>
            <Input
              id="barcode"
              autoFocus
              {...register("barcode")}
              ref={(el) => {
                register("barcode").ref(el);
                barcodeRef.current = el;
              }}
              placeholder="Scan or type article number..."
            />
            {errors.barcode && <p className="text-xs text-destructive">{errors.barcode.message}</p>}
            <p className="text-xs text-muted-foreground">
              Scanners auto-fill this field when focused.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="name">Product name</Label>
            <Input id="name" {...register("name")} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <Field label="Key category">
              <Input {...register("key_category")} />
            </Field>
            <Field label="Age group">
              <Input {...register("age_group")} />
            </Field>
            <Field label="Gender">
              <Select
                value={watch("gender") ?? ""}
                onValueChange={(v) => setValue("gender", (v || null) as Values["gender"])}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="men">Men</SelectItem>
                  <SelectItem value="women">Women</SelectItem>
                  <SelectItem value="unisex">Unisex</SelectItem>
                  <SelectItem value="kids">Kids</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Product division">
              <Input {...register("product_division")} />
            </Field>
            <Field label="Product line">
              <Input {...register("product_line")} />
            </Field>
            <Field label="Product type">
              <Input {...register("product_type")} />
            </Field>
            <Field label="Color">
              <Input {...register("color")} />
            </Field>
            <Field label="Size">
              <Input {...register("size")} placeholder="M, 42, 10.5…" />
            </Field>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" rows={4} {...register("description")} />
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-5 space-y-3">
            <h2 className="font-semibold">Pricing & stock</h2>
            <Field label="Purchase price">
              <Input type="number" step="0.01" {...register("purchase_price")} />
            </Field>
            <Field label="Selling price">
              <Input type="number" step="0.01" {...register("selling_price")} />
            </Field>
            <Field label="Quantity">
              <Input type="number" {...register("quantity")} />
            </Field>
          </Card>

          <Card className="p-5 space-y-3">
            <h2 className="font-semibold">Images</h2>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleUpload(e.target.files)}
            />
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="size-4 mr-1.5" /> {uploading ? "Uploading…" : "Upload images"}
            </Button>
            {images.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {images.map((src, i) => (
                  <div
                    key={i}
                    className="relative aspect-square rounded-md border bg-white p-2 overflow-hidden group"
                  >
                    <img src={src} alt="" className="size-full object-contain" />
                    <button
                      type="button"
                      onClick={() => setImages((p) => p.filter((_, j) => j !== i))}
                      className="absolute top-1 right-1 size-6 rounded-full bg-background/80 grid place-items-center opacity-0 group-hover:opacity-100"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <div className="flex gap-2 justify-end pt-2">
        <Button type="button" variant="ghost" onClick={() => navigate({ to: "/products" })}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || save.isPending}>
          {initial?.id ? "Save changes" : "Save product"}
        </Button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
