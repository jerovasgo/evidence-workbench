# 08 — Pathophysiology (mechanism) diagrams

## Purpose
From a natural-language question ("How does adrenaline act on the cardiomyocyte?"), build a 2D diagram of
a molecular mechanism — ligands, receptors, membranes, second messengers, kinases, effectors — grounded
in retrieved sources and verified like everything else. Flagship component #3.

## Hard rule
**The model never draws.** It proposes a `MechanismGraph` (JSON). Code validates it and renders it from
an SVG glyph library with a deterministic layout. Unsupported edges are not drawn.

## Position in the pipeline
Own pipeline for `mechanism` intent: `scope → retrieve (background sources) → extract → validate → coherence → render → sandbox`.
It reuses retrieval (02) and quote verification (03), but with `basis = 'background'` (no GRADE shown).

## Agents

### `mechanism-scoper` (T0, P16)
- **Input:** user question. **Output:** `{ pathway, scopeEntities: string[], compartments, outOfScope?: string, subQueries: string[] }`.
- **Rules:** restrict to **one** signalling pathway or mechanism per diagram (e.g., β1-adrenergic → Gs →
  AC → cAMP → PKA → effectors). Broad requests ("heart failure pathophysiology") are narrowed to a
  pathway and the user is told what was chosen and what was left out. Organ-level causal chains are out
  of v1: respond with a narrowing suggestion.
- 1 step, 500 tokens.

### `mechanism-extractor` (T1, P17)
- **Input:** passages (textbook-level open sources, review articles, Europe PMC full text, drug-label
  mechanism sections, Reactome/GtoPdb descriptions) tagged with ids and locators.
- **Output:** `MechanismGraph = { scope, entities[], interactions[] }` where each `Interaction` has
  `type`, `sign`, `order` (position in the cascade), and a verbatim `quote` + `passageId` (becomes a
  `Claim` with `basis='background'` and `actionType='mechanism'`). **SPEC §8 must add `'mechanism'` to
  `Claim.actionType`** (done in SPEC v0.3); views for other intents never show `actionType='mechanism'` claims.
- **Rules:** entities are normalized names with compartment; no entity or edge without a quote; do not
  infer edges from general knowledge; sign `+/−/0` only if the passage says activate/inhibit/etc.;
  second messengers must have a producer and consumer or be flagged.
- Limits: 1 step (+1 repair), 4,000 tokens, T1; parallel per source and merged in code.

### `coherence-judge` (T2, P18)
- **Input:** merged graph + quotes. **Output:** `{ issues: { kind: 'missing_step'|'sign_conflict'|'compartment_error'|'orphan'|'overreach', ids, note }[] }`.
- **Effect:** issues create visible warnings or remove the offending edge; it cannot add edges.

## Deterministic validation (`src/lib/validators/mechanism.ts`)
1. **Quote found** for every interaction (module 03 machinery).
2. **Cross-references:** each entity with a human gene/protein/compound name is resolved via
   `uniprot_lookup` / `chebi_lookup`; unresolved entities are drawn with a dashed "unresolved" style
   or removed if they have no supported interaction.
3. **Corroboration:** where Reactome or IUPHAR/BPS Guide to Pharmacology contains the interaction,
   record `corroboratedBy`; mismatch in sign vs database → warning and drop to "disputed" style.
   Licences verified 2026-10-26 (`docs/DAY0-VERIFICATION.md`): Reactome data CC0 (its illustrations are
   CC BY 4.0, so we draw our own glyphs); UniProt CC BY 4.0; ChEBI CC BY 4.0; GtoPdb is ODbL / CC BY-SA 4.0
   with commercial-access terms, so GtoPdb corroboration is **optional and off by default** until its
   terms are read; store only ids/flags, never copied text. Avoid KEGG. Credit all sources in the UI and
   `docs/ATTRIBUTIONS.md`.
4. **Structural checks:** every interaction endpoints exist; second messengers have producer and
   consumer; compartments consistent (a membrane receptor cannot be in the nucleus); no sign conflicts
   along a single path without a stated reason; graph connected from the ligand/trigger.
5. **Edge budget:** ≤ 25 entities and ≤ 40 interactions per diagram (readability); beyond that,
   split into sub-diagrams by compartment/stage.

## Rendering (`src/lib/render/mechanism/`)
- **Layout:** compartment lanes (extracellular, membrane, cytosol, nucleus) as horizontal bands;
  entities placed by ELK layered within lanes, ordered by `Interaction.order`; membrane drawn as a
  lipid-bilayer band; deterministic and seeded.
- **Glyph library:** SVG symbols per `Entity.kind` (ligand, GPCR, RTK, ion channel, G protein, enzyme,
  kinase, second messenger, transcription factor, other) in one consistent line style; sizes tokenised.
  Unit-tested for viewBox, stroke width, and accessible titles.
- **Edge style:** arrow for `activates/produces/phosphorylates`, blunt end for `inhibits`, dashed for
  `binds` (reversible) or "unresolved/disputed"; labels only on hover/focus to avoid clutter.
- **Step-through animation:** order 1..N highlights the cascade; respects `prefers-reduced-motion`
  (steps become a list with stepper controls).
- **Evidence drawer:** click an edge → quote, source, locator, corroboration badges.
- **Accessibility:** parallel textual cascade ("1. Ligand binds receptor → 2. …") for screen readers.

## Sandbox (qualitative propagation)
- Toggles: `agonist+`, `antagonist/block receptor`, `inhibit enzyme`, `knockout entity`, `add second
  messenger analogue` (as present in graph). Implemented as **sign propagation** over the graph:
  each node state ∈ {up, down, unchanged, unknown}; a toggle sets the source node state; propagation
  follows edge signs; conflicting influences → `unknown` (never invent a net effect).
- Effect text is generated from **code templates** citing the edges traversed ("Blocking the receptor
  → less Gs activation → less cAMP [edges 2,3,4]"). No free-text model output here.
- Persistent label: *qualitative graph propagation, not a kinetic simulation*. No doses, no treatment
  suggestions, no patient scenarios.
- **Bridge (stretch):** clicking a drug-target node lists guideline claims (verified) mentioning that
  drug class with grades. Only if time remains.

## Contracts
`Entity`, `Interaction`, `MechanismGraph` (SPEC §8); `SandboxState = Record<entityId, 'up'|'down'|'unchanged'|'unknown'>`;
`MechanismView = { graph, layout, warnings, unsupported: string[] }`.

## Failure modes and fallbacks
| Failure | Handling |
| --- | --- |
| Few open sources for a niche pathway | Smaller diagram with fewer edges, plus "unsupported" list; never fill from memory |
| Entity resolution fails | Dashed style + "unresolved"; excluded from sandbox propagation |
| Sources disagree on sign or step | Show both as "disputed"; propagation treats as `unknown` |
| Request too broad | Scoper narrows and says so; offer sibling pathways as buttons |
| Drift into tutoring chatbot | Keep the canvas as the answer; no long prose; link to clinical evidence bridge |

## Evaluation
- **Quote coverage:** 100% of drawn edges have verified quotes.
- **Cross-reference resolution:** ≥90% of entities resolve to UniProt/ChEBI; unresolved are visibly marked.
- **Precision vs database:** for 3–5 canonical pathways (e.g., GPCR–Gs–cAMP–PKA; β-arrestin; RTK–MAPK),
  compare edges to Reactome/GtoPdb: report edge precision and recall; hand-review any extra edges.
- **Propagation oracles:** unit tests for textbook cases — receptor antagonist lowers downstream cAMP;
  phosphodiesterase inhibition raises cAMP; adenylyl cyclase knockout blocks the PKA branch; conflicting
  paths yield `unknown`. Oracles cite sources in the test comment.
- **Structural invariants:** orphan/producer-consumer checks pass on 100% of rendered graphs.
- **Layout:** no overlap of glyphs and labels; entities stay in correct compartment lane (property tests).
- **Hallucination probe:** ask about a non-existent receptor/drug name; the system must abstain
  (pass/fail on 5 probes).
- **Human review:** clinical/pharmacology reviewer rates 3 diagrams (correct / minor errors / wrong);
  report.

## Build notes
Build only after the core (02–07) works end to end; thin vertical slice first: one pathway, glyphs for
5 entity kinds, no animation, then sandbox, then animation. Keep it behind a feature flag so it can be
cut without touching the rest (SPEC §14 cut order).

## Acceptance
One pathway rendered from a natural-language question with 100% quoted edges, ≥3 sandbox toggles,
step-through animation, and honest labelling as qualitative.
