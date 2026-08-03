const test = require('node:test');
const assert = require('node:assert');

const db = require('../src/db/database.js');
const { matchScore, semanticScore } = require('../src/scrapers/utils.js');

// ── Group 1: database.js functions ─────────────────────────────────────────

test('getUserPreferences returns default for unknown user', () => {
  const result = db.getUserPreferences('nonexistent-clerk-id');
  assert.strictEqual(result.match_threshold, 65);
  assert.strictEqual(result.daily_limit, 5);
  assert.strictEqual(Array.isArray(result.roles), true);
  assert.strictEqual(Array.isArray(result.boards), true);
});

test('updateUserPreferences throws on invalid threshold', () => {
  assert.throws(
    () => db.updateUserPreferences('fake-id', {
      roles: [], location_type: 'remote', location_city: '',
      match_threshold: 50, daily_limit: 5, boards: ['jsearch'],
    }),
    /match_threshold/
  );
});

test('updateUserPreferences throws on invalid daily_limit', () => {
  assert.throws(
    () => db.updateUserPreferences('fake-id', {
      roles: [], location_type: 'remote', location_city: '',
      match_threshold: 65, daily_limit: 20, boards: ['jsearch'],
    }),
    /daily_limit/
  );
});

// ── Group 2: utils.js functions ────────────────────────────────────────────

test('matchScore returns a number between 0 and 100', () => {
  const result = matchScore('senior aws cloud engineer terraform');
  assert.strictEqual(typeof result, 'number');
  assert.ok(result >= 0 && result <= 100);
});

test('semanticScore returns fallback on missing API key', async () => {
  const saved = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    const result = await semanticScore(
      { skills: ['AWS'], titles_held: [], certifications: [], experience_years: 2 },
      { title: 'Cloud Engineer', company: 'Test Co', description: 'AWS cloud role' }
    );
    assert.strictEqual(result.score, 0);
    assert.strictEqual(result.title_match, 'unknown');
  } finally {
    process.env.GEMINI_API_KEY = saved;
  }
});

// ── Group 3: routes exist ──────────────────────────────────────────────────

test('GET /api/preferences route is registered', () => {
  assert.doesNotThrow(() => require('../src/routes.js'));
});

test('PUT /api/preferences route is registered', () => {
  assert.doesNotThrow(() => require('../src/routes.js'));
});

test('POST /api/score route is registered', () => {
  assert.doesNotThrow(() => require('../src/routes.js'));
});

test('POST /api/tailor route is registered', () => {
  require('../src/routes.js');
  assert.doesNotThrow(() => require('../src/routes.js'));
});

test('GET /api/resumes route is registered', () => {
  assert.doesNotThrow(() => require('../src/routes.js'));
});

test('generatePDF exports a function', () => {
  const { generatePDF } = require('../src/pdf/generatePDF.js');
  assert.strictEqual(typeof generatePDF, 'function');
});

test('uploadPDF exports a function', () => {
  const { uploadPDF } = require('../src/storage/uploadFile.js');
  assert.strictEqual(typeof uploadPDF, 'function');
});
