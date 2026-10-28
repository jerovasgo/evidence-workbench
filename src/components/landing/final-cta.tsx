import Link from 'next/link';
import { Button } from '@/components/ui/button';

export function FinalCta() {
  return (
    <section className="mx-auto flex max-w-2xl flex-col items-center px-6 py-32 text-center">
      <h2 className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">See the bigger picture.</h2>
      <Link href="/dashboard" className="mt-8">
        <Button variant="primary" className="px-6 py-3 text-sm">
          Start exploring
        </Button>
      </Link>
    </section>
  );
}
