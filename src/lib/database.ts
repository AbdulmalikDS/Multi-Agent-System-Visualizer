import Database from 'better-sqlite3';
import path from 'path';

export class AgentDatabase {
    private db: Database.Database;

    constructor() {
        const dbPath = path.join(process.cwd(), 'data', 'agents.db');
        this.db = new Database(dbPath);
        this.initializeTables();
    }

    private initializeTables() {
        // Agents table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS agents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                personality_type TEXT NOT NULL,
                color TEXT NOT NULL,
                topics TEXT NOT NULL,
                style TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Conversations table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS conversations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                topic TEXT NOT NULL,
                agent1_id INTEGER NOT NULL,
                agent2_id INTEGER NOT NULL,
                start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
                end_time DATETIME,
                status TEXT DEFAULT 'active',
                FOREIGN KEY (agent1_id) REFERENCES agents (id),
                FOREIGN KEY (agent2_id) REFERENCES agents (id)
            )
        `);

        // Messages table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                conversation_id INTEGER NOT NULL,
                speaker_id INTEGER NOT NULL,
                message TEXT NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                message_type TEXT DEFAULT 'text',
                FOREIGN KEY (conversation_id) REFERENCES conversations (id),
                FOREIGN KEY (speaker_id) REFERENCES agents (id)
            )
        `);

        // Agent memory table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS agent_memory (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                agent_id INTEGER NOT NULL,
                memory_type TEXT NOT NULL,
                content TEXT NOT NULL,
                importance REAL DEFAULT 1.0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_accessed DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (agent_id) REFERENCES agents (id)
            )
        `);

        // Network connections table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS network_connections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                agent1_id INTEGER NOT NULL,
                agent2_id INTEGER NOT NULL,
                strength REAL DEFAULT 1.0,
                last_interaction DATETIME DEFAULT CURRENT_TIMESTAMP,
                interaction_count INTEGER DEFAULT 0,
                FOREIGN KEY (agent1_id) REFERENCES agents (id),
                FOREIGN KEY (agent2_id) REFERENCES agents (id)
            )
        `);

        this.initializeDefaultAgents();
    }

    private initializeDefaultAgents() {
        const agents = [
            {
                name: 'Tech Enthusiast',
                personality_type: 'tech',
                color: '#00ff88',
                topics: JSON.stringify(['AI', 'programming', 'innovation', 'technology', 'startups']),
                style: 'enthusiastic about technology and innovation'
            },
            {
                name: 'Philosopher',
                personality_type: 'philosopher',
                color: '#ff8800',
                topics: JSON.stringify(['ethics', 'meaning', 'consciousness', 'existence', 'morality']),
                style: 'contemplative and philosophical about deep questions'
            },
            {
                name: 'Skeptic',
                personality_type: 'skeptic',
                color: '#ff0088',
                topics: JSON.stringify(['critical thinking', 'evidence', 'skepticism', 'debunking', 'logic']),
                style: 'questioning and skeptical, always seeking evidence'
            },
            {
                name: 'Creative',
                personality_type: 'creative',
                color: '#8800ff',
                topics: JSON.stringify(['art', 'creativity', 'imagination', 'expression', 'beauty']),
                style: 'artistic and imaginative, focused on creative expression'
            },
            {
                name: 'Analyst',
                personality_type: 'analyst',
                color: '#0088ff',
                topics: JSON.stringify(['data', 'analysis', 'research', 'patterns', 'insights']),
                style: 'analytical and data-driven, focused on patterns and insights'
            },
            {
                name: 'Connector',
                personality_type: 'connector',
                color: '#ffff00',
                topics: JSON.stringify(['relationships', 'networking', 'collaboration', 'community', 'bridging']),
                style: 'focused on building connections and facilitating conversations'
            }
        ];

        const insertAgent = this.db.prepare(`
            INSERT OR IGNORE INTO agents (name, personality_type, color, topics, style)
            VALUES (?, ?, ?, ?, ?)
        `);

        agents.forEach(agent => {
            insertAgent.run(agent.name, agent.personality_type, agent.color, agent.topics, agent.style);
        });
    }

    // Agent methods
    getAllAgents() {
        return this.db.prepare('SELECT * FROM agents ORDER BY id').all();
    }

    getAgentById(id: number) {
        return this.db.prepare('SELECT * FROM agents WHERE id = ?').get(id);
    }

    updateAgentMemory(agentId: number, memoryType: string, content: string, importance: number = 1.0) {
        const stmt = this.db.prepare(`
            INSERT INTO agent_memory (agent_id, memory_type, content, importance)
            VALUES (?, ?, ?, ?)
        `);
        return stmt.run(agentId, memoryType, content, importance);
    }

    getAgentMemory(agentId: number, limit: number = 10) {
        return this.db.prepare(`
            SELECT * FROM agent_memory 
            WHERE agent_id = ? 
            ORDER BY importance DESC, last_accessed DESC 
            LIMIT ?
        `).all(agentId, limit);
    }

    // Conversation methods
    createConversation(topic: string, agent1Id: number, agent2Id: number) {
        const stmt = this.db.prepare(`
            INSERT INTO conversations (topic, agent1_id, agent2_id)
            VALUES (?, ?, ?)
        `);
        const result = stmt.run(topic, agent1Id, agent2Id);
        return result.lastInsertRowid;
    }

    addMessage(conversationId: number, speakerId: number, message: string, messageType: string = 'text') {
        const stmt = this.db.prepare(`
            INSERT INTO messages (conversation_id, speaker_id, message, message_type)
            VALUES (?, ?, ?, ?)
        `);
        return stmt.run(conversationId, speakerId, message, messageType);
    }

    getConversationMessages(conversationId: number, limit: number = 20) {
        return this.db.prepare(`
            SELECT m.*, a.name as speaker_name, a.color as speaker_color
            FROM messages m
            JOIN agents a ON m.speaker_id = a.id
            WHERE m.conversation_id = ?
            ORDER BY m.timestamp DESC
            LIMIT ?
        `).all(conversationId, limit);
    }

    getActiveConversations() {
        return this.db.prepare(`
            SELECT c.*, 
                   a1.name as agent1_name, a1.color as agent1_color,
                   a2.name as agent2_name, a2.color as agent2_color
            FROM conversations c
            JOIN agents a1 ON c.agent1_id = a1.id
            JOIN agents a2 ON c.agent2_id = a2.id
            WHERE c.status = 'active'
            ORDER BY c.start_time DESC
        `).all();
    }

    // Network connection methods
    updateConnection(agent1Id: number, agent2Id: number, strength: number = 1.0) {
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO network_connections 
            (agent1_id, agent2_id, strength, last_interaction, interaction_count)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP, 
                    COALESCE((SELECT interaction_count FROM network_connections 
                             WHERE (agent1_id = ? AND agent2_id = ?) 
                                OR (agent1_id = ? AND agent2_id = ?)), 0) + 1)
        `);
        return stmt.run(agent1Id, agent2Id, strength, agent1Id, agent2Id, agent2Id, agent1Id);
    }

    getNetworkConnections() {
        return this.db.prepare(`
            SELECT nc.*, 
                   a1.name as agent1_name, a1.color as agent1_color,
                   a2.name as agent2_name, a2.color as agent2_color
            FROM network_connections nc
            JOIN agents a1 ON nc.agent1_id = a1.id
            JOIN agents a2 ON nc.agent2_id = a2.id
            ORDER BY nc.strength DESC
        `).all();
    }

    // Analytics methods
    getConversationStats() {
        return this.db.prepare(`
            SELECT 
                COUNT(*) as total_conversations,
                COUNT(CASE WHEN status = 'active' THEN 1 END) as active_conversations,
                COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_conversations
            FROM conversations
        `).get();
    }

    getAgentStats() {
        return this.db.prepare(`
            SELECT 
                a.id,
                a.name,
                a.personality_type,
                COUNT(DISTINCT c.id) as conversation_count,
                COUNT(m.id) as message_count,
                AVG(nc.strength) as avg_connection_strength
            FROM agents a
            LEFT JOIN conversations c ON (a.id = c.agent1_id OR a.id = c.agent2_id)
            LEFT JOIN messages m ON a.id = m.speaker_id
            LEFT JOIN network_connections nc ON (a.id = nc.agent1_id OR a.id = nc.agent2_id)
            GROUP BY a.id
            ORDER BY message_count DESC
        `).all();
    }

    close() {
        this.db.close();
    }
}

// Export singleton instance
export const agentDB = new AgentDatabase();
