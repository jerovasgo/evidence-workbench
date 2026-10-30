// Module 02 Crossref connector: "DOI existence, metadata, update/retraction notices."
// Public API, no key required; Crossref's own etiquette asks for a contact email in
// the User-Agent or a `mailto` query param for the "polite pool" (higher, more
// reliable rate limits) — optional here, included when configured.

const CROSSREF_BASE = 'https://api.crossref.org/works';

export interface CrossrefUpdateNotice {
  type: string; // e.g. 'retraction', 'correction', 'erratum'
  doi: string;
  updated: string | undefined;
}

export interface CrossrefWork {
  doi: string;
  title?: string;
  issued?: string;
  retracted: boolean;
  updateNotices: CrossrefUpdateNotice[];
}

export interface CrossrefClient {
  /** Returns null (not an error) when the DOI does not resolve (HTTP 404). */
  lookup(doi: string): Promise<CrossrefWork | null>;
}

export interface CreateCrossrefClientOptions {
  fetchImpl?: typeof fetch;
  /** Contact email for Crossref's "polite pool" (docs.crossref.org/docs/etiquette). */
  mailto?: string;
}

interface RawUpdateTo {
  type?: string;
  DOI?: string;
  updated?: { 'date-time'?: string };
}

interface RawCrossrefMessage {
  DOI?: string;
  title?: string[];
  issued?: { 'date-parts'?: number[][] };
  'update-to'?: RawUpdateTo[];
}

const RETRACTION_TYPES = new Set(['retraction', 'retracted']);

export function createCrossrefClient(options: CreateCrossrefClientOptions = {}): CrossrefClient {
  const fetchImpl = options.fetchImpl ?? fetch;

  async function lookup(doi: string): Promise<CrossrefWork | null> {
    const normalizedDoi = normalizeDoi(doi);
    const url = new URL(`${CROSSREF_BASE}/${encodeURIComponent(normalizedDoi)}`);
    if (options.mailto) url.searchParams.set('mailto', options.mailto);

    const res = await fetchImpl(url.toString(), { signal: AbortSignal.timeout(8000) });
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`Crossref lookup failed: HTTP ${res.status}`);
    }

    const json = (await res.json()) as { message?: RawCrossrefMessage };
    const message = json.message ?? {};

    const updateNotices: CrossrefUpdateNotice[] = (message['update-to'] ?? []).map((u) => ({
      type: (u.type ?? '').toLowerCase(),
      doi: u.DOI ?? '',
      updated: u.updated?.['date-time'],
    }));

    const datePart = message.issued?.['date-parts']?.[0];
    const issued = datePart ? datePart.join('-') : undefined;

    return {
      doi: message.DOI ?? normalizedDoi,
      title: message.title?.[0],
      issued,
      retracted: updateNotices.some((n) => RETRACTION_TYPES.has(n.type)),
      updateNotices,
    };
  }

  return { lookup };
}

/** Strips a "https://doi.org/" prefix and lower-cases, matching module 02's identifier normalization. */
export function normalizeDoi(doi: string): string {
  return doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').toLowerCase().trim();
}
