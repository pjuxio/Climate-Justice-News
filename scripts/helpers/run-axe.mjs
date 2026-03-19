/**
 * run-axe.mjs — axe accessibility audit
 *
 * Usage:  node scripts/helpers/run-axe.mjs <url>
 * Output: JSON to stdout
 *
 * Loads <url> in a headless Chromium browser, waits for the JS feed
 * to render, then runs the full axe-core rule set and reports violations
 * grouped by impact level (critical → minor).
 */

import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const PAGE_TIMEOUT = 30000;

const url = process.argv[2];
if (!url) {
  console.error('Usage: node run-axe.mjs <url>');
  process.exit(1);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page    = await context.newPage();

await page.goto(url, { waitUntil: 'networkidle', timeout: PAGE_TIMEOUT });

// Give the SPA feed time to render cards
await page.waitForTimeout(3000);

const results = await new AxeBuilder({ page })
  .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
  .analyze();

await browser.close();

// Compact violation objects — keep only what's useful for the report
const violations = results.violations.map(v => ({
  id:          v.id,
  impact:      v.impact,
  description: v.description,
  helpUrl:     v.helpUrl,
  nodes:       v.nodes.length,
  // First affected node for context
  firstNode:   v.nodes[0]?.html?.slice(0, 120) ?? '',
}));

const impactCount = (impact) =>
  violations.filter(v => v.impact === impact).length;

console.log(JSON.stringify({
  url,
  testedAt:    new Date().toISOString(),
  summary: {
    violations: violations.length,
    passes:     results.passes.length,
    incomplete: results.incomplete.length,
    critical:   impactCount('critical'),
    serious:    impactCount('serious'),
    moderate:   impactCount('moderate'),
    minor:      impactCount('minor'),
  },
  violations,
}, null, 2));
