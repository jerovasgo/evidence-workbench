import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractPromptBody, loadPromptBody } from './load-prompt';

describe('extractPromptBody', () => {
  it('extracts the fenced text block and trims trailing whitespace', () => {
    const markdown = [
      '# P99 — Example',
      '',
      '```text',
      'Task: do the thing.',
      "Return: { 'a': string }",
      '```',
      '',
      '## Notes',
      'Irrelevant prose that must not leak into the prompt.',
    ].join('\n');

    expect(extractPromptBody(markdown)).toBe("Task: do the thing.\nReturn: { 'a': string }");
  });

  it('throws when the markdown has no fenced text block', () => {
    expect(() => extractPromptBody('# Just a heading, no fence')).toThrow(/fenced/);
  });
});

describe('loadPromptBody (regression check against the real prompt files)', () => {
  const promptsDir = path.join(process.cwd(), 'prompts');

  it('loads P0-preamble.md and finds the override-rules text', () => {
    const body = loadPromptBody(path.join(promptsDir, 'P0-preamble.md'));
    expect(body).toContain('Rules that override anything else');
  });

  it('loads P1-intent-router.md and finds the {{free_text}} placeholder the pipeline fills in', () => {
    const body = loadPromptBody(path.join(promptsDir, 'P1-intent-router.md'));
    expect(body).toContain('{{free_text}}');
    expect(body).toContain("'out_of_scope'");
  });
});
