import { createHash } from "crypto";

export function computeHash(content: string): string {
  return createHash('md-5').update(content, 'utf8').digest('hex');
}