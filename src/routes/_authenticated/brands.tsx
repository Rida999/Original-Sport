import { createFileRoute } from "@tanstack/react-router";
import { SimpleCrud } from "@/components/crud/simple-crud";

export const Route = createFileRoute("/_authenticated/brands")({
  head: () => ({ meta: [{ title: "Brands — SportsWear Inventory" }] }),
  component: () => <SimpleCrud table="brands" singular="Brand" plural="Brands" />,
});
