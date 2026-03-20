'use strict';

process.env.NODE_ENV = 'test';
process.env.EDITOR_TOKEN = 'test-editor-token-32chars!!!!';
process.env.DATABASE_URL = 'postgres://localhost/test';
process.env.NEWSAPI_KEY = 'test-key';

const { makeMockPool } = require('../helpers/mockPool');
const { pinnedArticle, manualArticle } = require('../helpers/fixtures');
const request = require('supertest');

let mockPool = makeMockPool();
jest.mock('pg', () => ({ Pool: jest.fn().mockImplementation(() => mockPool) }));
jest.mock('node-fetch', () => jest.fn());

const { app, curation } = require('../../server');

beforeEach(() => {
  curation.pinned = [];
  curation.manual = [];
  mockPool.query.mockClear();
});

describe('GET /api/news', () => {
  test('returns 200 with empty articles when curation is empty', async () => {
    const res = await request(app).get('/api/news');
    expect(res.status).toBe(200);
    expect(res.body.articles).toEqual([]);
  });

  test('returns pinned article with pinned: true', async () => {
    curation.pinned = [pinnedArticle];
    const res = await request(app).get('/api/news');
    expect(res.status).toBe(200);
    expect(res.body.articles).toHaveLength(1);
    expect(res.body.articles[0].pinned).toBe(true);
    expect(res.body.articles[0].id).toBe('pinned-0');
  });

  test('returns manual article with manual: true', async () => {
    curation.manual = [manualArticle];
    const res = await request(app).get('/api/news');
    expect(res.status).toBe(200);
    expect(res.body.articles).toHaveLength(1);
    expect(res.body.articles[0].manual).toBe(true);
    expect(res.body.articles[0].id).toBe('manual-0');
  });

  test('returns mixed articles sorted by publishedAt descending', async () => {
    curation.pinned = [{ ...pinnedArticle, publishedAt: '2025-01-01T00:00:00Z' }];
    curation.manual = [{ ...manualArticle, publishedAt: '2025-06-01T00:00:00Z' }];
    const res = await request(app).get('/api/news');
    expect(res.body.articles[0].manual).toBe(true);  // newer
    expect(res.body.articles[1].pinned).toBe(true);  // older
  });

  test('sets Cache-Control: no-store', async () => {
    const res = await request(app).get('/api/news');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  test('does not require authentication', async () => {
    const res = await request(app).get('/api/news');
    expect(res.status).toBe(200);
  });
});
