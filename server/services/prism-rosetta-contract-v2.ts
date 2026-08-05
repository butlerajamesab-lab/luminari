import type { DeepRosettaBindingRequest } from "./prism-verification-contract";

export {
  PRISM_ROSETTA_ENGINE_VERSION,
  PRISM_ROSETTA_RULE_SET_HASH,
  PRISM_ROSETTA_RULE_SET_ID,
  PRISM_ROSETTA_RULE_SET_VERSION,
  canonical_json,
  deep_rosetta_binding_request_schema,
  prism_receipt_schema,
  rosetta_binding_request_schema,
  sha256_hex,
  sign_prism_request,
} from "./prism-verification-contract";
export type {
  DeepRosettaBindingRequest,
  PrismReceipt,
  RosettaBindingRequest,
} from "./prism-verification-contract";

export function rosetta_semantic_request_payload(
  request: DeepRosettaBindingRequest,
): Omit<
  DeepRosettaBindingRequest,
  "originating_lighthouse_commit" | "originating_lighthouse_runtime_version"
> {
  const {
    originating_lighthouse_commit: _commit,
    originating_lighthouse_runtime_version: _runtime,
    ...semantic_request
  } = request;
  return semantic_request;
}
