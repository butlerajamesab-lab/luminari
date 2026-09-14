import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("./db-legacy", () => ({ getPool: () => ({ query: state.query }) }));
import { createBenefitApplication } from "./benefit-applications-live-compat";

const database = new PGlite();
beforeAll(async () => {
  state.query.mockImplementation((sql: string, values: unknown[]) => database.query(sql, values));
  await database.exec(`
    create table cases (id integer primary key, user_id integer);
    insert into cases values (12, 7), (13, 8);
    create table benefit_applications (
      id serial primary key, user_id integer, case_id text, program_id text, program_name text,
      benefit_app_status text, state_code text, applied_at bigint, decision_at bigint,
      next_deadline bigint, deadline_label text, notes text, denial_reason text,
      application_url text, confirmation_number text, documents_needed text, documents_submitted text,
      created_at bigint, updated_at bigint
    );
  `);
});
afterAll(() => database.close());

describe("benefit application case binding", () => {
  it("preserves the string program identity and known case in the stored application", async () => {
    const result = await createBenefitApplication({ userId: 7, caseId: 12, programId: "fed_benefit_snap", programName: "SNAP", stateCode: "CO", documentsNeeded: ["Notice"] });
    expect(result).toMatchObject({ caseId: 12, programId: "fed_benefit_snap", stateCode: "CO", documentsNeeded: ["Notice"] });
    const stored = await database.query("select case_id, program_id, user_id from benefit_applications where id=$1", [result.id]);
    expect(stored.rows).toEqual([{ case_id: "12", program_id: "fed_benefit_snap", user_id: 7 }]);
  });

  it("rejects another owner's case inside the insert and leaves no orphan association", async () => {
    await expect(createBenefitApplication({ userId: 7, caseId: 13, programId: "denied-test", programName: "Test" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const rows = await database.query("select id from benefit_applications where program_id='denied-test'");
    expect(rows.rows).toEqual([]);
  });

  it("continues to allow personal tracking without claiming a case association", async () => {
    const result = await createBenefitApplication({ userId: 7, programId: "personal-test", programName: "Test" });
    expect(result.caseId).toBeNull();
  });
});
