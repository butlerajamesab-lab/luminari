export const architecture_layer_routes: Record<string, string> = {
  statutes: "/legal-library", case_law: "/legal-library",
  claim_elements: "/claim-elements", proof_frameworks: "/proof-frameworks",
  enforcement: "/enforcement-pathway", regulatory: "/enforcement-intel",
  investigation: "/investigation-workflow", intelligence: "/signal-registry",
};

export function architecture_layer_route(layer_id: string) {
  return architecture_layer_routes[layer_id] ?? "/architecture-map";
}

export function current_object_inspection_route(object_class: string, node_id?: string) {
  const query = new URLSearchParams({ object_class });
  if (node_id) query.set("node_id", node_id);
  return `/architecture-map?${query.toString()}`;
}
