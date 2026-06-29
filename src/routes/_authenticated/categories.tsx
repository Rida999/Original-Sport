import { createFileRoute } from "@tanstack/react-router";
import { SimpleCrud } from "@/components/crud/simple-crud";

export const Route = createFileRoute("/_authenticated/categories")({
  head: () => ({ meta: [{ title: "Categories — SportsWear Inventory" }] }),
  component: () => <SimpleCrud table="categories" singular="Category" plural="Categories" />,
});
