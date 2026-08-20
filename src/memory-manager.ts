import fs from 'fs/promises';
import path from 'path';
import { VectorStore, type MemoryRecord, type MemoryFilters, type SearchResult } from './vector-store.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export type MemoryType = 'plan' | 'analysis' | 'tasklist' | 'thought' | 'note';

const VALID_MEMORY_TYPES: MemoryType[] = [
  'plan',
  'analysis',
  'tasklist',
  'thought',
  'note',
];

const TYPE_DIRS: Record<MemoryType, string> = {
  plan: 'plans',
  analysis: 'analyses',
  tasklist: 'tasklists',
  thought: 'thoughts',
  note: 'notes',
};

// ─── Memory Manager ──────────────────────────────────────────────────────────

export class MemoryManager {
  private vectorStore: VectorStore;
  private memoryDir: string;

  constructor(vectorStore: VectorStore, dataDir: string) {
    this.vectorStore = vectorStore;
    this.memoryDir = path.join(dataDir, 'memory');
  }

  async initialize(): Promise<void> {
    // Create all memory type directories
    for (const dir of Object.values(TYPE_DIRS)) {
      await fs.mkdir(path.join(this.memoryDir, dir), { recursive: true });
    }
  }

  // ─── Validation ────────────────────────────────────────────────────────

  static isValidType(type: string): type is MemoryType {
    return VALID_MEMORY_TYPES.includes(type as MemoryType);
  }

  // ─── CRUD Operations ──────────────────────────────────────────────────

  async store(data: {
    type: MemoryType;
    title: string;
    content: string;
    tags?: string[];
    sessionId?: string;
  }): Promise<MemoryRecord> {
    // 1. Save to vector store
    const record = await this.vectorStore.addMemory({
      type: data.type,
      title: data.title,
      content: data.content,
      tags: data.tags,
      sessionId: data.sessionId,
    });

    // 2. Save as Markdown file
    await this.writeMarkdownFile(record);

    return record;
  }

  async update(
    id: string,
    data: { title?: string; content?: string; tags?: string[] }
  ): Promise<MemoryRecord | null> {
    // 1. Update in vector store
    const record = await this.vectorStore.updateMemory(id, data);

    if (!record) return null;

    // 2. Update Markdown file
    await this.writeMarkdownFile(record);

    return record;
  }

  async search(
    query: string,
    filters?: MemoryFilters,
    limit: number = 10
  ): Promise<SearchResult<MemoryRecord>[]> {
    return this.vectorStore.searchMemories(query, filters, limit);
  }

  async list(filters?: MemoryFilters): Promise<MemoryRecord[]> {
    return this.vectorStore.listMemories(filters);
  }

  async delete(id: string): Promise<boolean> {
    // 1. Get the record first for file deletion
    const record = await this.vectorStore.getMemoryById(id);
    if (!record) return false;

    // 2. Delete from vector store
    const deleted = await this.vectorStore.deleteMemory(id);
    if (!deleted) return false;

    // 3. Delete Markdown file
    await this.deleteMarkdownFile(record);

    return true;
  }

  async getById(id: string): Promise<MemoryRecord | null> {
    return this.vectorStore.getMemoryById(id);
  }

  // ─── Markdown File Management ─────────────────────────────────────────

  private getFilePath(record: MemoryRecord): string {
    const typeDir = TYPE_DIRS[record.type as MemoryType] || 'notes';
    const sanitizedTitle = record.title
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 60);
    const shortId = record.id.substring(0, 8);
    const filename = `${sanitizedTitle}-${shortId}.md`;
    return path.join(this.memoryDir, typeDir, filename);
  }

  private generateFrontmatter(record: MemoryRecord): string {
    const tags = record.tags
      ? record.tags
          .split(',')
          .map(t => t.trim())
          .filter(t => t.length > 0)
      : [];

    const lines = [
      '---',
      `id: "${record.id}"`,
      `type: "${record.type}"`,
      `title: "${record.title.replace(/"/g, '\\"')}"`,
      `tags: [${tags.map(t => `"${t}"`).join(', ')}]`,
    ];

    if (record.sessionId) {
      lines.push(`sessionId: "${record.sessionId}"`);
    }

    lines.push(`createdAt: "${record.createdAt}"`);
    lines.push(`updatedAt: "${record.updatedAt}"`);
    lines.push('---');

    return lines.join('\n');
  }

  private async writeMarkdownFile(record: MemoryRecord): Promise<void> {
    const filePath = this.getFilePath(record);
    const frontmatter = this.generateFrontmatter(record);
    const content = `${frontmatter}\n\n# ${record.title}\n\n${record.content}\n`;

    await fs.writeFile(filePath, content, 'utf-8');
  }

  private async deleteMarkdownFile(record: MemoryRecord): Promise<void> {
    const filePath = this.getFilePath(record);
    try {
      await fs.unlink(filePath);
    } catch {
      // File may not exist — ignore
    }
  }
}
