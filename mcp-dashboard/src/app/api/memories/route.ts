import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const MEMORY_DIR = path.resolve(process.cwd(), '../mcp-sequential-thinking/data/memory');
const DIRS = ['plans', 'analyses', 'tasklists', 'thoughts', 'notes'];

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const memories = [];

    for (const dir of DIRS) {
      const dirPath = path.join(MEMORY_DIR, dir);
      try {
        const files = await fs.readdir(dirPath);
        for (const file of files) {
          if (file.endsWith('.md')) {
            const content = await fs.readFile(path.join(dirPath, file), 'utf-8');
            memories.push({
              file,
              type: dir,
              content
            });
          }
        }
      } catch (err) {
        // Directory might not exist yet, skip
      }
    }

    return NextResponse.json({ memories });
  } catch (error) {
    console.error('API /memories Error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
