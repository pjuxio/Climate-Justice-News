/**
 * check-links.mjs — Broken link checker
 *
 * Usage:  node scripts/helpers/check-links.mjs <url>
 * Output: JSON to stdout
 *
 * Navigates to <url> with Playwright, collects all <a href> links,
 * then HEAD-requests each unique HTTP/HTTPS URL and reports which
 * ones return a non-2xx/3xx status or fail to connect.
 *
 * Internal links (same origin) are tested first; external article
 * links are sampled (up to MAX_EXTERNAL) to keep runtime reasonable.
 */

import { chromium } from 'playwright';

const MAX_EXTERNAL   = 30;   // cap on external article links to probe
const FETCH_TIMEOUT  = 12000; // ms per link request
const PAGE_TIMEOUT   = 30000; // ms to load the page

const url = process.argv[2];
if (!url) {
  console.error('Usage: node check-links.mjs <url>');
  process.exit(1);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function origin(u) {
  try { return new URL(u).origin; } catch { return null; }
}

async function probeLink(href) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(href, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'ClimateJusticeNews-LinkChecker/1.0' },
    });
    clearTimeout(timer);
    return { url: href, status: res.status, ok: res.status < 400 };
  } catch (err) {
    clearTimeout(timer);
    return { url: href, status: 0, ok: false, error: err.message };
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const browser = await chromium.launch({ headless: true });
const page    = await browser.newPage();

await page.goto(url, { waitUntil: 'networkidle', timeout: PAGE_TIMEOUT });

// Wait a moment for the JS feed to render
await page.waitForTimeout(3000);

const rawHrefs = await page.$$eval(
  'a[href]',
  els => els.map(el => el.href).filter(h => /^https?:\/\//.test(h)),
);
await browser.close();

const targetOrigin = origin(url);
const unique = [...new Set(rawHrefs)];

const internal = unique.filter(h => origin(h) === targetOrigin);
const external = unique.filter(h => origin(h) !== targetOrigin).slice(0, MAX_EXTERNAL);
const toProbe  = [...internal, ...external];

const results = await Promise.all(toProbe.map(probeLink));
const broken  = results.filter(r => !r.ok);

console.log(JSON.stringify({
  url,
  testedAt:       new Date().toISOString(),
  totalFound:     unique.length,
  totalTested:    results.length,
  internalTested: internal.length,
  externalTested: external.length,
  brokenCount:    broken.length,
  broken,
  all: results,
}, null, 2));
