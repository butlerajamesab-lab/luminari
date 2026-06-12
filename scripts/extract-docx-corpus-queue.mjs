#!/usr/bin/env node
import "dotenv/config";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  createPool,
  getTableColumns,
  repoRoot,
  tableExists,
} from "./lib/corpus-audit-utils.mjs";

const execFileAsync = promisify(execFile);
const artifactDir = path.join(repoRoot, "artifacts", "corpus-audit");
const jsonReportPath = path.join(artifactDir, "docx-extraction-report.json");
const csvReportPath = path.join(artifactDir, "docx-extraction-report.csv");

function parseArgs(argv = process.argv.slice(2)) {
  const args = { dryRun: false, apply: false, jsonOnly: false, id: null };
  for (const arg of argv) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--apply") args.apply = true;
    else if (arg === "--json") args.jsonOnly = true;
    else if (arg.startsWith("--id=")) args.id = Number.parseInt(arg.slice("--id=".length), 10);
  }
  if (args.id !== null && (!Number.isInteger(args.id) || args.id <= 0)) throw new Error("--id must be a positive integer.");
  if (!args.apply) args.dryRun = true;
  if (args.apply && args.dryRun) throw new Error("Choose either --dry-run or --apply, not both.");
  return args;
}

function getSupabaseUrl() {
  return process.env.SUPABASE_URL?.trim()
    || process.env.LIGHTHOUSE_SUPABASE_URL?.trim()
    || process.env.VITE_SUPABASE_URL?.trim()
    || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
    || "";
}

function getServiceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    || process.env.LIGHTHOUSE_SUPABASE_SERVICE_ROLE_KEY?.trim()
    || process.env.SUPABASE_SERVICE_KEY?.trim()
    || process.env.SUPABASE_KEY?.trim()
    || "";
}

function createSupabaseClientIfConfigured() {
  const url = getSupabaseUrl();
  const key = getServiceRoleKey();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-luminari-client": "docx-corpus-queue-extractor" } },
    realtime: { params: { eventsPerSecond: 0 } },
  });
}

function safeJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function firstString(...values) {
  return values.find((value) => typeof value === "string" && value.trim())?.trim() ?? null;
}
