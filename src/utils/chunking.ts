export function splitSentences(text: string): string[] {
  // Split text into paragraphs
  const paragraphs = text.split(/\n{2,}/);
  const sentences: string[] = [];

  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) continue;
    
    // Split at ?,.,!
    const paraSentences = paragraph.split(/(?<=[.!?])\s+(?=[A-Z"'(])|(?<=\.\s{0,1})\n(?=[A-Z])/)
      .map((s) => s.trim())
      .filter((s) => s.length > 5);

    if (paraSentences.length>0) {
     
      const last = paraSentences[paraSentences.length-1];
      if (last!==undefined){
        paraSentences[paraSentences.length-1]=last+'\n\n';
      }
      sentences.push(...paraSentences);
    }
  }

  return sentences;
}


export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}