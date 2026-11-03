import { DnaLoader } from '@/components/dna-loader';
import { initialProcessingMessage } from '@/lib/processing-messages';
import type { Mode } from '@/lib/modes';

export function InitialResearchStatus({ query, mode }: { query: string; mode?: Mode }) {
  return (
    <div role="status" className="flex w-full max-w-2xl items-end gap-3 text-sm leading-6 text-fg">
      <p className="min-w-0 flex-1">{initialProcessingMessage(query, mode)}</p>
      <DnaLoader size="inline" caption="Research in progress" />
    </div>
  );
}
