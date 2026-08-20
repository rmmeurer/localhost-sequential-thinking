const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs/promises');
const lancedb = require('@lancedb/lancedb');

const app = express();
app.use(cors());

const DATA_DIR = path.resolve(process.cwd(), '../mcp-sequential-thinking/data/vector-store');
const MEMORY_DIR = path.resolve(process.cwd(), '../mcp-sequential-thinking/data/memory');
const DIRS = ['plans', 'analyses', 'tasklists', 'thoughts', 'notes'];

app.get('/api/thoughts', async (req, res) => {
  try {
    const sessionId = req.query.sessionId;
    const db = await lancedb.connect(DATA_DIR);
    const tables = await db.tableNames();
    
    if (!tables.includes('thoughts')) {
      return res.json({ nodes: [], edges: [] });
    }

    const table = await db.openTable('thoughts');
    let query = table.query();
    if (sessionId) {
      query = query.where(`sessionId = '${sessionId}'`);
    }
    
    const results = await query.limit(1000).toArray();
    results.sort((a, b) => a.thoughtNumber - b.thoughtNumber);

    const nodes = [];
    const edges = [];
    const ySpacing = 150;
    const xSpacing = 300;
    
    for (let i = 0; i < results.length; i++) {
      const thought = results[i];
      const tNum = thought.thoughtNumber;
      const tBranch = thought.branchFromThought;
      const tRevises = thought.revisesThought;
      const id = String(tNum);
      
      nodes.push({
        id,
        type: 'thoughtNode',
        position: { x: tBranch ? xSpacing : 0, y: i * ySpacing },
        data: {
          label: `Thought ${tNum}`,
          thought: thought.thought,
          isRevision: thought.isRevision,
          sessionId: thought.sessionId,
          raw: thought
        }
      });

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

    res.json({ nodes, edges });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: String(error) });
  }
});

app.get('/api/sessions', async (req, res) => {
  try {
    const db = await lancedb.connect(DATA_DIR);
    const tables = await db.tableNames();
    
    if (!tables.includes('thoughts')) {
      return res.json({ sessions: [] });
    }

    const table = await db.openTable('thoughts');
    const results = await table.query().limit(10000).toArray();
    
    const sessions = new Set();
    for (const row of results) {
      if (row.sessionId) {
        sessions.add(row.sessionId);
      }
    }

    res.json({ sessions: Array.from(sessions) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: String(error) });
  }
});

app.listen(3001, () => {
  console.log('LanceDB API Server running on port 3001');
});
