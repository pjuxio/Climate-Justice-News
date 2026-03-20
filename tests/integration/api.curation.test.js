'use strict';

process.env.NODE_ENV = 'test';
process.env.EDITOR_TOKEN = 'test-editor-token-32chars!!!!';
process.env.DATABASE_URL = 'postgres://localhost/test';
process.env.NEWSAPI_KEY = 'test-key';

const { makeMockPool } = require('../helpers/mockPool');
const { pinnedArticle, manualArticle } = require('../helpers/fixtures');
const request = require('supertest');

const VALID_TOKEN = 'test-editor-token-32chars!!!!';

let mockPool = makeMockPool();
jest.mock('pg', () => ({ Pool: jest.fn().mockImplementation(() => mockPool) }));
jest.mock('node-fetch', () => jest.fn());

const { app, curation } = require('../../server');

beforeEach(() => {
  curation.pinned = [];
  curation.manual = [];
  mockPool.query.mockClear();
});

/* ── GET /api/curation ───────────────────────────────────────────────────────── */
describe('GET /api/curation', () => {
  test('returns 200 with empty arrays when curation is empty', async () => {
    const res = await request(app).get('/api/curation');
    expect(res.status).toBe(200);
    expect(res.body.pinned).toEqual([]);
    expect(res.body.manual).toEqual([]);
  });

  test('returns current curation state', async () => {
    curation.pinned = [pinnedArticle];
    curation.manual = [manualArticle];
    const res = await request(app).get('/api/curation');
    expect(res.body.pinned).toHaveLength(1);
    expect(res.body.manual).toHaveLength(1);
    expect(res.body.pinned[0].url).toBe(pinnedArticle.url);
  });

  test('does not require authentication', async () => {
    const res = await request(app).get('/api/curation');
    expect(res.status).toBe(200);
  });

  test('sets Cache-Control: no-store', async () => {
    const res = await request(app).get('/api/curation');
    expect(res.headers['cache-control']).toBe('no-store');
  });
});

/* ── GET /api/curation/verify ────────────────────────────────────────────────── */
describe('GET /api/curation/verify', () => {
  test('returns 200 with valid token', async () => {
    const res = await request(app)
      .get('/api/curation/verify')
      .set('X-Editor-Token', VALID_TOKEN);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  test('returns 401 with no token', async () => {
    const res = await request(app).get('/api/curation/verify');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  test('returns 401 with wrong token (same length)', async () => {
    const res = await request(app)
      .get('/api/curation/verify')
      .set('X-Editor-Token', 'wrong-editor-token-32chars!!!!');
    expect(res.status).toBe(401);
  });

  test('returns 401 with wrong token (different length)', async () => {
    const res = await request(app)
      .get('/api/curation/verify')
      .set('X-Editor-Token', 'shorttoken');
    expect(res.status).toBe(401);
  });

  test('sets Cache-Control: no-store', async () => {
    const res = await request(app)
      .get('/api/curation/verify')
      .set('X-Editor-Token', VALID_TOKEN);
    expect(res.headers['cache-control']).toBe('no-store');
  });
});
