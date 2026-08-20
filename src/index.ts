#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import chalk from 'chalk';
import path from 'path';
import { fileURLToPath } from 'url';

import { VectorStore } from './vector-store.js';
import { SequentialThinkingServer } from './thinking-server.js';
import { MemoryManager } from './memory-manager.js';

// ─── Resolve data directory ─────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Safe boolean coercion that correctly handles string "false" */
const coercedBoolean = z.preprocess((val) => {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') {
    if (val.toLowerCase() === 'true') return true;
    if (val.toLowerCase() === 'false') return false;
  }
  return val;
}, z.boolean());

// ─── Initialize ──────────────────────────────────────────────────────────────

const server = new McpServer({
  name: 'localhost-sequential-thinking',
  version: '1.0.0',
});

const vectorStore = new VectorStore(DATA_DIR);
const thinkingServer = new SequentialThinkingServer(vectorStore);
const memoryManager = new MemoryManager(vectorStore, DATA_DIR);

// ─── Tool 1: sequential_thinking ─────────────────────────────────────────────

server.registerTool(
  'sequentialthinking',
  {
    title: 'Sequential Thinking',
    description: `A detailed tool for dynamic and reflective problem-solving through thoughts.
This tool helps analyze problems through a flexible thinking process that can adapt and evolve.
Each thought can build on, question, or revise previous insights as understanding deepens.

When to use this tool:
- Breaking down complex problems into steps
- Planning and design with room for revision
- Analysis that might need course correction
- Problems where the full scope might not be clear initially
- Problems that require a multi-step solution
- Tasks that need to maintain context over multiple steps
- Situations where irrelevant information needs to be filtered out

Key features:
- You can adjust total_thoughts up or down as you progress
- You can question or revise previous thoughts
- You can add more thoughts even after reaching what seemed like the end
- You can express uncertainty and explore alternative approaches
- Not every thought needs to build linearly - you can branch or backtrack
- Generates a solution hypothesis
- Verifies the hypothesis based on the Chain of Thought steps
- Repeats the process until satisfied
- Provides a correct answer
- **All thoughts are persisted to a local vector database for future retrieval**
- **Each thinking chain gets a unique session ID for grouping**

Parameters explained:
- thought: Your current thinking step, which can include:
  * Regular analytical steps
  * Revisions of previous thoughts
  * Questions about previous decisions
  * Realizations about needing more analysis
  * Changes in approach
  * Hypothesis generation
  * Hypothesis verification
- nextThoughtNeeded: True if you need more thinking, even if at what seemed like the end
- thoughtNumber: Current number in sequence (can go beyond initial total if needed)
- totalThoughts: Current estimate of thoughts needed (can be adjusted up/down)
- isRevision: A boolean indicating if this thought revises previous thinking
- revisesThought: If is_revision is true, which thought number is being reconsidered
- branchFromThought: If branching, which thought number is the branching point
- branchId: Identifier for the current branch (if any)
- needsMoreThoughts: If reaching end but realizing more thoughts needed

You should:
1. Start with an initial estimate of needed thoughts, but be ready to adjust
2. Feel free to question or revise previous thoughts
3. Don't hesitate to add more thoughts if needed, even at the "end"
4. Express uncertainty when present
5. Mark thoughts that revise previous thinking or branch into new paths
6. Ignore information that is irrelevant to the current step
7. Generate a solution hypothesis when appropriate
8. Verify the hypothesis based on the Chain of Thought steps
9. Repeat the process until satisfied with the solution
10. Provide a single, ideally correct answer as the final output
11. Only set nextThoughtNeeded to false when truly done and a satisfactory answer is reached`,
    inputSchema: {
      thought: z.string().describe('Your current thinking step'),
      nextThoughtNeeded: coercedBoolean.describe(
        'Whether another thought step is needed'
      ),
      thoughtNumber: z
        .number()
        .int()
        .min(1)
        .describe('Current thought number (numeric value, e.g., 1, 2, 3)'),
      totalThoughts: z
        .number()
        .int()
        .min(1)
        .describe('Estimated total thoughts needed (numeric value, e.g., 5, 10)'),
      isRevision: coercedBoolean
        .optional()
        .describe('Whether this revises previous thinking'),
      revisesThought: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('Which thought is being reconsidered'),
      branchFromThought: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('Branching point thought number'),
      branchId: z.string().optional().describe('Branch identifier'),
      needsMoreThoughts: coercedBoolean
        .optional()
        .describe('If more thoughts are needed'),
    },
  },
  async (args) => {
    return thinkingServer.processThought({
      thought: args.thought,
      nextThoughtNeeded: args.nextThoughtNeeded,
      thoughtNumber: args.thoughtNumber,
      totalThoughts: args.totalThoughts,
      isRevision: args.isRevision,
      revisesThought: args.revisesThought,
      branchFromThought: args.branchFromThought,
      branchId: args.branchId,
      needsMoreThoughts: args.needsMoreThoughts,
    });
  }
);

// ─── Tool 2: memory_store ────────────────────────────────────────────────────

server.registerTool(
  'memory_store',
  {
    title: 'Memory Store',
    description: `Store a memory artifact (plan, analysis, tasklist, thought, or note) with persistent vector storage.
The content is embedded and saved to a local vector database for semantic search retrieval.
A Markdown file is also created on disk for human readability.

Use this to:
- Save plans and implementation strategies
- Record analysis results and findings
- Create and persist task lists
- Store important thoughts and insights
- Take notes for future reference

Each memory gets a unique ID and is searchable via semantic similarity.`,
    inputSchema: {
      type: z
        .enum(['plan', 'analysis', 'tasklist', 'thought', 'note'])
        .describe('Type of memory artifact'),
      title: z.string().describe('Title of the memory artifact'),
      content: z
        .string()
        .describe('Full content of the memory artifact (Markdown supported)'),
      tags: z
        .array(z.string())
        .optional()
        .describe('Optional tags for categorization'),
      sessionId: z
        .string()
        .optional()
        .describe(
          'Optional session ID to link this memory to a thinking session'
        ),
    },
  },
  async (args) => {
    try {
      const record = await memoryManager.store({
        type: args.type,
        title: args.title,
        content: args.content,
        tags: args.tags,
        sessionId: args.sessionId,
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                success: true,
                id: record.id,
                type: record.type,
                title: record.title,
                tags: record.tags,
                createdAt: record.createdAt,
                message: `Memory stored successfully. ID: ${record.id}`,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: `Failed to store memory: ${error}`,
            }),
          },
        ],
        isError: true,
      };
    }
  }
);

// ─── Tool 3: memory_search ───────────────────────────────────────────────────

server.registerTool(
  'memory_search',
  {
    title: 'Memory Search',
    description: `Search stored memories using semantic similarity.
Finds the most relevant memories based on meaning, not just keyword matching.

Use this to:
- Find relevant past plans or analyses
- Retrieve context from previous thinking sessions
- Search for related notes and insights
- Find task lists relevant to current work

Results include a relevance score (0-1) for each match.`,
    inputSchema: {
      query: z
        .string()
        .describe('Search query — will be matched semantically against stored memories'),
      type: z
        .enum(['plan', 'analysis', 'tasklist', 'thought', 'note'])
        .optional()
        .describe('Filter by memory type'),
      tags: z
        .array(z.string())
        .optional()
        .describe('Filter by tags (matches any)'),
      sessionId: z
        .string()
        .optional()
        .describe('Filter by session ID'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .default(10)
        .describe('Maximum number of results (default: 10)'),
    },
  },
  async (args) => {
    try {
      const results = await memoryManager.search(
        args.query,
        {
          type: args.type,
          tags: args.tags,
          sessionId: args.sessionId,
        },
        args.limit
      );

      const formatted = results.map(r => ({
        id: r.item.id,
        type: r.item.type,
        title: r.item.title,
        content: r.item.content.substring(0, 500) + (r.item.content.length > 500 ? '...' : ''),
        tags: r.item.tags,
        score: Math.round(r.score * 1000) / 1000,
        createdAt: r.item.createdAt,
      }));

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                query: args.query,
                totalResults: formatted.length,
                results: formatted,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: `Failed to search memories: ${error}`,
            }),
          },
        ],
        isError: true,
      };
    }
  }
);

// ─── Tool 4: memory_list ─────────────────────────────────────────────────────

server.registerTool(
  'memory_list',
  {
    title: 'Memory List',
    description: `List all stored memories with optional filters.
Unlike memory_search, this does NOT use semantic similarity — it returns a filtered list sorted by creation date (newest first).

Use this to:
- Browse all stored memories
- Get an overview of available plans, analyses, or task lists
- Filter by type, tags, or session`,
    inputSchema: {
      type: z
        .enum(['plan', 'analysis', 'tasklist', 'thought', 'note'])
        .optional()
        .describe('Filter by memory type'),
      tags: z
        .array(z.string())
        .optional()
        .describe('Filter by tags (matches any)'),
      sessionId: z
        .string()
        .optional()
        .describe('Filter by session ID'),
      since: z
        .string()
        .optional()
        .describe('Filter by creation date (ISO format, e.g. 2024-01-01)'),
    },
  },
  async (args) => {
    try {
      const memories = await memoryManager.list({
        type: args.type,
        tags: args.tags,
        sessionId: args.sessionId,
        since: args.since,
      });

      const formatted = memories.map(m => ({
        id: m.id,
        type: m.type,
        title: m.title,
        tags: m.tags,
        sessionId: m.sessionId || undefined,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
        contentPreview: m.content.substring(0, 200) + (m.content.length > 200 ? '...' : ''),
      }));

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                totalMemories: formatted.length,
                memories: formatted,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: `Failed to list memories: ${error}`,
            }),
          },
        ],
        isError: true,
      };
    }
  }
);

// ─── Tool 5: memory_delete ───────────────────────────────────────────────────

server.registerTool(
  'memory_delete',
  {
    title: 'Memory Delete',
    description: `Delete a stored memory by its ID.
Removes the memory from the vector database and deletes the associated Markdown file.

Use this to:
- Remove outdated or incorrect memories
- Clean up temporary thinking artifacts
- Delete superseded plans or analyses`,
    inputSchema: {
      id: z.string().describe('The unique ID of the memory to delete'),
    },
  },
  async (args) => {
    try {
      const deleted = await memoryManager.delete(args.id);

      if (!deleted) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                error: `Memory with ID "${args.id}" not found`,
              }),
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              message: `Memory "${args.id}" deleted successfully`,
            }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: `Failed to delete memory: ${error}`,
            }),
          },
        ],
        isError: true,
      };
    }
  }
);

// ─── Start Server ────────────────────────────────────────────────────────────

async function main() {
  try {
    console.error(chalk.cyan('🚀 Initializing Localhost Sequential Thinking...'));
    console.error(chalk.dim(`   Data directory: ${DATA_DIR}`));

    // Initialize vector store and memory manager
    await vectorStore.initialize();
    await memoryManager.initialize();

    console.error(chalk.green('✅ Vector store initialized'));
    console.error(chalk.green('✅ Memory manager initialized'));

    // Connect transport
    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.error(chalk.green('✅ Localhost Sequential Thinking MCP server running on stdio'));
  } catch (error) {
    console.error(chalk.red(`❌ Failed to start server: ${error}`));
    process.exit(1);
  }
}

main();
