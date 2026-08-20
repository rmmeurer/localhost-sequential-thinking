import { NextResponse } from 'next/server';
import path from 'path';

const DATA_DIR = path.resolve(process.cwd(), '../mcp-sequential-thinking/data/vector-store');

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const lancedb = await import('@lancedb/lancedb');
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    const db = await lancedb.connect(DATA_DIR);
    
    // Check if table exists
    const tables = await db.tableNames();
    if (!tables.includes('thoughts')) {
      return NextResponse.json({ nodes: [], edges: [] });
    }

    const table = await db.openTable('thoughts');
    
    // Fetch thoughts, filtering by sessionId if provided
    let query = table.query();
    if (sessionId) {
      query = query.where(`sessionId = '${sessionId}'`);
    }
    
    const results = await query.limit(1000).toArray();

    // Sort by thoughtNumber
    results.sort((a, b) => (a.thoughtNumber as number) - (b.thoughtNumber as number));

    // Convert to React Flow nodes & edges
    const nodes = [];
    const edges = [];
    const ySpacing = 150;
    const xSpacing = 300;

    // Basic layout calculation (can be improved with dagre on client)
    let currentY = 0;
    
    for (let i = 0; i < results.length; i++) {
      const thought = results[i];
      const tNum = thought.thoughtNumber as number;
      const tBranch = thought.branchFromThought as number | undefined;
      const tRevises = thought.revisesThought as number | undefined;

      const id = String(tNum);
      
      nodes.push({
        id,
        type: 'thoughtNode', // Custom node type we will create
        position: { x: tBranch ? xSpacing : 0, y: i * ySpacing },
        data: {
          label: `Thought ${tNum}`,
          thought: thought.thought,
          isRevision: thought.isRevision,
          sessionId: thought.sessionId,
          raw: thought
        }
      });

      // Connect to previous sequential thought unless it's a branch/revision that points elsewhere
      if (tRevises) {
        edges.push({
          id: `e${tRevises}-${id}-revision`,
          source: String(tRevises),
          target: id,
          animated: true,
          style: { stroke: '#f59e0b', strokeWidth: 2 },
          label: 'revises'
        });
      } else if (tBranch) {
        edges.push({
          id: `e${tBranch}-${id}-branch`,
          source: String(tBranch),
          target: id,
          animated: true,
          style: { stroke: '#3b82f6', strokeWidth: 2 },
          label: 'branches'
        });
      } else if (i > 0 && results[i-1].sessionId === thought.sessionId) {
        edges.push({
          id: `e${results[i-1].thoughtNumber}-${id}`,
          source: String(results[i-1].thoughtNumber),
          target: id,
          style: { stroke: '#10b981' }
        });
      }
    }

    return NextResponse.json({ nodes, edges });
  } catch (error) {
    console.error('API /thoughts Error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
