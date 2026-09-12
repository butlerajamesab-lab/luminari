// Shared Node parser bridge for the Python registry/reconciliation tools. No writes or execution of source content.
import { parse_batch_source } from "./lib/batch-source-adapter.mjs";
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const result = await parse_batch_source(Buffer.concat(chunks), process.argv[2]);
process.stdout.write(JSON.stringify(result));
