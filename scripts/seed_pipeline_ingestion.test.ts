import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

function runPython(args: string[], cwd?: string) {
  return spawnSync("python", args, {
    cwd,
    encoding: "utf8",
  });
}

function createTempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function writeJson(path: string, payload: unknown) {
  writeFileSync(path, JSON.stringify(payload, null, 2));
}

const cleanup: string[] = [];
afterEach(() => {
  while (cleanup.length > 0) {
    const dir = cleanup.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("seed corpus registry pipeline scripts", () => {
  it("build_registry.py ingests mixed source fixtures and builds correlation coverage", () => {
    const root = createTempDir("luminari-build-registry-");
    cleanup.push(root);

    const inputsDir = join(root, "inputs");
    mkdirSync(inputsDir, { recursive: true });

    writeJson(join(inputsDir, "legal_case_law_priority1.json"), [
      { case_id: "case_1", case_name: "O'Brien v. State", summary: "legal case law" },
    ]);
    writeJson(join(inputsDir, "enforcement_operations.json"), [
      { enforcement_id: "enf_1", description: "enforcement agency action" },
    ]);
    writeFileSync(
      join(inputsDir, "intake_operations.jsonl"),
      [
        JSON.stringify({ intake_id: "in_1", note: "intake triage" }),
        JSON.stringify({ intake_id: "in_2", note: "intake follow-up" }),
      ].join("\n"),
    );
    writeFileSync(
      join(inputsDir, "weak_joints_registry.csv"),
      "weak_joint_id,description\nwj_1,weak joint diagnostic\n",
    );
    writeJson(join(inputsDir, "resource_directory.json"), [
      { resource_id: "res_1", name: "Legal resource", category: "resource" },
    ]);
    writeJson(join(inputsDir, "workflow_steps.json"), [
      { workflow_id: "wf_1", step: "workflow evidence intake" },
    ]);
    writeJson(join(inputsDir, "signal_events.json"), [
      { signal_id: "sig_1", signal: "signal convergence" },
    ]);
    writeJson(join(inputsDir, "advocacy_campaigns.json"), [
      { campaign_id: "camp_1", advocacy: "advocacy campaign" },
    ]);
    writeJson(join(inputsDir, "coalition_networks.json"), [
      { coalition_id: "coal_1", coalition: "coalition network" },
    ]);
    writeJson(join(inputsDir, "legislator_contacts.json"), [
      { legislator_id: "leg_1", legislator: "legislator contact" },
    ]);
    writeJson(join(inputsDir, "agencies_directory.json"), [
      { agency_id: "ag_1", agency: "agency oversight" },
    ]);
    writeJson(join(inputsDir, "targets_queue.json"), [
      { target_id: "tar_1", target: "target milestone" },
    ]);
    writeJson(join(inputsDir, "media_watch.json"), [
      { outlet_id: "media_1", media: "media reporting" },
    ]);
    writeJson(join(inputsDir, "campaign_timeline.json"), [
      { campaign_id: "camp_2", campaign: "campaign timeline" },
    ]);

    writeFileSync(
      join(inputsDir, "legal_seed.sql"),
      "INSERT INTO legal_case_law (case_id, case_name, summary) VALUES ('case_2', 'Case, With, Commas', 'quote-aware parser test'), ('case_3', 'Another ''Quoted'' Case', 'second row');",
    );

    writeFileSync(join(inputsDir, "duplicate_legal.json"), readFileSync(join(inputsDir, "legal_case_law_priority1.json")));

    const xlsxGenerator = runPython([
      "-c",
      `import zipfile, pathlib
root = pathlib.Path(r"${inputsDir}")
path = root / "resource_directory.xlsx"
with zipfile.ZipFile(path, "w") as z:
  z.writestr("[Content_Types].xml", """<?xml version='1.0' encoding='UTF-8'?>\n<Types xmlns='http://schemas.openxmlformats.org/package/2006/content-types'>\n<Default Extension='rels' ContentType='application/vnd.openxmlformats-package.relationships+xml'/>\n<Default Extension='xml' ContentType='application/xml'/>\n<Override PartName='/xl/workbook.xml' ContentType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml'/>\n<Override PartName='/xl/worksheets/sheet1.xml' ContentType='application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml'/>\n</Types>""")
  z.writestr("_rels/.rels", """<?xml version='1.0' encoding='UTF-8'?>\n<Relationships xmlns='http://schemas.openxmlformats.org/package/2006/relationships'>\n<Relationship Id='rId1' Type='http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument' Target='xl/workbook.xml'/>\n</Relationships>""")
  z.writestr("xl/workbook.xml", """<?xml version='1.0' encoding='UTF-8'?>\n<workbook xmlns='http://schemas.openxmlformats.org/spreadsheetml/2006/main' xmlns:r='http://schemas.openxmlformats.org/officeDocument/2006/relationships'>\n<sheets><sheet name='Resources' sheetId='1' r:id='rId1'/></sheets>\n</workbook>""")
  z.writestr("xl/_rels/workbook.xml.rels", """<?xml version='1.0' encoding='UTF-8'?>\n<Relationships xmlns='http://schemas.openxmlformats.org/package/2006/relationships'>\n<Relationship Id='rId1' Type='http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet' Target='worksheets/sheet1.xml'/>\n</Relationships>""")
  z.writestr("xl/worksheets/sheet1.xml", """<?xml version='1.0' encoding='UTF-8'?>\n<worksheet xmlns='http://schemas.openxmlformats.org/spreadsheetml/2006/main'>\n<sheetData>\n<row r='1'><c r='A1' t='str'><v>resource_id</v></c><c r='B1' t='str'><v>name</v></c></row>\n<row r='2'><c r='A2' t='str'><v>res_xlsx_1</v></c><c r='B2' t='str'><v>XLSX Resource</v></c></row>\n</sheetData>\n</worksheet>""")`,
    ]);
    expect(xlsxGenerator.status).toBe(0);

    const zipGenerator = runPython([
      "-c",
      `import zipfile, pathlib, json
root = pathlib.Path(r"${inputsDir}")
with zipfile.ZipFile(root / "advocacy_bundle.zip", "w") as z:
  z.writestr("advocacy_targets_import_snake_case.json", json.dumps([{"target_id":"zip_target_1","name":"Zip target"}]))`,
    ]);
    expect(zipGenerator.status).toBe(0);

    const spineDb = join(root, "spine.sqlite3");
    const spineInit = runPython([
      "-c",
      `import sqlite3
conn = sqlite3.connect(r"${spineDb}")
conn.execute("create table if not exists spine_marker(id integer primary key, marker text)")
conn.execute("insert into spine_marker(marker) values ('baseline')")
conn.commit()
conn.close()`,
    ]);
    expect(spineInit.status).toBe(0);

    const outputDb = join(root, "registry.sqlite3");
    const scriptPath = resolve(process.cwd(), "scripts/build_registry.py");
    const build = runPython([
      scriptPath,
      "--spine-db",
      spineDb,
      "--output-db",
      outputDb,
      "--inputs",
      inputsDir,
    ]);

    expect(build.status).toBe(0);
    expect(build.stdout).toContain("REGISTRY VERIFICATION SUMMARY");
    expect(build.stdout).toContain("top_tables=");

    const inspect = runPython([
      "-c",
      `import sqlite3, json
conn = sqlite3.connect(r"${outputDb}")
families = sorted([row[0] for row in conn.execute("select distinct family from registry_record")])
coverage = {row[0]: row[1] for row in conn.execute("select route_path, correlated_records from v_registry_coverage")}
views = sorted([row[0] for row in conn.execute("select name from sqlite_master where type='view' and name in ('v_registry_coverage','v_table_index')")])
duplicates = conn.execute("select count(*) from source_manifest where is_duplicate=1").fetchone()[0]
print(json.dumps({"families":families,"coverage":coverage,"views":views,"duplicates":duplicates}))
conn.close()`,
    ]);
    expect(inspect.status).toBe(0);

    const parsed = JSON.parse(inspect.stdout.trim()) as {
      families: string[];
      coverage: Record<string, number>;
      views: string[];
      duplicates: number;
    };

    expect(parsed.views).toEqual(["v_registry_coverage", "v_table_index"]);
    expect(parsed.duplicates).toBeGreaterThan(0);
    expect(parsed.families).toEqual(
      expect.arrayContaining([
        "legal",
        "enforcement",
        "intake",
        "weak_joints",
        "resources",
        "workflows",
        "signals",
        "advocacy",
        "coalition",
        "legislators",
        "agencies",
        "targets",
        "media",
        "campaigns",
      ]),
    );

    expect(parsed.coverage["/legal-library"]).toBeGreaterThan(0);
    expect(parsed.coverage["/enforcement-pathway"]).toBeGreaterThan(0);
    expect(parsed.coverage["/intake"]).toBeGreaterThan(0);
    expect(parsed.coverage["/resources"]).toBeGreaterThan(0);
    expect(parsed.coverage["/mission-control/governance"]).toBeGreaterThan(0);
  });

  it("advocacy_lane_import.py emits sectioned ON CONFLICT-safe SQL", () => {
    const root = createTempDir("luminari-advocacy-lane-");
    cleanup.push(root);

    writeJson(join(root, "sais_escalation_advocacy_registry.json"), {
      resources: [{ resource_id: "sais_1", name: "SAIS resource" }],
      routing_items: [{ route_id: "route_1", title: "Escalation path" }],
    });

    writeJson(join(root, "legal_case_law_priority1.json"), [
      { case_id: "law_1", case_name: "Priority Case", citation: "1 U.S. 1" },
    ]);

    writeFileSync(
      join(root, "20260417095403_023_seed_legislators_agencies_coalitions.sql"),
      [
        "INSERT INTO legislator_contacts (legislator_id, name, state, chamber, level, source) VALUES ('leg_023', 'Legislator 023', 'WA', 'House', 'federal', 'seed');",
        "INSERT INTO coalition_agencies (agency_id, name, jurisdiction, oversight_focus) VALUES ('agency_023', 'Agency 023', 'Federal', 'Oversight');",
        "INSERT INTO coalition_networks (coalition_id, name, description, source) VALUES ('coal_023', 'Coalition 023', 'Desc', 'seed');",
        "INSERT INTO advocacy_targets (target_id, name, target_type, jurisdiction, current_status, description, priority) VALUES ('target_023', 'Target 023', 'legislative', 'Federal', 'Active', 'Desc', 'High');",
      ].join("\n"),
    );

    const zipGenerator = runPython([
      "-c",
      `import zipfile, json, pathlib
root = pathlib.Path(r"${root}")
with zipfile.ZipFile(root / "lighthouse_legislators_complete(2).zip", "w") as z:
  z.writestr("legislators.json", json.dumps([{"legislator_id":"leg_zip_1","name":"Zip Legislator"}]))`,
    ]);
    expect(zipGenerator.status).toBe(0);

    writeJson(join(root, "coalition_agencies_import_snake_case.json"), [
      { agency_id: "agency_v2_1", name: "Agency V2", jurisdiction: "State", oversight_focus: "Focus" },
    ]);

    writeJson(join(root, "coalition_advocacy_orgs_import_snake_case.json"), [
      { org_id: "org_50_1", name: "Canonical Org" },
      { org_id: "org_shared", name: "Shared Org" },
    ]);

    writeJson(join(root, "advocacy_organizations_import_snake_case.json"), [
      { org_id: "org_shared", name: "Shared Org" },
      { org_id: "org_49_extra", name: "Extra From 49" },
    ]);

    writeJson(join(root, "advocacy_targets_import_snake_case.json"), [
      { target_id: "target_16_1", name: "Preferred Target", target_type: "regulatory_change", jurisdiction: "Federal", current_status: "Draft", description: "Target", priority: "High" },
    ]);

    writeJson(join(root, "coalition_intelligence_complete.REPAIRED.json"), {
      media_outlets: [{ outlet_id: "media_1", outlet_name: "Media One" }],
      campaigns: [{ campaign_id: "camp_1", campaign_name: "Campaign One", status_stage: "Draft", demand: "Demand" }],
    });

    const output = join(root, "supabase_import_unified.sql");
    const scriptPath = resolve(process.cwd(), "scripts/advocacy_lane_import.py");
    const generated = runPython([
      scriptPath,
      "--source-root",
      root,
      "--output",
      output,
    ]);

    expect(generated.status).toBe(0);
    expect(generated.stdout).toContain("generated=");

    const sql = readFileSync(output, "utf8");
    expect(sql).toContain("Authoritative advocacy/reform intelligence import lane");
    expect(sql).toContain("SAIS escalation resources and routing items");
    expect(sql).toContain("Case law priority corpus");
    expect(sql).toContain("Legislators");
    expect(sql).toContain("Agencies");
    expect(sql).toContain("Coalition networks");
    expect(sql).toContain("Advocacy organizations");
    expect(sql).toContain("Advocacy targets");
    expect(sql).toContain("Media outlets");
    expect(sql).toContain("Active campaigns");
    expect(sql).toContain("on conflict");

    const beginCount = (sql.match(/\nbegin;\n/gi) ?? []).length;
    const commitCount = (sql.match(/\ncommit;\n/gi) ?? []).length;
    expect(beginCount).toBe(commitCount);

    expect(sql).toContain("insert into legal_case_law");
    expect(sql).toContain("insert into legislator_contacts");
    expect(sql).toContain("insert into coalition_agencies");
    expect(sql).toContain("insert into coalition_networks");
    expect(sql).toContain("insert into advocacy_organizations");
    expect(sql).toContain("insert into advocacy_targets");
    expect(sql).toContain("insert into reform_media_outlets");
    expect(sql).toContain("insert into reform_campaigns");

    const sharedOrgOccurrences = (sql.match(/org_shared/g) ?? []).length;
    expect(sharedOrgOccurrences).toBe(2); // one in coalition_advocacy_orgs, one in deduped advocacy_organizations
  });
});
