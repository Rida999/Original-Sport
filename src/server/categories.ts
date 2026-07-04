import { createServerFn } from "@tanstack/react-start";

import { slugify } from "@/lib/format";

export type CrudTable = "categories";
export type CrudRow = { id: string; name: string; slug: string; description: string | null };

export const listCrud = createServerFn({ method: "GET" })
  .validator((data: { table: CrudTable }) => data)
  .handler(async ({ data }) => {
    const { query } = await import("./db.server");
    return query<CrudRow>(`select id, name, slug, description from ${data.table} order by name`);
  });

export const saveCrud = createServerFn({ method: "POST" })
  .validator(
    (data: { table: CrudTable; id?: string; name: string; description?: string | null }) => data,
  )
  .handler(async ({ data }) => {
    const { one } = await import("./db.server");
    const payload = {
      name: data.name.trim(),
      slug: slugify(data.name),
      description: data.description?.trim() || null,
    };
    if (data.id) {
      await one(
        `update ${data.table} set name = $1, slug = $2, description = $3 where id = $4 returning id`,
        [payload.name, payload.slug, payload.description, data.id],
      );
      return;
    }
    await one(
      `insert into ${data.table} (name, slug, description) values ($1, $2, $3) returning id`,
      [payload.name, payload.slug, payload.description],
    );
  });

export const deleteCrud = createServerFn({ method: "POST" })
  .validator((data: { table: CrudTable; id: string }) => data)
  .handler(async ({ data }) => {
    const { query } = await import("./db.server");
    await query(`delete from ${data.table} where id = $1`, [data.id]);
  });

export const listCategoryOptions = createServerFn({ method: "GET" }).handler(async () => {
  const { query } = await import("./db.server");
  return query<{ id: string; name: string }>("select id, name from categories order by name");
});
