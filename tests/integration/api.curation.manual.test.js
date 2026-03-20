'use strict';

process.env.NODE_ENV = 'test';
process.env.EDITOR_TOKEN = 'test-editor-token-32chars!!!!';
process.env.DATABASE_URL = 'postgres://localhost/test';
process.env.NEWSAPI_KEY = 'test-key';

const { makeMockPool } = require('../helpers/mockPool');
const { manualBody } = require('../helpers/fixtures');
const request = require('supertest');

const VALID_TOKEN = 'test-editor-token-32chars!!!!';

let mockPool = makeMockPool();
jest.mock('pg', () => ({ Pool: jest.fn().mockImplementation(() => mockPool) }));
jest.mock('node-fetch', () => jest.fn());

const { app, curation } = require('../../server');

beforeEach(() => {
  curation.pinned = [];
  curation.manual = [];
  mockPool.query.mockResolvedValue({ rows: [] });
});

function addManual(body, token = VALID_TOKEN) {
  const req = request(app).post('/api/curation/manual');
  if (token) req.set('X-Editor-Token', token);
  return req.send(body);
}

function removeManual(body, token = VALID_TOKEN) {
  const req = request(app).delete('/api/curation/manual');
  if (token) req.set('X-Editor-Token', token);
  return req.send(body);
}

/* ── POST /api/curation/manual ───────────────────────────────────────────────── */
describe('POST /api/curation/manual', () => {
  test('adds a valid manual article and returns 200', async () => {
    const res = await addManual(manualBody);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(curation.manual).toHaveLength(1);
    expect(curation.manual[0].url).toBe(manualBody.url);
  });

  test('persists article data correctly', async () => {
    await addManual(manualBody);
    const saved = curation.manual[0];
    expect(saved.title).toBe(manualBody.title);
    expect(saved.source).toBe(manualBody.source);
    expect(saved.region).toBe(manualBody.region);
    expect(saved.addedAt).toBeTruthy();
    // manual articles have no 'note' field
    expect(saved.note).toBeUndefined();
  });

  test('is idempotent — does not duplicate the same URL', async () => {
    await addManual(manualBody);
    await addManual(manualBody);
    expect(curation.manual).toHaveLength(1);
  });

  test('returns 400 for missing URL', async () => {
    const res = await addManual({ ...manualBody, url: undefined });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid URL');
  });

  test('returns 400 for unsafe URL', async () => {
    const res = await addManual({ ...manualBody, url: 'javascript:alert(1)' });
    expect(res.status).toBe(400);
  });

  test('returns 401 with no auth token', async () => {
    const res = await addManual(manualBody, null);
    expect(res.status).toBe(401);
  });

  test('uses General for invalid category', async () => {
    await addManual({ ...manualBody, category: 'NotACategory' });
    expect(curation.manual[0].category).toBe('General');
  });

  test('uses global for invalid region', async () => {
    await addManual({ ...manualBody, region: 'atlantis' });
    expect(curation.manual[0].region).toBe('global');
  });

  test('clamps readTime to minimum 1', async () => {
    await addManual({ ...manualBody, readTime: 0 });
    expect(curation.manual[0].readTime).toBe(1);
  });

  test('clamps readTime to maximum 60', async () => {
    await addManual({ ...manualBody, readTime: 200 });
    expect(curation.manual[0].readTime).toBe(60);
  });

  test('manual article appears in GET /api/news', async () => {
    await addManual(manualBody);
    const res = await request(app).get('/api/news');
    expect(res.body.articles).toHaveLength(1);
    expect(res.body.articles[0].manual).toBe(true);
    expect(res.body.articles[0].url).toBe(manualBody.url);
  });

  test('saves curation to database', async () => {
    await addManual(manualBody);
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE curation'),
      expect.any(Array)
    );
  });
});

/* ── DELETE /api/curation/manual ─────────────────────────────────────────────── */
describe('DELETE /api/curation/manual', () => {
  beforeEach(async () => {
    await addManual(manualBody);
    mockPool.query.mockClear();
  });

  test('removes a manual article and returns 200', async () => {
    const res = await removeManual({ url: manualBody.url });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(curation.manual).toHaveLength(0);
  });

  test('is a no-op for a URL not in manual', async () => {
    const res = await removeManual({ url: 'https://not-added.com/article' });
    expect(res.status).toBe(200);
    expect(curation.manual).toHaveLength(1); // unchanged
  });

  test('returns 400 for missing URL field', async () => {
    const res = await removeManual({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('URL required');
  });

  test('returns 401 with no auth token', async () => {
    const res = await removeManual({ url: manualBody.url }, null);
    expect(res.status).toBe(401);
  });

  test('removed article no longer appears in GET /api/news', async () => {
    await removeManual({ url: manualBody.url });
    const res = await request(app).get('/api/news');
    expect(res.body.articles).toHaveLength(0);
  });
});
