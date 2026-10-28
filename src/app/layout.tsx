import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { DM_Sans } from 'next/font/google';
import './globals.css';

// "From evidence to clarity" visual identity (2026-10-28): DM Sans throughout.

const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans' });

export const metadata: Metadata = {
  title: 'Evidence Workbench',
  description: 'From evidence to clarity.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={dmSans.variable} data-theme="dark">
      <body>{children}</body>
    </html>
  );
}
