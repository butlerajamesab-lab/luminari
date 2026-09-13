import type { declared_intake_submission } from "@shared/declared-intake-context";
import { getPool } from "./db-legacy";
import { storageDelete } from "./storage";

export type RegisteredIntakeContext = {
  document_id: number;
  intake_session_id: string;
};

export type IntakeCaseCreationInput = {
  user_id: number;
  name: string;
  description?: string;
  domain?: string;
  pipeline_type: string;
  declaration: declared_intake_submission;
};

export async function rollback_uncommitted_intake_case(args: {
  case_id: number;
  user_id: number;
}): Promise<void> {
  const client = await getPool().connect();
  let storage_keys: string[] = [];
  try {
    await client.query("begin");
    const owned_case = await client.query<{ id: number }>(
      `select id
         from public.cases
        where id = $1::integer
          and user_id = $2::integer
        for update`,
      [args.case_id, args.user_id],
    );
    if (!owned_case.rows[0]) {
      throw new Error("uncommitted_intake_case_not_owned");
    }

    const linked_sessions = await client.query<{ intake_session_id: string }>(
      `select link.intake_session_id::text as intake_session_id
         from public.case_identity_bridge bridge
         join public.case_intake_links link
           on link.case_uuid = bridge.case_uuid
        where bridge.legacy_case_id = $1::integer
        for update of link`,
      [args.case_id],
    );
    const intake_session_ids = linked_sessions.rows.map(
      (row) => row.intake_session_id,
    );
    const stored_documents = await client.query<{ s3_key: string | null }>(
      `select s3_key
         from public.documents
        where case_id = $1::integer
        for update`,
      [args.case_id],
    );
    storage_keys = stored_documents.rows
      .map((row) => row.s3_key)
      .filter((key): key is string => Boolean(key));

    await client.query(
      `delete from public.intake_artifacts artifact
        using public.case_intake_links link,
              public.case_identity_bridge bridge
        where artifact.intake_session_id = link.intake_session_id
          and link.case_uuid = bridge.case_uuid
          and bridge.legacy_case_id = $1::integer
          and artifact.artifact_status = 'registered'`,
      [args.case_id],
    );
    await client.query(
      `delete from public.documents
        where case_id = $1::integer`,
      [args.case_id],
    );
    await client.query(
      `delete from public.cases
        where id = $1::integer
          and user_id = $2::integer`,
      [args.case_id, args.user_id],
    );

    if (intake_session_ids.length > 0) {
      await client.query(
        `delete from public.intake_sessions session
          where session.intake_session_id = any($1::uuid[])
            and session.owner_user_id = $2::integer
            and not exists (
              select 1
                from public.case_intake_links remaining_link
               where remaining_link.intake_session_id = session.intake_session_id
            )
            and not exists (
              select 1
                from public.intake_artifacts remaining_artifact
               where remaining_artifact.intake_session_id = session.intake_session_id
            )`,
        [intake_session_ids, args.user_id],
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  const storage_cleanup = await Promise.allSettled(
    storage_keys.map((storage_key) => storageDelete(storage_key)),
  );
  const storage_errors = storage_cleanup
    .filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    )
    .map((result) => result.reason);
  if (storage_errors.length > 0) {
    throw new AggregateError(
      storage_errors,
      "uncommitted_intake_case_storage_cleanup_failed",
    );
  }
}

export async function create_intake_case_with_compensation<
  T extends RegisteredIntakeContext,
>(args: {
  input: IntakeCaseCreationInput;
  create_case: () => Promise<number>;
  register_context: (case_id: number) => Promise<T>;
  rollback_case?: (case_id: number, user_id: number) => Promise<void>;
}): Promise<{ case_id: number; registered: T }> {
  const case_id = await args.create_case();
  try {
    const registered = await args.register_context(case_id);
    return { case_id, registered };
  } catch (registration_error) {
    try {
      await (
        args.rollback_case ??
        (async (failed_case_id, user_id) => {
          await rollback_uncommitted_intake_case({
            case_id: failed_case_id,
            user_id,
          });
        })
      )(case_id, args.input.user_id);
    } catch (rollback_error) {
      throw new AggregateError(
        [registration_error, rollback_error],
        "intake_case_creation_failed_and_rollback_failed",
      );
    }
    throw registration_error;
  }
}
