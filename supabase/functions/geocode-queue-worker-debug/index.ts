Deno.serve(() => new Response(JSON.stringify({ error: "diagnostic_endpoint_disabled" }), {
  status: 410,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
}));
