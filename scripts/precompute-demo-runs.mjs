// One-off operational tool (docs/DECISIONS.md, 2026-11-01) — not part of the app
// bundle, not wired into `pnpm test`/CI. Run manually, locally, before a demo:
//   node scripts/precompute-demo-runs.mjs
// Requires the dev server running at http://localhost:3000 (`pnpm dev`). For each
// landing-page suggestion (src/components/dashboard/empty-state.tsx's SUGGESTIONS,
// duplicated here so this script has no import dependency on app code), POSTs a real
// run, consumes its SSE stream to completion (so every stage actually persists), and
// prints a ready-to-paste `PRECOMPUTED_DEMO_RUNS` object. Uses the real
// RUN_COST_CAP_USD from .env.local — deliberately not bumped — so the precomputed
// answer is exactly what a live, budget-constrained visitor would get.

const BASE_URL = 'http://localhost:3000';

const SUGGESTIONS = [
  'Does a polar aprotic solvent increase the rate of an SN2 reaction?',
  'Compare the evidence for CRISPR-Cas9 off-target rates at different guide RNA lengths.',
  'What does recent evidence say about horizontal gene transfer in antibiotic resistance?',
];

async function runOne(freeText) {
  const started = Date.now();
  const postRes = await fetch(`${BASE_URL}/api/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ freeText, userId: null, mode: 'auto', depth: 'balanced' }),
  });
  const postBody = await postRes.json();
  if (!postBody.streamUrl) {
    console.error(JSON.stringify({ freeText, error: 'no streamUrl', postBody }));
    return null;
  }

  const cookie = postRes.headers.get('set-cookie')?.split(';')[0] ?? '';
  const streamRes = await fetch(new URL(postBody.streamUrl, BASE_URL), { headers: { cookie } });

  let buffer = '';
  let finalStatus = null;
  let claimsTotal = null;
  for await (const chunk of streamRes.body) {
    buffer += new TextDecoder().decode(chunk);
    let end;
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      for (const line of block.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const event = JSON.parse(line.slice(6));
        if (event.type === 'done') finalStatus = event.status;
        if (event.type === 'receipt_ready') claimsTotal = event.receipt?.claimsTotal ?? null;
        if (event.type === 'stage_progress' || event.type === 'stage_started') {
          console.log(JSON.stringify({ freeText: freeText.slice(0, 40), ms: Date.now() - started, type: event.type, stage: event.stage, detail: event.detail }));
        }
      }
    }
  }

  return { freeText, runId: postBody.runId, intent: postBody.intent, status: finalStatus, claimsTotal, ms: Date.now() - started };
}

const results = [];
for (const text of SUGGESTIONS) {
  console.log(`\n--- running: ${text} ---`);
  const result = await runOne(text);
  if (result) results.push(result);
}

console.log('\n\n=== Results ===');
console.log(JSON.stringify(results, null, 2));

console.log('\n\n=== Paste into src/lib/precomputed-demo-runs.ts ===');
console.log('export const PRECOMPUTED_DEMO_RUNS: Record<string, { runId: string; intent: Intent }> = {');
for (const r of results) {
  console.log(`  ${JSON.stringify(r.freeText)}: { runId: ${JSON.stringify(r.runId)}, intent: ${JSON.stringify(r.intent)} }, // status: ${r.status}, claimsTotal: ${r.claimsTotal}`);
}
console.log('};');
