import Link from 'next/link';
import { Button } from '@/components/ui/button';

export function FinalCta() {
  return (
    <section className="final-cta mx-auto mb-20 flex max-w-5xl flex-col items-center px-6 py-24 text-center">
      <h2 className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">Follow the science further.</h2>
      <p className="mt-4 max-w-lg text-muted">Bring your next genetics question into focus, one source at a time.</p><Link href="/dashboard" className="mt-8">
        <Button variant="primary" className="px-6 py-3 text-sm">
          Explore the evidence
        </Button>
      </Link>
    </section>
  );
}
