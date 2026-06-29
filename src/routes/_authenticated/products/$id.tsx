import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ProductForm } from "@/components/products/product-form";
import { ChevronLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/products/$id")({
  head: () => ({ meta: [{ title: "Edit product — SportsWear Inventory" }] }),
  component: EditProduct,
});

function EditProduct() {
  const { id } = Route.useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["product", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-4">
      <Link to="/products" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" /> Products</Link>
      <h1 className="text-2xl font-semibold tracking-tight">Edit product</h1>
      {isLoading || !data ? <Skeleton className="h-96" /> : (
        <ProductForm initial={{
          id: data.id,
          barcode: data.barcode,
          name: data.name,
          brand_id: data.brand_id,
          category_id: data.category_id,
          gender: data.gender ?? undefined,
          sport: data.sport ?? undefined,
          color: data.color ?? undefined,
          size: data.size ?? undefined,
          purchase_price: Number(data.purchase_price),
          selling_price: Number(data.selling_price),
          quantity: data.quantity,
          min_stock: data.min_stock,
          description: data.description ?? undefined,
          images: data.images ?? [],
        }} />
      )}
    </div>
  );
}
