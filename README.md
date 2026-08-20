# Localhost Sequential Thinking MCP Server

An enhanced, locally-hosted fork of the official Model Context Protocol (MCP) `sequential-thinking` server. 

This version introduces **persistent memory** using an embedded **LanceDB vector database** and **local embeddings** via HuggingFace Transformers, completely offline. It not only keeps track of your thinking process across sessions but also allows AI agents to store, search, and manage persistent memory artifacts (plans, analyses, notes) as standard Markdown files.

## 🚀 Key Features

- **100% Local & Offline**: Runs entirely on your machine. No external APIs needed for embeddings.
- **Embedded Vector Database**: Uses [LanceDB](https://lancedb.github.io/lancedb/) to store thoughts and memories.
- **Semantic Search**: Built-in embeddings (`all-MiniLM-L6-v2`) allow agents to recall past thoughts and plans using natural language similarity.
- **Markdown Artifacts**: Every memory stored is dual-written as a Markdown file with YAML frontmatter, making it easy for humans to read and organize.
- **Session Tracking**: Thoughts are grouped by session, allowing agents to maintain context across different reasoning chains.

---

## 🛠️ Installation

### Prerequisites
- Node.js (v18 or higher)
- npm

### Setup

1. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/mcp-sequential-thinking.git
   cd mcp-sequential-thinking
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the project:
   ```bash
   npm run build
   ```

*(Note: On the first run, the `@huggingface/transformers` library will download the `all-MiniLM-L6-v2` model (~22MB) to your local cache).*

---

## ⚙️ Configuration (MCP Clients)

To use this server with your favorite MCP client (like Claude Desktop, Antigravity, or VS Code), add the following to your MCP configuration file (e.g., `claude_desktop_config.json` or `mcp_config.json`):

```json
{
  "mcpServers": {
    "localhost-sequential-thinking": {
      "command": "node",
      "args": [
        "/absolute/path/to/mcp-sequential-thinking/dist/index.js"
      ],
      "env": {
        "DISABLE_THOUGHT_LOGGING": "false"
      }
    }
  }
}
```
*Make sure to replace `/absolute/path/to/...` with the actual path where you cloned the repository.*

---

## 🧰 Available Tools

This server exposes 5 tools to the AI agent:

### 1. `sequentialthinking`
The core reflective problem-solving tool. It allows the agent to break down complex problems into steps.
- **Enhancement**: Every thought is automatically embedded and saved to the local vector database.

### 2. `memory_store`
Stores a memory artifact (`plan`, `analysis`, `tasklist`, `thought`, or `note`).
- **Action**: Embeds the content into LanceDB and creates a beautifully formatted Markdown file in `./data/memory/<type>/`.

### 3. `memory_search`
Performs a semantic vector search across all stored memories.
- **Action**: Agents can pass a natural language query to find relevant past plans or notes, returning a similarity score.

### 4. `memory_list`
Lists stored memories without semantic search.
- **Action**: Allows filtering by type, tags, or creation date to get an overview of what is stored.

### 5. `memory_delete`
Deletes a specific memory artifact.
- **Action**: Removes the vector from LanceDB and deletes the associated Markdown file from disk.

---

## 📁 Data Storage

All data is stored locally within the repository in the `./data/` directory (ignored by git):

```
mcp-sequential-thinking/
├── data/
│   ├── vector-store/         # LanceDB database files (*.lance)
│   └── memory/               # Human-readable Markdown artifacts
│       ├── plans/
│       ├── analyses/
│       ├── tasklists/
│       ├── thoughts/
│       └── notes/
```

---

## 🧪 Testing with MCP Inspector

You can test the server and its tools visually using the official MCP Inspector:

```bash
npm run build
npx @modelcontextprotocol/inspector node dist/index.js
```

This will start a local web server where you can manually connect to the MCP server and trigger the tools via a graphical interface.

---

## 📄 License

MIT License - Based on the original `@modelcontextprotocol/server-sequential-thinking`.
