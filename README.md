# Multi-Agent System Visualizer

A sophisticated 3D visualization platform for multi-agent research systems with real-time AI-powered research capabilities.

**🎮 Try it live**: [Live Demo](https://your-app-name.up.railway.app) - Works in demo mode without API keys!

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template)

## Features

- **3D Agent Architecture**: Interactive visualization of specialized research agents
- **Real-time Research**: Integration with Perplexity API and Azure OpenAI
- **Intelligent Interactions**: Context-aware agent communication flows
- **Embedding Space**: Dynamic visualization of research embeddings
- **Export System**: Clean, minimal research result exports
- **Dual Architecture**: Express server + Astro framework support

## Quick Start

### 🚀 Instant Deploy (No setup required)
- **Railway**: [![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template)
- **Render**: [![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)
- **Demo Mode**: Works immediately without API keys!

### 💻 Local Development

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure APIs**:
   ```bash
   cp .env.template env.local
   # Edit env.local with your API keys:
   # - AZURE_API_KEY: Your Azure OpenAI key
   # - AZURE_ENDPOINT: Your Azure endpoint
   # - PERPLEXITY_API_KEY: Your Perplexity API key
   ```

3. **Start the server**:
   ```bash
   node server.js
   ```

4. **Open your browser**: `http://localhost:4321`

## Usage

1. **Start Research**: Enter a topic in the search interface
2. **Watch Visualization**: Real-time 3D agent interactions
3. **Monitor Embeddings**: Top-right panel shows research space
4. **Export Results**: Get clean, minimal research summaries with real API data

## Architecture

### Specialized Research Agents
- **Lead Orchestrator**: Coordinates all research activities
- **Memory System**: Contextual data storage and retrieval  
- **Tool Agent**: API management and resource coordination
- **Search Cluster**: Parallel information retrieval (Alpha, Beta, Gamma)
- **Citations Agent**: Source validation and reference management
- **Synthesis Agent**: Analysis and knowledge integration

### Technology Stack
- **Frontend**: Three.js + ES Modules for 3D visualization
- **Backend**: Node.js + Express + Socket.io for real-time communication
- **AI Integration**: Azure OpenAI GPT-4.1-nano + Perplexity API
- **Framework**: Astro (for language diversity)
- **Database**: SQLite with better-sqlite3

## API Configuration

Required API keys in `env.local`:
- `AZURE_API_KEY`: Azure OpenAI access
- `AZURE_ENDPOINT`: Your Azure cognitive services endpoint  
- `PERPLEXITY_API_KEY`: Perplexity search API access

## Development

### Running in Development
```bash
# Express server (main application)
node server.js

# Or Astro dev server (alternative)
npm run dev
```

### Project Structure
```
├── server.js              # Main Express server
├── public/
│   ├── index.html         # 3D visualization interface
│   └── css/styles.css     # Styling
├── src/                   # Astro components (for language stats)
├── data/agents.db         # SQLite database
└── env.local             # API configuration
```

## Export Format

Research results can be exported as structured data including:
- **Search Results**: Real-time Perplexity API search results
- **Agent Analysis**: Specialized AI analysis from multiple perspectives  
- **Academic Citations**: Validated sources and references
- **Visualization Statistics**: 3D interaction and embedding metrics

## Notes

- **Security**: Never commit your `env.local` file - it contains sensitive API keys
- **Languages**: Astro framework included for GitHub language diversity
- **Performance**: Optimized for real-time 3D rendering and WebSocket communication
