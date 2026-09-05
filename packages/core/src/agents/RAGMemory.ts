import { readJSON, writeJSON } from '../storage';
import { AgentTool } from './AgentEngine';
import { Toolbox } from './Toolbox';

const STORAGE_KEY = 'acode.rag.v1';

interface RAGPersistShape {
  chunks: { text: string; id: number }[];
  nextId: number;
}

/**
 * Lite local RAG: index documents by chunking + keyword scoring,
 * then retrieve relevant context for the model. Chunks are persisted
 * to localStorage so an ingested knowledge base survives reloads.
 */
export class RAGMemory {
  private chunks: { text: string; id: number }[] = [];
  private nextId = 0;

  constructor() {
    this.load();
  }

  private load() {
    const data = readJSON<RAGPersistShape>(STORAGE_KEY);
    if (!data) return;
    this.chunks = Array.isArray(data.chunks) ? data.chunks : [];
    this.nextId = typeof data.nextId === 'number' ? data.nextId : this.chunks.length;
  }

  private persist() {
    writeJSON(STORAGE_KEY, { chunks: this.chunks, nextId: this.nextId });
  }

  addDocuments(texts: string[], chunkSize = 800, overlap = 100) {
    for (const text of texts) {
      const cleaned = text.replace(/\s+/g, ' ').trim();
      if (!cleaned) continue;
      for (let i = 0; i < cleaned.length; i += chunkSize - overlap) {
        this.chunks.push({ text: cleaned.slice(i, i + chunkSize), id: this.nextId++ });
        if (i + chunkSize >= cleaned.length) break;
      }
    }
    this.persist();
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
    this.nextId = 0;
    this.persist();
  }

  get size() {
    return this.chunks.length;
  }
}

export type { AgentTool };
export { Toolbox };
