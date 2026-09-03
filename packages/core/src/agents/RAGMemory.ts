import { AgentTool } from './AgentEngine';
import { Toolbox } from './Toolbox';

/**
 * Lite in-memory RAG: index documents by chunking + keyword scoring,
 * then retrieve relevant context for the model.
 */
export class RAGMemory {
  private chunks: { text: string; id: number }[] = [];
  private nextId = 0;

  addDocuments(texts: string[], chunkSize = 800, overlap = 100) {
    for (const text of texts) {
      const cleaned = text.replace(/\s+/g, ' ').trim();
      if (!cleaned) continue;
      for (let i = 0; i < cleaned.length; i += chunkSize - overlap) {
        this.chunks.push({ text: cleaned.slice(i, i + chunkSize), id: this.nextId++ });
        if (i + chunkSize >= cleaned.length) break;
      }
    }
  }

  retrieve(query: string, topK = 5): string {
    const tokens = query.toLowerCase().split(/\W+/).filter((t) => t.length > 2);
    const scored = this.chunks
      .map((c) => {
        const lower = c.text.toLowerCase();
        let score = 0;
        for (const t of tokens) if (lower.includes(t)) score++;
        return { ...c, score };
      })
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
    return scored.map((c) => c.text).join('\n\n---\n\n');
  }

  clear() {
    this.chunks = [];
  }

  get size() {
    return this.chunks.length;
  }
}

export { AgentTool, Toolbox };
