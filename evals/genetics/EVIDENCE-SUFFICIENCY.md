# Evidence sufficiency correction — 2026-10-31

## Diagnosed failure

The Spanish query `¿Cuáles son los cinco genes más asociados con hipertensión primaria?` was classified as `out_of_scope` before retrieval because disease-related genetics inherited the earlier product ban on clinical medicine. The baseline run ended `abstained` at 11.468 s with no sources and no overview. Separately, the deterministic seed query did not translate primary hypertension into the literature term `essential hypertension`, and overview prompts treated the absence of a universal ranking too much like absence of evidence.

## Focused correction

- Disease genetics is routed deterministically as in-scope evidence research; identifiable-person and individual-care safeguards remain unchanged.
- Spanish primary/essential hypertension queries expand to bounded PubMed and Europe PMC searches for GWAS, genetic association/loci, reviews and meta-analyses.
- Title ranking gives transparent priority to GWAS/TWAS, genetic loci and synthesis literature while retaining every candidate and its audit reason.
- Structuring and extraction no longer require one source to state the final multi-source list verbatim.
- Overview prompts use three answerability states: direct answer, contextualized partial answer, or genuine absence of relevant evidence. Rankings unsupported as universal can become explicitly provisional shortlists.
- Agent deadlines now abort the underlying HTTP request, preventing stalled provider calls from extending the verification stage after their deadline.

## Live result

Run `a043d26e-e3e1-4293-8ac8-1d7166b0313e` passed the live regression test. Source metadata appeared at 1.454 s and the substantive Spanish overview at 6.772 s. It stated that no authoritative universal top five was established, then presented `RBM6`, `HLA-DRB5`, `UHRF1BP1`, `LYZ` and `TMEM116` as a provisional TWAS-derived shortlist rather than a definitive ranking. It also separated a primary-aldosteronism finding from primary hypertension.

The final result completed at 40.978 s with 13 fully supported claims from three sources; relations completed at 44.895 s. The receipt preserved 38 extracted candidates, 7 numeric-check drops, 18 support-stage drops and one unanswered sub-question. This is a single live observation, not an expert validation of the shortlist or a p50/p95 benchmark.
