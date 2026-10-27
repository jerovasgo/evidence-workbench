import { readFileSync } from 'node:fs';

const FENCED_TEXT_BLOCK = /```text\n([\s\S]*?)```/;

/** Pulls the ```text fenced prompt body out of a /prompts/P<n>-<name>.md file's markdown. */
export function extractPromptBody(markdown: string): string {
  const match = markdown.match(FENCED_TEXT_BLOCK);
  if (!match) {
    throw new Error('No ```text fenced block found in prompt markdown');
  }
  return match[1]!.trimEnd();
}

export function loadPromptBody(filePath: string): string {
  return extractPromptBody(readFileSync(filePath, 'utf8'));
}
