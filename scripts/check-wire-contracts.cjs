const fs = require("fs");

const server = fs.readFileSync("server/executor-routes.ts", "utf8");
const client = fs.readFileSync("client/src/pages/SovereignControl.tsx", "utf8");
const directLayerStart = client.indexOf("Direct fetch() execution layer");
const directLayerEnd = client.indexOf("\n  return (", directLayerStart);
const directLayer = client.slice(directLayerStart, directLayerEnd);

const checks = [
  {
    name: "server executor routes",
    text: server,
    patterns: [
      /\/api\/executor\/(runStream|runAllStreams|retryStream|backfillStream|resetCheckpoint|resetCounters|reenableStream)/,
      /req\.body\.streamId/,
      /\b(streamId|recordsProcessed|signalsGenerated|totalStreams)\s*:/,
      /\btotalStreams\b/,
    ],
  },
  {
    name: "SovereignControl executor direct fetch layer",
    text: directLayer,
    patterns: [
      /\/api\/executor\/(runStream|runAllStreams|retryStream|backfillStream|resetCheckpoint|resetCounters|reenableStream)/,
      /execFetch\("(runStream|runAllStreams|retryStream|backfillStream|resetCheckpoint|resetCounters|reenableStream)"/,
      /JSON\.stringify\(\{\s*streamId\b/,
      /result\.(recordsProcessed|signalsGenerated|totalStreams)\b/,
      /\br\.(streamId|recordsProcessed|signalsGenerated)\b/,
    ],
  },
  {
    name: "SovereignControl direct executor fetch URLs",
    text: client,
    patterns: [
      /\/api\/executor\/(runStream|runAllStreams|retryStream|backfillStream|resetCheckpoint|resetCounters|reenableStream)/,
      /JSON\.stringify\(\{\s*streamId\b/,
    ],
  },
];

let failed = false;

if (directLayerStart === -1 || directLayerEnd === -1) {
  console.error("Unable to locate SovereignControl direct fetch layer");
  failed = true;
}

for (const { name, text, patterns } of checks) {
  for (const pattern of patterns) {
    if (pattern.test(text)) {
      console.error(`Forbidden executor wire token in ${name}: ${pattern}`);
      failed = true;
    }
  }
}

if (failed) {
  process.exit(1);
}

console.log("Executor wire contracts are canonical snake_case.");
