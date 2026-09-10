import { describe, expect, it } from 'vitest';

import { resolve_intake_review_status } from './intake-review-status';

const completion = '2026-09-10T19:04:23.450Z';
const complete_review = {
  completion_state: 'governed_execution_complete',
  projection_invalidated_at: '2026-09-01T07:14:54.891834+00:00',
  last_successful_review_epoch_ms: String(Date.parse(completion)),
};

describe('current intake review status', () => {
  it('resolves historical invalidation after a successful review without erasing it', () => {
    expect(resolve_intake_review_status(complete_review)).toEqual({
      last_governed_completed_at: completion,
      projection_requires_review: false,
    });
    expect(complete_review.projection_invalidated_at)
      .toBe('2026-09-01T07:14:54.891834+00:00');
  });

  it('requires another review for changes newer than the successful execution', () => {
    expect(resolve_intake_review_status({
      ...complete_review,
      projection_invalidated_at: '2026-09-10T19:04:24.000Z',
    }).projection_requires_review).toBe(true);
  });

  it('does not use an old success to mask evidence changes during promotion', () => {
    expect(resolve_intake_review_status({
      ...complete_review,
      completion_state: 'evidence_registered',
    }).projection_requires_review).toBe(true);
  });

  it('cannot establish ordering for equal or malformed invalidation timestamps', () => {
    for (const projection_invalidated_at of [completion, 'not-a-timestamp']) {
      expect(resolve_intake_review_status({
        ...complete_review,
        projection_invalidated_at,
      }).projection_requires_review).toBe(true);
    }
  });

  it('preserves the warning when successful completion cannot be proved', () => {
    for (const last_successful_review_epoch_ms of [null, '', 'invalid', 'Infinity']) {
      expect(resolve_intake_review_status({
        ...complete_review,
        last_successful_review_epoch_ms,
      })).toEqual({
        last_governed_completed_at: null,
        projection_requires_review: true,
      });
    }
  });

  it('does not invent an evidence-change warning when no invalidation exists', () => {
    expect(resolve_intake_review_status({
      completion_state: 'evidence_registered',
      projection_invalidated_at: null,
      last_successful_review_epoch_ms: null,
    }).projection_requires_review).toBe(false);
  });
});
