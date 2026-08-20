import * as lancedb from '@lancedb/lancedb';
import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs/promises';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ThoughtRecord {
  id: string;
  vector: number[];
  thought: string;
  thoughtNumber: number;
  totalThoughts: number;
  sessionId: string;
  isRevision: boolean;
  branchId: string;
  branchFromThought: number;
  revisesThought: number;
  needsMoreThoughts: boolean;
  nextThoughtNeeded: boolean;
  timestamp: string;
}

export interface MemoryRecord {
  id: string;
  vector: number[];
  type: string;       // plan | analysis | tasklist | thought | note
  title: string;
  content: string;
  tags: string;        // comma-separated
  sessionId: string;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryFilters {
  type?: string;
  tags?: string[];
  sessionId?: string;
  since?: string;      // ISO date
}

export interface SearchResult<T> {
  item: T;
  score: number;
}

// ─── Embedding Service ───────────────────────────────────────────────────────

const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';
const EMBEDDING_DIMENSIONS = 384;

class EmbeddingService {
  private extractor: FeatureExtractionPipeline | null = null;
  private initPromise: Promise<void> | null = null;

  async initialize(): Promise<void> {
    if (this.extractor) return;
    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initPromise = (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.extractor = (await (pipeline as any)(
        'feature-extraction',
        EMBEDDING_MODEL,
        { dtype: 'fp32' }
      )) as FeatureExtractionPipeline;
    })();

    await this.initPromise;
  }

  async embed(text: string): Promise<number[]> {
    await this.initialize();
    if (!this.extractor) throw new Error('Embedding service not initialized');

    const output = await this.extractor(text, {
      pooling: 'mean',
      normalize: true,
    });

    return Array.from(output.data as Float32Array);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    for (const text of texts) {
      results.push(await this.embed(text));
    }
    return results;
  }
}

// ─── Vector Store ────────────────────────────────────────────────────────────

export class VectorStore {
  private db: lancedb.Connection | null = null;
  private thoughtsTable: lancedb.Table | null = null;
  private memoriesTable: lancedb.Table | null = null;
  private embeddings: EmbeddingService;
  private dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.embeddings = new EmbeddingService();
  }

  async initialize(): Promise<void> {
    // Ensure data directory exists
    const vectorDir = path.join(this.dataDir, 'vector-store');
    await fs.mkdir(vectorDir, { recursive: true });

    // Connect to LanceDB
    this.db = await lancedb.connect(vectorDir);

    // Initialize embedding service
    await this.embeddings.initialize();

    // Create or open tables
    await this.ensureTables();
  }

  private async ensureTables(): Promise<void> {
    if (!this.db) throw new Error('Database not connected');

    const tableNames = await this.db.tableNames();

    // Thoughts table
    if (tableNames.includes('thoughts')) {
      this.thoughtsTable = await this.db.openTable('thoughts');
    } else {
      // Create with a dummy record to establish schema, then delete it
      const dummyVector = new Array(EMBEDDING_DIMENSIONS).fill(0);
      this.thoughtsTable = await this.db.createTable('thoughts', [{
        id: '__init__',
        vector: dummyVector,
        thought: '',
        thoughtNumber: 0,
        totalThoughts: 0,
        sessionId: '',
        isRevision: false,
        branchId: '',
        branchFromThought: 0,
        revisesThought: 0,
        needsMoreThoughts: false,
        nextThoughtNeeded: false,
        timestamp: '',
      }]);
      await this.thoughtsTable.delete("id = '__init__'");
    }

    // Memories table
    if (tableNames.includes('memories')) {
      this.memoriesTable = await this.db.openTable('memories');
    } else {
      const dummyVector = new Array(EMBEDDING_DIMENSIONS).fill(0);
      this.memoriesTable = await this.db.createTable('memories', [{
        id: '__init__',
        vector: dummyVector,
        type: '',
        title: '',
        content: '',
        tags: '',
        sessionId: '',
        createdAt: '',
        updatedAt: '',
      }]);
      await this.memoriesTable.delete("id = '__init__'");
    }
  }

  // ─── Thoughts ────────────────────────────────────────────────────────────

  async addThought(data: {
    thought: string;
    thoughtNumber: number;
    totalThoughts: number;
    sessionId: string;
    isRevision?: boolean;
    branchId?: string;
    branchFromThought?: number;
    revisesThought?: number;
    needsMoreThoughts?: boolean;
    nextThoughtNeeded: boolean;
  }): Promise<ThoughtRecord> {
    if (!this.thoughtsTable) throw new Error('Thoughts table not initialized');

    const vector = await this.embeddings.embed(data.thought);
    const record: ThoughtRecord = {
      id: uuidv4(),
      vector,
      thought: data.thought,
      thoughtNumber: data.thoughtNumber,
      totalThoughts: data.totalThoughts,
      sessionId: data.sessionId,
      isRevision: data.isRevision ?? false,
      branchId: data.branchId ?? '',
      branchFromThought: data.branchFromThought ?? 0,
      revisesThought: data.revisesThought ?? 0,
      needsMoreThoughts: data.needsMoreThoughts ?? false,
      nextThoughtNeeded: data.nextThoughtNeeded,
      timestamp: new Date().toISOString(),
    };

    await this.thoughtsTable.add([record as unknown as Record<string, unknown>]);
    return record;
  }

  async searchThoughts(
    query: string,
    limit: number = 5,
    sessionId?: string
  ): Promise<SearchResult<ThoughtRecord>[]> {
    if (!this.thoughtsTable) throw new Error('Thoughts table not initialized');

    const queryVector = await this.embeddings.embed(query);

    let search = this.thoughtsTable.vectorSearch(queryVector).limit(limit);

    if (sessionId) {
      search = search.where(`sessionId = '${sessionId}'`);
    }

    const results = await search.toArray();

    return results.map((r: Record<string, unknown>) => ({
      item: {
        id: r.id as string,
        vector: r.vector as number[],
        thought: r.thought as string,
        thoughtNumber: r.thoughtNumber as number,
        totalThoughts: r.totalThoughts as number,
        sessionId: r.sessionId as string,
        isRevision: r.isRevision as boolean,
        branchId: r.branchId as string,
        branchFromThought: r.branchFromThought as number,
        revisesThought: r.revisesThought as number,
        needsMoreThoughts: r.needsMoreThoughts as boolean,
        nextThoughtNeeded: r.nextThoughtNeeded as boolean,
        timestamp: r.timestamp as string,
      },
      score: r._distance != null ? 1 - (r._distance as number) : 0,
    }));
  }

  async getSessionThoughts(sessionId: string): Promise<ThoughtRecord[]> {
    if (!this.thoughtsTable) throw new Error('Thoughts table not initialized');

    const results = await this.thoughtsTable
      .query()
      .where(`sessionId = '${sessionId}'`)
      .toArray();

    return results
      .map((r: Record<string, unknown>) => ({
        id: r.id as string,
        vector: r.vector as number[],
        thought: r.thought as string,
        thoughtNumber: r.thoughtNumber as number,
        totalThoughts: r.totalThoughts as number,
        sessionId: r.sessionId as string,
        isRevision: r.isRevision as boolean,
        branchId: r.branchId as string,
        branchFromThought: r.branchFromThought as number,
        revisesThought: r.revisesThought as number,
        needsMoreThoughts: r.needsMoreThoughts as boolean,
        nextThoughtNeeded: r.nextThoughtNeeded as boolean,
        timestamp: r.timestamp as string,
      }))
      .sort((a, b) => a.thoughtNumber - b.thoughtNumber);
  }

  // ─── Memories ────────────────────────────────────────────────────────────

  async addMemory(data: {
    type: string;
    title: string;
    content: string;
    tags?: string[];
    sessionId?: string;
  }): Promise<MemoryRecord> {
    if (!this.memoriesTable) throw new Error('Memories table not initialized');

    const textToEmbed = `${data.title}\n\n${data.content}`;
    const vector = await this.embeddings.embed(textToEmbed);
    const now = new Date().toISOString();

    const record: MemoryRecord = {
      id: uuidv4(),
      vector,
      type: data.type,
      title: data.title,
      content: data.content,
      tags: (data.tags ?? []).join(','),
      sessionId: data.sessionId ?? '',
      createdAt: now,
      updatedAt: now,
    };

    await this.memoriesTable.add([record as unknown as Record<string, unknown>]);
    return record;
  }

  async updateMemory(
    id: string,
    data: { title?: string; content?: string; tags?: string[] }
  ): Promise<MemoryRecord | null> {
    if (!this.memoriesTable) throw new Error('Memories table not initialized');

    // Fetch existing record
    const existing = await this.memoriesTable
      .query()
      .where(`id = '${id}'`)
      .toArray();

    if (existing.length === 0) return null;

    const record = existing[0] as Record<string, unknown>;
    const updatedTitle = data.title ?? (record.title as string);
    const updatedContent = data.content ?? (record.content as string);
    const updatedTags = data.tags ? data.tags.join(',') : (record.tags as string);

    // Re-embed if content changed
    const textToEmbed = `${updatedTitle}\n\n${updatedContent}`;
    const vector = await this.embeddings.embed(textToEmbed);

    const updatedRecord: MemoryRecord = {
      id,
      vector,
      type: record.type as string,
      title: updatedTitle,
      content: updatedContent,
      tags: updatedTags,
      sessionId: record.sessionId as string,
      createdAt: record.createdAt as string,
      updatedAt: new Date().toISOString(),
    };

    // Use mergeInsert for upsert behavior
    await this.memoriesTable
      .mergeInsert(['id'])
      .whenMatchedUpdateAll()
      .whenNotMatchedInsertAll()
      .execute([updatedRecord as unknown as Record<string, unknown>]);

    return updatedRecord;
  }

  async searchMemories(
    query: string,
    filters?: MemoryFilters,
    limit: number = 10
  ): Promise<SearchResult<MemoryRecord>[]> {
    if (!this.memoriesTable) throw new Error('Memories table not initialized');

    const queryVector = await this.embeddings.embed(query);

    let search = this.memoriesTable.vectorSearch(queryVector).limit(limit);

    // Apply filters
    const conditions: string[] = [];
    if (filters?.type) {
      conditions.push(`type = '${filters.type}'`);
    }
    if (filters?.sessionId) {
      conditions.push(`sessionId = '${filters.sessionId}'`);
    }
    if (filters?.since) {
      conditions.push(`createdAt >= '${filters.since}'`);
    }

    if (conditions.length > 0) {
      search = search.where(conditions.join(' AND '));
    }

    const results = await search.toArray();

    let mapped = results.map((r: Record<string, unknown>) => ({
      item: {
        id: r.id as string,
        vector: r.vector as number[],
        type: r.type as string,
        title: r.title as string,
        content: r.content as string,
        tags: r.tags as string,
        sessionId: r.sessionId as string,
        createdAt: r.createdAt as string,
        updatedAt: r.updatedAt as string,
      },
      score: r._distance != null ? 1 - (r._distance as number) : 0,
    }));

    // Post-filter by tags (LanceDB doesn't support LIKE/CONTAINS natively on strings well)
    if (filters?.tags && filters.tags.length > 0) {
      mapped = mapped.filter(r => {
        const itemTags = r.item.tags.split(',').map(t => t.trim().toLowerCase());
        return filters.tags!.some(tag => itemTags.includes(tag.toLowerCase()));
      });
    }

    return mapped;
  }

  async listMemories(filters?: MemoryFilters): Promise<MemoryRecord[]> {
    if (!this.memoriesTable) throw new Error('Memories table not initialized');

    let query = this.memoriesTable.query();

    const conditions: string[] = [];
    if (filters?.type) {
      conditions.push(`type = '${filters.type}'`);
    }
    if (filters?.sessionId) {
      conditions.push(`sessionId = '${filters.sessionId}'`);
    }
    if (filters?.since) {
      conditions.push(`createdAt >= '${filters.since}'`);
    }

    if (conditions.length > 0) {
      query = query.where(conditions.join(' AND '));
    }

    const results = await query.toArray();

    let mapped = results.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      vector: r.vector as number[],
      type: r.type as string,
      title: r.title as string,
      content: r.content as string,
      tags: r.tags as string,
      sessionId: r.sessionId as string,
      createdAt: r.createdAt as string,
      updatedAt: r.updatedAt as string,
    }));

    // Post-filter by tags
    if (filters?.tags && filters.tags.length > 0) {
      mapped = mapped.filter(r => {
        const itemTags = r.tags.split(',').map(t => t.trim().toLowerCase());
        return filters.tags!.some(tag => itemTags.includes(tag.toLowerCase()));
      });
    }

    // Sort by createdAt descending
    mapped.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return mapped;
  }

  async deleteMemory(id: string): Promise<boolean> {
    if (!this.memoriesTable) throw new Error('Memories table not initialized');

    const existing = await this.memoriesTable
      .query()
      .where(`id = '${id}'`)
      .toArray();

    if (existing.length === 0) return false;

    await this.memoriesTable.delete(`id = '${id}'`);
    return true;
  }

  async getMemoryById(id: string): Promise<MemoryRecord | null> {
    if (!this.memoriesTable) throw new Error('Memories table not initialized');

    const results = await this.memoriesTable
      .query()
      .where(`id = '${id}'`)
      .toArray();

    if (results.length === 0) return null;

    const r = results[0] as Record<string, unknown>;
    return {
      id: r.id as string,
      vector: r.vector as number[],
      type: r.type as string,
      title: r.title as string,
      content: r.content as string,
      tags: r.tags as string,
      sessionId: r.sessionId as string,
      createdAt: r.createdAt as string,
      updatedAt: r.updatedAt as string,
    };
  }
}
