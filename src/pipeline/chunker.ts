import { TextChunk } from "../types.ts/pipeline.js";
import { countWords, splitSentences } from "../utils/chunking.js";

const MIN_WORDS = 300;
const MAX_WORDS = 500;          
const TARGET_WORDS = 400;       // Preferred flush point
const OVERLAP_SENTENCES = 2;    // Sentences shared between adjacent chunks
const MIN_TRAILING_WORDS = 50;  // Discard trailing chunks below this threshold

// Chunks text to sentences of 300-500 words
export function chunkText(text: string): TextChunk[] {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return [];

  const chunks: TextChunk[] = [];
  let windowStart = 0;     
  let chunkIndex = 0;

  while (windowStart < sentences.length) {
    let windowEnd = windowStart;
    let wordCount = 0;
    let lastParagraphBreak = -1;

    while (windowEnd < sentences.length) {
      const sentenceWords = countWords(sentences[windowEnd] ?? '');

      if (wordCount+sentenceWords > MAX_WORDS && wordCount >= MIN_WORDS) break;

      wordCount+=sentenceWords;
      if (sentences[windowEnd]?.endsWith('\n\n')) {
        lastParagraphBreak = windowEnd;
      }
      windowEnd++;

      if (wordCount >= TARGET_WORDS && lastParagraphBreak > windowStart) {
        windowEnd = lastParagraphBreak + 1;
        wordCount = sentences
          .slice(windowStart, windowEnd)
          .reduce((acc, s) => acc + countWords(s), 0);
        break;
      }
    }

    // Build chunk content from the window
    const chunkSentences = sentences.slice(windowStart, windowEnd);
    const content = chunkSentences.join(' ').replace(/\n\n\s+/g, '\n\n').trim();
    const finalWordCount = countWords(content);

    // Only emit if content is substantial
    if (finalWordCount >= MIN_TRAILING_WORDS) {
      chunks.push({ content, wordCount: finalWordCount, chunkIndex: chunkIndex++ });
    }

    const step = Math.max(1, windowEnd - windowStart - OVERLAP_SENTENCES);
    windowStart += step;

    if (step === 0) windowStart = windowEnd;
  }

  return chunks;
}
