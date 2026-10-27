// Shared kernel: loads a /prompts/P<n>-<name>.md file's fenced prompt body. Used by
// any module that calls runAgent with a versioned prompt.
export * from './load-prompt';
