type IntakeReviewStatusInput = {
  completion_state: string;
  projection_invalidated_at: string | null;
  last_successful_review_epoch_ms: string | number | null;
};

/**
 * Invalidation metadata is history, not a permanent request to rerun. A
 * successful run audit is written after governed finalization and promotion,
 * including on an idempotent replay that reuses previously sealed layers.
 * Keep the original timestamp while distinguishing outstanding invalidation.
 */
export function resolve_intake_review_status(input: IntakeReviewStatusInput) {
  const completed_ms = input.last_successful_review_epoch_ms === null
    ? NaN
    : Number(input.last_successful_review_epoch_ms);
  const has_completion_time = Number.isFinite(completed_ms)
    && completed_ms > 0
    && completed_ms <= 8.64e15;
  const last_governed_completed_at = has_completion_time
    ? new Date(completed_ms).toISOString()
    : null;
  const invalidated_ms = input.projection_invalidated_at
    ? Date.parse(input.projection_invalidated_at)
    : NaN;

  return {
    last_governed_completed_at,
    projection_requires_review: Boolean(input.projection_invalidated_at) && (
      input.completion_state !== 'governed_execution_complete'
      || !has_completion_time
      || !Number.isFinite(invalidated_ms)
      // Equal timestamps cannot establish that the review covered the change.
      || invalidated_ms >= completed_ms
    ),
  };
}
