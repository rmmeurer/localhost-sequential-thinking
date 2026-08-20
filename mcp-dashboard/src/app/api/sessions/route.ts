import { NextResponse } from 'next/server';
import path from 'path';

const DATA_DIR = path.resolve(process.cwd(), '../mcp-sequential-thinking/data/vector-store');

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const lancedb = await import('@lancedb/lancedb');
    const db = await lancedb.connect(DATA_DIR);
    const tables = await db.tableNames();
    
    if (!tables.includes('thoughts')) {
      return NextResponse.json({ sessions: [] });
    }

    const table = await db.openTable('thoughts');
    
    // In LanceDB we fetch and extract unique sessionIds
    const results = await table.query().limit(10000).toArray();
    
    const sessions = new Set<string>();
    for (const row of results) {
      if (row.sessionId) {
        sessions.add(row.sessionId as string);
      }
    }

    return NextResponse.json({ sessions: Array.from(sessions) });
  } catch (error) {
    console.error('API /sessions Error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
