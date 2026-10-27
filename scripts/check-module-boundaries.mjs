#!/usr/bin/env node
// Modular-monolith boundary check (CLAUDE.md-adjacent convention; see
// docs/architecture/00-overview.md "Module boundaries"). A package under src/shared/*
// or src/modules/*/ may only be reached by other code through its bare specifier
// (@/shared/<pkg> or @/modules/<name>, hitting that package's index.ts) — reaching
// into its internal files from outside is a violation. shared/* may never depend on
// modules/* in either form (dependency direction). Code inside a package may still
// use ordinary relative imports to its own siblings.
//
// This is a small hand-written check, not a third-party plugin: its config DSL
// (capture groups, policy precedence) turned out to be inconsistently documented even
// in the plugin's own docs, and a custom ~100-line script here is fully verifiable
// and has no dependency to pin. Wired into `pnpm lint` (see package.json).

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** @returns {{ kind: 'shared'|'module'|'other', pkg: string|null }} */
function ownerOf(srcRelPosix) {
  const parts = srcRelPosix.split('/');
  if (parts[0] === 'shared' && parts[1]) return { kind: 'shared', pkg: parts[1] };
  if (parts[0] === 'modules' && parts[1]) return { kind: 'module', pkg: parts[1] };
  return { kind: 'other', pkg: null };
}

function samePackage(a, b) {
  return a.kind !== 'other' && a.kind === b.kind && a.pkg === b.pkg;
}

const SPECIFIER_PATTERN = /(?:from\s+|import\(\s*|mock\(\s*(?:import\(\s*)?)(['"])([^'"]+)\1/g;

const files = walk(SRC);
const violations = [];

for (const absFile of files) {
  const srcRelPosix = toPosix(path.relative(SRC, absFile));
  const fileOwner = ownerOf(srcRelPosix);
  const fileDirPosix = path.posix.dirname(srcRelPosix);
  const content = fs.readFileSync(absFile, 'utf8');

  for (const match of content.matchAll(SPECIFIER_PATTERN)) {
    const specifier = match[2];
    let targetSrcRelPosix = null;

    if (specifier.startsWith('@/shared/') || specifier.startsWith('@/modules/')) {
      targetSrcRelPosix = specifier.slice(2); // strip '@/'
    } else if (specifier.startsWith('.')) {
      targetSrcRelPosix = path.posix.normalize(path.posix.join(fileDirPosix, specifier));
    } else {
      continue; // a bare package (zod, next/server, node:*, ...) — not our concern
    }

    const targetOwner = ownerOf(targetSrcRelPosix);
    if (targetOwner.kind === 'other') continue; // not pointed at a shared/module package

    if (samePackage(fileOwner, targetOwner)) continue; // internal access within one's own package

    // Dependency direction: shared may never depend on modules.
    if (fileOwner.kind === 'shared' && targetOwner.kind === 'module') {
      violations.push(
        `${srcRelPosix}: shared/${fileOwner.pkg} imports modules/${targetOwner.pkg} ("${specifier}") — shared must never depend on a module`,
      );
      continue;
    }

    // Cross-package access must go through the bare package specifier (its index.ts).
    const targetParts = targetSrcRelPosix.split('/');
    const isBarePackage = targetParts.length === 2; // e.g. "shared/meta" or "modules/02-retrieval"
    if (!isBarePackage) {
      const bare = `@/${targetParts[0]}/${targetParts[1]}`;
      violations.push(
        `${srcRelPosix}: imports "${specifier}" directly — reach ${targetOwner.kind} "${targetOwner.pkg}" only through its public API ("${bare}")`,
      );
    }
  }
}

if (violations.length > 0) {
  console.error(`Module boundary violations (${violations.length}):\n`);
  for (const v of violations) console.error(`  - ${v}`);
  console.error('\nSee docs/architecture/00-overview.md "Module boundaries".');
  process.exit(1);
}

console.log('Module boundaries OK.');
