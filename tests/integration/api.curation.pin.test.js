'use strict';

process.env.NODE_ENV = 'test';
process.env.EDITOR_TOKEN = 'test-editor-token-32chars!!!!';
process.env.DATABASE_URL = 'postgres://localhost/test';
process.env.NEWSAPI_KEY = 'test-key';

const { makeMockPool } = require('../helpers/mockPool');
const { pinBody } = require('../helpers/fixtures');
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

function pin(body, token = VALID_TOKEN) {
  const req = request(app).post('/api/curation/pin');
  if (token) req.set('X-Editor-Token', token);
  return req.send(body);
}

function unpin(body, token = VALID_TOKEN) {
  const req = request(app).delete('/api/curation/pin');
  if (token) req.set('X-Editor-Token', token);
  return req.send(body);
}

/* ── POST /api/curation/pin ──────────────────────────────────────────────────── */
describe('POST /api/curation/pin', () => {
  test('pins a valid article and returns 200', async () => {
    const res = await pin(pinBody);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(curation.pinned).toHaveLength(1);
    expect(curation.pinned[0].url).toBe(pinBody.url);
  });

  test('persists article data correctly', async () => {
    await pin(pinBody);
    const saved = curation.pinned[0];
    expect(saved.title).toBe(pinBody.title);
    expect(saved.source).toBe(pinBody.source);
    expect(saved.category).toBe(pinBody.category);
    expect(saved.region).toBe(pinBody.region);
    expect(saved.note).toBe(pinBody.note);
    expect(saved.pinned).toBeUndefined(); // internal flag not stored
    expect(saved.pinnedAt).toBeTruthy();
  });

  test('is idempotent — does not duplicate the same URL', async () => {
    await pin(pinBody);
    await pin(pinBody);
    expect(curation.pinned).toHaveLength(1);
  });

  test('returns 400 for missing URL', async () => {
    const res = await pin({ ...pinBody, url: undefined });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid URL');
  });

  test('returns 400 for javascript: URL', async () => {
    const res = await pin({ ...pinBody, url: 'javascript:alert(1)' });
    expect(res.status).toBe(400);
  });

  test('returns 400 for data: URL', async () => {
    const res = await pin({ ...pinBody, url: 'data:text/html,x' });
    expect(res.status).toBe(400);
  });

  test('returns 401 with no auth token', async () => {
    const res = await pin(pinBody, null);
    expect(res.status).toBe(401);
  });

  test('returns 401 with wrong token', async () => {
    const res = await pin(pinBody, 'completely-wrong-token-!!!!!!!!!');
    expect(res.status).toBe(401);
  });

  test('uses General for invalid category', async () => {
    await pin({ ...pinBody, category: 'Fake' });
    expect(curation.pinned[0].category).toBe('General');
  });

  test('uses global for invalid region', async () => {
    await pin({ ...pinBody, region: 'mars' });
    expect(curation.pinned[0].region).toBe('global');
  });

  test('truncates title to 500 chars', async () => {
    const longTitle = 'x'.repeat(600);
    await pin({ ...pinBody, title: longTitle });
    expect(curation.pinned[0].title).toHaveLength(500);
  });

  test('truncates description to 2000 chars', async () => {
    const longDesc = 'x'.repeat(2500);
    await pin({ ...pinBody, description: longDesc });
    expect(curation.pinned[0].description).toHaveLength(2000);
  });

  test('clamps readTime to minimum 1', async () => {
    await pin({ ...pinBody, readTime: 0 });
    expect(curation.pinned[0].readTime).toBe(1);
  });

  test('clamps readTime to maximum 60', async () => {
    await pin({ ...pinBody, readTime: 999 });
    expect(curation.pinned[0].readTime).toBe(60);
  });

  test('uses current timestamp for invalid publishedAt', async () => {
    const before = Date.now();
    await pin({ ...pinBody, publishedAt: 'banana' });
    const savedDate = new Date(curation.pinned[0].publishedAt).getTime();
    expect(savedDate).toBeGreaterThanOrEqual(before);
  });

  test('sets image to null for unsafe image URL', async () => {
    await pin({ ...pinBody, image: 'javascript:bad' });
    expect(curation.pinned[0].image).toBeNull();
  });

  test('stores valid image URL', async () => {
    await pin({ ...pinBody, image: 'https://example.com/img.jpg' });
    expect(curation.pinned[0].image).toBe('https://example.com/img.jpg');
  });

  test('saves curation to database', async () => {
    await pin(pinBody);
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE curation'),
      expect.any(Array)
    );
  });
});

/* ── DELETE /api/curation/pin ────────────────────────────────────────────────── */
describe('DELETE /api/curation/pin', () => {
  beforeEach(async () => {
    await pin(pinBody);
    mockPool.query.mockClear();
  });

  test('removes a pinned article and returns 200', async () => {
    const res = await unpin({ url: pinBody.url });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(curation.pinned).toHaveLength(0);
  });

  test('is a no-op for a URL not in pinned', async () => {
    const res = await unpin({ url: 'https://not-pinned.com/article' });
    expect(res.status).toBe(200);
    expect(curation.pinned).toHaveLength(1); // unchanged
  });

  test('returns 400 for missing URL field', async () => {
    const res = await unpin({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('URL required');
  });

  test('returns 401 with no auth token', async () => {
    const res = await unpin({ url: pinBody.url }, null);
    expect(res.status).toBe(401);
  });

  test('saves curation to database after unpin', async () => {
    await unpin({ url: pinBody.url });
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE curation'),
      expect.any(Array)
    );
  });
});
