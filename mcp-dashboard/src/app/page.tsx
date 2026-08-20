'use client';

import { useState, useCallback, useEffect } from 'react';
import useSWR from 'swr';
import ReactFlow, { Background, Controls, MiniMap, useNodesState, useEdgesState, Node } from 'reactflow';
import 'reactflow/dist/style.css';
import { RefreshCw, Database, Brain, AlignLeft } from 'lucide-react';

const fetcher = (url: string) => fetch(url).then(res => res.json());

// Custom Node Component for a more 'cyberpunk/tech' look
function ThoughtNode({ data }: { data: any }) {
  return (
    <div className={`p-4 rounded-xl border border-white/10 backdrop-blur-md min-w-[280px] max-w-[320px] shadow-2xl transition-all ${data.isRevision ? 'bg-amber-900/40 border-amber-500/50' : 'bg-black/60 border-indigo-500/30'}`}>
      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-white/10">
        <Brain className={`w-4 h-4 ${data.isRevision ? 'text-amber-400' : 'text-indigo-400'}`} />
        <span className="text-xs font-mono font-bold tracking-wider text-white/80">{data.label}</span>
      </div>
      <p className="text-sm text-slate-300 leading-relaxed">{data.thought}</p>
    </div>
  );
}

const nodeTypes = {
  thoughtNode: ThoughtNode,
};

export default function DashboardPage() {
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  // Poll sessions and thoughts every 3 seconds
  const { data: sessionsData } = useSWR('http://localhost:3001/api/sessions', fetcher, { refreshInterval: 5000 });
  const { data: graphData, mutate: refreshGraph } = useSWR(
    selectedSession ? `http://localhost:3001/api/thoughts?sessionId=${selectedSession}` : 'http://localhost:3001/api/thoughts',
    fetcher,
    { refreshInterval: 3000 }
  );

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Sync SWR data to React Flow state
  useEffect(() => {
    if (graphData && graphData.nodes) {
      setNodes(graphData.nodes);
      setEdges(graphData.edges);
    }
  }, [graphData, setNodes, setEdges]);

  const onNodeClick = useCallback((event: any, node: Node) => {
    setSelectedNode(node);
  }, []);

  return (
    <div className="flex h-screen w-full bg-[#050505] text-white overflow-hidden font-sans">
      
      {/* Sidebar: Sessions */}
      <aside className="w-64 border-r border-white/10 bg-black/50 backdrop-blur-xl flex flex-col z-10">
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center gap-3 text-indigo-400 mb-2">
            <Database className="w-6 h-6" />
            <h1 className="font-bold tracking-tight">MCP Dashboard</h1>
          </div>
          <p className="text-xs text-slate-500 font-mono">Localhost Sequential Thinking</p>
        </div>

        <div className="p-4 flex-1 overflow-y-auto">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">Sessions</h2>
          
          <button 
            onClick={() => setSelectedSession(null)}
            className={`w-full text-left px-3 py-2 text-sm rounded-lg mb-2 transition-colors ${!selectedSession ? 'bg-indigo-600 text-white' : 'hover:bg-white/5 text-slate-400'}`}
          >
            All Sessions
          </button>
          
          {sessionsData?.sessions?.map((session: string) => (
            <button
              key={session}
              onClick={() => setSelectedSession(session)}
              className={`w-full text-left px-3 py-2 text-sm rounded-lg mb-1 truncate font-mono transition-colors ${selectedSession === session ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30' : 'hover:bg-white/5 text-slate-500'}`}
              title={session}
            >
              {session.substring(0, 12)}...
            </button>
          ))}
        </div>
      </aside>

      {/* Main Canvas: React Flow */}
      <main className="flex-1 relative bg-grid-white/[0.02]">
        <div className="absolute top-4 right-4 z-10 flex gap-2">
          <button 
            onClick={() => refreshGraph()}
            className="p-2 bg-black/50 border border-white/10 rounded-lg hover:bg-white/10 transition-colors backdrop-blur-md"
            title="Force Refresh"
          >
            <RefreshCw className="w-4 h-4 text-slate-300" />
          </button>
        </div>
        
        {nodes.length > 0 ? (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            fitView
            className="bg-transparent"
          >
            <Background color="#ffffff" gap={16} size={1} style={{ opacity: 0.05 }} />
            <Controls className="!bg-black/50 !border-white/10 !fill-white" />
            <MiniMap 
              className="!bg-black/80 !border !border-white/10" 
              maskColor="rgba(0,0,0,0.5)" 
              nodeColor={(n) => n.data?.isRevision ? '#f59e0b' : '#6366f1'} 
            />
          </ReactFlow>
        ) : (
          <div className="flex h-full items-center justify-center text-slate-500 font-mono text-sm">
            Waiting for Agent Thoughts...
          </div>
        )}
      </main>

      {/* Right Panel: Inspector */}
      {selectedNode && (
        <aside className="w-80 border-l border-white/10 bg-black/80 backdrop-blur-xl flex flex-col z-10 overflow-y-auto">
          <div className="p-6 border-b border-white/10 flex justify-between items-center">
            <h2 className="font-bold flex items-center gap-2">
              <AlignLeft className="w-4 h-4 text-indigo-400" />
              Inspector
            </h2>
            <button onClick={() => setSelectedNode(null)} className="text-slate-500 hover:text-white">✕</button>
          </div>
          
          <div className="p-6 space-y-6">
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Metadata</h3>
              <div className="bg-black/50 p-3 rounded-lg border border-white/5 font-mono text-xs text-slate-300 break-all">
                <span className="text-slate-500">ID:</span> {selectedNode.data.raw.id}<br/>
                <span className="text-slate-500">Session:</span> {selectedNode.data.sessionId}
              </div>
            </div>

            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Content</h3>
              <div className="bg-white/5 p-4 rounded-lg text-sm text-slate-200 leading-relaxed border border-white/10">
                {selectedNode.data.thought}
              </div>
            </div>
            
            {/* Can be extended with Memory Search via API later */}
            <div className="p-4 bg-indigo-900/20 border border-indigo-500/20 rounded-lg">
              <p className="text-xs text-indigo-300">
                O LanceDB está monitorando este nó na camada vetorial. Memórias relacionadas podem ser anexadas aqui no futuro.
              </p>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}
