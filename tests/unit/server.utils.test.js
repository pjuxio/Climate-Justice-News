'use strict';

process.env.NODE_ENV = 'test';
process.env.EDITOR_TOKEN = 'test-editor-token-32chars!!!!';
process.env.DATABASE_URL = 'postgres://localhost/test';
process.env.NEWSAPI_KEY = 'test-key';

// Mock pg before requiring server.js
const { makeMockPool } = require('../helpers/mockPool');
let mockPool = makeMockPool();

jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => mockPool),
}));
jest.mock('node-fetch', () => jest.fn());

const {
  isSafeUrl,
  buildQuery,
  normalizeArticle,
  categorize,
  buildPublicFeed,
  estimateReadTime,
  curation,
} = require('../../server');

/* ── isSafeUrl ──────────────────────────────────────────────────────────────── */
describe('isSafeUrl()', () => {
  test('accepts https URL', () => {
    expect(isSafeUrl('https://example.com/path')).toBe(true);
  });

  test('accepts http URL', () => {
    expect(isSafeUrl('http://example.com')).toBe(true);
  });

  test('rejects javascript: protocol', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
  });

  test('rejects data: URI', () => {
    expect(isSafeUrl('data:text/html,<h1>x</h1>')).toBe(false);
  });

  test('rejects empty string', () => {
    expect(isSafeUrl('')).toBe(false);
  });

  test('rejects non-URL string', () => {
    expect(isSafeUrl('not a url')).toBe(false);
  });

  test('rejects null', () => {
    expect(isSafeUrl(null)).toBe(false);
  });

  test('rejects ftp: protocol', () => {
    expect(isSafeUrl('ftp://files.example.com')).toBe(false);
  });

  test('accepts URL with query string', () => {
    expect(isSafeUrl('https://example.com/page?id=1&ref=2')).toBe(true);
  });
});

/* ── estimateReadTime ───────────────────────────────────────────────────────── */
describe('estimateReadTime()', () => {
  test('returns 1 for empty/null text', () => {
    expect(estimateReadTime('')).toBe(1);
    expect(estimateReadTime(null)).toBe(1);
    expect(estimateReadTime(undefined)).toBe(1);
  });

  test('returns 1 for short text under 200 words', () => {
    expect(estimateReadTime('hello world')).toBe(1);
  });

  test('returns 2 for ~400-word text', () => {
    const text = 'word '.repeat(400);
    expect(estimateReadTime(text)).toBe(2);
  });

  test('rounds up fractional minutes', () => {
    // 201 words → ceil(201/200) = 2
    const text = 'word '.repeat(201);
    expect(estimateReadTime(text)).toBe(2);
  });
});

/* ── buildQuery ─────────────────────────────────────────────────────────────── */
describe('buildQuery()', () => {
  test('returns base query for global region', () => {
    const q = buildQuery('global');
    expect(q).toContain('"climate justice"');
    expect(q).not.toContain('AND');
  });

  test('appends regional terms for africa', () => {
    const q = buildQuery('africa');
    expect(q).toContain('AND');
    expect(q).toContain('Africa');
    expect(q).toContain('Nigeria');
  });

  test('appends regional terms for americas', () => {
    const q = buildQuery('americas');
    expect(q).toContain('"North America"');
  });

  test('appends regional terms for asia', () => {
    const q = buildQuery('asia');
    expect(q).toContain('Asia');
    expect(q).toContain('India');
  });

  test('appends regional terms for europe', () => {
    const q = buildQuery('europe');
    expect(q).toContain('Europe');
    expect(q).toContain('"European Union"');
  });

  test('appends regional terms for mena', () => {
    const q = buildQuery('mena');
    expect(q).toContain('MENA');
    expect(q).toContain('"Middle East"');
  });

  test('returns base query for unknown region', () => {
    const q = buildQuery('mars');
    expect(q).toContain('"climate justice"');
    expect(q).not.toContain('AND');
  });

  test('returns base query for undefined', () => {
    const q = buildQuery(undefined);
    expect(q).not.toContain('AND');
  });
});

/* ── normalizeArticle ───────────────────────────────────────────────────────── */
describe('normalizeArticle()', () => {
  const full = {
    title: 'Climate Policy Advances in EU',
    source: { name: 'Reuters' },
    author: 'Jane Smith',
    description: 'The EU passed landmark climate legislation.',
    url: 'https://reuters.com/climate/policy-2025',
    urlToImage: 'https://reuters.com/img/climate.jpg',
    publishedAt: '2025-03-15T12:00:00Z',
    content: 'Full article text.',
  };

  test('maps all fields correctly', () => {
    const result = normalizeArticle(full, 0);
    expect(result.id).toBe(0);
    expect(result.title).toBe('Climate Policy Advances in EU');
    expect(result.source).toBe('Reuters');
    expect(result.author).toBe('Jane Smith');
    expect(result.description).toBe('The EU passed landmark climate legislation.');
    expect(result.url).toBe('https://reuters.com/climate/policy-2025');
    expect(result.image).toBe('https://reuters.com/img/climate.jpg');
    expect(result.publishedAt).toBe('2025-03-15T12:00:00Z');
  });

  test('id equals the passed index', () => {
    expect(normalizeArticle(full, 5).id).toBe(5);
    expect(normalizeArticle(full, 99).id).toBe(99);
  });

  test('defaults title to Untitled when missing', () => {
    expect(normalizeArticle({ ...full, title: '' }, 0).title).toBe('Untitled');
    expect(normalizeArticle({ ...full, title: null }, 0).title).toBe('Untitled');
  });

  test('defaults source to Unknown Source when missing', () => {
    expect(normalizeArticle({ ...full, source: null }, 0).source).toBe('Unknown Source');
    expect(normalizeArticle({ ...full, source: {} }, 0).source).toBe('Unknown Source');
  });

  test('sets url to null for unsafe URL', () => {
    expect(normalizeArticle({ ...full, url: 'javascript:alert(1)' }, 0).url).toBeNull();
  });

  test('sets image to null for unsafe urlToImage', () => {
    expect(normalizeArticle({ ...full, urlToImage: 'javascript:bad' }, 0).image).toBeNull();
  });

  test('sets image to null when urlToImage is missing', () => {
    expect(normalizeArticle({ ...full, urlToImage: null }, 0).image).toBeNull();
  });

  test('defaults description to empty string when missing', () => {
    expect(normalizeArticle({ ...full, description: null }, 0).description).toBe('');
  });

  test('sets author to null when missing', () => {
    expect(normalizeArticle({ ...full, author: null }, 0).author).toBeNull();
  });

  test('readTime is at least 1', () => {
    expect(normalizeArticle({ ...full, description: '', content: '' }, 0).readTime).toBe(1);
  });

  test('readTime reflects word count of description + content', () => {
    const bigContent = 'word '.repeat(400);
    const result = normalizeArticle({ ...full, description: '', content: bigContent }, 0);
    expect(result.readTime).toBe(2);
  });
});

/* ── categorize ─────────────────────────────────────────────────────────────── */
describe('categorize()', () => {
  function art(title, description = '') {
    return { title, description };
  }

  test('returns Policy for legislation keyword', () => {
    expect(categorize(art('New climate legislation passed'))).toBe('Policy');
  });

  test('returns Policy for COP keyword', () => {
    expect(categorize(art('COP30 summit in Brazil begins'))).toBe('Policy');
  });

  test('returns Policy for government keyword', () => {
    expect(categorize(art('Government issues new climate regulation'))).toBe('Policy');
  });

  test('returns Community for grassroots keyword', () => {
    // Note: avoid 'activists' as it contains 'act' which matches the Policy regex first
    expect(categorize(art('Grassroots groups organize protest march'))).toBe('Community');
  });

  test('returns Community for indigenous keyword', () => {
    expect(categorize(art('Indigenous peoples rights at climate talks'))).toBe('Community');
  });

  test('returns Community for protest keyword', () => {
    expect(categorize(art('Protest grows outside parliament'))).toBe('Community');
  });

  test('returns Science for study keyword', () => {
    expect(categorize(art('New temperature study published'))).toBe('Science');
  });

  test('returns Science for emissions keyword', () => {
    expect(categorize(art('Emissions report shows record high'))).toBe('Science');
  });

  test('returns Environment for ocean keyword', () => {
    expect(categorize(art('Ocean biodiversity declining rapidly'))).toBe('Environment');
  });

  test('returns Environment for forest keyword', () => {
    expect(categorize(art('Forest cover shrinks in Amazon'))).toBe('Environment');
  });

  test('returns General for no matching keywords', () => {
    expect(categorize(art('General climate article today'))).toBe('General');
  });

  test('Policy takes priority over Community keywords', () => {
    expect(categorize(art('Government grassroots bill protest'))).toBe('Policy');
  });

  test('is case-insensitive', () => {
    expect(categorize(art('LEGISLATION PASSED IN PARLIAMENT'))).toBe('Policy');
  });

  test('matches keyword in description when title has none', () => {
    expect(categorize(art('Climate update', 'New study shows temperature rise'))).toBe('Science');
  });
});

/* ── buildPublicFeed ────────────────────────────────────────────────────────── */
describe('buildPublicFeed()', () => {
  beforeEach(() => {
    curation.pinned = [];
    curation.manual = [];
  });

  test('returns empty array when no articles', () => {
    expect(buildPublicFeed()).toEqual([]);
  });

  test('returns pinned articles with pinned: true', () => {
    curation.pinned = [
      { url: 'https://a.com', title: 'A', publishedAt: '2025-01-01T00:00:00Z' },
    ];
    const result = buildPublicFeed();
    expect(result).toHaveLength(1);
    expect(result[0].pinned).toBe(true);
    expect(result[0].id).toBe('pinned-0');
  });

  test('returns manual articles with manual: true', () => {
    curation.manual = [
      { url: 'https://b.com', title: 'B', publishedAt: '2025-01-02T00:00:00Z' },
    ];
    const result = buildPublicFeed();
    expect(result).toHaveLength(1);
    expect(result[0].manual).toBe(true);
    expect(result[0].id).toBe('manual-0');
  });

  test('assigns correct ids to multiple pinned articles', () => {
    curation.pinned = [
      { url: 'https://a.com', title: 'A', publishedAt: '2025-01-01T00:00:00Z' },
      { url: 'https://b.com', title: 'B', publishedAt: '2025-01-02T00:00:00Z' },
    ];
    const result = buildPublicFeed();
    expect(result.map(r => r.id)).toContain('pinned-0');
    expect(result.map(r => r.id)).toContain('pinned-1');
  });

  test('sorts by publishedAt descending', () => {
    curation.pinned = [
      { url: 'https://a.com', title: 'Older', publishedAt: '2025-01-01T00:00:00Z' },
    ];
    curation.manual = [
      { url: 'https://b.com', title: 'Newer', publishedAt: '2025-06-01T00:00:00Z' },
    ];
    const result = buildPublicFeed();
    expect(result[0].title).toBe('Newer');
    expect(result[1].title).toBe('Older');
  });

  test('returns both pinned and manual articles', () => {
    curation.pinned = [{ url: 'https://p.com', publishedAt: '2025-01-01T00:00:00Z' }];
    curation.manual = [{ url: 'https://m.com', publishedAt: '2025-01-02T00:00:00Z' }];
    expect(buildPublicFeed()).toHaveLength(2);
  });
});
