import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getProduct } from "@/lib/data";
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
    queryFn: async () => getProduct({ data: { id } }),
  });

  return (
    <div className="space-y-4">
      <Link
        to="/products"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Products
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">Edit product</h1>
      {isLoading || !data ? (
        <Skeleton className="h-96" />
      ) : (
        <ProductForm
          initial={{
            id: data.id,
            barcode: data.barcode,
            article_number: data.article_number ?? undefined,
            name: data.name,
            model_name: data.model_name ?? undefined,
            category_id: data.category_id,
            key_category: data.key_category ?? undefined,
            age_group: data.age_group ?? undefined,
            gender: data.gender ?? undefined,
            sport: data.sport ?? undefined,
            marketing_line: data.marketing_line ?? undefined,
            product_division: data.product_division ?? undefined,
            product_line: data.product_line ?? undefined,
            product_type: data.product_type ?? undefined,
            sub_brand: data.sub_brand ?? undefined,
            color: data.color ?? undefined,
            size: data.size ?? undefined,
            purchase_price: Number(data.purchase_price),
            selling_price: Number(data.selling_price),
            quantity: data.quantity,
            min_stock: data.min_stock,
            description: data.description ?? undefined,
            images: data.images ?? [],
          }}
        />
      )}
    </div>
  );
}
