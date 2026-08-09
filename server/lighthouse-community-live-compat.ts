import { query_with_diagnostics } from "./db-legacy";

type live_spotlight_row = {
  id: number;
  eyebrow: string;
  title: string;
  description: string;
  color: string;
  cta: string;
  href: string | null;
  active: number | boolean;
  sortOrder: number;
  startDate: string | null;
  endDate: string | null;
  lat: string | number | null;
  lng: string | number | null;
  createdAt: number;
  updatedAt: number;
};

export type live_spotlight_input = {
  eyebrow: string;
  title: string;
  description: string;
  color: string;
  cta: string;
  href?: string | null;
  active: boolean;
  sortOrder: number;
  startDate?: number | null;
  endDate?: number | null;
};

export async function list_live_spotlight_items(active_only = true) {
  const { rows } = await query_with_diagnostics<live_spotlight_row>(
    `select
       id,
       eyebrow,
       title,
       description,
       color,
       cta,
       href,
       active,
       sort_order as "sortOrder",
       start_date as "startDate",
       end_date as "endDate",
       lat,
       lng,
       created_at as "createdAt",
       updated_at as "updatedAt"
     from public.lighthouse_spotlight
     where ($1::boolean is false or active = 1)
     order by sort_order asc, created_at desc`,
    [active_only],
    { label: "lighthouse_spotlight_live_list" },
  );

  return rows.map((row) => ({
    ...row,
    active: row.active === true || Number(row.active) === 1,
    lat: row.lat == null ? null : Number(row.lat),
    lng: row.lng == null ? null : Number(row.lng),
  }));
}

export async function create_live_spotlight_item(input: live_spotlight_input) {
  const now = Date.now();
  const { rows } = await query_with_diagnostics<{ id: number }>(
    `insert into public.lighthouse_spotlight
       (eyebrow, title, description, color, cta, href, active, sort_order,
        start_date, end_date, created_at, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
     returning id`,
    [
      input.eyebrow,
      input.title,
      input.description,
      input.color,
      input.cta,
      input.href ?? null,
      input.active ? 1 : 0,
      input.sortOrder,
      input.startDate == null ? null : String(input.startDate),
      input.endDate == null ? null : String(input.endDate),
      now,
    ],
    { label: "lighthouse_spotlight_live_create" },
  );
  return Number(rows[0]?.id);
}

export async function update_live_spotlight_item(
  id: number,
  input: Partial<live_spotlight_input>,
) {
  const assignments: string[] = [];
  const values: unknown[] = [];
  const add = (column: string, value: unknown) => {
    values.push(value);
    assignments.push(`${column} = $${values.length}`);
  };
  if (input.eyebrow !== undefined) add("eyebrow", input.eyebrow);
  if (input.title !== undefined) add("title", input.title);
  if (input.description !== undefined) add("description", input.description);
  if (input.color !== undefined) add("color", input.color);
  if (input.cta !== undefined) add("cta", input.cta);
  if (input.href !== undefined) add("href", input.href);
  if (input.active !== undefined) add("active", input.active ? 1 : 0);
  if (input.sortOrder !== undefined) add("sort_order", input.sortOrder);
  if (input.startDate !== undefined) add("start_date", input.startDate == null ? null : String(input.startDate));
  if (input.endDate !== undefined) add("end_date", input.endDate == null ? null : String(input.endDate));
  add("updated_at", Date.now());
  values.push(id);
  await query_with_diagnostics(
    `update public.lighthouse_spotlight
        set ${assignments.join(", ")}
      where id = $${values.length}`,
    values,
    { label: "lighthouse_spotlight_live_update" },
  );
}

export async function delete_live_spotlight_item(id: number) {
  await query_with_diagnostics(
    `delete from public.lighthouse_spotlight where id = $1`,
    [id],
    { label: "lighthouse_spotlight_live_delete" },
  );
}
