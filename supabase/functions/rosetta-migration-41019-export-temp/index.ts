import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(() =>
  new Response("diagnostic retired", {
    status: 410,
    headers: { "cache-control": "no-store" },
  })
);
