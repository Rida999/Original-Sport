import { createFileRoute, Link } from "@tanstack/react-router";
import { ProductForm } from "@/components/products/product-form";
import { ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/products/new")({
  head: () => ({ meta: [{ title: "New product — SportsWear Inventory" }] }),
  component: NewProduct,
});

function NewProduct() {
  return (
    <div className="space-y-4">
      <Link to="/products" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" /> Products</Link>
      <h1 className="text-2xl font-semibold tracking-tight">New product</h1>
      <ProductForm />
    </div>
  );
}
