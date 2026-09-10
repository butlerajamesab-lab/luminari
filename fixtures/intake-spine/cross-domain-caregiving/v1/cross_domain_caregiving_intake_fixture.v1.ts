import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

export interface CrossDomainCaregivingIntakeFixtureV1 {
  fixture_metadata: {
    fixture_id: string;
    fixture_version: string;
    [key: string]: unknown;
  };
  test_slices: Array<{
    slice_id: string;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

const fixturePayload = readFileSync(
  new URL("./cross_domain_caregiving_intake_fixture.v1.json.gz.b64", import.meta.url),
  "utf8",
);

export const crossDomainCaregivingIntakeFixtureV1 = JSON.parse(
  gunzipSync(Buffer.from(fixturePayload.trim(), "base64")).toString("utf8"),
) as CrossDomainCaregivingIntakeFixtureV1;

export default crossDomainCaregivingIntakeFixtureV1;
