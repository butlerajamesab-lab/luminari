/**
 * Tribal council gate router.
 *
 * Server side of the gate in supabase/migrations/20261127100000_tribal_council_gate_v1.sql.
 * Three audiences, three surfaces:
 *
 *   admin.*    Luminari admins: see drafts, record a council's decision from
 *              its letter or resolution, keep council addresses, draft,
 *              approve and log letters. Two-step sign-in (aal2) required.
 *   council.*  People a council names, under any display name: see and
 *              decide on their own nation's page only. aal2 required.
 *   public.*   Reads tribal_council_gate_public_field_v1 only, i.e. what a
 *              council confirmed or wrote, in sections it opened.
 *
 * Every non-public read and every action writes to tribal_council_gate.access_log.
 * Every decision goes through tribal_council_gate.record_council_decision, so
 * the page always matches the append-only decision record.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { sql, type SQL } from "drizzle-orm";
import { router, publicProcedure, protectedProcedure, adminProcedure } from "../_core/trpc";
import type { TrpcContext } from "../_core/context";
import { db } from "../db";
import { build_council_letter, type letter_section_summary } from "../tribal-council-letter";

async function query_rows<T>(query: SQL): Promise<T[]> {
  const result = (await db.execute(query)) as unknown;
  if (Array.isArray(result)) return result as T[];
  if (result != null && Array.isArray((result as { rows?: unknown }).rows)) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

/**
 * Reads the assurance level from the caller's Supabase access token. The
 * token itself was already validated against Supabase auth when the context
 * was built (server/_core/context.ts); here we only read its aal claim.
 */
export function read_session_aal(req: TrpcContext["req"] | undefined): string | null {
  const header = req?.headers?.["x-lighthouse-supabase-session"] ?? req?.headers?.authorization;
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) return null;
  const token = String(raw).replace(/^Bearer\s+/i, "").trim();
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { aal?: unknown };
    return typeof claims.aal === "string" ? claims.aal : null;
  } catch {
    return null;
  }
}

function require_aal2(ctx: TrpcContext): string {
  const aal = read_session_aal(ctx.req);
  if (aal !== "aal2" || ctx.auth.auth_status !== "authenticated_profile_resolved") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "The tribal council gate needs two-step sign-in. Sign in again with your second factor and retry.",
    });
  }
  return aal;
}

const admin_gate = adminProcedure.use(({ ctx, next }) => {
  const aal = require_aal2(ctx);
  return next({ ctx: { ...ctx, aal } });
});

const council_gate = protectedProcedure.use(({ ctx, next }) => {
  const aal = require_aal2(ctx);
  return next({ ctx: { ...ctx, aal } });
});

const nation_key = z.string().min(3).max(120);
const section_key = z.string().regex(/^[a-z][a-z0-9_]{1,62}$/);

const decision_kind = z.enum([
  "confirm_field", "correct_field", "restrict_field", "replace_field", "reject_field",
  "add_field", "add_section", "rename_section", "remove_section", "reorder_sections",
  "set_display_name", "set_language", "unlock_section", "lock_section",
  "grant_public_display", "revoke_public_display", "revoke_all", "withdraw_participation",
  "resume_participation",
]);

const decision_input = z.object({
  nation_key,
  decision_kind,
  section_key: section_key.optional(),
  field_id: z.number().int().positive().optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
});

type access_action =
  | "view_page" | "view_section" | "view_letters" | "export" | "decide"
  | "draft_letter" | "approve_letter" | "mark_letter";

async function log_access(
  actor_kind: "admin" | "council_member",
  actor_ref: string,
  action: access_action,
  aal: string,
  nation: string | null,
  section: string | null = null,
): Promise<void> {
  await db.execute(sql`
    insert into tribal_council_gate.access_log (actor_kind, actor_ref, nation_key, section_key, access_action, aal)
    values (${actor_kind}, ${actor_ref}, ${nation}, ${section}, ${action}, ${aal})
  `);
}

function admin_ref(ctx: { user: { id: number; email: string | null } }): string {
  return `user:${ctx.user.id}${ctx.user.email ? `:${ctx.user.email}` : ""}`;
}

async function read_page(nation: string) {
  const [layout] = await query_rows<Record<string, unknown>>(sql`
    select l.*, r.nation_name, r.federal_status, r.website_url
    from tribal_council_gate.layout l
    join public.native_nation_registry_v1 r using (nation_key)
    where l.nation_key = ${nation}
  `);
  if (!layout) throw new TRPCError({ code: "NOT_FOUND", message: "No page is open for that nation." });
  const sections = await query_rows<Record<string, unknown>>(sql`
    select * from tribal_council_gate.section where nation_key = ${nation} order by display_order, section_key
  `);
  const fields = await query_rows<Record<string, unknown>>(sql`
    select field_id, section_key, field_key, value_text, language_tag, source_posture,
           citation_url, citation_title, display_order, field_state, superseded_by, created_at
    from tribal_council_gate.field
    where nation_key = ${nation} and field_state <> 'superseded'
    order by section_key, display_order, field_id
  `);
  return { layout, sections, fields };
}

async function record_decision(
  input: z.infer<typeof decision_input>,
  member_id: number | null,
  admin: string | null,
  basis: string,
): Promise<number> {
  try {
    const [row] = await query_rows<{ decision_id: string | number }>(sql`
      select tribal_council_gate.record_council_decision(
        ${input.nation_key}, ${input.decision_kind}, ${input.section_key ?? null}, ${input.field_id ?? null},
        ${JSON.stringify(input.payload)}::jsonb, ${member_id}, ${admin}, ${basis}
      ) as decision_id
    `);
    return Number(row.decision_id);
  } catch (error) {
    const code = (error as { code?: string }).code;
    const message = (error as Error).message;
    if (code === "42501") throw new TRPCError({ code: "FORBIDDEN", message });
    if (code === "22023" || code === "23514" || code === "P0001" || code === "23505") {
      throw new TRPCError({ code: "BAD_REQUEST", message });
    }
    throw error;
  }
}

async function council_membership(auth_user_id: string | null, nation: string) {
  if (!auth_user_id) return null;
  const [member] = await query_rows<{ member_id: string | number; member_role: string; display_name: string }>(sql`
    select member_id, member_role, display_name from tribal_council_gate.council_member
    where nation_key = ${nation} and auth_user_id = ${auth_user_id}::uuid and revoked_at is null
  `);
  return member ?? null;
}

export const tribal_council_gate_router = router({
  public: router({
    page: publicProcedure.input(z.object({ nation_key })).query(async ({ input }) => {
      const fields = await query_rows<Record<string, unknown>>(sql`
        select section_key, section_title, section_order, field_key, value_text, language_tag,
               source_posture, citation_url, citation_title, display_order
        from public.tribal_council_gate_public_field_v1
        where nation_key = ${input.nation_key}
        order by section_order, display_order
      `);
      const [layout] = await query_rows<{ display_name: string | null; primary_language_tag: string | null; section_order: string[] }>(sql`
        select display_name, primary_language_tag, section_order from tribal_council_gate.layout
        where nation_key = ${input.nation_key} and participation <> 'withdrawn'
      `);
      return { nation_key: input.nation_key, layout: fields.length ? layout ?? null : null, fields };
    }),
  }),

  council: router({
    my_nations: council_gate.query(async ({ ctx }) => {
      return query_rows<Record<string, unknown>>(sql`
        select m.nation_key, r.nation_name, m.member_role, m.display_name
        from tribal_council_gate.council_member m
        join public.native_nation_registry_v1 r using (nation_key)
        where m.auth_user_id = ${ctx.auth.supabase_user_id}::uuid and m.revoked_at is null
      `);
    }),
    page: council_gate.input(z.object({ nation_key })).query(async ({ ctx, input }) => {
      const member = await council_membership(ctx.auth.supabase_user_id, input.nation_key);
      if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "This page belongs to another nation." });
      await log_access("council_member", `member:${member.member_id}`, "view_page", ctx.aal, input.nation_key);
      return read_page(input.nation_key);
    }),
    decide: council_gate.input(decision_input).mutation(async ({ ctx, input }) => {
      const member = await council_membership(ctx.auth.supabase_user_id, input.nation_key);
      if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "This page belongs to another nation." });
      await log_access("council_member", `member:${member.member_id}`, "decide", ctx.aal, input.nation_key, input.section_key ?? null);
      const decision_id = await record_decision(input, Number(member.member_id), null, "decided in the council gate");
      return { decision_id };
    }),
  }),

  admin: router({
    nations: admin_gate.query(async ({ ctx }) => {
      await log_access("admin", admin_ref(ctx), "view_page", ctx.aal, null);
      return query_rows<Record<string, unknown>>(sql`
        select l.nation_key, r.nation_name, r.federal_status, l.participation, l.updated_at,
               (select count(*) from tribal_council_gate.field f where f.nation_key = l.nation_key and f.field_state <> 'superseded') as field_count,
               (select count(*) from tribal_council_gate.section s where s.nation_key = l.nation_key and s.public_display_permitted) as public_sections,
               (select max(o.drafted_at) from tribal_council_gate.outreach_letter o where o.nation_key = l.nation_key) as last_letter_at
        from tribal_council_gate.layout l
        join public.native_nation_registry_v1 r using (nation_key)
        order by r.nation_name
      `);
    }),
    page: admin_gate.input(z.object({ nation_key })).query(async ({ ctx, input }) => {
      await log_access("admin", admin_ref(ctx), "view_page", ctx.aal, input.nation_key);
      return read_page(input.nation_key);
    }),
    open_page: admin_gate.input(z.object({ nation_key })).mutation(async ({ ctx, input }) => {
      await log_access("admin", admin_ref(ctx), "decide", ctx.aal, input.nation_key);
      await db.execute(sql`select tribal_council_gate.open_nation_page(${input.nation_key})`);
      return { opened: input.nation_key };
    }),
    record_council_decision: admin_gate
      .input(decision_input.extend({ decision_basis: z.string().min(10).max(2000) }))
      .mutation(async ({ ctx, input }) => {
        await log_access("admin", admin_ref(ctx), "decide", ctx.aal, input.nation_key, input.section_key ?? null);
        const decision_id = await record_decision(input, null, admin_ref(ctx), input.decision_basis);
        return { decision_id };
      }),
    add_council_member: admin_gate
      .input(z.object({
        nation_key,
        auth_user_id: z.string().uuid(),
        display_name: z.string().min(1).max(120),
        member_role: z.enum(["council_reviewer", "council_approver"]),
        granted_basis: z.string().min(10).max(2000),
      }))
      .mutation(async ({ ctx, input }) => {
        await log_access("admin", admin_ref(ctx), "decide", ctx.aal, input.nation_key);
        const [row] = await query_rows<{ member_id: string | number }>(sql`
          insert into tribal_council_gate.council_member (nation_key, auth_user_id, display_name, member_role, granted_by, granted_basis)
          values (${input.nation_key}, ${input.auth_user_id}::uuid, ${input.display_name}, ${input.member_role}, ${admin_ref(ctx)}, ${input.granted_basis})
          returning member_id
        `);
        return { member_id: Number(row.member_id) };
      }),
    revoke_council_member: admin_gate
      .input(z.object({ member_id: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const [row] = await query_rows<{ nation_key: string }>(sql`
          update tribal_council_gate.council_member set revoked_at = now()
          where member_id = ${input.member_id} and revoked_at is null returning nation_key
        `);
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "No active member with that id." });
        await log_access("admin", admin_ref(ctx), "decide", ctx.aal, row.nation_key);
        return { revoked: input.member_id };
      }),
    add_contact: admin_gate
      .input(z.object({
        nation_key,
        addressee: z.string().min(2).max(200),
        mailing_address: z.string().max(500).optional(),
        email: z.string().email().optional(),
        phone: z.string().max(60).optional(),
        source_posture: z.enum(["own_website", "official_directory", "council_provided"]),
        source_url: z.string().url().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await log_access("admin", admin_ref(ctx), "decide", ctx.aal, input.nation_key);
        const [row] = await query_rows<{ contact_id: string | number }>(sql`
          insert into tribal_council_gate.council_contact (nation_key, addressee, mailing_address, email, phone, source_posture, source_url)
          values (${input.nation_key}, ${input.addressee}, ${input.mailing_address ?? null}, ${input.email ?? null},
                  ${input.phone ?? null}, ${input.source_posture}, ${input.source_url ?? null})
          returning contact_id
        `);
        return { contact_id: Number(row.contact_id) };
      }),
    letters: admin_gate.input(z.object({ nation_key: nation_key.optional() })).query(async ({ ctx, input }) => {
      await log_access("admin", admin_ref(ctx), "view_letters", ctx.aal, input.nation_key ?? null);
      return query_rows<Record<string, unknown>>(sql`
        select o.*, c.addressee, c.mailing_address, c.email
        from tribal_council_gate.outreach_letter o
        join tribal_council_gate.council_contact c using (contact_id)
        where ${input.nation_key ?? null}::text is null or o.nation_key = ${input.nation_key ?? null}
        order by o.drafted_at desc
      `);
    }),
    draft_letter: admin_gate
      .input(z.object({
        nation_key,
        contact_id: z.number().int().positive(),
        letter_kind: z.enum(["initial_invitation", "follow_up", "decision_confirmation", "withdrawal_confirmation"]),
        sender_name: z.string().min(2).max(120),
        sender_contact: z.string().min(3).max(300),
      }))
      .mutation(async ({ ctx, input }) => {
        const [contact] = await query_rows<{ addressee: string; mailing_address: string | null; nation_name: string }>(sql`
          select c.addressee, c.mailing_address, r.nation_name
          from tribal_council_gate.council_contact c
          join public.native_nation_registry_v1 r using (nation_key)
          where c.contact_id = ${input.contact_id} and c.nation_key = ${input.nation_key} and c.retired_at is null
        `);
        if (!contact) throw new TRPCError({ code: "NOT_FOUND", message: "No current address for that council." });
        const sections = await query_rows<{ section_title: string; field_count: string | number; source_pages: string[] | null }>(sql`
          select s.title as section_title, count(f.field_id) as field_count,
                 array_remove(array_agg(distinct f.citation_url), null) as source_pages
          from tribal_council_gate.section s
          left join tribal_council_gate.field f
            on f.nation_key = s.nation_key and f.section_key = s.section_key and f.field_state <> 'superseded'
          where s.nation_key = ${input.nation_key} and s.removed_by_council = false
          group by s.title, s.display_order order by s.display_order
        `);
        const decisions = input.letter_kind === "decision_confirmation"
          ? (await query_rows<{ line: string }>(sql`
              select decided_at::date || ': ' || replace(decision_kind, '_', ' ') ||
                     coalesce(' (' || section_key || ')', '') as line
              from tribal_council_gate.council_decision where nation_key = ${input.nation_key}
              order by decided_at desc limit 50
            `)).map((d) => d.line)
          : undefined;
        const summaries: letter_section_summary[] = sections.map((s) => ({
          section_title: s.section_title,
          field_count: Number(s.field_count),
          source_pages: s.source_pages ?? [],
        }));
        const letter = build_council_letter({
          letter_kind: input.letter_kind,
          nation_name: contact.nation_name,
          addressee: contact.addressee,
          mailing_address: contact.mailing_address,
          sections: summaries,
          sender_name: input.sender_name,
          sender_contact: input.sender_contact,
          letter_date: new Date().toISOString().slice(0, 10),
          decisions_summary: decisions,
        });
        await log_access("admin", admin_ref(ctx), "draft_letter", ctx.aal, input.nation_key);
        const [row] = await query_rows<{ letter_id: string | number }>(sql`
          insert into tribal_council_gate.outreach_letter (nation_key, contact_id, letter_kind, body_text, body_sha256, drafted_by)
          values (${input.nation_key}, ${input.contact_id}, ${input.letter_kind}, ${letter.body_text}, ${letter.body_sha256}, ${admin_ref(ctx)})
          returning letter_id
        `);
        return { letter_id: Number(row.letter_id), body_text: letter.body_text };
      }),
    approve_letter: admin_gate.input(z.object({ letter_id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const [row] = await query_rows<{ nation_key: string }>(sql`
        update tribal_council_gate.outreach_letter
           set letter_status = 'approved', approved_by = ${admin_ref(ctx)}, approved_at = now()
         where letter_id = ${input.letter_id} and letter_status = 'draft'
        returning nation_key
      `);
      if (!row) throw new TRPCError({ code: "BAD_REQUEST", message: "Only a draft letter can be approved." });
      await log_access("admin", admin_ref(ctx), "approve_letter", ctx.aal, row.nation_key);
      return { approved: input.letter_id };
    }),
    mark_letter: admin_gate
      .input(z.object({
        letter_id: z.number().int().positive(),
        letter_status: z.enum(["sent", "returned_undeliverable", "response_received", "cancelled"]),
        sent_method: z.enum(["postal_mail", "email", "hand_delivered"]).optional(),
        status_note: z.string().max(2000).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (input.letter_status === "sent" && !input.sent_method) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Say how the letter was sent." });
        }
        const [row] = await query_rows<{ nation_key: string }>(sql`
          update tribal_council_gate.outreach_letter
             set letter_status = ${input.letter_status},
                 sent_at = case when ${input.letter_status} = 'sent' then now() else sent_at end,
                 sent_method = coalesce(${input.sent_method ?? null}, sent_method),
                 response_received_at = case when ${input.letter_status} = 'response_received' then now() else response_received_at end,
                 status_note = coalesce(${input.status_note ?? null}, status_note)
           where letter_id = ${input.letter_id}
             and (${input.letter_status} <> 'sent' or letter_status = 'approved')
          returning nation_key
        `);
        if (!row) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "No such letter, or it has not been approved yet." });
        }
        await log_access("admin", admin_ref(ctx), "mark_letter", ctx.aal, row.nation_key);
        return { letter_id: input.letter_id, letter_status: input.letter_status };
      }),
    access_log: admin_gate
      .input(z.object({ nation_key: nation_key.optional(), limit: z.number().int().min(1).max(500).default(100) }))
      .query(async ({ ctx, input }) => {
        await log_access("admin", admin_ref(ctx), "view_page", ctx.aal, input.nation_key ?? null);
        return query_rows<Record<string, unknown>>(sql`
          select * from tribal_council_gate.access_log
          where ${input.nation_key ?? null}::text is null or nation_key = ${input.nation_key ?? null}
          order by accessed_at desc limit ${input.limit}
        `);
      }),
  }),
});
