/**
 * CFPB Native Adapter — Consumer Financial Protection Bureau
 * 
 * The CFPB Consumer Complaint Database uses its own REST API (not Socrata).
 * API: https://api.consumerfinance.gov/data-research/consumer-complaints/search.json
 * 
 * 14M+ consumer financial complaints. Core stream for Luminari.
 */

import { db } from "../db";
import { ingestedRecords, dataStreamRegistry, ingestRuns } from "../../drizzle/schema";
import { eq, sql } from "drizzle-orm";
import crypto from "crypto";
import type { NormalizedRecord, IngestionResult, IngestionDiagnostics, ErrorClass } from "./socrata-adapter";
import { classifyError, suggestRemediation } from "./socrata-adapter";

const CFPB_API_BASE = "https://api.consumerfinance.gov/data-research/consumer-complaints/search.json";
const PAGE_SIZE = 100;
const MAX_PAGES = 500;
const REQUEST_TIMEOUT_MS = 30000;
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 2000;

export * from './cfpb-adapter';