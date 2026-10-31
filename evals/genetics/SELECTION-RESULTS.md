# Query-aware prioritization — 2026-10-31

Implemented deterministic title priority with explicit matched terms and criteria version, retaining uncertain candidates. This is lexical prioritization, not semantic screening or irreversible exclusion. Extraction still attempts queued sources within the existing time/cost limits. Source selection and final attempt status are stored in stage_outputs.

Sections retain original passage IDs and locators. Results/discussion precede introductory material for findings queries; explicit method and interpretation queries change priority. Each passage has pending/reviewed/unreviewed status and a completion/failure reason. Reviewed means extraction completed, not that claims passed support verification. Unknown section headings stay unknown. Audit persistence failures log a warning without aborting research. The saved audit is now accessible in the Evidence & Sources coverage panel, loaded on demand through the existing authorized run endpoint. It refreshes on completion or manual request without restarting research.

Live comparison (single observations, varying retrieved sources):
- Before: overview 16.087 s, done 38.777 s, 5 method claims, no findings.
- After: overview 10.483 s, done 65.752 s, 4 claims: 1 finding, 2 measurements, 1 method. Live regression passed, including at least two sources, an actual finding, concordance event and overview replay.
- Output includes reduced DIO2 mRNA and increased SATB2 mRNA under their respective reported conditions, from passages 4 and 8 rather than only initial passages. Different experimental systems do not establish contradiction.

Persisted coverage checked directly: source 42896440 completed extraction on 7 Results and 2 Discussion passages, plus Abstract and one unknown passage; 6 Introduction and 2 Conclusions passages remained unreviewed. Source 32403966 completed 2 Results passages; 5 Discussion, 2 Methods, 1 Introduction and 1 unknown remained unreviewed. Budget abstentions remain a limitation. This demonstrates deeper coverage, not comprehensive review or expert-validated recall. End-to-end overview is still above 10 seconds and deep processing became slower in this observation.

## Latency correction

The 65.752 s regression came from sending too many deep-reading passages to a medium-tier extractor with a 6,000-token output allowance. Individual extraction calls took 17–54 s, so additional section depth increased the critical path even though source retrieval was not the bottleneck.

The correction preserves section-balanced reading and the audit trail, but bounds each extraction batch to two passages, selects up to six passages per source across Results and Discussion, limits aggregate extraction concurrency, and runs quote-bound proposal extraction on the fast tier with a 3,000-token ceiling. Deterministic quote, locator, number and retraction checks remain unchanged; the higher-tier support judge remains authoritative. Explicit comparison requests also bypass the general LLM router and use deterministic intent routing.

Live hypoxia comparison after correction (run `cb5468a9-9893-41df-8d82-2f788d93bed6`):

- Source catalog: 2.567 s.
- Evidence-based opening: 7.407 s.
- Verified result: 34.708 s.
- Relations: 36.973 s; test completed in 43.069 s including replay/assertions.
- Final band: 5 verified findings from 2 sources. The receipt records 38 extracted candidates and 33 support-stage drops rather than hiding them.

Compared with the 65.752 s regression, verified completion improved by 47.2% while the final verified-claim count increased from four to five and all five retained claims are findings. This is one live observation, not a p50/p95 benchmark.
