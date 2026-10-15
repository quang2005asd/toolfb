process.env.USE_SQLITE = 'true';

const test = require('node:test');
const assert = require('node:assert/strict');

const { isDueScheduledPost } = require('../src/utils/StandaloneScheduler');

test('scheduled post is due when ISO time has already passed', () => {
  const now = new Date('2026-10-14T12:00:00Z').getTime();

  assert.equal(isDueScheduledPost('2026-10-14T11:59:00.000Z', now), true);
  assert.equal(isDueScheduledPost('2026-10-14T12:00:00.000Z', now), true);
  assert.equal(isDueScheduledPost('2026-10-14T12:01:00.000Z', now), false);
});

test('scheduled post works with local datetime strings and ignores invalid values', () => {
  const now = new Date('2026-10-14T12:00:00Z').getTime();

  assert.equal(isDueScheduledPost('2026-10-14T12:00:00', now), true);
  assert.equal(isDueScheduledPost('', now), false);
  assert.equal(isDueScheduledPost('not-a-date', now), false);
});
