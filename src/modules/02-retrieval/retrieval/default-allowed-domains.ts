// Module 02/10: `fetch_url_text`'s domain allow-list was empty by default
// (SECURITY.md known gap) — nothing was fetchable until this was configured. This
// is a curated Day-1 starting set of public-health bodies, recognized medical
// societies' guideline-publishing domains, and open-access article hosts; it is
// deliberately NOT exhaustive. `url-guard.ts`'s `assertSafeUrl` matches a domain or
// any of its subdomains, so only apex domains are listed here.
//
// User-requested follow-up, not built yet: letting a clinician review/approve
// additional domains themselves (a settings UI) rather than only this hardcoded
// default list — tracked in SECURITY.md until module 11 (UI) exists to host it.

export interface AllowedDomain {
  domain: string;
  reason: string;
}

export const DEFAULT_ALLOWED_DOMAINS: readonly AllowedDomain[] = [
  { domain: 'cdc.gov', reason: 'US Centers for Disease Control and Prevention — public health guidance' },
  { domain: 'who.int', reason: 'World Health Organization — global public health guidance' },
  { domain: 'nice.org.uk', reason: 'UK National Institute for Health and Care Excellence — clinical guidelines' },
  { domain: 'ahajournals.org', reason: 'American Heart Association journals — publishes AHA/ACC cardiology guidelines' },
  { domain: 'professional.heart.org', reason: "American Heart Association's professional/guidelines portal" },
  { domain: 'escardio.org', reason: 'European Society of Cardiology — guidelines' },
  { domain: 'idsociety.org', reason: 'Infectious Diseases Society of America — guidelines' },
  { domain: 'thoracic.org', reason: 'American Thoracic Society — guidelines' },
  { domain: 'acog.org', reason: 'American College of Obstetricians and Gynecologists — guidelines' },
  { domain: 'aap.org', reason: 'American Academy of Pediatrics — guidelines' },
  { domain: 'cochranelibrary.com', reason: 'Cochrane systematic reviews (open abstracts; some full text open access)' },
  { domain: 'ncbi.nlm.nih.gov', reason: 'NCBI Bookshelf/NBK guideline pages not indexed as PMC full text' },
  { domain: 'magicapp.org', reason: 'MAGIC — open-access structured guideline authoring/publishing platform' },
];

export const DEFAULT_ALLOWED_DOMAIN_NAMES: readonly string[] = DEFAULT_ALLOWED_DOMAINS.map((d) => d.domain);
