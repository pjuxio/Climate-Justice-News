/**
 * run-lighthouse.mjs — Lighthouse audit
 *
 * Usage:  node scripts/helpers/run-lighthouse.mjs <url>
 * Output: JSON to stdout
 *
 * Runs a Lighthouse audit against <url> using a headless Chrome instance
 * and reports category scores plus flagged audits (score < 1).
 *
 * Categories: performance · accessibility · best-practices · seo
 */

import { launch as launchChrome } from 'chrome-launcher';
import lighthouse from 'lighthouse';

const url = process.argv[2];
if (!url) {
  console.error('Usage: node run-lighthouse.mjs <url>');
  process.exit(1);
}

const chrome = await launchChrome({
  chromeFlags: ['--headless', '--no-sandbox', '--disable-gpu'],
});

let report;
try {
  const runnerResult = await lighthouse(url, {
    logLevel: 'silent',
    output: 'json',
    port: chrome.port,
    onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
    // Give the SPA enough time to settle
    extraHeaders: {},
    throttlingMethod: 'simulate',
  });

  const lhr = runnerResult.lhr;

  // Category scores (0–100)
  const scores = Object.fromEntries(
    Object.entries(lhr.categories).map(([key, cat]) => [
      key,
      Math.round(cat.score * 100),
    ]),
  );

  // Audits that scored below 1 (i.e. have room for improvement)
  const failedAudits = Object.entries(lhr.audits)
    .filter(([, a]) => a.score !== null && a.score < 1)
    .map(([id, a]) => ({
      id,
      title:        a.title,
      score:        a.score,
      displayValue: a.displayValue ?? null,
    }))
    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0));

  report = {
    url,
    testedAt:    new Date().toISOString(),
    lighthouseVersion: lhr.lighthouseVersion,
    scores,
    failedAudits,
  };
} finally {
  await chrome.kill();
}

console.log(JSON.stringify(report, null, 2));
