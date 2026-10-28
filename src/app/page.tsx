import { Navbar } from '@/components/navbar';
import { Hero } from '@/components/landing/hero';
import { HowItWorks } from '@/components/landing/how-it-works';
import { VisualizeTabs } from '@/components/landing/visualize-tabs';
import { EvidenceTrust } from '@/components/landing/evidence-trust';
import { FinalCta } from '@/components/landing/final-cta';

// "From evidence to clarity" landing page (2026-10-28, user-specified redesign).
// The hero's search bar is the real entry point — submitting navigates to
// /dashboard with the query and mode preserved (src/components/landing/hero.tsx).

export default function LandingPage() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <HowItWorks />
        <VisualizeTabs />
        <EvidenceTrust />
        <FinalCta />
      </main>
    </>
  );
}
