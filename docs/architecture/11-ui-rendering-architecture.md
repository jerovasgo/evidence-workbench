# 11 — UI rendering architecture

## Purpose
Render streamed, verified results as fast-to-read visuals in a minimalist, futuristic, elegant interface,
with provenance and grade always one click away. Defines client state, component boundaries, rendering
of each view, and performance/accessibility rules. Visual language is in SPEC §11; this file is about
how to build it.

## Position
Client side of every module. Consumes the SSE stream (01) and the typed views (06–09).

## Architecture

```text
app/
  (marketing)/page.tsx         home: single input + examples
  runs/[id]/page.tsx           result shell (band, tabs, receipt, footer)
  watches/…, pool/…            watch list/builder/inbox; local pool
components/
  band/ evidence-drawer/ receipt/ provenance-chip/ grade-badge/ divergence-card/
  views/algorithm/ views/map/ views/matrix/ views/mechanism/ views/answer-card/
  primitives/ (Radix/shadcn wrappers using tokens)
lib/
  stream/ (SSE client + reducer)   state/ (store)   tokens/ (design tokens)   i18n/
```

- **Data flow:** `EventSource` → `runReducer(state, RunEvent)` → store (Zustand or `useReducer` +
  context). The reducer is pure and typed against the shared `RunEvent` union. Views read **selectors**
  only; they never fetch data themselves.
- **Server components** for static shell and precomputed results; client components for interactive
  canvases. Precomputed results are statically rendered/ISR where possible (instant first paint).
- **URL state** (view, selected node, filters, parameter chips) so any state is linkable and restorable.
- **Single evidence drawer** component keyed by `claimId`; every node/cell/edge opens it.

## Rendering responsibilities by view
- **Band (hero):** renders from `band_ready` — red flags, first action, state. Must be visible without
  scrolling at 375×667. Skeleton shown before the event. Never waits for the full graph.
- **Algorithm:** React Flow with custom nodes (shape/colour by `type`, urgency accent), elk layout
  computed in a Web Worker for graphs >20 nodes; "see all" vs "walk the path" toggle; branch collapse;
  keyboard: arrows move between nodes, Enter opens the drawer, `[`/`]` collapse/expand.
- **Map:** radial layout (d3/ELK) rendered as SVG via React Flow; badges as small SVG glyphs (certainty
  pips, strength arrows); secondary relation edges toggle; collapsed by default.
- **Matrix:** semantic HTML `<table>` (not canvas) with sticky headers, cell state icons + text,
  filters (disagreements, safety-critical), CSV export. This is the most accessible and most used view.
- **Mechanism:** SVG canvas from glyph library; lanes; step-through with a stepper; sandbox toggles as
  segmented controls; textual cascade for screen readers.
- **Answer card:** headline ≤25 words, claims, basis, abstention state.
- **Receipt:** compact bar ("38 claims · 38 citations exist · 38 quotes found · 0 retracted · 2 abstained");
  expands to counts and source mix.
- **Divergence card:** two columns + classification + decision buttons (module 05).

## Design tokens and components
- Tokens in `lib/tokens/` (CSS variables) generated from one TS file; dark-first with light theme;
  certainty ramp as luminance steps of the accent + 4 pips + text label (never colour alone).
- Typography: Geist Sans / Mono via `next/font`; numbers in mono for alignment.
- Motion: 150–250 ms; Motion library; `prefers-reduced-motion` disables spatial animation and uses fades.
- Mascot (if adopted): only in empty/loading states and logo; never in clinical content.
- Copy: use verbs *navigate, compare, audit, verify*; no "recommends/advises" (lint rule on i18n strings).

## Streaming UX
- Stage progress list ("Searching guidelines · Reading 14 sources · Verifying quotes…") with counts.
- Partial results appear as they verify; unfinished parts are skeletons with stable dimensions to avoid
  layout shift (CLS budget).
- Failure states: what failed, what still works, retry button; abstain state is a designed screen
  explaining what was missing and offering "broaden sources" or "ask a different question".

## Performance budgets
- LCP ≤2.5 s on precomputed results (4G throttle); JS for the home route ≤150 KB gz; heavy libraries
  (React Flow, elk) code-split per view; layout in a Web Worker; memoized node components; virtualize
  long lists (matrix >100 rows).
- Interaction latency: open drawer ≤100 ms; toggle collapse ≤100 ms for ≤60 nodes.

## Accessibility and i18n
- WCAG AA contrast; focus rings; full keyboard operation; tree/list fallbacks for canvases; ARIA
  labels from claim labels; live region announces stage changes politely.
- ES/EN via a typed message catalogue; source quotes remain in their original language with a label;
  numbers/units locale-safe; no text baked into images.
- Mobile-first layouts; print stylesheet for a one-page "algorithm card" including the receipt line and
  limits statement.

## Failure modes and fallbacks
| Failure | Handling |
| --- | --- |
| Canvas performance on low-end devices | Switch to list/table view automatically above node thresholds |
| SSE drops | Auto-reconnect with `Last-Event-ID`; reducer idempotent; fall back to polling run status |
| Layout worker error | Use a simple synchronous fallback layout and log |
| Missing translation | Fallback to English and log key |

## Evaluation
- **Reducer tests:** every `RunEvent` type, out-of-order and duplicate events, reconnection.
- **Component tests:** badge rendering rules (source vs AI-estimated style differ; abstain state visible;
  `partial` shows caveat).
- **Playwright:** end-to-end for each intent on precomputed data; keyboard-only traversal of algorithm,
  map and matrix; reduced-motion mode; mobile viewport (375 px) screenshot test for the band.
- **Accessibility:** axe scans on all routes (no critical/serious violations); manual screen-reader
  smoke test of matrix and mechanism cascade.
- **Visual regression:** snapshot of key views with fixture data (tolerance small; review diffs).
- **Performance:** Lighthouse CI budgets above; CLS ≤0.1 during streaming.
- **Copy lint:** CI fails on banned phrases in UI strings.
- **Usability (lightweight):** 3–5 people (ideally clinicians) perform: "find first action", "find the
  disagreement", "see why this is graded low"; report success and time honestly.

## Build notes
Start the shell, tokens, drawer and matrix on Day 1–2 with fixture data so UI work never blocks on the
pipeline. Add the stream reducer on Day 2, algorithm/map on Day 6–7, mechanism last. Keep views dumb:
all rules live in `lib/` pure functions already covered by tests.

## Acceptance
All views render from fixtures and from live streams; drawer works everywhere; keyboard and
reduced-motion pass; band readable on a phone without scrolling.
