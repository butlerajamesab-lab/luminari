import { getLuminariDb } from "./luminari-db";
import { sql } from "drizzle-orm";

async function seed() {
  const db = await getLuminariDb();

  console.log("Fetching domains...");
  const result = await db.execute(sql`SELECT id, name FROM domains`);
  const domains = (result as any).rows || [];
  
  console.log("Domains found:", domains.length);
  
  const domainMap: { [key: string]: number } = {};
  for (const row of domains) {
    domainMap[row.name] = row.id;
  }
  
  console.log("Domain map:", domainMap);
  
  // Now seed categories
  const categories = [
    ["Family Law", "Initial Filing", "First filing in family law matter"],
    ["Housing", "Filing Complaint", "Initial complaint filing"],
    ["Employment", "Wage Claim", "Wage and hour claims"],
  ];

  for (const [domainName, catName, desc] of categories) {
    const domainId = domainMap[domainName];
    if (!domainId) {
      console.error(`Domain not found: ${domainName}`);
      continue;
    }
    await db.execute(sql`
      INSERT INTO categories (domain_id, name, description)
      VALUES (${domainId}, ${catName}, ${desc})
      ON CONFLICT DO NOTHING
    `);
    console.log(`✓ ${domainName} > ${catName}`);
  }
}

seed().catch(console.error).finally(() => process.exit(0));
