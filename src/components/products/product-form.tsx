import { useState, useRef, type FormEvent } from "react";
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

const cleanTextPattern = /^[A-Za-z0-9 ]*$/;
const optionalCleanText = (max: number) =>
  z
    .string()
    .max(max)
    .regex(cleanTextPattern, "Special characters are not allowed")
    .optional()
    .or(z.literal(""));
const priceField = z.preprocess(
  (value) => String(value ?? ""),
  z
    .string()
    .regex(/^\d{1,4}(\.\d{1,2})?$/, "Price must be at most 4 digits and 2 decimals")
    .transform(Number),
);
const optionalPriceField = z.preprocess((value) => {
  const text = String(value ?? "").trim();
  return text === "" ? 0 : text;
}, z.coerce.number().min(0));
const quantityField = z.preprocess(
  (value) => String(value ?? ""),
  z
    .string()
    .regex(/^\d{1,5}$/, "Quantity must be at most 5 digits")
    .transform(Number),
);

const schema = z.object({
  article_number: z
    .string()
    .min(1, "Required")
    .regex(/^[A-Za-z0-9 ]+$/, "Article number cannot contain special characters")
    .max(20, "Article number must be at most 20 characters"),
  name: z
    .string()
    .min(2, "Required")
    .max(30, "Product name must be at most 30 characters")
    .regex(/^[A-Za-z0-9 ]+$/, "Product name cannot contain special characters"),
  model_name: optionalCleanText(200),
  category_id: z.string().uuid().nullable().optional(),
  key_category: optionalCleanText(200),
  age_group: optionalCleanText(100),
  gender: z.enum(["men", "women", "unisex", "kids"]).nullable().optional(),
  sport: optionalCleanText(100),
  marketing_line: optionalCleanText(200),
  product_division: optionalCleanText(30),
  product_line: optionalCleanText(30),
  product_type: optionalCleanText(30),
  sub_brand: optionalCleanText(30),
  color: optionalCleanText(20),
  size: z
    .string()
    .regex(/^\d{1,2}(\.\d)?$/, "Size must be like 9, 42, or 42.5")
    .optional()
    .or(z.literal("")),
  purchase_price: optionalPriceField,
  selling_price: priceField,
  quantity: quantityField,
  min_stock: z.coerce.number().int().min(0),
  description: optionalCleanText(200),
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

const sanitizeArticleNumber = (value: string) => value.replace(/[^A-Za-z0-9 ]/g, "");
const sanitizeText = (value: string) => value.replace(/[^A-Za-z0-9 ]/g, "");
const sanitizeMoney = (value: string) => {
  const cleaned = value.replace(/[^0-9.]/g, "");
  const [whole, ...decimalParts] = cleaned.split(".");
  const wholePart = whole.slice(0, 4);
  const decimals = decimalParts.join("").slice(0, 2);
  return cleaned.includes(".") ? `${wholePart}.${decimals}` : wholePart;
};
const sanitizeInteger = (value: string) => value.replace(/\D/g, "").slice(0, 5);
const sanitizeSize = (value: string) => {
  const cleaned = value.replace(/[^0-9.]/g, "");
  const [whole, ...decimalParts] = cleaned.split(".");
  const wholePart = whole.slice(0, 2);
  if (!wholePart) return "";
  const decimal = decimalParts.join("").slice(0, 1);
  return cleaned.includes(".") ? `${wholePart}.${decimal}` : wholePart;
};
const sportsBrands = [
  "Adidas",
  "Nike",
  "Puma",
  "Under Armour",
  "New Balance",
  "Reebok",
  "Asics",
  "Skechers",
  "Speedo",
  "Converse",
  "Vans",
  "Jordan",
  "Fila",
  "Mizuno",
  "Salomon",
  "Hoka",
  "Havaianas",
  "On",
  "Brooks",
  "Saucony",
  "Lacoste",
  "Champion",
  "Umbro",
  "Kappa",
  "Diadora",
  "Wilson",
  "Head",
  "Yonex",
  "Babolat",
  "Li Ning",
  "Anta",
  "The North Face",
  "Columbia",
  "Timberland",
];
const sanitizedInput =
  (sanitize: (value: string) => string) =>
  (event: FormEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    event.currentTarget.value = sanitize(event.currentTarget.value);
  };
const priceDefault = (value: unknown) => {
  const price = Number(value ?? 0);
  return price > 0 ? price : ("" as unknown as number);
};

export function ProductForm({ initial }: { initial?: ProductDefault }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [images, setImages] = useState<string[]>(initial?.images ?? []);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
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
      purchase_price: priceDefault(initial?.purchase_price),
      selling_price: priceDefault(initial?.selling_price),
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
    onSuccess: async (_result, values) => {
      toast.success(initial?.id ? "Product updated" : "Product created");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["products"], refetchType: "all" }),
        qc.invalidateQueries({ queryKey: ["archive"], refetchType: "all" }),
        qc.invalidateQueries({ queryKey: ["inventory"], refetchType: "all" }),
        qc.invalidateQueries({ queryKey: ["reports"], refetchType: "all" }),
        qc.invalidateQueries({ queryKey: ["sold-products-report"], refetchType: "all" }),
        qc.invalidateQueries({ queryKey: ["sales-report"], refetchType: "all" }),
        qc.invalidateQueries({ queryKey: ["dashboard-stats"], refetchType: "all" }),
        initial?.id
          ? qc.invalidateQueries({ queryKey: ["product", initial.id], refetchType: "all" })
          : Promise.resolve(),
      ]);
      navigate({ to: values.quantity === 0 ? "/archive" : "/products", replace: true });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <form onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-4 max-w-4xl">
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="p-5 md:col-span-2 space-y-4">
          <h2 className="font-semibold">Basics</h2>
          <div className="space-y-1.5">
            <Label htmlFor="article_number">Article number</Label>
            <Input
              id="article_number"
              autoFocus
              maxLength={20}
              onInput={sanitizedInput(sanitizeArticleNumber)}
              {...register("article_number")}
              placeholder="Scan or type article number..."
            />
            {errors.article_number && (
              <p className="text-xs text-destructive">{errors.article_number.message}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Scanners auto-fill this field when focused.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="name">Product name</Label>
            <Input
              id="name"
              maxLength={30}
              onInput={sanitizedInput(sanitizeText)}
              {...register("name")}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <Field label="Brand">
              <Input
                list="sports-brand-options"
                maxLength={30}
                onInput={sanitizedInput(sanitizeText)}
                {...register("sub_brand")}
                placeholder="Choose or type a brand"
              />
              <datalist id="sports-brand-options">
                {sportsBrands.map((brand) => (
                  <option key={brand} value={brand} />
                ))}
              </datalist>
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
              <Input
                maxLength={30}
                onInput={sanitizedInput(sanitizeText)}
                {...register("product_division")}
              />
            </Field>
            <Field label="Product line">
              <Input
                maxLength={30}
                onInput={sanitizedInput(sanitizeText)}
                {...register("product_line")}
              />
            </Field>
            <Field label="Product type">
              <Input
                maxLength={30}
                onInput={sanitizedInput(sanitizeText)}
                {...register("product_type")}
              />
            </Field>
            <Field label="Color">
              <Input
                maxLength={20}
                onInput={sanitizedInput(sanitizeText)}
                {...register("color")}
              />
            </Field>
            <Field label="Size">
              <Input
                inputMode="decimal"
                maxLength={4}
                onInput={sanitizedInput(sanitizeSize)}
                {...register("size")}
                placeholder="42.5"
              />
              {errors.size && <p className="text-xs text-destructive">{errors.size.message}</p>}
            </Field>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              rows={4}
              maxLength={200}
              onInput={sanitizedInput(sanitizeText)}
              {...register("description")}
            />
            {errors.description && (
              <p className="text-xs text-destructive">{errors.description.message}</p>
            )}
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-5 space-y-3">
            <h2 className="font-semibold">Pricing & stock</h2>
            <Field label="Purchase price">
              <Input
                inputMode="decimal"
                placeholder="0.00"
                {...register("purchase_price")}
              />
              {errors.purchase_price && (
                <p className="text-xs text-destructive">{errors.purchase_price.message}</p>
              )}
            </Field>
            <Field label="Selling price">
              <Input
                inputMode="decimal"
                maxLength={6}
                placeholder="0.00"
                onInput={sanitizedInput(sanitizeMoney)}
                {...register("selling_price")}
              />
              {errors.selling_price && (
                <p className="text-xs text-destructive">{errors.selling_price.message}</p>
              )}
            </Field>
            <Field label="Quantity">
              <Input
                inputMode="numeric"
                maxLength={5}
                onInput={sanitizedInput(sanitizeInteger)}
                {...register("quantity")}
              />
              {errors.quantity && (
                <p className="text-xs text-destructive">{errors.quantity.message}</p>
              )}
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
