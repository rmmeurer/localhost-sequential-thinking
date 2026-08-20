# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2026-08-20

### Added
- **Local Embedded Vector Database**: Integrated `LanceDB` to persist all thoughts and memories offline locally.
- **Embedded Semantic Search**: Implemented offline embeddings using `@huggingface/transformers` (`all-MiniLM-L6-v2` model) allowing the agent to retrieve past reasoning semantically.
- **Dual-Write Architecture**: All thoughts and memory artifacts are now dual-written to LanceDB for semantic search and to the disk as readable Markdown files inside `data/memory/`.
- **Super Dashboard Visualizer**: Created a `Next.js` and `React Flow` interactive dashboard located in the `mcp-dashboard` subfolder to visualize the agent's Tree of Thoughts in real-time.
- **Sidecar API for Dashboard**: Added an Express sidecar (`api-server.cjs`) to query LanceDB directly. This circumvents native C++ binding compilation errors that exist when trying to load LanceDB inside the Next.js 15+ Turbopack environment on macOS.
- **Memory Store Tool**: Added `memory_store`, `memory_list`, `memory_search`, and `memory_delete` tools.

### Changed
- Re-architected the `sequentialthinking` tool to automatically embed and persist all nodes into the vector store.
- Structured the project so the MCP Server and the visual dashboard live in the same repository for ease of deployment.
