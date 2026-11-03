import Link from 'next/link';
import { Button } from '@/components/ui/button';

export function FinalCta() {
  return (
    <section className="final-cta mx-auto mb-20 flex max-w-5xl flex-col items-center px-6 py-24 text-center">
      <div className="section-heading">
        <span className="section-kicker">GET STARTED</span>
        <h2>Follow the <span className="neon-text">science further.</span></h2>
        <p>Bring your next genetics question into focus, one source at a time.</p>
      </div>
      <Link href="/dashboard" className="mt-8">
        <Button variant="primary" className="px-6 py-3 text-sm">
          Explore the evidence
        </Button>
      </Link>
    </section>
  );
}
