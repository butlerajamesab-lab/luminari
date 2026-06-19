#!/usr/bin/env node
import fs from "node:fs";

const audit_scanned_files = [
  "server/routes/docket.ts",
  "server/_core/index.ts",
  "server/services/legiscan.ts",
  "client/src/App.tsx",
  "client/src/pages/NativeNationsHub.tsx",
  "client/src/pages/RecognitionAtlas.tsx",
  "client/src/pages/RecognitionAtlasTribe.tsx",
  "client/src/pages/RecognitionAtlasLayer.tsx",
  "client/src/pages/RecognitionGideon.tsx",
  "client/src/data/chinook_route_to_recognition_profile.ts",
  "client/src/data/route_to_recognition_registry.ts",
  "client/src/data/muwekma_truth_seed_corrected.ts",
  "client/src/data/muwekma_truth_seed.ts",
  "client/src/data/duwamish_truth_seed.ts",
  "client/src/types/duwamish_truth_layer.ts",
  "client/src/types/muwekma_truth_layer.ts",
];

const required_fix_tokens = new Set([
  "sessionId", "sessionTitle", "billCount", "fetchedAt", "docketRouter",
  "getSessionList", "getMasterList", "getBill", "LegiScanSession", "LegiScanMasterBill", "LegiScanBillDetail",
  "requiredEnv", "normalizeStateCode", "legiscanRequest", "LegiScanEnvelope",
  "sourcePosture", "layerCards", "tribalCardPage", "routeToRecognition", "recognitionTimeline",
  "sourcePacket", "tribeId", "layerSlug", "allyCall", "primaryDeclaration", "territorialDeclaration",
  "populatedProfiles",
]);

const third_party_required = new Map([
  ["getSessionList", "LegiScan API operation string must remain exact."],
  ["getMasterList", "LegiScan API operation string must remain exact."],
  ["getBill", "LegiScan API operation string must remain exact."],
  ["persistSession", "Supabase auth option key is an external library contract."],
  ["autoRefreshToken", "Supabase auth option key is an external library contract."],
]);

const ignore_tokens = new Set([
  "ReactNode", "ReturnType", "Record", "Array", "String", "Boolean", "Promise", "Number", "Date", "Error", "Object", "URL",
  "Router", "ENV", "Link", "Route", "Switch", "Shield", "Lock", "EyeOff", "ArrowRight", "ArrowLeft", "AlertTriangle", "BookOpen", "Globe2", "GitBranch", "FileText", "MapPin", "Scale",
  "useAuth", "useRoute", "useLocation", "useEffect", "useState", "createClient", "createServer", "createExpressMiddleware",
  "appRouter", "createContext", "sessionMiddleware", "aiInspectRouter", "systemVisibilityRouter", "conveyorRouter", "civicMapRouter", "atlasProxyRouter", "ingestionControlRestRouter",
  "registerExecutorRoutes", "loadPipelineRegistry", "loadLensRegistry", "serveStatic", "setupVite", "isAuthenticated", "isArray",
  "borderRadius", "fontFamily", "fontSize", "gridTemplateColumns", "justifyContent", "letterSpacing", "lineHeight", "marginBottom", "marginTop", "maxWidth", "minHeight", "placeItems", "textDecoration", "textTransform", "alignItems", "paddingLeft", "paddingTop", "borderTop", "borderBottom", "borderCollapse", "flexWrap", "fontWeight", "minWidth", "overflowX", "textAlign", "verticalAlign", "wordBreak", "backgroundColor",
  "HomeOrWelcome", "DashboardRouter", "NotFound", "DocketRoom", "NativeNationsHub", "RecognitionAtlas", "RecognitionAtlasTribe", "RecognitionAtlasLayer", "RecognitionGideon",
]);

const to_snake = (token) => token
  .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
  .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
  .toLowerCase();

const strip_strings_and_comments = (line) => line
  .replace(/`(?:\\.|[^`])*`/g, "")
  .replace(/"(?:\\.|[^"])*"/g, "")
  .replace(/'(?:\\.|[^'])*'/g, "")
  .replace(/\/\/.*$/, "");

const rows = [];
for (const file of audit_scanned_files) {
  const text = fs.readFileSync(file, "utf8");
  text.split(/\r?\n/).forEach((line, index) => {
    const code = strip_strings_and_comments(line);
    for (const token of code.match(/\b[A-Za-z_$][A-Za-z0-9_$]*\b/g) ?? []) {
      if (!/[A-Z]/.test(token)) continue;
      if (third_party_required.has(token)) {
        rows.push({ file, line: index + 1, token, classification: "third_party_required", suggested_snake_case_replacement: to_snake(token), reason: third_party_required.get(token) });
        continue;
      }
      if (required_fix_tokens.has(token)) {
        rows.push({ file, line: index + 1, token, classification: "required_fix", suggested_snake_case_replacement: to_snake(token) });
        continue;
      }
      if (ignore_tokens.has(token)) continue;
    }
  });
}

const required_fix_count_after = rows.filter((row) => row.classification === "required_fix").length;
const third_party_required_count = rows.filter((row) => row.classification === "third_party_required").length;
console.log(JSON.stringify({ audit_scanned_files, rows, required_fix_count_after, third_party_required_count, remaining_required_fix_count: required_fix_count_after }, null, 2));
