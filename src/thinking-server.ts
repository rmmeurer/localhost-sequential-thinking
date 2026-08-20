import chalk from 'chalk';
import { v4 as uuidv4 } from 'uuid';
import { VectorStore, type ThoughtRecord } from './vector-store.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ThoughtData {
  thought: string;
  thoughtNumber: number;
  totalThoughts: number;
  nextThoughtNeeded: boolean;
  isRevision?: boolean;
  revisesThought?: number;
  branchFromThought?: number;
  branchId?: string;
  needsMoreThoughts?: boolean;
}

// ─── Server ──────────────────────────────────────────────────────────────────

export class SequentialThinkingServer {
  private thoughtHistory: ThoughtData[] = [];
  private branches: Record<string, ThoughtData[]> = {};
  private disableThoughtLogging: boolean;
  private vectorStore: VectorStore;
  private currentSessionId: string;

  constructor(vectorStore: VectorStore) {
    this.disableThoughtLogging =
      (process.env.DISABLE_THOUGHT_LOGGING || '').toLowerCase() === 'true';
    this.vectorStore = vectorStore;
    this.currentSessionId = uuidv4();
  }

  /**
   * Start a new thinking session. Each sequential chain gets its own sessionId
   * so thoughts can be grouped and retrieved together.
   */
  startNewSession(): string {
    this.currentSessionId = uuidv4();
    this.thoughtHistory = [];
    this.branches = {};
    return this.currentSessionId;
  }

  getSessionId(): string {
    return this.currentSessionId;
  }

  // ─── Formatting ──────────────────────────────────────────────────────────

  private formatThought(thoughtData: ThoughtData): string {
    const {
      thoughtNumber,
      totalThoughts,
      thought,
      isRevision,
      revisesThought,
      branchFromThought,
      branchId,
    } = thoughtData;

    let prefix = '';
    let context = '';

    if (isRevision) {
      prefix = chalk.yellow('🔄 Revision');
      context = ` (revising thought ${revisesThought})`;
    } else if (branchFromThought) {
      prefix = chalk.green('🌿 Branch');
      context = ` (from thought ${branchFromThought}, branch: ${branchId})`;
    } else {
      prefix = chalk.blue('💭 Thought');
      context = '';
    }

    const header = `${prefix} ${thoughtNumber}/${totalThoughts}${context}`;
    const border = '─'.repeat(Math.max(header.length, 40));

    return [
      '',
      chalk.dim(border),
      header,
      chalk.dim(border),
      '',
      thought,
      '',
      chalk.dim(border),
      '',
    ].join('\n');
  }

  private validateThoughtData(input: ThoughtData): ThoughtData {
    // Ensure thoughtNumber is at least 1
    if (input.thoughtNumber < 1) {
      input.thoughtNumber = 1;
    }

    // Ensure totalThoughts is at least equal to thoughtNumber
    if (input.totalThoughts < input.thoughtNumber) {
      input.totalThoughts = input.thoughtNumber;
    }

    return input;
  }

  // ─── Core Processing ────────────────────────────────────────────────────

  async processThought(input: ThoughtData): Promise<{
    content: { type: 'text'; text: string }[];
    isError?: boolean;
  }> {
    const validatedInput = this.validateThoughtData(input);

    // If this is the first thought, consider starting a new session
    if (validatedInput.thoughtNumber === 1 && this.thoughtHistory.length === 0) {
      this.startNewSession();
    }

    // Adjust totalThoughts if needed
    if (validatedInput.needsMoreThoughts) {
      validatedInput.totalThoughts = Math.max(
        validatedInput.totalThoughts,
        validatedInput.thoughtNumber + 2
      );
    }

    // Store in local history
    this.thoughtHistory.push(validatedInput);

    // Handle branching
    if (validatedInput.branchFromThought && validatedInput.branchId) {
      if (!this.branches[validatedInput.branchId]) {
        this.branches[validatedInput.branchId] = [];
      }
      this.branches[validatedInput.branchId].push(validatedInput);
    }

    // Persist to vector store
    try {
      await this.vectorStore.addThought({
        thought: validatedInput.thought,
        thoughtNumber: validatedInput.thoughtNumber,
        totalThoughts: validatedInput.totalThoughts,
        sessionId: this.currentSessionId,
        isRevision: validatedInput.isRevision,
        branchId: validatedInput.branchId,
        branchFromThought: validatedInput.branchFromThought,
        revisesThought: validatedInput.revisesThought,
        needsMoreThoughts: validatedInput.needsMoreThoughts,
        nextThoughtNeeded: validatedInput.nextThoughtNeeded,
      });
    } catch (error) {
      // Log but don't fail — persistence is best-effort
      if (!this.disableThoughtLogging) {
        console.error(
          chalk.red(`[VectorStore] Failed to persist thought: ${error}`)
        );
      }
    }

    // Log to stderr if enabled
    if (!this.disableThoughtLogging) {
      const formatted = this.formatThought(validatedInput);
      console.error(formatted);
    }

    // Build response
    const response = {
      thoughtNumber: validatedInput.thoughtNumber,
      totalThoughts: validatedInput.totalThoughts,
      nextThoughtNeeded: validatedInput.nextThoughtNeeded,
      sessionId: this.currentSessionId,
      branches: Object.keys(this.branches),
      thoughtHistoryLength: this.thoughtHistory.length,
      ...(validatedInput.isRevision && {
        isRevision: true,
        revisesThought: validatedInput.revisesThought,
      }),
      ...(validatedInput.branchFromThought && {
        branchFromThought: validatedInput.branchFromThought,
        branchId: validatedInput.branchId,
      }),
    };

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(response, null, 2),
        },
      ],
    };
  }

  // ─── Context Retrieval ───────────────────────────────────────────────────

  /**
   * Search past thoughts (across all sessions) that are semantically similar
   * to the given query. Useful for providing context before starting a new
   * thinking chain.
   */
  async findRelatedThoughts(
    query: string,
    limit: number = 5
  ): Promise<ThoughtRecord[]> {
    const results = await this.vectorStore.searchThoughts(query, limit);
    return results.map(r => r.item);
  }

  /**
   * Get all thoughts from the current session, ordered by thoughtNumber.
   */
  async getCurrentSessionThoughts(): Promise<ThoughtRecord[]> {
    return this.vectorStore.getSessionThoughts(this.currentSessionId);
  }
}
