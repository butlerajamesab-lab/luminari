import express, { Request, Response } from "express";
import { sanitize_office_families } from "@shared/office-families";
import { lookupAddressPoint } from "../legislators-geocode";
import {
  count_anchored_office_sites,
  find_nearest_offices,
} from "../services/office-nearest";
import { get_unified_catalog_summary } from "../services/resource-directory-unified";
import {
  browse_place,
  list_place_cities,
  list_place_states,
  normalize_city_key,
  normalize_state_code,
} from "../services/office-place";

export const officesRouter = express.Router();

/**
 * Find-an-Office locator endpoint (F3).
 *
 * POST /api/offices/nearest { address, families? }
 *
 * The address is resolved through the same server-side Census
 * Geocoder helper the legislators hub uses (legislators-geocode) —
 * there is no second geocoder and no guessed fallback point: an
 * address the Census cannot match returns status "no_match", and a
 * geocoder failure returns 502 with status "unavailable". On a match,
 * the nearest anchored offices come from the unified catalog
 * (services/office-nearest), and the response echoes the Census
 * matched address so the person can confirm the right place was
 * understood.
 */
officesRouter.post("/nearest", async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as { address?: unknown; families?: unknown };
  const address =
    typeof body.address === "string" ? body.address.trim() : "";
  if (address.length < 6 || address.length > 300) {
    return res.status(400).json({
      ok: false,
      error: "invalid_address",
      message: "Enter a street address, city, and state.",
    });
  }
  const families = sanitize_office_families(body.families);

  try {
    const outcome = await lookupAddressPoint(address);
    if (outcome.status === "no_match") {
      return res.json({
        ok: true,
        status: "no_match",
        results: [],
        families_not_found: families,
      });
    }
    if (outcome.status === "unavailable") {
      return res.status(502).json({
        ok: false,
        status: "unavailable",
        error: "geocoder_unavailable",
        message:
          "The address lookup service is unavailable right now. Please try again in a moment.",
      });
    }

    const { match } = outcome;
    const [search, summary, anchored_office_sites] = await Promise.all([
      find_nearest_offices({
        latitude: match.latitude,
        longitude: match.longitude,
        families,
      }),
      get_unified_catalog_summary(),
      count_anchored_office_sites(),
    ]);

    res.setHeader("Cache-Control", "no-store");
    return res.json({
      ok: true,
      status: "matched",
      geocoded_address: match.matchedAddress,
      radius_used_mi: search.radius_used_mi,
      initial_radius_mi: search.initial_radius_mi,
      families_not_found: search.families_not_found,
      results: search.results,
      coverage: {
        // The population this locator searches, counted live from the
        // same catalog corpus and joins as the results themselves.
        anchored_office_sites,
        // The unified catalog summary's own site counts, carried in
        // the summary's shape so the page's numbers reconcile with
        // the directory and the map.
        verified_physical_sites: summary.verified_physical_sites ?? 0,
        exact_mappable_resources: summary.exact_mappable_resources ?? 0,
        total_resources: summary.total_resources ?? 0,
      },
    });
  } catch (error) {
    console.error("[Offices] nearest-office request failed", error);
    return res
      .status(500)
      .json({ ok: false, error: "office_search_unavailable" });
  }
});

/**
 * Place browse (no street address needed).
 *
 * GET /api/offices/places            → states with record counts
 * GET /api/offices/places?state=WA   → cities in that state with counts
 * GET /api/offices/place?state=WA&city=seattle&families=a,b
 *   → offices in the place plus every other catalog record there and
 *     the records that serve the whole state (services/office-place).
 */
officesRouter.get("/places", async (req: Request, res: Response) => {
  try {
    if (req.query.state === undefined) {
      return res.json({ ok: true, states: await list_place_states() });
    }
    const state = normalize_state_code(req.query.state);
    if (!state) return res.status(400).json({ ok: false, error: "invalid_state" });
    return res.json({ ok: true, state, cities: await list_place_cities(state) });
  } catch (error) {
    console.error("[Offices] places request failed", error);
    return res.status(500).json({ ok: false, error: "office_places_unavailable" });
  }
});

officesRouter.get("/place", async (req: Request, res: Response) => {
  const state = normalize_state_code(req.query.state);
  if (!state) return res.status(400).json({ ok: false, error: "invalid_state" });
  const raw_city = typeof req.query.city === "string" ? req.query.city : "";
  const city_key = raw_city.trim() ? normalize_city_key(raw_city) : null;
  if (raw_city.trim() && !city_key) {
    return res.status(400).json({ ok: false, error: "invalid_city" });
  }
  const families = typeof req.query.families === "string"
    ? req.query.families.split(",").map(value => value.trim()).filter(Boolean)
    : [];
  try {
    const outcome = await browse_place({ state, city_key, families });
    res.setHeader("Cache-Control", "no-store");
    return res.json({ ok: true, ...outcome });
  } catch (error) {
    console.error("[Offices] place browse failed", error);
    return res.status(500).json({ ok: false, error: "office_place_unavailable" });
  }
});
