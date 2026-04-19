export function cleanText(raw: string): string {
  return raw
    .replace(/[ \t]+/g, ' ')           // Collapse horizontal whitespace
    .replace(/\n{3,}/g, '\n\n')        // Max one blank line between paragraphs
    .replace(/^\s+|\s+$/gm, '')        // Trim each line
    .trim();
}