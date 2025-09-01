# 🚀 Quick Deployment Guide

Deploy your Multi-Agent System Visualizer in minutes!

## Option 1: Railway (Recommended - 2 minutes)

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template/multi-agent-visualizer)

1. Click the Railway button above
2. Connect your GitHub account
3. Fork this repository
4. Railway auto-deploys from GitHub
5. Add environment variables in Railway dashboard:
   - `AZURE_API_KEY` (optional - demo mode works without)
   - `AZURE_ENDPOINT` (optional)
   - `PERPLEXITY_API_KEY` (optional)

**Demo Mode**: Works immediately without API keys!

## Option 2: Render (3 minutes)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

1. Fork this repository
2. Connect to Render
3. Render will auto-detect the `render.yaml`
4. Add environment variables (optional for demo)
5. Deploy!

## Option 3: Heroku (5 minutes)

```bash
# Install Heroku CLI
heroku create your-app-name
git push heroku main

# Add environment variables (optional)
heroku config:set AZURE_API_KEY=your_key
heroku config:set PERPLEXITY_API_KEY=your_key
```

## Option 4: Vercel (Node.js Runtime)

```bash
npm install -g vercel
vercel --prod
```

## Option 5: Local Development

```bash
git clone https://github.com/AbdulmalikDS/Multi-Agent-System-Visualizer.git
cd Multi-Agent-System-Visualizer
npm install
node server.js
```

## Demo Mode Features

The app works in **Demo Mode** without any API configuration:
- ✅ Full 3D visualization
- ✅ Agent interactions and animations
- ✅ Embedding space visualization
- ✅ Export system with sample data
- ✅ All UI features functional

## Production Features (with API keys)

- 🔥 Real Perplexity search results
- 🔥 Azure OpenAI agent analysis
- 🔥 Live academic citations
- 🔥 Intelligent agent coordination

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AZURE_API_KEY` | Optional | Azure OpenAI API key |
| `AZURE_ENDPOINT` | Optional | Azure endpoint URL |
| `PERPLEXITY_API_KEY` | Optional | Perplexity search API |
| `PORT` | Auto-set | Server port (default: 4321) |

## Free API Keys

- **Perplexity**: Get free credits at [perplexity.ai](https://perplexity.ai)
- **Azure OpenAI**: Free tier at [azure.microsoft.com](https://azure.microsoft.com)

## Performance Tips

- Use Railway/Render for best WebSocket performance
- Enable persistent disk for SQLite database
- Set `NODE_ENV=production` for optimization
