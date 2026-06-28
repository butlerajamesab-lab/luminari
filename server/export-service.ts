import { getPool } from './db';
import fs from 'fs';
import path from 'path';

export async function exportAll() {
  const pool = getPool();
  const tables = [
    "resources",
    "resource_contacts",
    "workflows",
    "workflow_steps",
    "workflow_step_agencies",
    "oversight_bodies",
    "oversight_contacts",
    "accountability_paths",
    "legal_statutes",
    "statute_oversight_links",
    "live_signals"
  ];

  const result: Record<string, any[]> = {};

  for (const table of tables) {
    try {
      const res = await pool.query(`SELECT * FROM ${table}`);
      result[table] = res.rows;
      console.log(`Exported ${table}: ${res.rows.length} rows`);
    } catch (error) {
      console.error(`Error exporting ${table}:`, error);
      result[table] = [];
    }
  }

  const exportPath = path.join(process.cwd(), 'luminari_full_export.json');
  fs.writeFileSync(exportPath, JSON.stringify(result, null, 2));
  console.log(`Full export saved to ${exportPath}`);
  return result;
}

export async function exportResourcesExpanded() {
  try {
    const pool = getPool();
    const res = await pool.query(`
      SELECT
        r.*,
        json_agg(json_build_object(
          'id', rc.id,
          'phone', rc.phone,
          'email', rc.email,
          'website', rc.website,
          'address', rc.address,
          'contact_label', rc.contact_label
        )) AS contacts
      FROM resources r
      LEFT JOIN resource_contacts rc ON rc.resource_id = r.id
      GROUP BY r.id
    `);
    
    const exportPath = path.join(process.cwd(), 'luminari_resources_expanded.json');
    fs.writeFileSync(exportPath, JSON.stringify(res.rows, null, 2));
    console.log(`Resources expanded export saved to ${exportPath}`);
    return res.rows;
  } catch (error) {
    console.error('Error exporting resources expanded:', error);
    return [];
  }
}

export async function exportWorkflowsExpanded() {
  try {
    const pool = getPool();
    const res = await pool.query(`
      SELECT
        wp.*,
        json_agg(json_build_object(
          'id', ws.id,
          'step_number', ws.step_number,
          'step_label', ws.step_label,
          'action', ws.action,
          'documents_needed', ws.documents_needed,
          'deadline', ws.deadline,
          'agencies', (
            SELECT json_agg(json_build_object(
              'agency_name', wsa.agency_name,
              'phone', wsa.phone,
              'email', wsa.email,
              'website', wsa.website
            ))
            FROM workflow_step_agencies wsa
            WHERE wsa.workflow_step_id = ws.id
          )
        )) AS steps
      FROM workflow_pipeline wp
      LEFT JOIN workflow_steps ws ON ws.workflow_pipeline_id = wp.id
      GROUP BY wp.id
    `);
    
    const exportPath = path.join(process.cwd(), 'luminari_workflows_expanded.json');
    fs.writeFileSync(exportPath, JSON.stringify(res.rows, null, 2));
    console.log(`Workflows expanded export saved to ${exportPath}`);
    return res.rows;
  } catch (error) {
    console.error('Error exporting workflows expanded:', error);
    return [];
  }
}

export async function exportAccountabilityExpanded() {
  try {
    const pool = getPool();
    const res = await pool.query(`
      SELECT
        ar.*,
        json_agg(json_build_object(
          'id', oc.id,
          'phone', oc.phone,
          'email', oc.email,
          'website', oc.website,
          'contact_label', oc.contact_label
        )) AS contacts
      FROM accountability_route ar
      LEFT JOIN oversight_contacts oc ON oc.oversight_body_id = ar.oversight_body_id
      GROUP BY ar.id
    `);
    
    const exportPath = path.join(process.cwd(), 'luminari_accountability_expanded.json');
    fs.writeFileSync(exportPath, JSON.stringify(res.rows, null, 2));
    console.log(`Accountability expanded export saved to ${exportPath}`);
    return res.rows;
  } catch (error) {
    console.error('Error exporting accountability expanded:', error);
    return [];
  }
}

export async function exportStatutesExpanded() {
  try {
    const pool = getPool();
    const res = await pool.query(`
      SELECT
        ls.*,
        json_agg(json_build_object(
          'id', sol.id,
          'oversight_body_id', sol.oversight_body_id,
          'oversight_name', ob.oversight_name
        )) AS linked_oversight
      FROM legal_statutes ls
      LEFT JOIN statute_oversight_links sol ON sol.statute_id = ls.id
      LEFT JOIN oversight_bodies ob ON ob.id = sol.oversight_body_id
      GROUP BY ls.id
    `);
    
    const exportPath = path.join(process.cwd(), 'luminari_statutes_expanded.json');
    fs.writeFileSync(exportPath, JSON.stringify(res.rows, null, 2));
    console.log(`Statutes expanded export saved to ${exportPath}`);
    return res.rows;
  } catch (error) {
    console.error('Error exporting statutes expanded:', error);
    return [];
  }
}
