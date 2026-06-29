import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { generateBarcode } from "@/lib/format";
import { Upload, X, Wand2 } from "lucide-react";

const schema = z.object({
  barcode: z.string().min(3, "Required"),
  name: z.string().min(2, "Required").max(200),
  brand_id: z.string().uuid().nullable().optional(),
  category_id: z.string().uuid().nullable().optional(),
  gender: z.enum(["men", "women", "unisex", "kids"]).nullable().optional(),
  sport: z.string().max(100).optional(),
  color: z.string().max(50).optional(),
  size: z.string().max(50).optional(),
  purchase_price: z.coerce.number().min(0),
  selling_price: z.coerce.number().min(0),
  quantity: z.coerce.number().int().min(0),
  min_stock: z.coerce.number().int().min(0),
  description: z.string().max(2000).optional(),
});

type Values = z.infer<typeof schema>;

export type ProductDefault = Partial<Values> & { id?: string; images?: string[] };

export function ProductForm({ initial }: { initial?: ProductDefault }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [images, setImages] = useState<string[]>(initial?.images ?? []);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const barcodeRef = useRef<HTMLInputElement>(null);

  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      barcode: initial?.barcode ?? "",
      name: initial?.name ?? "",
      brand_id: initial?.brand_id ?? null,
      category_id: initial?.category_id ?? null,
      gender: initial?.gender ?? null,
      sport: initial?.sport ?? "",
      color: initial?.color ?? "",
      size: initial?.size ?? "",
      purchase_price: Number(initial?.purchase_price ?? 0),
      selling_price: Number(initial?.selling_price ?? 0),
      quantity: Number(initial?.quantity ?? 0),
      min_stock: Number(initial?.min_stock ?? 5),
      description: initial?.description ?? "",
    },
  });

  const { data: brands } = useQuery({ queryKey: ["brands-list"], queryFn: async () => (await supabase.from("brands").select("id,name").order("name")).data ?? [] });
  const { data: categories } = useQuery({ queryKey: ["categories-list"], queryFn: async () => (await supabase.from("categories").select("id,name").order("name")).data ?? [] });

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop();
        const path = `${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from("product-images").upload(path, file);
        if (error) throw error;
        const { data } = await supabase.storage.from("product-images").createSignedUrl(path, 60 * 60 * 24 * 365);
        if (data?.signedUrl) uploaded.push(data.signedUrl);
      }
      setImages((prev) => [...prev, ...uploaded]);
      toast.success(`${uploaded.length} image(s) uploaded`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setUploading(false); }
  };

  const save = useMutation({
    mutationFn: async (values: Values) => {
      const payload = {
        ...values,
        gender: values.gender || null,
        brand_id: values.brand_id || null,
        category_id: values.category_id || null,
        sport: values.sport || null,
        color: values.color || null,
        size: values.size || null,
        description: values.description || null,
        images,
        status: (values.quantity === 0 ? "out_of_stock" : "available") as "out_of_stock" | "available",
      };
      if (initial?.id) {
        const { error } = await supabase.from("products").update(payload).eq("id", initial.id);
        if (error) throw error;
        return initial.id;
      } else {
        const { data, error } = await supabase.from("products").insert(payload).select("id").single();
        if (error) throw error;
        // Log activity
        const { data: ures } = await supabase.auth.getUser();
        if (ures.user) await supabase.from("activity_logs").insert({ user_id: ures.user.id, action: "created", entity_type: "product", entity_id: data.id, metadata: { name: values.name } });
        return data.id;
      }
    },
    onSuccess: () => {
      toast.success(initial?.id ? "Product updated" : "Product created");
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      navigate({ to: "/products" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <form onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-4 max-w-4xl">
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="p-5 md:col-span-2 space-y-4">
          <h2 className="font-semibold">Basics</h2>
          <div className="space-y-1.5">
            <Label htmlFor="barcode">Barcode</Label>
            <div className="flex gap-2">
              <Input id="barcode" autoFocus {...register("barcode")} ref={(el) => { register("barcode").ref(el); barcodeRef.current = el; }} placeholder="Scan or type…" />
              <Button type="button" variant="outline" onClick={() => { const code = generateBarcode(); setValue("barcode", code, { shouldValidate: true }); }}>
                <Wand2 className="size-4 mr-1.5" /> Generate
              </Button>
            </div>
            {errors.barcode && <p className="text-xs text-destructive">{errors.barcode.message}</p>}
            <p className="text-xs text-muted-foreground">USB barcode scanners auto-fill this field when focused.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="name">Product name</Label>
            <Input id="name" {...register("name")} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <Field label="Brand">
              <Select value={watch("brand_id") ?? ""} onValueChange={(v) => setValue("brand_id", v || null)}>
                <SelectTrigger><SelectValue placeholder="Select brand" /></SelectTrigger>
                <SelectContent>{brands?.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Category">
              <Select value={watch("category_id") ?? ""} onValueChange={(v) => setValue("category_id", v || null)}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>{categories?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Gender">
              <Select value={watch("gender") ?? ""} onValueChange={(v) => setValue("gender", (v || null) as Values["gender"])}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="men">Men</SelectItem><SelectItem value="women">Women</SelectItem>
                  <SelectItem value="unisex">Unisex</SelectItem><SelectItem value="kids">Kids</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Sport"><Input {...register("sport")} placeholder="Running, Basketball…" /></Field>
            <Field label="Color"><Input {...register("color")} /></Field>
            <Field label="Size"><Input {...register("size")} placeholder="M, 42, 10.5…" /></Field>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" rows={4} {...register("description")} />
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-5 space-y-3">
            <h2 className="font-semibold">Pricing & stock</h2>
            <Field label="Purchase price"><Input type="number" step="0.01" {...register("purchase_price")} /></Field>
            <Field label="Selling price"><Input type="number" step="0.01" {...register("selling_price")} /></Field>
            <Field label="Quantity"><Input type="number" {...register("quantity")} /></Field>
            <Field label="Minimum stock"><Input type="number" {...register("min_stock")} /></Field>
          </Card>

          <Card className="p-5 space-y-3">
            <h2 className="font-semibold">Images</h2>
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleUpload(e.target.files)} />
            <Button type="button" variant="outline" className="w-full" disabled={uploading} onClick={() => fileRef.current?.click()}>
              <Upload className="size-4 mr-1.5" /> {uploading ? "Uploading…" : "Upload images"}
            </Button>
            {images.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {images.map((src, i) => (
                  <div key={i} className="relative aspect-square rounded-md overflow-hidden bg-muted group">
                    <img src={src} alt="" className="size-full object-cover" />
                    <button type="button" onClick={() => setImages((p) => p.filter((_, j) => j !== i))} className="absolute top-1 right-1 size-6 rounded-full bg-background/80 grid place-items-center opacity-0 group-hover:opacity-100">
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
        <Button type="button" variant="ghost" onClick={() => navigate({ to: "/products" })}>Cancel</Button>
        <Button type="submit" disabled={isSubmitting || save.isPending}>{initial?.id ? "Save changes" : "Save product"}</Button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
