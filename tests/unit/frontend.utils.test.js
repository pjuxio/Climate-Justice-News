/**
 * @jest-environment jsdom
 *
 * Unit tests for pure utility functions from public/app.js.
 * Functions are extracted here to avoid bootstrapping the full DOM-dependent app.
 * Keep these in sync with the originals in public/app.js.
 */
'use strict';

/* ── Functions extracted from public/app.js ─────────────────────────────────── */

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(diff / 86_400_000);
  if (h < 1)  return 'Just now';
  if (h < 24) return `${h}h ago`;
  if (d < 7)  return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function initials(name) {
  return name.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

function getFaviconUrl(articleUrl) {
  try {
    const origin = new URL(articleUrl).origin;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(origin)}&sz=64`;
  } catch { return null; }
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* Server-side isSafeUrl — identical logic, tested independently */
function isSafeUrl(url) {
  try {
    const { protocol } = new URL(url);
    return protocol === 'https:' || protocol === 'http:';
  } catch { return false; }
}

/* ── escHtml ─────────────────────────────────────────────────────────────────── */
describe('escHtml()', () => {
  test('escapes ampersand', () => {
    expect(escHtml('a & b')).toBe('a &amp; b');
  });

  test('escapes less-than', () => {
    expect(escHtml('<script>')).toBe('&lt;script&gt;');
  });

  test('escapes greater-than', () => {
    expect(escHtml('5 > 3')).toBe('5 &gt; 3');
  });

  test('escapes double quote', () => {
    expect(escHtml('say "hello"')).toBe('say &quot;hello&quot;');
  });

  test('passes through text with no special chars', () => {
    expect(escHtml('hello world')).toBe('hello world');
  });

  test('fully escapes XSS payload', () => {
    const input = '<img src=x onerror=alert(1)>';
    expect(escHtml(input)).not.toContain('<');
    expect(escHtml(input)).not.toContain('>');
  });

  test('coerces number to string', () => {
    expect(escHtml(42)).toBe('42');
  });

  test('coerces null to string', () => {
    expect(escHtml(null)).toBe('null');
  });

  test('escapes all four special chars together', () => {
    expect(escHtml('<a href="b&c">')).toBe('&lt;a href=&quot;b&amp;c&quot;&gt;');
  });
});

/* ── isSafeUrl (frontend copy) ───────────────────────────────────────────────── */
describe('isSafeUrl() — frontend copy', () => {
  test('accepts https URL', () => expect(isSafeUrl('https://example.com')).toBe(true));
  test('accepts http URL', () => expect(isSafeUrl('http://example.com')).toBe(true));
  test('rejects javascript:', () => expect(isSafeUrl('javascript:alert(1)')).toBe(false));
  test('rejects data: URI', () => expect(isSafeUrl('data:text/html,x')).toBe(false));
  test('rejects empty string', () => expect(isSafeUrl('')).toBe(false));
  test('rejects plain text', () => expect(isSafeUrl('not a url')).toBe(false));
  test('rejects null', () => expect(isSafeUrl(null)).toBe(false));
  test('rejects ftp:', () => expect(isSafeUrl('ftp://files.example.com')).toBe(false));
});

/* ── timeAgo ─────────────────────────────────────────────────────────────────── */
describe('timeAgo()', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  function minsAgo(n) {
    return new Date(Date.now() - n * 60_000).toISOString();
  }
  function hoursAgo(n) {
    return new Date(Date.now() - n * 3_600_000).toISOString();
  }
  function daysAgo(n) {
    return new Date(Date.now() - n * 86_400_000).toISOString();
  }

  test('returns Just now for 30 minutes ago', () => {
    expect(timeAgo(minsAgo(30))).toBe('Just now');
  });

  test('returns 1h ago for exactly 1 hour ago', () => {
    expect(timeAgo(hoursAgo(1))).toBe('1h ago');
  });

  test('returns 5h ago for 5 hours ago', () => {
    expect(timeAgo(hoursAgo(5))).toBe('5h ago');
  });

  test('returns 23h ago for 23 hours ago', () => {
    expect(timeAgo(hoursAgo(23))).toBe('23h ago');
  });

  test('returns 1d ago for 1 day ago', () => {
    expect(timeAgo(daysAgo(1))).toBe('1d ago');
  });

  test('returns 6d ago for 6 days ago', () => {
    expect(timeAgo(daysAgo(6))).toBe('6d ago');
  });

  test('returns formatted date for 7+ days ago', () => {
    const result = timeAgo(daysAgo(10));
    // Should be a short date like "Mar 10" — not a relative time
    expect(result).not.toMatch(/ago/);
    expect(result).toMatch(/\w+ \d+/);
  });
});

/* ── initials ────────────────────────────────────────────────────────────────── */
describe('initials()', () => {
  test('two-word name', () => {
    expect(initials('The Guardian')).toBe('TG');
  });

  test('single word', () => {
    expect(initials('Reuters')).toBe('R');
  });

  test('three words uses only first two', () => {
    expect(initials('New York Times')).toBe('NY');
  });

  test('already uppercase', () => {
    expect(initials('BBC News')).toBe('BN');
  });
});

/* ── getFaviconUrl ───────────────────────────────────────────────────────────── */
describe('getFaviconUrl()', () => {
  test('returns Google favicon URL for valid https URL', () => {
    const result = getFaviconUrl('https://reuters.com/article/123');
    expect(result).toContain('https://www.google.com/s2/favicons');
    expect(result).toContain(encodeURIComponent('https://reuters.com'));
    expect(result).toContain('sz=64');
  });

  test('uses only the origin, not the full URL', () => {
    const result = getFaviconUrl('https://reuters.com/path/to/article?q=1');
    expect(result).toContain(encodeURIComponent('https://reuters.com'));
    expect(result).not.toContain('path/to/article');
  });

  test('returns null for invalid URL', () => {
    expect(getFaviconUrl('not-a-url')).toBeNull();
  });

  test('returns null for empty string', () => {
    expect(getFaviconUrl('')).toBeNull();
  });
});
