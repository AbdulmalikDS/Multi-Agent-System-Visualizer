import { handler as ssrHandler } from './dist/server/entry.mjs';
import express from 'express';
import { createServer } from 'http';
import { WebSocketManager } from './lib/websocket';
import { agentDB } from './lib/database';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const server = createServer(app);

// Initialize WebSocket manager
const wsManager = new WebSocketManager(server);

// Initialize database
console.log('Initializing database...');
try {
    // Test database connection
    const agents = agentDB.getAllAgents();
    console.log(`Database initialized with ${agents.length} agents`);
} catch (error) {
    console.error('Database initialization error:', error);
}

// Handle SSR requests
app.use('*', (req, res, next) => {
    ssrHandler(req, res, next);
});

const PORT = process.env.PORT || 4321;

server.listen(PORT, () => {
    console.log(`🚀 Multi-Agent Conversation Network (Astro + LangGraph) running on port ${PORT}`);
    console.log(`🌐 Open http://localhost:${PORT} in your browser`);
    console.log(`🔑 Azure API Key: ${process.env.AZURE_API_KEY ? 'Configured' : 'NOT CONFIGURED'}`);
    console.log(`📊 Database: SQLite with persistent memory`);
    console.log(`🤖 Agents: LangGraph-powered with state machines`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('Shutting down gracefully...');
    agentDB.close();
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});
