import { describe, expect, it } from "vitest";

import {
  background_feature_enabled,
  background_workers_allowed,
  resolve_lighthouse_runtime_role,
} from "./runtime-role";

const all_worker_flags = {
  PRISM_ROSETTA_QUEUE_ENABLED: "true",
  LEGISLATIVE_VERSION_QUEUE_ENABLED: "true",
  ROSETTA_GENOME_ACTIVATION_QUEUE_ENABLED: "true",
  ROSETTA_GENOME_TARGET_SYNC_ENABLED: "true",
  ROSETTA_GENOME_UPGRADE_QUEUE_ENABLED: "true",
  DOCKET_BILL_ACTIVATION_QUEUE_ENABLED: "true",
  CIVIC_GENOME_FINAL_SOURCE_RECONCILIATION_ENABLED: "true",
  DOCKET_STATE_CACHE_WARMER_ENABLED: "true",
};

describe("Lighthouse runtime role", () => {
  it("defaults missing, web, and invalid roles to an HTTP-only web process", () => {
    expect(resolve_lighthouse_runtime_role({})).toEqual({
      role: "web",
      configured_value: null,
      valid: true,
    });
    expect(resolve_lighthouse_runtime_role({ LIGHTHOUSE_RUNTIME_ROLE: " web " })).toEqual({
      role: "web",
      configured_value: " web ",
      valid: false,
    });
    expect(resolve_lighthouse_runtime_role({ LIGHTHOUSE_RUNTIME_ROLE: "typo" })).toEqual({
      role: "web",
      configured_value: "typo",
      valid: false,
    });
  });

  it("does not let queue flags override the web boundary", () => {
    const environment = {
      NODE_ENV: "production",
      LIGHTHOUSE_RUNTIME_ROLE: "web",
      ...all_worker_flags,
    };

    expect(background_workers_allowed(environment)).toBe(false);
    for (const flag of Object.keys(all_worker_flags)) {
      expect(background_feature_enabled(flag, environment)).toBe(false);
    }
  });

  it("requires an explicit worker role and an explicit feature grant", () => {
    const worker_environment = {
      NODE_ENV: "production",
      LIGHTHOUSE_RUNTIME_ROLE: "worker",
    };

    expect(background_workers_allowed(worker_environment)).toBe(true);
    expect(background_feature_enabled("LEGISLATIVE_VERSION_QUEUE_ENABLED", worker_environment))
      .toBe(false);
    expect(background_feature_enabled("LEGISLATIVE_VERSION_QUEUE_ENABLED", {
      ...worker_environment,
      LEGISLATIVE_VERSION_QUEUE_ENABLED: "true",
    })).toBe(true);
  });

  it("rejects normalized variants of privileged grants", () => {
    for (const configured_value of ["WORKER", "worker ", " worker", "Worker"]) {
      expect(resolve_lighthouse_runtime_role({
        LIGHTHOUSE_RUNTIME_ROLE: configured_value,
      })).toEqual({
        role: "web",
        configured_value,
        valid: false,
      });
    }

    for (const configured_value of ["TRUE", "true ", " true", "True"]) {
      expect(background_feature_enabled("TEST_WORKER_ENABLED", {
        LIGHTHOUSE_RUNTIME_ROLE: "worker",
        TEST_WORKER_ENABLED: configured_value,
      })).toBe(false);
    }
  });
});
