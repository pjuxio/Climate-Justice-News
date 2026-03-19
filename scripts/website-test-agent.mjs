/**
 * Website Testing Agent for climatejustice.news
 *
 * Uses the Claude Agent SDK to orchestrate:
 *   - Broken link checking (all 5 pages)
 *   - Lighthouse audits (performance, accessibility, SEO, best-practices)
 *   - axe accessibility audits
 *
 * Requirements:
 *   - ANTHROPIC_API_KEY env var must be set
 *   - Run `npm install` first to install devDependencies
 *   - Run `npx playwright install chromium` once to download browser
 *
 * Usage:
 *   node scripts/website-test-agent.mjs
 *   TEST_URL=http://localhost:3000 node scripts/website-test-agent.mjs
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { mkdirSync } from 'fs';

const BASE_URL = process.env.TEST_URL || 'https://climatejustice.news';

// The 5 pages to test — covers home + all major filter states
const PAGES = [
  { path: '/',                  label: 'home'          },
  { path: '/?region=americas',  label: 'region-americas' },
  { path: '/?region=africa',    label: 'region-africa'   },
  { path: '/?region=asia',      label: 'region-asia'     },
  { path: '/?days=1',           label: 'days-1'          },
];

const pageList = PAGES
  .map((p, i) => `  ${i + 1}. ${BASE_URL}${p.path}  (label: ${p.label})`)
  .join('\n');

const PROMPT = `\
You are a website quality-assurance agent. Your job is to test ${BASE_URL} and
produce a consolidated report.

Pages to test (5 total):
${pageList}

Follow these steps exactly:

1. Ensure the reports/ directory exists (create it if needed).

2. For each page listed above, run the three test helpers in sequence:

   A. Broken-link check
      node scripts/helpers/check-links.mjs "<full-url>"
      Save stdout JSON → reports/<label>-links.json

   B. Axe accessibility audit
      node scripts/helpers/run-axe.mjs "<full-url>"
      Save stdout JSON → reports/<label>-axe.json

   C. Lighthouse audit
      node scripts/helpers/run-lighthouse.mjs "<full-url>"
      Save stdout JSON → reports/<label>-lighthouse.json

3. After all 15 test runs, read the saved JSON files and write a Markdown
   summary to reports/summary.md with the following sections:

   ## Summary — ${BASE_URL}
   Date: <ISO date>

   ### Broken Links
   A table listing any broken links found (URL, status, page).
   If none found, say "No broken links detected."

   ### Lighthouse Scores
   A table with columns: Page | Performance | Accessibility | Best Practices | SEO
   Add a ✅ for scores ≥ 90, ⚠️ for 70–89, ❌ for < 70.

   ### Axe Accessibility Violations
   A table: Page | Critical | Serious | Moderate | Minor | Total
   List unique violation IDs if any critical/serious issues exist.

   ### Overall Status
   PASS if no broken links and all Lighthouse accessibility scores ≥ 90 and
   no critical/serious axe violations. Otherwise FAIL with a brief reason.

Important notes:
- Each helper prints JSON to stdout. Capture it with shell redirection:
    node scripts/helpers/check-links.mjs "..." > reports/home-links.json
  Or capture programmatically — your choice.
- If a helper exits non-zero, save the error output to
  reports/<label>-<test>-error.txt and continue with the next test.
- Do not skip any pages or tests.
`;

// ─── Main ────────────────────────────────────────────────────────────────────

mkdirSync('reports', { recursive: true });

console.log('Climate Justice News — Website Testing Agent');
console.log('=============================================');
console.log(`Target : ${BASE_URL}`);
console.log(`Pages  : ${PAGES.length}`);
console.log('');

let turnCount = 0;

for await (const message of query({
  prompt: PROMPT,
  options: {
    cwd: process.cwd(),
    allowedTools: ['Bash', 'Read', 'Write'],
    permissionMode: 'acceptEdits',
    maxTurns: 100,
  },
})) {
  // Stream assistant text to stdout in real time
  if (message.type === 'assistant') {
    for (const block of (message.message?.content ?? [])) {
      if (block.type === 'text') process.stdout.write(block.text);
    }
    turnCount++;
  }

  // Final result
  if ('result' in message) {
    console.log('\n\n=============================================');
    console.log('Testing complete after', turnCount, 'turns.');
    console.log('Reports saved to reports/');
    console.log('Summary: reports/summary.md');
  }
}
