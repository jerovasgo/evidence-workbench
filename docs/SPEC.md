# Genebark product specification

Status: hackathon submission build, 2026-11-03.

## 1. Product definition

Genebark is a domain-specific agent harness for evidence-grounded genetics research. A user asks about a gene, protein, variant, pathway, genetic association, experiment or set of studies. Genebark retrieves relevant scientific material, produces a fast provisional orientation, verifies source-level findings and progressively constructs the clearest useful answer and visualization.

The system is not a general chatbot, a formal systematic-review service or a clinical decision product.

## 2. Target user and problem

Primary users are genetics researchers, laboratory teams and technically trained students. Their problem is not merely finding papers; it is determining:

- what each source actually reports;
- whether a claim is supported by the cited passage;
- how organism, tissue, model, perturbation and assay change interpretation;
- where studies agree, differ or cannot be compared;
- which sources deserve attention and why.

## 3. Response contract

Every research response follows one shared data flow and two complementary views.

### Main Answer

1. Immediate deterministic acknowledgement specific to the query.
2. Provisional overview based on retrieved abstracts, explicitly labelled provisional.
3. Definitive overview based on verified findings; immutable once published.
4. Key findings and the visualization best aligned with intent.
5. Contextual links for verified gene/protein entities.

### Evidence & Sources

- source registry and review state;
- extracted claims and original quotations;
- verification reports and partial-support caveats;
- exclusions, withdrawals and retraction checks actually performed;
- source-score factors and relevance rationale;
- detailed comparison when the question or evidence warrants it.

Both views consume the same run state. They never launch duplicate research.

## 4. Supported intents

- General genetics fact or orientation.
- Gene/protein/variant association and qualified shortlists.
- Cross-study comparison.
- Molecular mechanism or pathway.
- Evidence map by subquestion.
- Evidence-backed algorithm or decision pathway.
- Recent literature exploration.
- Contextual follow-up within the active anonymous chat.

Ambiguous queries are clarified only when missing criteria would materially change retrieval or comparison. Simple questions and greetings do not enter the research pipeline.

## 5. Progressive execution

The system minimizes perceived latency without presenting unlabelled speculation:

- deterministic routing and seed search begin immediately;
- retrieval from trusted indexes runs concurrently with question structuring;
- abstract synthesis may publish a provisional answer;
- full text is selected by query-relevant sections;
- extraction and verification run with bounded concurrency;
- claims and visual structures stream as SSE events;
- relation labelling and secondary audit details may complete after the main answer.

Research depth changes exploration time and work attempted, not a hard promise about source count.

## 6. Evidence states

- `provisional`: extracted or synthesized before complete source-level verification.
- `supported`: source, quote, locator and semantic support checks pass.
- `partial`: source text supports a narrower claim than originally proposed.
- `unknown`: a bounded check could not determine support; never presented as verified.
- `withdrawn`: a provisional claim failed verification and is removed from the answer.
- `abstained`: the system cannot responsibly make the requested claim, while still returning supported partial/contextual findings when available.

## 7. Verification

Applicable checks include identifier existence, locator validity, quote matching, number preservation, retraction signals, semantic support, negation, scope and conclusion strength. The model may propose a claim; deterministic code and a bounded semantic judge decide its final state.

## 8. Concordance

Claims are compared only when they address a common question. Relations include supports, contradicts, refines, different scope and not comparable. A contradiction requires incompatible findings under sufficiently comparable experimental conditions; the system never searches for opposition merely because the user requested a comparison.

## 9. Source score

`total = relevance × level × quality × currency × applicability`

- Relevance is deterministic query/subquestion fit against title and available snippet, with extra weight for named genetic entities and a small intent-specific signal.
- Level is derived from publication/study type.
- Quality uses explicit methods and conflict metadata; unknown is not treated as failure.
- Currency is a bounded publication-age factor.
- Applicability compares experimental context when enough metadata exists.

The score prioritizes review and explains ranking. It is not a universal truth metric and does not replace claim verification.

## 10. Visual representations

- Evidence landscape for broad orientation.
- Evidence map grouped by subquestion.
- Compact comparison matrix for genuinely comparable or contradictory evidence.
- Mechanism diagram grounded in claim IDs.
- Algorithm/decision pathway grounded in claim IDs.

Visual elements open the underlying source evidence. Layout and graph invariants are computed and validated in code.

## 11. Conversation memory

Memory is temporary, anonymous and isolated by chat/session. The client retains a bounded capsule of recent queries, overviews, findings, sources and visualization type. Deterministic resolution handles named genes, ordinal findings and previous-study references; one bounded model call handles genuinely ambiguous elliptical follow-ups. No authentication or permanent chat history is part of this build.

## 12. Safety and privacy

- No patient-specific diagnosis, treatment or prescribing.
- Reject identifiable-person scenarios.
- Do not log query/source plaintext.
- Keep service credentials server-side.
- Treat retrieved content as untrusted data.
- Do not claim compliance certification.

## 13. Acceptance criteria

- A user receives meaningful progressive feedback rather than a blocking spinner.
- Provisional and verified text are visibly distinct.
- Definitive overview content cannot be overwritten by later events.
- Every verified claim opens to a source quote and locator.
- Comparisons expose concrete experimental variables.
- Source scores contain no placeholder factors.
- Follow-ups resolve within one active chat and remain isolated across sessions.
- Unit/integration tests, lint, module boundaries and strict TypeScript pass.

## 14. Honest limitations

- Full text is not available for every indexed paper.
- The retrieval sequence is PRISMA-inspired triage, not a formal systematic review.
- Source-score weights are transparent initial weights, not expert-calibrated universal measures.
- Retraction and metadata coverage depend on external identifiers/services.
- Multi-instance production would require shared cancellation and budget state.
