import test from 'node:test';
import assert from 'node:assert/strict';
process.env.RUNTIME_SERVER_NO_LISTEN = '1';
const { applyControllerReviewRound } = await import('../server.mjs');

test('controller review starts at round 1 and preserves the three-round human gate', () => {
  const raw = { decision: 'revision_required', next_action: 'revise', reason: '证据不足' };
  const first = applyControllerReviewRound(raw, 1, 3);
  assert.equal(first.decision, 'revision_required');
  assert.equal(first.review_round, 1);
  assert.equal(first.max_review_rounds, 3);

  const second = applyControllerReviewRound(raw, 2, 3);
  assert.equal(second.decision, 'revision_required');
  assert.equal(second.review_round, 2);

  const third = applyControllerReviewRound(raw, 3, 3);
  assert.equal(third.decision, 'needs_human');
  assert.equal(third.next_action, 'human_review');
  assert.equal(third.review_round, 3);
  assert.equal(third.max_review_rounds, 3);

  const approved = applyControllerReviewRound({ decision: 'approved' }, 3, 3);
  assert.equal(approved.decision, 'approved');
});
