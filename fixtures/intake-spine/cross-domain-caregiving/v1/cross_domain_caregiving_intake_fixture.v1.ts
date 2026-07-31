import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const fixturePayload = readFileSync(
  new URL("./cross_domain_caregiving_intake_fixture.v1.json.gz.b64", import.meta.url),
  "utf8",
);

export const crossDomainCaregivingIntakeFixtureV1 = JSON.parse(
  gunzipSync(Buffer.from(fixturePayload.trim(), "base64")).toString("utf8"),
) as Readonly<Record<string, unknown>>;

export default crossDomainCaregivingIntakeFixtureV1;
