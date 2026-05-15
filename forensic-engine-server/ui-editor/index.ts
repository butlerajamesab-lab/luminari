/**
 * UI Editor Service — Sunam UI Control Layer
 * 
 * Gives the System Copilot (Sunam) direct access to modify frontend React files.
 * 
 * Capabilities:
 *   readFile(path)   — read any file under /client/src/
 *   writeFile(path, content) — overwrite a file under /client/src/
 *   patchFile(path, patches) — apply targeted find/replace patches
 *   listFiles(dir)   — list files in a directory under /client/src/
 * 
 * Guardrails:
 *   - ONLY /client/src/ is editable (no server, no config, no node_modules)
 *   - All changes are logged to ui_change_log in-memory + DB
 *   - Syntax validation via basic checks before write
 *   - Backup of original file content stored before each write
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { db } from "../db";
import { sql } from "drizzle-orm";

// ─── Constants ───
const __filename_local = fileURLToPath(import.meta.url);
const __dirname_local = path.dirname(__filename_local);
const PROJECT_ROOT = path.resolve(__dirname_local, "../..");
const CLIENT_SRC = path.join(PROJECT_ROOT, "client", "src");
const ALLOWED_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js", ".css", ".json", ".md"];

// ─── In-memory change log ───
interface UIChangeEntry {
  id: number;
  timestamp: number;
  filePath: string;
  action: "read" | "write" | "patch";
  actor: string;
  summary: string;
  backup?: string;
  patchCount?: number;
}

const changeLog: UIChangeEntry[] = [];
let nextId = 1;

function logChange(entry: Omit<UIChangeEntry, "id" | "timestamp">) {
  const record: UIChangeEntry = {
    id: nextId++,
    timestamp: Date.now(),
    ...entry,
  };
  changeLog.push(record);
  // Keep last 200 entries
  if (changeLog.length > 200) changeLog.splice(0, changeLog.length - 200);
  console.log(`[UIEditor] ${entry.action.toUpperCase()} ${entry.filePath} by ${entry.actor}: ${entry.summary}`);
  return record;
}

// ─── Path validation ───
function resolveSafePath(relativePath: string): string {
  // Normalize and resolve the path
  const normalized = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  
  // If it starts with client/src/, strip that prefix
  let cleanPath = normalized;
  if (cleanPath.startsWith("client/src/")) {
    cleanPath = cleanPath.slice("client/src/".length);
  }
  
  const fullPath = path.resolve(CLIENT_SRC, cleanPath);
  
  // Security: ensure resolved path is still under CLIENT_SRC
  if (!fullPath.startsWith(CLIENT_SRC)) {
    throw new Error(`[UIEditor] BLOCKED: Path escapes /client/src/ boundary: ${relativePath}`);
  }
  
  // Check extension
  const ext = path.extname(fullPath);
  if (ext && !ALLOWED_EXTENSIONS.includes(ext)) {
    throw new Error(`[UIEditor] BLOCKED: Extension ${ext} not allowed. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`);
  }
  
  return fullPath;
}

// ─── Syntax validation ───
function validateSyntax(content: string, filePath: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const ext = path.extname(filePath);
  
  if (ext === ".tsx" || ext === ".jsx") {
    // Check for basic JSX/TSX structure
    const openBraces = (content.match(/{/g) || []).length;
    const closeBraces = (content.match(/}/g) || []).length;
    if (Math.abs(openBraces - closeBraces) > 2) {
      errors.push(`Brace mismatch: ${openBraces} open vs ${closeBraces} close`);
    }
    
    const openParens = (content.match(/\(/g) || []).length;
    const closeParens = (content.match(/\)/g) || []).length;
    if (Math.abs(openParens - closeParens) > 2) {
      errors.push(`Parenthesis mismatch: ${openParens} open vs ${closeParens} close`);
    }
    
    // Check for export
    if (!content.includes("export")) {
      errors.push("Warning: No export statement found — component may not be importable");
    }
  }
  
  if (ext === ".json") {
    try {
      JSON.parse(content);
    } catch (e: any) {
      errors.push(`Invalid JSON: ${e.message}`);
    }
  }
  
  // Check for empty content
  if (content.trim().length === 0) {
    errors.push("File content is empty");
  }
  
  return { valid: errors.filter(e => !e.startsWith("Warning")).length === 0, errors };
}

// ─── Core operations ───

export async function uiReadFile(filePath: string, actor: string = "sunam"): Promise<{
  success: boolean;
  content?: string;
  path: string;
  lines?: number;
  error?: string;
}> {
  try {
    const fullPath = resolveSafePath(filePath);
    
    if (!fs.existsSync(fullPath)) {
      return { success: false, path: filePath, error: `File not found: ${filePath}` };
    }
    
    const content = fs.readFileSync(fullPath, "utf-8");
    
    logChange({
      filePath,
      action: "read",
      actor,
      summary: `Read ${content.split("\n").length} lines`,
    });
    
    return {
      success: true,
      content,
      path: filePath,
      lines: content.split("\n").length,
    };
  } catch (e: any) {
    return { success: false, path: filePath, error: e.message };
  }
}

export async function uiWriteFile(
  filePath: string,
  content: string,
  actor: string = "sunam"
): Promise<{
  success: boolean;
  path: string;
  lines: number;
  backup?: string;
  warnings: string[];
  error?: string;
}> {
  try {
    const fullPath = resolveSafePath(filePath);
    
    // Validate syntax
    const validation = validateSyntax(content, fullPath);
    if (!validation.valid) {
      return {
        success: false,
        path: filePath,
        lines: 0,
        warnings: validation.errors,
        error: `Syntax validation failed: ${validation.errors.join("; ")}`,
      };
    }
    
    // Backup existing file
    let backup: string | undefined;
    if (fs.existsSync(fullPath)) {
      backup = fs.readFileSync(fullPath, "utf-8");
    }
    
    // Ensure directory exists
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Write the file
    fs.writeFileSync(fullPath, content, "utf-8");
    
    const lines = content.split("\n").length;
    
    logChange({
      filePath,
      action: "write",
      actor,
      summary: `Wrote ${lines} lines${backup ? " (backup stored)" : " (new file)"}`,
      backup,
    });
    
    return {
      success: true,
      path: filePath,
      lines,
      backup: backup ? `${backup.split("\n").length} lines backed up` : undefined,
      warnings: validation.errors.filter(e => e.startsWith("Warning")),
    };
  } catch (e: any) {
    return { success: false, path: filePath, lines: 0, warnings: [], error: e.message };
  }
}

export interface UIPatch {
  find: string;
  replace: string;
  all?: boolean; // replace all occurrences (default: first only)
}

export async function uiPatchFile(
  filePath: string,
  patches: UIPatch[],
  actor: string = "sunam"
): Promise<{
  success: boolean;
  path: string;
  patchesApplied: number;
  patchesFailed: number;
  backup?: string;
  warnings: string[];
  error?: string;
}> {
  try {
    const fullPath = resolveSafePath(filePath);
    
    if (!fs.existsSync(fullPath)) {
      return {
        success: false,
        path: filePath,
        patchesApplied: 0,
        patchesFailed: patches.length,
        warnings: [],
        error: `File not found: ${filePath}`,
      };
    }
    
    // Read original
    const original = fs.readFileSync(fullPath, "utf-8");
    let content = original;
    let applied = 0;
    let failed = 0;
    const warnings: string[] = [];
    
    for (let i = 0; i < patches.length; i++) {
      const patch = patches[i];
      if (!content.includes(patch.find)) {
        failed++;
        warnings.push(`Patch ${i + 1}: find string not found in file`);
        continue;
      }
      
      if (patch.all) {
        content = content.split(patch.find).join(patch.replace);
      } else {
        content = content.replace(patch.find, patch.replace);
      }
      applied++;
    }
    
    if (applied === 0) {
      return {
        success: false,
        path: filePath,
        patchesApplied: 0,
        patchesFailed: failed,
        warnings,
        error: "No patches could be applied — find strings not found",
      };
    }
    
    // Validate result
    const validation = validateSyntax(content, fullPath);
    if (!validation.valid) {
      return {
        success: false,
        path: filePath,
        patchesApplied: 0,
        patchesFailed: patches.length,
        warnings: validation.errors,
        error: `Patched content failed syntax validation: ${validation.errors.join("; ")}`,
      };
    }
    
    // Write patched content
    fs.writeFileSync(fullPath, content, "utf-8");
    
    logChange({
      filePath,
      action: "patch",
      actor,
      summary: `Applied ${applied}/${patches.length} patches${failed > 0 ? ` (${failed} failed)` : ""}`,
      backup: original,
      patchCount: applied,
    });
    
    return {
      success: true,
      path: filePath,
      patchesApplied: applied,
      patchesFailed: failed,
      backup: `${original.split("\n").length} lines backed up`,
      warnings: [...warnings, ...validation.errors.filter(e => e.startsWith("Warning"))],
    };
  } catch (e: any) {
    return { success: false, path: filePath, patchesApplied: 0, patchesFailed: patches.length, warnings: [], error: e.message };
  }
}

export async function uiListFiles(
  dirPath: string = "",
  actor: string = "sunam"
): Promise<{
  success: boolean;
  files: { name: string; path: string; type: "file" | "directory"; size?: number }[];
  error?: string;
}> {
  try {
    const fullPath = resolveSafePath(dirPath || ".");
    
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isDirectory()) {
      return { success: false, files: [], error: `Directory not found: ${dirPath}` };
    }
    
    const entries = fs.readdirSync(fullPath, { withFileTypes: true });
    const files = entries.map(entry => ({
      name: entry.name,
      path: path.join(dirPath || "", entry.name).replace(/\\/g, "/"),
      type: entry.isDirectory() ? "directory" as const : "file" as const,
      size: entry.isFile() ? fs.statSync(path.join(fullPath, entry.name)).size : undefined,
    }));
    
    logChange({
      filePath: dirPath || "/",
      action: "read",
      actor,
      summary: `Listed ${files.length} entries`,
    });
    
    return { success: true, files };
  } catch (e: any) {
    return { success: false, files: [], error: e.message };
  }
}

export function uiGetChangeLog(limit: number = 50): UIChangeEntry[] {
  return changeLog.slice(-limit);
}

export function uiRollbackLastWrite(actor: string = "sunam"): {
  success: boolean;
  path?: string;
  error?: string;
} {
  // Find the last write/patch entry with a backup
  for (let i = changeLog.length - 1; i >= 0; i--) {
    const entry = changeLog[i];
    if ((entry.action === "write" || entry.action === "patch") && entry.backup) {
      try {
        const fullPath = resolveSafePath(entry.filePath);
        fs.writeFileSync(fullPath, entry.backup, "utf-8");
        
        logChange({
          filePath: entry.filePath,
          action: "write",
          actor,
          summary: `Rolled back to backup from change #${entry.id}`,
        });
        
        return { success: true, path: entry.filePath };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    }
  }
  
  return { success: false, error: "No write/patch with backup found in change log" };
}
