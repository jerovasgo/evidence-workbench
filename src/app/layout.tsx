import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';

// SPEC §11: "Geist Sans + Geist Mono (next/font)", dark-first.

export const metadata: Metadata = {
  title: 'Evidence Workbench',
  description: 'Evidence you can audit, in seconds.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} data-theme="dark">
      <body>{children}</body>
    </html>
  );
}
