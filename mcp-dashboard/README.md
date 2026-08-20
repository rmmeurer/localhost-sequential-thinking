# MCP Dashboard (Localhost Sequential Thinking)

Um painel visual interativo construído com **Next.js** e **React Flow** para monitorar e visualizar a "Árvore de Pensamentos" dos Agentes Autônomos usando o MCP `mcp-sequential-thinking`.

## 🎨 Arquitetura Híbrida

Devido ao modo como a engine nativa do LanceDB se integra com bundlers modernos (como Next.js 15+ Turbopack), o dashboard adota uma arquitetura híbrida de alto desempenho:

1. **Frontend (Next.js):** 
   - Roda na porta `:3000`.
   - Gerencia a interface, componentes (Tailwind, Framer Motion) e o Canvas (React Flow).
2. **API Sidecar (Express):** 
   - Roda na porta `:3001` de dentro do projeto original do MCP.
   - Faz a leitura pesada dos embeddings nativos do LanceDB (bypassando o Webpack) e expõe as rotas `/api/thoughts` em tempo-real para o Next.js.

## 🚀 Como Executar

Para ver a tela do mapa mental, você precisa rodar os dois processos:

### 1. Iniciar a API do LanceDB (Sidecar)
Em uma aba do terminal, vá até o projeto do servidor MCP e inicie o sidecar:
```bash
cd ../mcp-sequential-thinking
node api-server.cjs
```

### 2. Iniciar o Frontend (Dashboard)
Em outra aba, na pasta do dashboard, inicie o React:
```bash
cd mcp-dashboard
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000) no seu navegador. O canvas será atualizado magicamente à medida que o Agente AI formula novos pensamentos em segundo plano!
