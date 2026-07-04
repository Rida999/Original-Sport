import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Archive, Pencil, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { listArchivedProducts, type ProductGender } from "@/server/products";
import { money } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/archive")({
  head: () => ({ meta: [{ title: "Archive — SportsWear Inventory" }] }),
  component: ArchivePage,
});

function ArchivePage() {
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["archive"],
    queryFn: async () => listArchivedProducts(),
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    const term = q.toLowerCase().trim();
    if (!term) return data;
    return data.filter((p) =>
      [p.name, p.model_name, p.article_number, p.barcode, p.product_type, p.category?.name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [data, q]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Archive</h1>
          <p className="text-sm text-muted-foreground">{data?.length ?? 0} out of stock</p>
        </div>
        <Badge
          variant="outline"
          className="bg-destructive/15 text-destructive border-destructive/30"
        >
          <Archive className="size-3.5 mr-1.5" />
          Out of stock
        </Badge>
      </div>

      <div className="relative max-w-md">
        <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search archived products..."
          value={q}
          onChange={(event) => setQ(event.target.value)}
        />
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr className="text-left">
                <th className="p-3 font-medium">Product</th>
                <th className="p-3 font-medium">Barcode</th>
                <th className="p-3 font-medium">Category</th>
                <th className="p-3 font-medium">Gender</th>
                <th className="p-3 font-medium text-right">Price</th>
                <th className="p-3 font-medium">Last updated</th>
                <th className="p-3 w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading &&
                Array.from({ length: 5 }).map((_, index) => (
                  <tr key={index}>
                    <td colSpan={7} className="p-3">
                      <Skeleton className="h-8" />
                    </td>
                  </tr>
                ))}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-muted-foreground">
                    No archived products.
                  </td>
                </tr>
              )}
              {filtered.map((product) => (
                <tr key={product.id} className="hover:bg-muted/30">
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      <div className="size-10 rounded-md border bg-white p-1 overflow-hidden shrink-0">
                        {product.images?.[0] && (
                          <img
                            src={product.images[0]}
                            alt=""
                            className="size-full object-contain"
                          />
                        )}
                      </div>
                      <span className="font-medium">{product.name}</span>
                    </div>
                  </td>
                  <td className="p-3 font-mono text-xs text-muted-foreground">
                    {product.article_number ?? product.barcode}
                  </td>
                  <td className="p-3">{product.category?.name ?? "-"}</td>
                  <td className="p-3">{formatGender(product.gender)}</td>
                  <td className="p-3 text-right tabular-nums">{money(product.selling_price)}</td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {new Date(product.updated_at).toLocaleString()}
                  </td>
                  <td className="p-3">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => navigate({ to: "/products/$id", params: { id: product.id } })}
                    >
                      <Pencil className="size-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function formatGender(gender: ProductGender | null | undefined) {
  if (!gender) return "-";
  return gender.charAt(0).toUpperCase() + gender.slice(1);
}
