'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';

const NAV_LINKS = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#visualize', label: 'Visualizations' },
  { href: '/dashboard', label: 'Explore' },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8);
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 border-b backdrop-blur-xl transition-colors duration-150',
        scrolled ? 'border-border bg-bg/85' : 'border-transparent bg-bg',
      )}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="text-sm font-semibold tracking-tight text-fg">
          Evidence Workbench
        </Link>

        <nav className="hidden items-center gap-8 md:flex" aria-label="Primary">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="text-sm text-muted transition-colors hover:text-fg">
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-4 md:flex">
          <Link href="/dashboard" className="text-sm text-muted transition-colors hover:text-fg">
            Sign in
          </Link>
          <Link href="/dashboard">
            <Button variant="primary" className="px-4 py-1.5 text-xs">
              Get started
            </Button>
          </Link>
        </div>

        <button
          type="button"
          className="text-fg md:hidden"
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((v) => !v)}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="glass border-t border-border px-6 py-4 md:hidden">
          <nav className="flex flex-col gap-4" aria-label="Primary mobile">
            {NAV_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="text-sm text-fg" onClick={() => setMobileOpen(false)}>
                {link.label}
              </Link>
            ))}
            <Link href="/dashboard" className="text-sm text-muted" onClick={() => setMobileOpen(false)}>
              Sign in
            </Link>
            <Link href="/dashboard" onClick={() => setMobileOpen(false)}>
              <Button variant="primary" className="w-full">
                Get started
              </Button>
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
