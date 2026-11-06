import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Contract test for the signal-promotion write-back proposal
 * (20261106_signal_promotion_writeback) against PRODUCTION's shapes:
 * table DDL is generated from information_schema harvests taken
 * 2026-11-06 (live_data_signals 29 cols, transition table 9,
 * sunam_gate_log / extraction_staging / signal_promotion_log from the
 * bridge harvests plus the bridge's own gate_log_id columns); the
 * guard trigger, the integrity projector trigger and its function, and
 * the house hash / semantic-key functions are production's verbatim
 * definitions; fixtures are the REAL rows of the first governed
 * promotion (candidate f886164b…, gate log 20c57ec1…, promotion
 * bae4c6d4…). The proposal executes verbatim. This harness never
 * touches a Supabase project.
 */

const CANDIDATE = "f886164b-7a5c-40c4-9a54-3f6fd56381f2";
const GATE_LOG = "20c57ec1-6791-48db-9d0a-0afb18a6afb7";

const proposal = readFileSync(
  new URL(
    "../supabase/proposals/20261106_signal_promotion_writeback.proposal.sql",
    import.meta.url,
  ),
  "utf8",
);

const DDL = "CREATE SEQUENCE IF NOT EXISTS public.extraction_staging_id_seq;\nCREATE SEQUENCE IF NOT EXISTS public.sunam_gate_log_id_seq;\nCREATE TABLE public.sunam_gate_log (\n  \"id\" integer DEFAULT nextval('sunam_gate_log_id_seq'::regclass) NOT NULL,\n  \"decision\" text,\n  \"threshold\" text,\n  \"threshold_id\" text,\n  \"reason\" text,\n  \"timestamp\" bigint,\n  \"live_signal_id\" text,\n  \"signal_fingerprint\" text,\n  \"signal_type\" text,\n  \"dataset_id\" text,\n  \"sunam_score\" text,\n  \"threshold_used\" text,\n  \"decision_reason\" text,\n  \"promoted_signal_id\" text,\n  \"staging_id\" integer,\n  \"actor\" text,\n  \"decided_at\" bigint,\n  \"created_at\" bigint,\n  \"score_breakdown\" text\n);\n\nALTER TABLE public.sunam_gate_log ADD COLUMN gate_log_id uuid;\nCREATE UNIQUE INDEX sunam_gate_log_gate_log_id_idx ON public.sunam_gate_log (gate_log_id);\nCREATE TABLE public.extraction_staging (\n  \"id\" integer DEFAULT nextval('extraction_staging_id_seq'::regclass) NOT NULL,\n  \"signal_type\" text,\n  \"dataset_id\" text,\n  \"jurisdiction\" text,\n  \"domain\" text,\n  \"severity\" text,\n  \"title\" text,\n  \"explanation\" text,\n  \"pattern_summary\" text,\n  \"supporting_statistics\" text,\n  \"raw_confidence_score\" text,\n  \"signal_fingerprint\" text,\n  \"entity_type\" text,\n  \"canonical_entity_name\" text,\n  \"entity_role\" text,\n  \"live_signal_id\" integer,\n  \"ingest_run_id\" text,\n  \"sunam_score\" text,\n  \"sunam_threshold\" text,\n  \"score_breakdown\" text,\n  \"gate_decision\" text,\n  \"gate_reason\" text,\n  \"reviewed_by\" text,\n  \"reviewed_at\" text,\n  \"review_notes\" text,\n  \"staged_at\" bigint,\n  \"promoted_at\" text,\n  \"promoted_signal_id\" text,\n  \"created_at\" bigint,\n  \"updated_at\" bigint\n);\n\nALTER TABLE public.extraction_staging ADD COLUMN gate_log_id uuid;\nCREATE TABLE public.signal_promotion_log (\n  \"promotion_id\" uuid DEFAULT gen_random_uuid() NOT NULL,\n  \"gate_log_id\" uuid NOT NULL,\n  \"decision_hash\" text NOT NULL,\n  \"detected_signal_id\" uuid,\n  \"promotion_status\" text DEFAULT 'pending'::text NOT NULL,\n  \"promotion_hash\" text,\n  \"live_signal_id\" uuid,\n  \"signal_type\" text NOT NULL,\n  \"source_system\" text NOT NULL,\n  \"jurisdiction_raw_value\" text,\n  \"composite_score\" numeric NOT NULL,\n  \"failure_reason\" text,\n  \"retry_count\" integer DEFAULT 0 NOT NULL,\n  \"promoted_at\" timestamptz,\n  \"created_at\" timestamptz DEFAULT now() NOT NULL,\n  \"updated_at\" timestamptz DEFAULT now() NOT NULL\n);\n\nCREATE TABLE public.live_data_signals (\n  \"live_data_signal_id\" uuid DEFAULT gen_random_uuid() NOT NULL,\n  \"signal_type\" text NOT NULL,\n  \"title\" text NOT NULL,\n  \"description\" text NOT NULL,\n  \"primary_stream_id\" text NOT NULL,\n  \"source_event_refs\" jsonb NOT NULL,\n  \"entity_ids\" text[] DEFAULT ARRAY[]::text[] NOT NULL,\n  \"entity_resolution_status\" text NOT NULL,\n  \"jurisdiction_id\" text NOT NULL,\n  \"severity\" text NOT NULL,\n  \"confidence_score\" numeric NOT NULL,\n  \"verification_state\" text NOT NULL,\n  \"supporting_statistics\" jsonb NOT NULL,\n  \"evidence_refs\" jsonb DEFAULT '[]'::jsonb NOT NULL,\n  \"detection_rule_id\" text NOT NULL,\n  \"detection_rule_version\" text NOT NULL,\n  \"engine_id\" text NOT NULL,\n  \"engine_version\" text NOT NULL,\n  \"input_hash\" text NOT NULL,\n  \"signal_hash\" text NOT NULL,\n  \"source_freshness_at\" timestamptz NOT NULL,\n  \"detected_at\" timestamptz NOT NULL,\n  \"created_at\" timestamptz DEFAULT now() NOT NULL,\n  \"governance_status\" text DEFAULT 'observation_candidate'::text NOT NULL,\n  \"supersedes_id\" uuid,\n  \"is_current\" boolean DEFAULT true NOT NULL,\n  \"atlas_candidate_id\" uuid,\n  \"atlas_candidate_hash\" text,\n  \"atlas_semantic_key\" text\n);\n\nCREATE UNIQUE INDEX live_data_signals_signal_hash_key ON public.live_data_signals (signal_hash);\nCREATE UNIQUE INDEX live_data_signals_one_current_atlas_semantic_idx ON public.live_data_signals (atlas_semantic_key) WHERE (is_current AND (atlas_semantic_key IS NOT NULL));\nCREATE TABLE public.live_data_signal_semantic_transition_v1 (\n  \"transition_id\" uuid DEFAULT gen_random_uuid() NOT NULL,\n  \"semantic_key\" text NOT NULL,\n  \"previous_live_data_signal_id\" uuid,\n  \"current_live_data_signal_id\" uuid NOT NULL,\n  \"atlas_candidate_id\" uuid,\n  \"atlas_candidate_hash\" text,\n  \"transition_reason\" text NOT NULL,\n  \"transition_hash\" text NOT NULL,\n  \"transitioned_at\" timestamptz DEFAULT now() NOT NULL\n);\n\nALTER TABLE public.live_data_signals ADD CONSTRAINT live_data_signals_governance_status_check CHECK ((governance_status = ANY (ARRAY['observation_candidate'::text, 'review_hold'::text, 'promoted'::text, 'rejected'::text])));\nALTER TABLE public.live_data_signals ADD CONSTRAINT live_data_signals_signal_hash_check CHECK ((signal_hash ~ '^[0-9a-f]{64}$'::text));\nALTER TABLE public.live_data_signals ADD CONSTRAINT live_data_signals_input_hash_check CHECK ((input_hash ~ '^[0-9a-f]{64}$'::text));\nALTER TABLE public.live_data_signals ADD CONSTRAINT live_data_signals_atlas_candidate_hash_check CHECK (((atlas_candidate_hash IS NULL) OR (atlas_candidate_hash ~ '^[0-9a-f]{64}$'::text)));\nALTER TABLE public.live_data_signals ADD CONSTRAINT live_data_signals_atlas_semantic_key_check CHECK (((atlas_semantic_key IS NULL) OR (atlas_semantic_key ~ '^[0-9a-f]{64}$'::text)));\nALTER TABLE public.live_data_signals ADD CONSTRAINT live_data_signals_confidence_check CHECK (((confidence_score >= (0)::numeric) AND (confidence_score <= (1)::numeric)));\nALTER TABLE public.live_data_signals ADD CONSTRAINT live_data_signals_severity_check CHECK ((severity = ANY (ARRAY['critical'::text, 'high'::text, 'medium'::text, 'low'::text, 'informational'::text])));\nALTER TABLE public.live_data_signals ADD CONSTRAINT live_data_signals_entity_resolution_status_check CHECK ((entity_resolution_status = ANY (ARRAY['resolved'::text, 'ambiguous'::text, 'unresolved'::text, 'ignored'::text])));\nALTER TABLE public.live_data_signals ADD CONSTRAINT live_data_signals_verification_state_check CHECK ((verification_state = ANY (ARRAY['supported_one_source'::text, 'supported_multiple_sources'::text, 'contradicted'::text, 'disputed'::text, 'incomplete'::text, 'unresolved'::text, 'verified'::text])));\nALTER TABLE public.live_data_signals ADD CONSTRAINT live_data_signals_evidence_refs_check CHECK ((jsonb_typeof(evidence_refs) = 'array'::text));\nALTER TABLE public.live_data_signals ADD CONSTRAINT live_data_signals_source_event_refs_check CHECK (((jsonb_typeof(source_event_refs) = 'array'::text) AND (jsonb_array_length(source_event_refs) > 0)));\nALTER TABLE public.live_data_signals ADD CONSTRAINT live_data_signals_statistics_check CHECK (((jsonb_typeof(supporting_statistics) = 'object'::text) AND (supporting_statistics <> '{}'::jsonb)));\nALTER TABLE public.live_data_signal_semantic_transition_v1 ADD CONSTRAINT live_data_signal_semantic_transition_v1_transition_reason_check CHECK ((transition_reason = ANY (ARRAY['new_version'::text, 'reactivated_version'::text])));\nALTER TABLE public.live_data_signal_semantic_transition_v1 ADD CONSTRAINT live_data_signal_semantic_transition_v1_semantic_key_check CHECK ((semantic_key ~ '^[0-9a-f]{64}$'::text));\nALTER TABLE public.live_data_signal_semantic_transition_v1 ADD CONSTRAINT live_data_signal_semantic_transition_v1_transition_hash_check CHECK ((transition_hash ~ '^[0-9a-f]{64}$'::text));\nALTER TABLE public.live_data_signal_semantic_transition_v1 ADD CONSTRAINT live_data_signal_semantic_transition_atlas_candidate_hash_check CHECK (((atlas_candidate_hash IS NULL) OR (atlas_candidate_hash ~ '^[0-9a-f]{64}$'::text)));\nALTER TABLE public.signal_promotion_log ADD CONSTRAINT signal_promotion_log_promotion_status_check CHECK ((promotion_status = ANY (ARRAY['pending'::text, 'promoted'::text, 'failed'::text, 'duplicate'::text])));\n";
const FIXTURES = "INSERT INTO public.live_data_signals (\"live_data_signal_id\", \"signal_type\", \"title\", \"description\", \"primary_stream_id\", \"source_event_refs\", \"entity_ids\", \"entity_resolution_status\", \"jurisdiction_id\", \"severity\", \"confidence_score\", \"verification_state\", \"supporting_statistics\", \"evidence_refs\", \"detection_rule_id\", \"detection_rule_version\", \"engine_id\", \"engine_version\", \"input_hash\", \"signal_hash\", \"source_freshness_at\", \"detected_at\", \"created_at\", \"governance_status\", \"supersedes_id\", \"is_current\", \"atlas_candidate_id\", \"atlas_candidate_hash\", \"atlas_semantic_key\") VALUES ('f886164b-7a5c-40c4-9a54-3f6fd56381f2', 'cross_jurisdiction_recurrence', 'Cross-jurisdiction recurrence: TRANSUNION INTERMEDIATE HOLDINGS, INC.', 'TRANSUNION INTERMEDIATE HOLDINGS, INC. appears in 7921 observations across 19 governed jurisdictions. This is a recurrence observation, not a finding of wrongdoing.', 'cfpb_complaints', '[{\"offset\": 1778372879521173, \"stream_id\": \"cfpb_complaints\", \"event_identity_hash\": \"54f85f2771d1973605a376ce85cdf3969c565e01bc63cca07fca59f35759a9d3\"}, {\"offset\": 1778372879521174, \"stream_id\": \"cfpb_complaints\", \"event_identity_hash\": \"5f7070d587df676e715bb7adf763eb56953fcdc87b9d66120f52c8e4758df92f\"}, {\"offset\": 1778372879521175, \"stream_id\": \"cfpb_complaints\", \"event_identity_hash\": \"27fb4a6326700804878247e4484006e28552d2401cdf84c3f32c796918a52a3e\"}, {\"offset\": 1778372879521176, \"stream_id\": \"cfpb_complaints\", \"event_identity_hash\": \"441e98c7fea954d0ccffd22cb0d430af3f74960667ab64c0b2fa7a6013fd7aa4\"}, {\"offset\": 1778372879521177, \"stream_id\": \"cfpb_complaints\", \"event_identity_hash\": \"be8df637616e06fe1579608c7a1b661c8548498e1aa263fd9d4e6c643dafc52b\"}, {\"offset\": 1778372879521178, \"stream_id\": \"cfpb_complaints\", \"event_identity_hash\": \"565c02dca1eccf6800a29cf71cc9640c1300630967924912ebc5083257796ec8\"}, {\"offset\": 1778372879521179, \"stream_id\": \"cfpb_complaints\", \"event_identity_hash\": \"4d41885c71a4ce1a9b39fd0d6b4f0a09e32fbfefbda12687caa8b19b77dfeced\"}, {\"offset\": 1778372879521180, \"stream_id\": \"cfpb_complaints\", \"event_identity_hash\": \"ed7240124f4d9bea2dc10ba86985b52dea6f4d537ea2d4e46ea44f1a7ecf3788\"}, {\"offset\": 1778372879521181, \"stream_id\": \"cfpb_complaints\", \"event_identity_hash\": \"b99ba3b65bddc6cd30c50ff0157b7508af5dad6541c9715a6a075042555daed4\"}, {\"offset\": 1778372879521182, \"stream_id\": \"cfpb_complaints\", \"event_identity_hash\": \"91de75655c42d300a9b9843da4de638e1030ec04c89ab22e56dcc3dc0ea22771\"}, {\"offset\": 1778372879521183, \"stream_id\": \"cfpb_complaints\", \"event_identity_hash\": \"f41b1f44e4b50c44e9581eebf0a7999579e5dc6e767a26d750c9e3df49562ea9\"}, {\"offset\": 1778372879521184, \"stream_id\": \"cfpb_complaints\", \"event_identity_hash\": \"a4b0892f025f984588da99071f057417e65a283b494a0cdad66172361749beb9\"}, {\"offset\": 1778372879521185, \"stream_id\": \"cfpb_complaints\", \"event_identity_hash\": \"7f834b63465ffe2a7cdb4e28ad9f88421b7d29a26a3088797c614f5946568d54\"}, {\"offset\": 1778372879521186, \"stream_id\": \"cfpb_complaints\", \"event_identity_hash\": \"41cb5b0aad0b79b0e40bf5992a5d64f657e1a89b831abab26caae43cb6ddea9b\"}, {\"offset\": 1778372879521187, \"stream_id\": \"cfpb_complaints\", \"event_identity_hash\": \"911993ac941b195a5780e8b6cb58001e09c9f9c34ea38be3922ed58b50cf0202\"}, {\"offset\": 1778372879521188, \"stream_id\": \"cfpb_complaints\", \"event_identity_hash\": \"522dda0c871aaa8cb9d46b3698ea62e0044839b6e4ed00cd9e8e9295a68bfe99\"}, {\"offset\": 1778372879521189, \"stream_id\": \"cfpb_complaints\", \"event_identity_hash\": \"b55446596a1dcab97c3537006e67b59605446a96c61c96525b3d506a7e41ff91\"}, {\"offset\": 1778372879521190, \"stream_id\": \"cfpb_complaints\", \"event_identity_hash\": \"8f648a8c476fe8798eb988bceff565eb3e7322351d98b146b2e5698ec11327f5\"}, {\"offset\": 1778372879521191, \"stream_id\": \"cfpb_complaints\", \"event_identity_hash\": \"1c39170a6022b3081dfe410026c6a424796b247b36d5c56252ca2100a1f86aca\"}, {\"offset\": 1778372879521192, \"stream_id\": \"cfpb_complaints\", \"event_identity_hash\": \"d64b7fd5f80df7f965e5e2b4cc7591c983aa0b317967eb64dc70d41727f60e90\"}, {\"offset\": 1778372879521193, \"stream_id\": \"cfpb_complaints\", \"event_identity_hash\": \"d291db12a142b7b9c411994eb9c127d744d4469445251339fdd2e934f8f4543e\"}, {\"offset\": 1778372879521194, \"stream_id\": \"cfpb_complaints\", \"event_identity_hash\": \"d5950d206ce1a010e532ef8b704d0d475a3be671e8190653ba6c8ad2f9356060\"}, {\"offset\": 1778372879521195, \"stream_id\": \"cfpb_complaints\", \"event_identity_hash\": \"10bfa307c9961a0c7c69127e6e999ec87f5dac3844f635a8c2274359d418b952\"}, {\"offset\": 1778372879521196, \"stream_id\": \"cfpb_complaints\", \"event_identity_hash\": \"0129df1e246a7ee3abc2884f607de154390946abb7818f98b005d46872fb144a\"}, {\"offset\": 1778372879521197, \"stream_id\": \"cfpb_complaints\", \"event_identity_hash\": \"ae643f05c27cbcc525af7a239371eb87145a9f34ba9cb843f4cca02de5698159\"}]'::jsonb, ARRAY[]::text[], 'unresolved', 'multi_jurisdiction', 'critical', 0.95, 'unresolved', '{\"streams\": [\"cfpb_complaints\"], \"entity_name\": \"TRANSUNION INTERMEDIATE HOLDINGS, INC.\", \"jurisdictions\": [\"AL\", \"CA\", \"CT\", \"DE\", \"FL\", \"GA\", \"IL\", \"MA\", \"MD\", \"MI\", \"NJ\", \"NY\", \"OH\", \"PA\", \"PR\", \"SC\", \"TX\", \"WI\", \"us_federal\"], \"pattern_count\": 7921, \"records_analyzed\": 100000, \"jurisdiction_count\": 19, \"atlas_candidate_verification_state\": \"unverified\", \"atlas_candidate_entity_resolution_status\": \"unresolved_exact_match_required\"}'::jsonb, '[{\"offset\": 1778372879521173, \"stream_id\": \"cfpb_complaints\", \"event_identity_hash\": \"54f85f2771d1973605a376ce85cdf3969c565e01bc63cca07fca59f35759a9d3\"}, {\"offset\": 1778372879521174, \"stream_id\": \"cfpb_complaints\", \"event_identity_hash\": \"5f7070d587df676e715bb7adf763eb56953fcdc87b9d66120f52c8e4758df92f\"}, {\"offset\": 1778372879521175, \"stream_id\": \"cfpb_complaints\", \"event_identity_hash\": \"27fb4a6326700804878247e4484006e28552d2401cdf84c3f32c796918a52a3e\"}, {\"offset\": 1778372879521176, \"stream_id\": \"cfpb_complaints\", \"event_identity_hash\": \"441e98c7fea954d0ccffd22cb0d430af3f74960667ab64c0b2fa7a6013fd7aa4\"}, {\"offset\": 1778372879521177, \"stream_id\": \"cfpb_complaints\", \"event_identity_hash\": \"be8df637616e06fe1579608c7a1b661c8548498e1aa263fd9d4e6c643dafc52b\"}, {\"offset\": 1778372879521178, \"stream_id\": \"cfpb_complaints\", \"event_identity_hash\": \"565c02dca1eccf6800a29cf71cc9640c1300630967924912ebc5083257796ec8\"}, {\"offset\": 1778372879521179, \"stream_id\": \"cfpb_complaints\", \"event_identity_hash\": \"4d41885c71a4ce1a9b39fd0d6b4f0a09e32fbfefbda12687caa8b19b77dfeced\"}, {\"offset\": 1778372879521180, \"stream_id\": \"cfpb_complaints\", \"event_identity_hash\": \"ed7240124f4d9bea2dc10ba86985b52dea6f4d537ea2d4e46ea44f1a7ecf3788\"}, {\"offset\": 1778372879521181, \"stream_id\": \"cfpb_complaints\", \"event_identity_hash\": \"b99ba3b65bddc6cd30c50ff0157b7508af5dad6541c9715a6a075042555daed4\"}, {\"offset\": 1778372879521182, \"stream_id\": \"cfpb_complaints\", \"event_identity_hash\": \"91de75655c42d300a9b9843da4de638e1030ec04c89ab22e56dcc3dc0ea22771\"}, {\"offset\": 1778372879521183, \"stream_id\": \"cfpb_complaints\", \"event_identity_hash\": \"f41b1f44e4b50c44e9581eebf0a7999579e5dc6e767a26d750c9e3df49562ea9\"}, {\"offset\": 1778372879521184, \"stream_id\": \"cfpb_complaints\", \"event_identity_hash\": \"a4b0892f025f984588da99071f057417e65a283b494a0cdad66172361749beb9\"}, {\"offset\": 1778372879521185, \"stream_id\": \"cfpb_complaints\", \"event_identity_hash\": \"7f834b63465ffe2a7cdb4e28ad9f88421b7d29a26a3088797c614f5946568d54\"}, {\"offset\": 1778372879521186, \"stream_id\": \"cfpb_complaints\", \"event_identity_hash\": \"41cb5b0aad0b79b0e40bf5992a5d64f657e1a89b831abab26caae43cb6ddea9b\"}, {\"offset\": 1778372879521187, \"stream_id\": \"cfpb_complaints\", \"event_identity_hash\": \"911993ac941b195a5780e8b6cb58001e09c9f9c34ea38be3922ed58b50cf0202\"}, {\"offset\": 1778372879521188, \"stream_id\": \"cfpb_complaints\", \"event_identity_hash\": \"522dda0c871aaa8cb9d46b3698ea62e0044839b6e4ed00cd9e8e9295a68bfe99\"}, {\"offset\": 1778372879521189, \"stream_id\": \"cfpb_complaints\", \"event_identity_hash\": \"b55446596a1dcab97c3537006e67b59605446a96c61c96525b3d506a7e41ff91\"}, {\"offset\": 1778372879521190, \"stream_id\": \"cfpb_complaints\", \"event_identity_hash\": \"8f648a8c476fe8798eb988bceff565eb3e7322351d98b146b2e5698ec11327f5\"}, {\"offset\": 1778372879521191, \"stream_id\": \"cfpb_complaints\", \"event_identity_hash\": \"1c39170a6022b3081dfe410026c6a424796b247b36d5c56252ca2100a1f86aca\"}, {\"offset\": 1778372879521192, \"stream_id\": \"cfpb_complaints\", \"event_identity_hash\": \"d64b7fd5f80df7f965e5e2b4cc7591c983aa0b317967eb64dc70d41727f60e90\"}, {\"offset\": 1778372879521193, \"stream_id\": \"cfpb_complaints\", \"event_identity_hash\": \"d291db12a142b7b9c411994eb9c127d744d4469445251339fdd2e934f8f4543e\"}, {\"offset\": 1778372879521194, \"stream_id\": \"cfpb_complaints\", \"event_identity_hash\": \"d5950d206ce1a010e532ef8b704d0d475a3be671e8190653ba6c8ad2f9356060\"}, {\"offset\": 1778372879521195, \"stream_id\": \"cfpb_complaints\", \"event_identity_hash\": \"10bfa307c9961a0c7c69127e6e999ec87f5dac3844f635a8c2274359d418b952\"}, {\"offset\": 1778372879521196, \"stream_id\": \"cfpb_complaints\", \"event_identity_hash\": \"0129df1e246a7ee3abc2884f607de154390946abb7818f98b005d46872fb144a\"}, {\"offset\": 1778372879521197, \"stream_id\": \"cfpb_complaints\", \"event_identity_hash\": \"ae643f05c27cbcc525af7a239371eb87145a9f34ba9cb843f4cca02de5698159\"}]'::jsonb, 'atlas.domain3.cross_jurisdiction_recurrence', '1.0.0', 'atlas.domain3_population_exact', '1.1.0', 'b89da6cd958f30649276c7b1206b7dbec6b6975673bb4b21aff11fadc55250b3', '60250efd0beae1482c325274566c67fa1940590ebf51014c97a43b9d3dbffce3', '2026-11-05T04:59:23+00:00', '2026-11-05T11:00:49.808+00:00', '2026-11-05T11:01:10.90326+00:00', 'observation_candidate', 'cc7edc84-2618-46d7-9504-ffd2f8c1d57a', false, '46327716-e7b8-412d-bcd1-e650214d4945', 'e54c84b6920cd64e27fa2d0f65f23a75ec2304d52641a666d08ccc1bce41ac21', '9da73c13d0b4776bee3eb6e4a28d80467a94e1228ef460edd9ec046896b613b9');\nINSERT INTO public.sunam_gate_log (\"id\", \"decision\", \"threshold\", \"threshold_id\", \"reason\", \"timestamp\", \"live_signal_id\", \"signal_fingerprint\", \"signal_type\", \"dataset_id\", \"sunam_score\", \"threshold_used\", \"decision_reason\", \"promoted_signal_id\", \"staging_id\", \"actor\", \"decided_at\", \"created_at\", \"score_breakdown\", \"gate_log_id\") VALUES (2, 'PROMOTE', NULL, 'global_default', NULL, NULL, 'f886164b-7a5c-40c4-9a54-3f6fd56381f2', '262b5fc3b431cc3f2c5cf8e5147b0095', 'cross_jurisdiction_recurrence', 'cfpb_complaints', '0.7838', '0.6500', 'Score 0.7838 >= promote threshold 0.6500.', '4293e373-4c9d-46c8-8c3b-529530fd161a', NULL, 'sql_gate', 1793944542600, 1793944542600, '{\"profile_used\": \"global_default\", \"hold_threshold\": 0.2000, \"composite_score\": 0.7838, \"schema_validity\": {\"score\": 1.0000, \"weight\": 0.1000}, \"stage_threshold\": 0.4000, \"promote_threshold\": 0.6500, \"source_trust_tier\": {\"score\": 0.8500, \"weight\": 0.1500}, \"temporal_relevance\": {\"score\": 1.0000, \"weight\": 0.1000}, \"contradiction_flags\": {\"score\": 1.0000, \"weight\": 0.0500}, \"duplicate_probability\": {\"score\": 1.0000, \"weight\": 0.1000}, \"jurisdiction_validity\": {\"score\": 0.5000, \"weight\": 0.1500}, \"provenance_confidence\": {\"score\": 0.5000, \"weight\": 0.2000}, \"extraction_completeness\": {\"score\": 0.8750, \"weight\": 0.1500}}', '20c57ec1-6791-48db-9d0a-0afb18a6afb7');\nINSERT INTO public.signal_promotion_log (\"promotion_id\", \"gate_log_id\", \"decision_hash\", \"detected_signal_id\", \"promotion_status\", \"promotion_hash\", \"live_signal_id\", \"signal_type\", \"source_system\", \"jurisdiction_raw_value\", \"composite_score\", \"failure_reason\", \"retry_count\", \"promoted_at\", \"created_at\", \"updated_at\") VALUES ('bae4c6d4-afd4-421e-b666-1f7ef40e197a', '20c57ec1-6791-48db-9d0a-0afb18a6afb7', '9ba37b1097d978bd5d727ed3c92ed6e6', '4293e373-4c9d-46c8-8c3b-529530fd161a', 'promoted', 'b62bc2279646424ffe189af83d0d99e6', 'f886164b-7a5c-40c4-9a54-3f6fd56381f2', 'cross_jurisdiction_recurrence', 'cfpb', 'multi_jurisdiction', 0.7838, NULL, 0, '2026-11-06T05:55:42.600086+00:00', '2026-11-06T05:55:42.600086+00:00', '2026-11-06T05:55:42.600086+00:00');";

const SUPPORT = readFileSync(
  new URL("./signal-promotion-writeback.support.sql", import.meta.url),
  "utf8",
);

let database: PGlite;

async function one<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  const result = await database.query<T>(sql, params as never[]);
  return result.rows[0];
}

beforeAll(async () => {
  // pgcrypto's WASM initialization is slow on this host (measured
  // ~11 s once); the suite's setup gets a generous hook timeout.
  database = new PGlite({ extensions: { pgcrypto } });
  await database.exec("CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto SCHEMA extensions; CREATE SCHEMA private;");
  await database.exec(DDL);
  await database.exec(SUPPORT);
  await database.exec(proposal);
  await database.exec(FIXTURES);
}, 120_000);

afterAll(async () => {
  await database?.close();
});

describe("promotion write-back (production shapes, real first-promotion fixtures)", () => {
  it("supersedes the candidate: promoted row in, candidate flipped, transition recorded", async () => {
    const result = await one<{ id: string }>(
      "select public.apply_signal_promotion_writeback_v1($1::uuid, $2::uuid) as id",
      [CANDIDATE, GATE_LOG],
    );
    expect(result.id).toBeTruthy();

    const promoted = await one(
      "select * from public.live_data_signals where live_data_signal_id = $1",
      [result.id],
    );
    expect(promoted?.governance_status).toBe("promoted");
    expect(promoted?.supersedes_id).toBe(CANDIDATE);
    expect(promoted?.is_current).toBe(true);
    expect(promoted?.signal_type).toBe("cross_jurisdiction_recurrence");
    expect(promoted?.atlas_semantic_key).toBe(
      "9da73c13d0b4776bee3eb6e4a28d80467a94e1228ef460edd9ec046896b613b9",
    );

    const candidate = await one(
      "select is_current, governance_status from public.live_data_signals where live_data_signal_id = $1",
      [CANDIDATE],
    );
    expect(candidate?.is_current).toBe(false);
    expect(candidate?.governance_status).toBe("observation_candidate");

    const transition = await one(
      `select * from public.live_data_signal_semantic_transition_v1
        where previous_live_data_signal_id = $1 and transition_reason = 'new_version'`,
      [CANDIDATE],
    );
    expect(transition?.current_live_data_signal_id).toBe(result.id);
    expect(transition?.semantic_key).toBe(
      "9da73c13d0b4776bee3eb6e4a28d80467a94e1228ef460edd9ec046896b613b9",
    );
    // The transition hash follows the house formula over the same
    // object shape register_live_data_signal_v1 uses.
    const recomputed = await one<{ h: string }>(
      `select public.signal_architecture_hash_v1(jsonb_build_object(
         'semantic_key', $1::text, 'previous_live_data_signal_id', $2::uuid,
         'current_live_data_signal_id', $3::uuid, 'atlas_candidate_id', $4::uuid,
         'atlas_candidate_hash', $5::text, 'transition_reason', 'new_version')) as h`,
      [
        transition?.semantic_key,
        CANDIDATE,
        result.id,
        transition?.atlas_candidate_id,
        transition?.atlas_candidate_hash,
      ],
    );
    expect(transition?.transition_hash).toBe(recomputed.h);

    // The Domain 3 counter shape (is_current rows by governance_status).
    const counts = await one(
      `select
         count(*) filter (where governance_status = 'promoted')::int as promoted,
         count(*) filter (where governance_status = 'observation_candidate')::int as candidates
       from public.live_data_signals where is_current`,
    );
    expect(counts).toMatchObject({ promoted: 1, candidates: 0 });
  });

  it("is idempotent: a second call returns the same row and writes nothing new", async () => {
    const again = await one<{ id: string }>(
      "select public.apply_signal_promotion_writeback_v1($1::uuid, $2::uuid) as id",
      [CANDIDATE, GATE_LOG],
    );
    const first = await one(
      "select live_data_signal_id from public.live_data_signals where supersedes_id = $1 and governance_status = 'promoted'",
      [CANDIDATE],
    );
    expect(again.id).toBe(first?.live_data_signal_id);
    const transitions = await one<{ n: number }>(
      "select count(*)::int as n from public.live_data_signal_semantic_transition_v1 where transition_reason = 'new_version'",
    );
    expect(transitions.n).toBe(1);
  });

  it("refuses a write-back with no matching promoted record", async () => {
    await expect(
      database.query(
        "select public.apply_signal_promotion_writeback_v1($1::uuid, $2::uuid)",
        [CANDIDATE, "00000000-0000-0000-0000-000000000000"],
      ),
    ).rejects.toThrow(/no promoted record/);
  });

  it("promoter integration: a fresh promotion writes back in the same call", async () => {
    // Clone the fixture candidate into a second signal (new identity:
    // title, hashes, candidate id), with its own PROMOTE gate row.
    await database.query(
      `insert into public.live_data_signals (
         live_data_signal_id, signal_type, title, description, primary_stream_id,
         source_event_refs, entity_ids, entity_resolution_status, jurisdiction_id,
         severity, confidence_score, verification_state, supporting_statistics,
         evidence_refs, detection_rule_id, detection_rule_version, engine_id,
         engine_version, input_hash, signal_hash, source_freshness_at, detected_at,
         governance_status, supersedes_id, is_current, atlas_candidate_id,
         atlas_candidate_hash, atlas_semantic_key)
       select '11111111-2222-3333-4444-555555555555', signal_type, title || ' (second)',
         description, primary_stream_id, source_event_refs, entity_ids,
         entity_resolution_status, jurisdiction_id, severity, confidence_score,
         verification_state, supporting_statistics, evidence_refs,
         detection_rule_id, detection_rule_version, engine_id, engine_version,
         'f' || substr(input_hash, 2), 'f' || substr(signal_hash, 2),
         source_freshness_at, detected_at, 'observation_candidate', null, true,
         '22222222-3333-4444-5555-666666666666',
         'e' || substr(atlas_candidate_hash, 2),
         public.live_data_signal_semantic_key_v2(
           detection_rule_id, signal_type, primary_stream_id, jurisdiction_id,
           title || ' (second)', entity_ids)
        from public.live_data_signals where live_data_signal_id = $1`,
      [CANDIDATE],
    );
    await database.query(
      `insert into public.sunam_gate_log (
         live_signal_id, signal_fingerprint, signal_type, dataset_id,
         sunam_score, threshold_used, threshold_id, score_breakdown,
         decision_reason, actor, decided_at, created_at, gate_log_id)
       select '11111111-2222-3333-4444-555555555555', signal_fingerprint,
         signal_type, dataset_id, sunam_score, threshold_used, threshold_id,
         score_breakdown, decision_reason, 'sql_gate', decided_at,
         created_at, '33333333-4444-5555-6666-777777777777'
        from public.sunam_gate_log where gate_log_id = $1`,
      [GATE_LOG],
    );
    await database.query(
      "update public.sunam_gate_log set decision = 'PROMOTE' where gate_log_id = '33333333-4444-5555-6666-777777777777'",
    );

    const promoted = await one<{ r: Record<string, unknown> }>(
      `select public.promote_gate_signal(
         '33333333-4444-5555-6666-777777777777', 'cross_jurisdiction_recurrence',
         'cfpb_complaints', 'cfpb_complaints', 'multi_jurisdiction', 0.95,
         'critical', 'active', now(), null, 'atlas.domain3_population_exact',
         'atlas.domain3.cross_jurisdiction_recurrence', '1.0.0', 'atlas_bridge',
         'unresolved', '{}'::jsonb, '{}'::jsonb,
         '11111111-2222-3333-4444-555555555555') as r`,
    );
    expect(promoted.r?.status).toBe("promoted");
    expect(promoted.r?.promoted_live_data_signal_id).toBeTruthy();

    const second = await one(
      "select is_current from public.live_data_signals where live_data_signal_id = '11111111-2222-3333-4444-555555555555'",
    );
    expect(second?.is_current).toBe(false);
    const writeback = await one(
      "select governance_status, is_current from public.live_data_signals where live_data_signal_id = $1",
      [promoted.r?.promoted_live_data_signal_id],
    );
    expect(writeback).toMatchObject({ governance_status: "promoted", is_current: true });
  });

  it("re-emission case: the promoted row supersedes the CURRENT version of its semantic key, not the aged-out candidate", async () => {
    const OLDER = "44444444-5555-6666-7777-888888888888";
    const NEWER = "55555555-6666-7777-8888-999999999999";
    const GATE2 = "66666666-7777-8888-9999-aaaaaaaaaaaa";
    // Two versions of one semantic signal (title suffix makes a
    // distinct key from the other tests): OLDER was promoted by a
    // governed decision, then the bridge re-emitted NEWER as current.
    for (const [id, current] of [[OLDER, false], [NEWER, true]] as const) {
      await database.query(
        `insert into public.live_data_signals (
           live_data_signal_id, signal_type, title, description, primary_stream_id,
           source_event_refs, entity_ids, entity_resolution_status, jurisdiction_id,
           severity, confidence_score, verification_state, supporting_statistics,
           evidence_refs, detection_rule_id, detection_rule_version, engine_id,
           engine_version, input_hash, signal_hash, source_freshness_at, detected_at,
           governance_status, supersedes_id, is_current, atlas_candidate_id,
           atlas_candidate_hash, atlas_semantic_key)
         select $1, signal_type, title || ' (aged)', description, primary_stream_id,
           source_event_refs, entity_ids, entity_resolution_status, jurisdiction_id,
           severity, confidence_score, verification_state, supporting_statistics,
           evidence_refs, detection_rule_id, detection_rule_version, engine_id,
           engine_version,
           $2 || substr(input_hash, 2), $2 || substr(signal_hash, 2),
           source_freshness_at, detected_at, 'observation_candidate', null, $3,
           $4, $2 || substr(atlas_candidate_hash, 2),
           public.live_data_signal_semantic_key_v2(
             detection_rule_id, signal_type, primary_stream_id, jurisdiction_id,
             title || ' (aged)', entity_ids)
          from public.live_data_signals where live_data_signal_id = $5`,
        [id, id === OLDER ? "a" : "b", current, id === OLDER ? "77777777-8888-9999-aaaa-bbbbbbbbbbbb" : "88888888-9999-aaaa-bbbb-cccccccccccc", CANDIDATE],
      );
    }
    await database.query(
      `insert into public.signal_promotion_log (
         gate_log_id, decision_hash, live_signal_id, signal_type, source_system,
         jurisdiction_raw_value, composite_score, promotion_status, detected_signal_id)
       values ($1, 'testhash', $2, 'cross_jurisdiction_recurrence', 'cfpb_complaints',
         'multi_jurisdiction', 0.7838, 'promoted', '99999999-aaaa-bbbb-cccc-dddddddddddd')`,
      [GATE2, OLDER],
    );

    const result = await one<{ id: string }>(
      "select public.apply_signal_promotion_writeback_v1($1::uuid, $2::uuid) as id",
      [OLDER, GATE2],
    );
    const promotedRow = await one(
      "select supersedes_id, is_current, governance_status from public.live_data_signals where live_data_signal_id = $1",
      [result.id],
    );
    expect(promotedRow).toMatchObject({
      supersedes_id: NEWER,
      is_current: true,
      governance_status: "promoted",
    });
    const newer = await one(
      "select is_current from public.live_data_signals where live_data_signal_id = $1",
      [NEWER],
    );
    expect(newer?.is_current).toBe(false);
    const transition = await one(
      `select previous_live_data_signal_id from public.live_data_signal_semantic_transition_v1
        where current_live_data_signal_id = $1 and transition_reason = 'new_version'`,
      [result.id],
    );
    expect(transition?.previous_live_data_signal_id).toBe(NEWER);
  });
});
