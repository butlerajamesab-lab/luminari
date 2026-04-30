import { getLuminariDb } from "./luminari-db";
import { sql } from "drizzle-orm";

async function seed() {
  const db = await getLuminariDb();

  console.log("Step 1: Fetching domains...");
  const domainsRaw = await db.execute(sql`SELECT id, name FROM domains`);
  console.log("Type:", typeof domainsRaw);
  console.log("Is array:", Array.isArray(domainsRaw));
  console.log("Keys:", Object.keys(domainsRaw || {}));
  
  let domains: any[] = [];
  if (Array.isArray(domainsRaw)) {
    domains = domainsRaw;
  } else if (domainsRaw && typeof domainsRaw === 'object') {
    domains = Object.values(domainsRaw);
  }
  
  console.log("Domains array length:", domains.length);
  console.log("First domain:", domains[0]);
  
  const domainMap: { [key: string]: number } = {};
  for (const row of domains) {
    if (row && row.name) {
      domainMap[row.name] = row.id;
    }
  }
  
  console.log("Domain map keys:", Object.keys(domainMap));
  console.log("Domain map:", domainMap);
}

seed().catch(console.error).finally(() => process.exit(0));
