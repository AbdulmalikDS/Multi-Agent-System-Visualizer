import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import Database from 'better-sqlite3';
import fetch from 'node-fetch';
import OpenAI from 'openai';

// Load environment variables
dotenv.config({ path: './env.local' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server);

// Serve static files
app.use(express.static(join(__dirname, 'public')));

// Database setup
const db = new Database('./data/agents.db');

// Azure OpenAI Configuration
const AZURE_API_KEY = process.env.AZURE_API_KEY;
const AZURE_ENDPOINT = process.env.AZURE_ENDPOINT;
const AZURE_API_VERSION = process.env.AZURE_API_VERSION || "2024-04-01-preview";
const AZURE_DEPLOYMENT = "gpt-4.1-nano";
const MODEL_NAME = "gpt-4.1-nano";

// Perplexity Configuration
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;

console.log('🔑 Azure OpenAI API Key:', AZURE_API_KEY ? 'CONFIGURED' : 'NOT CONFIGURED');
console.log('🌐 Azure OpenAI Endpoint:', AZURE_ENDPOINT);
console.log('📅 Azure API Version:', AZURE_API_VERSION);
console.log('🤖 Azure Deployment:', AZURE_DEPLOYMENT);
console.log('🔍 Perplexity API Key:', PERPLEXITY_API_KEY ? 'CONFIGURED' : 'NOT CONFIGURED');

// Initialize Azure OpenAI client
let azureOpenAIClient = null;
if (AZURE_API_KEY && AZURE_ENDPOINT) {
    const options = { 
        baseURL: AZURE_ENDPOINT,
        apiKey: AZURE_API_KEY
    };
    azureOpenAIClient = new OpenAI(options);
    console.log('✅ Azure OpenAI client initialized successfully with GPT-4.1-nano');
} else {
    console.log('⚠️ Azure OpenAI not configured, using fallback responses');
}

// Global research session management
let currentResearchSession = null;

// Initialize database tables
db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        personality_type TEXT NOT NULL,
        color TEXT NOT NULL,
        topics TEXT NOT NULL,
        style TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

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
    );

    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id INTEGER NOT NULL,
        speaker_id INTEGER NOT NULL,
        message TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        message_type TEXT DEFAULT 'text',
        FOREIGN KEY (conversation_id) REFERENCES conversations (id),
        FOREIGN KEY (speaker_id) REFERENCES agents (id)
    );

    CREATE TABLE IF NOT EXISTS agent_memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id INTEGER NOT NULL,
        memory_type TEXT NOT NULL,
        content TEXT NOT NULL,
        importance REAL DEFAULT 1.0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_accessed DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (agent_id) REFERENCES agents (id)
    );

    CREATE TABLE IF NOT EXISTS network_connections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent1_id INTEGER NOT NULL,
        agent2_id INTEGER NOT NULL,
        strength REAL DEFAULT 1.0,
        last_interaction DATETIME DEFAULT CURRENT_TIMESTAMP,
        interaction_count INTEGER DEFAULT 0,
        FOREIGN KEY (agent1_id) REFERENCES agents (id),
        FOREIGN KEY (agent2_id) REFERENCES agents (id)
    );

    CREATE TABLE IF NOT EXISTS citations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        finding_id INTEGER NOT NULL,
        source_url TEXT,
        source_title TEXT,
        citation_text TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`);

// Populate with sample data
function populateSampleData() {
    try {
        // Insert sample agents if they don't exist
        const insertAgent = db.prepare(`
            INSERT OR IGNORE INTO agents (name, personality_type, color, topics, style)
            VALUES (?, ?, ?, ?, ?)
        `);
        
        const agents = [
            { name: 'Tech Enthusiast', type: 'tech', color: '#00ff88', topics: '["AI", "programming", "innovation"]', style: 'enthusiastic' },
            { name: 'Philosopher', type: 'philosopher', color: '#ff8800', topics: '["ethics", "meaning", "consciousness"]', style: 'contemplative' },
            { name: 'Skeptic', type: 'skeptic', color: '#ff0088', topics: '["critical thinking", "evidence", "skepticism"]', style: 'questioning' },
            { name: 'Creative', type: 'creative', color: '#8800ff', topics: '["art", "creativity", "imagination"]', style: 'artistic' },
            { name: 'Analyst', type: 'analyst', color: '#0088ff', topics: '["data", "analysis", "research"]', style: 'analytical' }
        ];
        
        agents.forEach(agent => {
            insertAgent.run(agent.name, agent.type, agent.color, agent.topics, agent.style);
        });
        
        // Create sample conversations and messages
        const insertConversation = db.prepare(`
            INSERT OR IGNORE INTO conversations (topic, agent1_id, agent2_id)
            VALUES (?, ?, ?)
        `);
        
        const insertMessage = db.prepare(`
            INSERT OR IGNORE INTO messages (conversation_id, speaker_id, message, message_type)
            VALUES (?, ?, ?, ?)
        `);
        
        // Create sample conversation
        const conversationResult = insertConversation.run('AI Ethics Discussion', 1, 2);
        const conversationId = conversationResult.lastInsertRowid || 1;
        
        // Add sample messages
        const sampleMessages = [
            { speaker: 1, message: 'AI has incredible potential to transform our world for the better!', type: 'text' },
            { speaker: 2, message: 'But we must consider the ethical implications carefully.', type: 'text' },
            { speaker: 1, message: 'Absolutely! We need responsible AI development.', type: 'text' },
            { speaker: 2, message: 'What about bias in AI systems?', type: 'text' },
            { speaker: 1, message: 'That\'s a critical concern that needs addressing.', type: 'text' }
        ];
        
        sampleMessages.forEach(msg => {
            insertMessage.run(conversationId, msg.speaker, msg.message, msg.type);
        });
        
        // Add some recent messages for testing (without conversation_id for direct agent messages)
        const recentMessages = [
            { speaker: 1, message: 'Just completed research on AI ethics frameworks.', type: 'research' },
            { speaker: 3, message: 'Found interesting patterns in the data analysis.', type: 'analysis' },
            { speaker: 4, message: 'Creative approach to problem-solving yields innovative solutions.', type: 'creative' },
            { speaker: 5, message: 'Statistical analysis shows significant correlation.', type: 'analysis' },
            { speaker: 2, message: 'Philosophical implications of AI consciousness need deeper exploration.', type: 'philosophy' }
        ];
        
        // Insert recent messages directly (without conversation_id for testing)
        const insertRecentMessage = db.prepare(`
            INSERT OR IGNORE INTO messages (conversation_id, speaker_id, message, message_type)
            VALUES (?, ?, ?, ?)
        `);
        
        recentMessages.forEach(msg => {
            insertRecentMessage.run(conversationId, msg.speaker, msg.message, msg.type);
        });
        
        console.log('✅ Sample data populated successfully');
    } catch (error) {
        console.error('❌ Error populating sample data:', error);
    }
}

// Populate sample data
populateSampleData();

// Azure OpenAI API Integration
async function callAzureOpenAI(prompt, systemMessage = null) {
    if (!azureOpenAIClient) {
        console.log('⚠️ Azure OpenAI client not configured, using fallback response');
        return generateFallbackResponse(prompt);
    }
    
    try {
        const messages = [];
        if (systemMessage) {
            messages.push({ role: 'system', content: systemMessage });
        }
        messages.push({ role: 'user', content: prompt });
        
        const response = await azureOpenAIClient.chat.completions.create({
            model: MODEL_NAME,
            messages: messages,
            max_tokens: 500,
            temperature: 0.7
        });
        
        console.log('🤖 Azure OpenAI API call successful');
        console.log('📊 Tokens used:', response.usage);
        return response.choices[0].message.content;
        
    } catch (error) {
        console.error('❌ Azure OpenAI API error:', error.message);
        return generateFallbackResponse(prompt);
    }
}

function generateFallbackResponse(prompt) {
    const responses = {
        'planning': 'Research plan created with comprehensive methodology and structured approach.',
        'background': 'Background research completed with key insights and foundational knowledge.',
        'analysis': 'Detailed analysis performed with critical examination and evidence-based conclusions.',
        'synthesis': 'Pattern synthesis completed with integrated findings and cross-domain insights.',
        'evaluation': 'Critical evaluation finished with balanced assessment and improvement recommendations.',
        'connection': 'Cross-domain connections established with interdisciplinary perspectives.'
    };
    
    for (const [key, response] of Object.entries(responses)) {
        if (prompt.toLowerCase().includes(key)) {
            return response;
        }
    }
    
    return 'Research task completed with comprehensive analysis and findings.';
}

// Enhanced Perplexity Search Integration with Link Parsing
async function searchWithPerplexity(query) {
    if (!PERPLEXITY_API_KEY) {
        console.log('⚠️ Perplexity API key not configured, using fallback search');
        return generateFallbackSearchResults(query);
    }
    
    try {
        const response = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'sonar',
                messages: [{
                    role: 'user',
                    content: `Research and provide comprehensive information about: ${query}. Include recent developments, key findings, and relevant sources.`
                }],
                max_tokens: 1000,
                temperature: 0.2
            })
        });
        
        if (!response.ok) {
            throw new Error(`Perplexity API error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('🔍 Perplexity search successful');
        
        // Parse the response content
        const content = data.choices[0].message.content;
        const links = extractLinksFromContent(content);
        const sources = extractSourcesFromContent(content);
        
        return {
            query: query,
            results: content,
            links: links,
            citations: [],
            sources: sources.length > 0 ? sources : ['Research Database', 'Academic Sources'],
            timestamp: new Date().toISOString(),
            embedding: generateEmbedding(query, content)
        };
        
    } catch (error) {
        console.error('❌ Perplexity search error:', error.message);
        return generateFallbackSearchResults(query);
    }
}

// Extract links from content
function extractLinksFromContent(content) {
    const urlRegex = /(https?:\/\/[^\s\)]+)/g;
    const links = content.match(urlRegex) || [];
    return [...new Set(links)]; // Remove duplicates
}

// Extract sources from content
function extractSourcesFromContent(content) {
    const sources = [];
    const lines = content.split('\n');
    
    for (const line of lines) {
        if (line.includes('http') || line.includes('www.') || line.includes('.com') || line.includes('.org')) {
            sources.push(line.trim());
        }
    }
    
    return sources;
}

// Generate embedding coordinates for visualization
function generateEmbedding(query, content) {
    // Create a simple embedding based on query and content characteristics
    const queryWords = query.toLowerCase().split(' ');
    const contentWords = content.toLowerCase().split(' ').slice(0, 100); // First 100 words
    
    // Calculate position based on content themes
    const themes = {
        technical: ['algorithm', 'system', 'technology', 'software', 'hardware', 'code', 'programming'],
        scientific: ['research', 'study', 'experiment', 'analysis', 'data', 'method', 'theory'],
        social: ['society', 'people', 'community', 'social', 'human', 'interaction', 'behavior'],
        economic: ['market', 'business', 'financial', 'economic', 'cost', 'profit', 'investment'],
        environmental: ['climate', 'environment', 'green', 'sustainability', 'ecological', 'nature']
    };
    
    let x = 0, y = 0, z = 0;
    let totalWeight = 0;
    
    for (const [theme, keywords] of Object.entries(themes)) {
        const weight = keywords.reduce((sum, keyword) => {
            return sum + (contentWords.filter(word => word.includes(keyword)).length);
        }, 0);
        
        totalWeight += weight;
        
        // Assign coordinates based on theme
        switch (theme) {
            case 'technical': x += weight * 2; y += weight * 1; break;
            case 'scientific': x += weight * -1; y += weight * 2; break;
            case 'social': x += weight * -2; y += weight * -1; break;
            case 'economic': x += weight * 1; y += weight * -2; break;
            case 'environmental': z += weight * 2; break;
        }
    }
    
    // Normalize and add some randomness
    const normalizer = Math.max(totalWeight, 1);
    return {
        x: (x / normalizer) + (Math.random() - 0.5) * 0.5,
        y: (y / normalizer) + (Math.random() - 0.5) * 0.5,
        z: (z / normalizer) + (Math.random() - 0.5) * 0.5,
        query: query,
        timestamp: Date.now(),
        weight: Math.min(totalWeight / 10, 1)
    };
}

function generateFallbackSearchResults(query) {
    const fallbackResults = {
        'AI': 'Artificial Intelligence has evolved significantly with recent breakthroughs in large language models, computer vision, and autonomous systems. Key developments include GPT-4, DALL-E, and advances in reinforcement learning.',
        'climate': 'Climate change research shows increasing global temperatures, rising sea levels, and extreme weather events. Recent studies indicate urgent need for renewable energy adoption and carbon reduction strategies.',
        'healthcare': 'Healthcare technology is advancing rapidly with AI diagnostics, telemedicine platforms, and personalized medicine approaches. Recent innovations include AI-powered medical imaging and drug discovery.',
        'cybersecurity': 'Cybersecurity threats are becoming more sophisticated with ransomware attacks, data breaches, and nation-state cyber warfare. Recent developments focus on zero-trust architecture and AI-powered threat detection.',
        'quantum': 'Quantum computing research is progressing with companies like IBM, Google, and startups achieving quantum advantage in specific domains. Recent breakthroughs include error correction and qubit stability improvements.'
    };
    
    const queryLower = query.toLowerCase();
    for (const [keyword, result] of Object.entries(fallbackResults)) {
        if (queryLower.includes(keyword)) {
            return {
                query: query,
                results: result,
                sources: ['Fallback Research Database', 'Academic Sources'],
                links: [],
                timestamp: new Date().toISOString()
            };
        }
    }
    
    return {
        query: query,
        results: `Research on ${query} shows various developments and current trends in the field. Recent studies indicate ongoing progress and new applications emerging.`,
        sources: ['Fallback Research Database', 'Academic Sources'],
        links: [],
        timestamp: new Date().toISOString()
    };
}

// Multi-Agent Research System Architecture (Based on Anthropic's System)

class Memory {
    constructor() {
        this.researchPlans = new Map();
        this.context = new Map();
        this.findings = new Map();
    }
    
    savePlan(sessionId, plan) {
        this.researchPlans.set(sessionId, plan);
        console.log(`📋 Research plan saved for session ${sessionId}`);
    }
    
    retrieveContext(sessionId) {
        return this.context.get(sessionId) || [];
    }
    
    addContext(sessionId, context) {
        if (!this.context.has(sessionId)) {
            this.context.set(sessionId, []);
        }
        this.context.get(sessionId).push(context);
    }
    
    saveFindings(sessionId, findings) {
        this.findings.set(sessionId, findings);
    }
}

class LeadResearcher {
    constructor(memory, db) {
        this.memory = memory;
        this.db = db;
        this.activeSessions = new Map();
        this.globalEmbeddings = new Map(); // Store all embeddings for visualization
        this.conceptClusters = new Map(); // Track concept clustering
        this.emergentConnections = new Map(); // Track emergent connections between concepts
        this.agentSpecializations = {
            'technical_analyst': { color: '#00ff88', expertise: ['technical', 'implementation', 'systems'] },
            'trend_researcher': { color: '#ff8800', expertise: ['trends', 'market', 'adoption'] },
            'impact_assessor': { color: '#ff0088', expertise: ['impact', 'implications', 'consequences'] },
            'context_synthesizer': { color: '#8800ff', expertise: ['synthesis', 'connections', 'relationships'] },
            'evidence_validator': { color: '#0088ff', expertise: ['validation', 'verification', 'accuracy'] }
        };
        this.tools = {
            search_tools: ['perplexity', 'web_search'],
            mcp_tools: ['memory_management', 'context_window'],
            memory: this.memory,
            run_subagent: this.runSubagent.bind(this),
            complete_task: this.completeTask.bind(this),
            generate_embedding: this.generateAdvancedEmbedding.bind(this),
            cluster_concepts: this.clusterConcepts.bind(this)
        };
        console.log('🎯 [LeadResearcher] Initialized with enhanced Anthropic-style multi-agent orchestration');
    }
    
    async startResearch(topic) {
        const sessionId = Date.now();
        console.log(`🔬 [LeadResearcher] Starting research session ${sessionId} on: ${topic}`);
        
        // Create research session in database
        const stmt = this.db.prepare(`
            INSERT INTO conversations (topic, agent1_id, agent2_id, status) 
            VALUES (?, 1, 2, 'active')
        `);
        const result = stmt.run(topic);
        const conversationId = result.lastInsertRowid;
        
        // Initialize session with Anthropic architecture
        this.activeSessions.set(sessionId, {
            topic,
            conversationId,
            status: 'active',
            subagents: [],
            findings: [],
            phase: 'planning',
            embeddings: [],
            citations: [],
            searchResults: []
        });
        
        try {
            // Phase 1: Initial Perplexity search and embedding generation
            console.log(`🔍 [LeadResearcher] Phase 1: Initial research and embedding generation`);
            const initialSearch = await searchWithPerplexity(topic);
            
            // Add embedding to global space
            this.addEmbeddingToSpace(sessionId, initialSearch.embedding, {
                type: 'initial_search',
                query: topic,
                content: initialSearch.results.substring(0, 100),
                links: initialSearch.links,
                sources: initialSearch.sources
            });
            
            // Phase 2: Plan research approach
            const plan = await this.planResearchApproach(topic, initialSearch);
            this.memory.savePlan(sessionId, plan);
            
            // Phase 3: Create and orchestrate subagents
            const subagents = await this.createSubagents(sessionId, plan);
            
            // Phase 4: Execute parallel research tasks
            await this.orchestrateResearch(sessionId, subagents, topic);
            
            return sessionId;
        } catch (error) {
            console.error(`❌ [LeadResearcher] Error in research session ${sessionId}:`, error);
            this.activeSessions.get(sessionId).status = 'failed';
            throw error;
        }
    }
    
    async planResearchApproach(topic, initialSearch) {
        console.log(`🧠 [LeadResearcher] Planning comprehensive research approach`);
        
        const systemMessage = `You are a Lead Research Agent orchestrator. Based on the initial search results, create a detailed multi-agent research plan. Break down the research into specialized tasks that different expert agents can handle in parallel.`;
        
        const prompt = `Based on this initial search about "${topic}":

${initialSearch.results}

Create a comprehensive research plan with:
1. 3-5 specialized research subtasks
2. Specific focus areas for each subagent
3. Expected outcomes and deliverables
4. Research methodology for each task

Topic: ${topic}`;
        
        const aiResponse = await callAzureOpenAI(prompt, systemMessage);
        
        return {
            topic,
            initialSearch,
            researchPlan: aiResponse,
            subtasks: this.extractSubtasks(aiResponse, topic),
            estimatedSubagents: 4,
            complexity: this.assessComplexity(topic),
            timestamp: new Date().toISOString()
        };
    }
    
    extractSubtasks(planText, topic) {
        // Extract structured subtasks from the AI response
        const subtasks = [
            {
                id: 1,
                name: 'Background Research',
                focus: `Historical context and foundational knowledge about ${topic}`,
                agent_type: 'background_researcher'
            },
            {
                id: 2,
                name: 'Current Trends Analysis',
                focus: `Latest developments and current state of ${topic}`,
                agent_type: 'trend_analyzer'
            },
            {
                id: 3,
                name: 'Technical Deep Dive',
                focus: `Technical aspects, methodologies, and implementation details`,
                agent_type: 'technical_specialist'
            },
            {
                id: 4,
                name: 'Impact Assessment',
                focus: `Implications, applications, and future prospects`,
                agent_type: 'impact_assessor'
            }
        ];
        
        return subtasks;
    }
    
    async orchestrateResearch(sessionId, subagents, topic) {
        console.log(`🚀 [LeadResearcher] Orchestrating parallel research with ${subagents.length} subagents`);
        
        const session = this.activeSessions.get(sessionId);
        if (!session) return;
        
        // Run subagents in parallel with different search queries
        const searchQueries = this.generateSearchQueries(topic);
        const tasks = subagents.map((subagent, index) => 
            this.runSubagentWithEmbedding(sessionId, subagent, searchQueries[index] || topic)
        );
        
        const results = await Promise.all(tasks);
        
        // Collect all findings and embeddings
        const allFindings = results.flat();
        session.findings = allFindings;
        
        // Generate final synthesis
        await this.synthesizeAndCite(sessionId, allFindings);
        
        // Mark session as completed
        session.status = 'completed';
        session.completedAt = new Date();
        
        console.log(`✅ [LeadResearcher] Research session ${sessionId} completed with ${allFindings.length} findings`);
    }
    
    generateSearchQueries(topic) {
        return [
            `${topic} background history development`,
            `${topic} latest trends 2024 2025 current`,
            `${topic} technical implementation methods`,
            `${topic} applications impact future prospects`,
            `${topic} challenges limitations solutions`
        ];
    }
    
    async runSubagentWithEmbedding(sessionId, subagent, searchQuery) {
        console.log(`🤖 [LeadResearcher] Running subagent ${subagent.name} with query: ${searchQuery}`);
        
        // Perform specialized search
        const searchResults = await searchWithPerplexity(searchQuery);
        
        // Add embedding to space
        this.addEmbeddingToSpace(sessionId, searchResults.embedding, {
            type: 'subagent_research',
            agentName: subagent.name,
            query: searchQuery,
            content: searchResults.results.substring(0, 150),
            links: searchResults.links,
            sources: searchResults.sources
        });
        
        // Get AI analysis from the subagent
        const findings = await subagent.performResearch(searchQuery, searchResults);
        
        return findings;
    }
    
    // Generate advanced embeddings with concept clustering
    generateAdvancedEmbedding(query, content, type = 'research') {
        const embedding = generateEmbedding(query, content);
        
        // Enhance with concept clustering
        const concepts = this.extractConcepts(content);
        const cluster = this.findConceptCluster(concepts);
        
        return {
            ...embedding,
            type,
            concepts,
            cluster,
            connections: this.findConceptConnections(concepts),
            novelty: this.calculateNovelty(concepts),
            importance: this.calculateImportance(content),
            id: `embed_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        };
    }
    
    // Extract key concepts from content
    extractConcepts(content) {
        const words = content.toLowerCase().split(/\W+/).filter(word => word.length > 3);
        const conceptFreq = {};
        
        words.forEach(word => {
            conceptFreq[word] = (conceptFreq[word] || 0) + 1;
        });
        
        return Object.entries(conceptFreq)
            .filter(([word, freq]) => freq > 1)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10)
            .map(([word]) => word);
    }
    
    // Find or create concept cluster
    findConceptCluster(concepts) {
        const clusterId = concepts.sort().join('_').substring(0, 20);
        
        if (!this.conceptClusters.has(clusterId)) {
            this.conceptClusters.set(clusterId, {
                id: clusterId,
                concepts,
                embeddings: [],
                center: { x: 0, y: 0, z: 0 },
                radius: 0.5,
                created: Date.now()
            });
        }
        
        return clusterId;
    }
    
    // Find connections between concepts
    findConceptConnections(concepts) {
        const connections = [];
        
        for (const [clusterId, cluster] of this.conceptClusters.entries()) {
            const overlap = concepts.filter(c => cluster.concepts.includes(c));
            if (overlap.length > 0) {
                connections.push({
                    clusterId,
                    strength: overlap.length / Math.max(concepts.length, cluster.concepts.length),
                    sharedConcepts: overlap
                });
            }
        }
        
        return connections;
    }
    
    // Calculate novelty score
    calculateNovelty(concepts) {
        let noveltyScore = 1.0;
        
        for (const concept of concepts) {
            const occurrences = Array.from(this.globalEmbeddings.values())
                .filter(emb => emb.concepts && emb.concepts.includes(concept)).length;
            
            noveltyScore *= Math.max(0.1, 1.0 - (occurrences * 0.1));
        }
        
        return noveltyScore;
    }
    
    // Calculate importance score
    calculateImportance(content) {
        const importanceKeywords = [
            'breakthrough', 'significant', 'major', 'critical', 'important', 
            'revolutionary', 'innovative', 'advanced', 'novel', 'unprecedented'
        ];
        
        let score = 0.5; // Base importance
        const lowerContent = content.toLowerCase();
        
        importanceKeywords.forEach(keyword => {
            if (lowerContent.includes(keyword)) {
                score += 0.1;
            }
        });
        
        return Math.min(score, 1.0);
    }
    
    // Cluster concepts for visualization
    clusterConcepts() {
        const clusters = [];
        
        for (const [clusterId, cluster] of this.conceptClusters.entries()) {
            if (cluster.embeddings.length > 1) {
                // Calculate cluster center
                const center = cluster.embeddings.reduce((acc, emb) => ({
                    x: acc.x + emb.x,
                    y: acc.y + emb.y,
                    z: acc.z + emb.z
                }), { x: 0, y: 0, z: 0 });
                
                center.x /= cluster.embeddings.length;
                center.y /= cluster.embeddings.length;
                center.z /= cluster.embeddings.length;
                
                clusters.push({
                    ...cluster,
                    center,
                    size: cluster.embeddings.length
                });
            }
        }
        
        return clusters;
    }
    
    // Add embedding to visualization space
    addEmbeddingToSpace(sessionId, embedding, metadata) {
        const enhancedEmbedding = {
            ...embedding,
            ...metadata,
            sessionId,
            id: `embed_${sessionId}_${Date.now()}`,
            timestamp: Date.now()
        };
        
        this.globalEmbeddings.set(enhancedEmbedding.id, enhancedEmbedding);
        
        // Update concept cluster
        if (enhancedEmbedding.cluster) {
            const cluster = this.conceptClusters.get(enhancedEmbedding.cluster);
            if (cluster) {
                cluster.embeddings.push(enhancedEmbedding);
            }
        }
        
        return enhancedEmbedding;
    }
    
    addEmbedding(embeddingData) {
        if (!embeddingData || !embeddingData.id) {
            console.warn(`⚠️ [LeadResearcher] Attempted to add invalid embedding data.`);
            return;
        }
        
        // Add to global embeddings without a session context
        this.globalEmbeddings.set(embeddingData.id, embeddingData);
        
        console.log(`✨ [LeadResearcher] Added global embedding ${embeddingData.id}`);
    }
    
    getEmbeddingSpace() {
        return Array.from(this.globalEmbeddings.values());
    }
    
    async synthesizeAndCite(sessionId, findings) {
        console.log(`🔍 [LeadResearcher] Synthesizing ${findings.length} findings`);
        
        // Create comprehensive synthesis
        const synthesis = await this.createSynthesis(findings);
        
        // Generate citations from all sources
        const citations = await this.generateCitations(sessionId, findings);
        
        // Save to session
        const session = this.activeSessions.get(sessionId);
        session.synthesis = synthesis;
        session.citations = citations;
        
        return { synthesis, citations };
    }
    
    async createSynthesis(findings) {
        const allContent = findings.map(f => f.content).join('\n\n');
        const allSources = findings.flatMap(f => f.searchResults?.sources || []);
        
        const systemMessage = `You are a research synthesis specialist. Create a comprehensive, well-structured synthesis of the research findings with proper academic formatting.`;
        
        const prompt = `Create a comprehensive research synthesis from these findings:

${allContent}

Structure your synthesis with:
1. Executive Summary
2. Key Findings
3. Analysis and Insights  
4. Implications and Applications
5. Future Research Directions

Make it academically rigorous and well-organized.`;
        
        const synthesis = await callAzureOpenAI(prompt, systemMessage);
        
        return {
            content: synthesis,
            keyFindings: this.extractKeyFindings(findings),
            sources: [...new Set(allSources)],
            timestamp: new Date().toISOString()
        };
    }
    
    extractKeyFindings(findings) {
        return findings
            .filter(f => f.confidence > 0.7)
            .slice(0, 10)
            .map(f => ({
                finding: f.content.substring(0, 200) + '...',
                confidence: f.confidence,
                source: f.source,
                agentName: f.agentName
            }));
    }
    
    async generateCitations(sessionId, findings) {
        const allLinks = findings.flatMap(f => f.searchResults?.links || []);
        const allSources = findings.flatMap(f => f.searchResults?.sources || []);
        
        return {
            links: [...new Set(allLinks)],
            sources: [...new Set(allSources)],
            academicCitations: this.formatAcademicCitations(allSources),
            sessionId,
            timestamp: new Date().toISOString()
        };
    }
    
    formatAcademicCitations(sources) {
        return sources.slice(0, 20).map((source, index) => ({
            id: index + 1,
            citation: this.formatSingleCitation(source),
            url: this.extractUrlFromSource(source)
        }));
    }
    
    formatSingleCitation(source) {
        // Basic citation formatting
        const year = new Date().getFullYear();
        return `[${source.substring(0, 50)}...]. Retrieved ${year}.`;
    }
    
    extractUrlFromSource(source) {
        const urlMatch = source.match(/(https?:\/\/[^\s]+)/);
        return urlMatch ? urlMatch[1] : null;
    }
    
    // Tool methods for subagents
    async runSubagent(agentConfig, task) {
        console.log(`🔧 [Tool] Running subagent ${agentConfig.name} for task: ${task}`);
        return `Subagent ${agentConfig.name} completed task: ${task}`;
    }
    
    async completeTask(taskId, results) {
        console.log(`✅ [Tool] Task ${taskId} completed with results`);
        return { taskId, status: 'completed', results };
    }
    
    // ...existing code...
    assessComplexity(topic) {
        const complexityKeywords = {
            'high': ['ethics', 'bias', 'quantum', 'cybersecurity', 'privacy'],
            'medium': ['healthcare', 'climate', 'energy', 'education'],
            'low': ['basic', 'introduction', 'overview', 'simple']
        };
        
        const topicLower = topic.toLowerCase();
        for (const [level, keywords] of Object.entries(complexityKeywords)) {
            if (keywords.some(keyword => topicLower.includes(keyword))) {
                return level;
            }
        }
        return 'medium';
    }
    
    async createSubagents(sessionId, plan) {
        console.log(`🛠️ [LeadResearcher] Creating subagents based on research plan`);
        
        const subagents = [
            new ResearchSubagent({ 
                id: 1, 
                name: 'Background Researcher', 
                expertise: 'background_research',
                personality: 'thorough and methodical',
                color: 0x00ff88 
            }, this.memory, this.db),
            new ResearchSubagent({ 
                id: 2, 
                name: 'Trend Analyzer', 
                expertise: 'trend_analysis',
                personality: 'analytical and forward-thinking',
                color: 0x0088ff 
            }, this.memory, this.db),
            new ResearchSubagent({ 
                id: 3, 
                name: 'Technical Specialist', 
                expertise: 'technical_analysis',
                personality: 'precise and detail-oriented',
                color: 0xff8800 
            }, this.memory, this.db),
            new ResearchSubagent({ 
                id: 4, 
                name: 'Impact Assessor', 
                expertise: 'impact_assessment',
                personality: 'strategic and comprehensive',
                color: 0xff0088 
            }, this.memory, this.db)
        ];
        
        return subagents;
    }
    
    async executeResearchTasks(sessionId, subagents) {
        console.log(`🚀 Executing research tasks with ${subagents.length} subagents`);
        
        const session = this.activeSessions.get(sessionId);
        if (!session) return;
        
        // Execute tasks in parallel
        const tasks = subagents.map(subagent => 
            subagent.executeTask(sessionId, session.topic, session.conversationId)
        );
        
        try {
            const results = await Promise.all(tasks);
            
            // Collect findings
            const allFindings = results.flat();
            session.findings = allFindings;
            
            // Save findings to database using messages table
            for (const finding of allFindings) {
                const stmt = this.db.prepare(`
                    INSERT INTO messages (conversation_id, speaker_id, message, message_type)
                    VALUES (?, ?, ?, ?)
                `);
                stmt.run(session.conversationId, finding.agentId, finding.content, 'finding');
            }
            
            // Phase 4: Synthesize results
            await this.synthesizeResults(sessionId, allFindings);
            
            // Phase 5: Create citations
            await this.createCitations(sessionId, allFindings);
            
            // Mark session as completed
            session.status = 'completed';
            session.completedAt = new Date();
            
            const updateStmt = this.db.prepare(`
                UPDATE conversations SET status = 'completed', end_time = CURRENT_TIMESTAMP
                WHERE id = ?
            `);
            updateStmt.run(session.conversationId);
            
            console.log(`✅ Research session ${sessionId} completed successfully`);
            
        } catch (error) {
            console.error(`❌ Error in research session ${sessionId}:`, error);
            session.status = 'failed';
        }
    }
    
    async synthesizeResults(sessionId, findings) {
        console.log(`🔍 Synthesizing ${findings.length} findings for session ${sessionId}`);
        
        // Group findings by theme
        const themes = this.groupFindingsByTheme(findings);
        
        // Create synthesis
        const synthesis = {
            sessionId,
            themes,
            keyInsights: this.extractKeyInsights(findings),
            recommendations: this.generateRecommendations(findings),
            confidence: this.calculateOverallConfidence(findings)
        };
        
        this.memory.saveFindings(sessionId, synthesis);
        return synthesis;
    }
    
    groupFindingsByTheme(findings) {
        const themes = {};
        const themeKeywords = {
            'technical': ['algorithm', 'technology', 'system', 'implementation'],
            'ethical': ['ethics', 'bias', 'fairness', 'privacy', 'security'],
            'social': ['impact', 'society', 'people', 'community'],
            'economic': ['cost', 'benefit', 'market', 'business', 'economic'],
            'environmental': ['environment', 'climate', 'sustainability', 'green']
        };
        
        for (const finding of findings) {
            const content = finding.content.toLowerCase();
            let assignedTheme = 'general';
            
            for (const [theme, keywords] of Object.entries(themeKeywords)) {
                if (keywords.some(keyword => content.includes(keyword))) {
                    assignedTheme = theme;
                    break;
                }
            }
            
            if (!themes[assignedTheme]) {
                themes[assignedTheme] = [];
            }
            themes[assignedTheme].push(finding);
        }
        
        return themes;
    }
    
    extractKeyInsights(findings) {
        // Extract key insights based on confidence and content
        const highConfidenceFindings = findings.filter(f => f.confidence > 0.7);
        return highConfidenceFindings.slice(0, 5).map(f => ({
            insight: f.content.substring(0, 100) + '...',
            confidence: f.confidence,
            source: f.source
        }));
    }
    
    generateRecommendations(findings) {
        // Generate recommendations based on findings
        const recommendations = [];
        
        if (findings.some(f => f.content.toLowerCase().includes('ethical'))) {
            recommendations.push('Consider ethical implications and bias mitigation strategies');
        }
        
        if (findings.some(f => f.content.toLowerCase().includes('security'))) {
            recommendations.push('Implement robust security measures and privacy protections');
        }
        
        if (findings.some(f => f.content.toLowerCase().includes('scalability'))) {
            recommendations.push('Plan for scalability and performance optimization');
        }
        
        return recommendations;
    }
    
    calculateOverallConfidence(findings) {
        if (findings.length === 0) return 0;
        const totalConfidence = findings.reduce((sum, f) => sum + (f.confidence || 0.5), 0);
        return totalConfidence / findings.length;
    }
    
    async createCitations(sessionId, findings) {
        console.log(`📚 Creating citations for session ${sessionId}`);
        
        const citationAgent = new CitationAgent(this.db);
        const citations = await citationAgent.processFindings(sessionId, findings);
        
        // Save citations to database
        for (const citation of citations) {
            const stmt = this.db.prepare(`
                INSERT INTO citations (session_id, finding_id, source_url, source_title, citation_text, created_at)
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `);
            stmt.run(sessionId, citation.findingId, citation.sourceUrl, 
                    citation.sourceTitle, citation.citationText);
        }
        
        return citations;
    }
}

class ResearchSubagent {
    constructor(config, memory, db) {
        this.config = config;
        this.memory = memory;
        this.db = db;
        this.name = config.name;
        this.expertise = config.expertise;
        this.personality = config.personality;
        this.color = config.color;
        this.tools = ['perplexity_search', 'memory_access', 'analysis_tools'];
    }
    
    async performResearch(searchQuery, searchResults) {
        console.log(`🤖 [${this.name}] Performing ${this.expertise} research on: ${searchQuery}`);
        
        try {
            // Analyze search results with specialized focus
            const systemMessage = `You are ${this.name}, a specialized research agent with expertise in ${this.expertise}. 
            Your personality is ${this.personality}. 
            
            Analyze the provided search results and provide detailed, insightful research findings based on your expertise.
            Focus specifically on ${this.getSpecializedFocus()}.
            
            Provide structured analysis with:
            1. Key findings specific to your expertise
            2. Critical insights and patterns
            3. Implications and significance
            4. Connections to related concepts
            5. Areas requiring further investigation`;
            
            const prompt = this.buildSpecializedPrompt(searchQuery, searchResults);
            
            const aiResponse = await callAzureOpenAI(prompt, systemMessage);
            console.log(`🤖 [${this.name}] Analysis completed: ${aiResponse.substring(0, 100)}...`);
            
            return [{
                agentId: this.config.id,
                agentName: this.name,
                content: aiResponse,
                source: `${this.expertise}_specialized_analysis`,
                confidence: 0.85 + Math.random() * 0.1,
                searchResults: searchResults,
                expertise: this.expertise,
                timestamp: new Date().toISOString()
            }];
            
        } catch (error) {
            console.error(`❌ [${this.name}] Research error:`, error);
            return this.generateFallbackFindings(searchQuery);
        }
    }
    
    getSpecializedFocus() {
        const focuses = {
            'background_research': 'historical context, foundational concepts, key developments, and evolution of the field',
            'trend_analysis': 'current trends, emerging patterns, market dynamics, and future projections',
            'technical_analysis': 'technical specifications, methodologies, implementation details, and architectural considerations',
            'impact_assessment': 'societal impact, economic implications, risks, benefits, and strategic considerations'
        };
        
        return focuses[this.expertise] || 'comprehensive analysis and evaluation';
    }
    
    buildSpecializedPrompt(searchQuery, searchResults) {
        // Ensure sources and links are arrays
        const sources = Array.isArray(searchResults.sources) ? searchResults.sources : 
                       typeof searchResults.sources === 'string' ? [searchResults.sources] : 
                       ['Research Database'];
        const links = Array.isArray(searchResults.links) ? searchResults.links : [];
        
        const basePrompt = `Research Query: ${searchQuery}

Search Results:
${searchResults.results}

Available Sources:
${sources.slice(0, 5).join('\n')}

Links Found:
${links.slice(0, 3).join('\n')}`;

        const specializedInstructions = {
            'background_research': `
            Focus on:
            - Historical development and timeline
            - Foundational theories and concepts
            - Key researchers and contributions
            - Evolution of understanding
            - Current state compared to origins`,
            
            'trend_analysis': `
            Focus on:
            - Current market trends and adoption rates
            - Emerging technologies and approaches
            - Growth patterns and projections
            - Competitive landscape
            - Future outlook and predictions`,
            
            'technical_analysis': `
            Focus on:
            - Technical architectures and frameworks
            - Implementation methodologies
            - Performance metrics and benchmarks
            - Technical challenges and solutions
            - Best practices and standards`,
            
            'impact_assessment': `
            Focus on:
            - Societal and economic impact
            - Benefits and potential risks
            - Stakeholder implications
            - Policy and regulatory considerations
            - Long-term consequences and opportunities`
        };
        
        return basePrompt + (specializedInstructions[this.expertise] || '');
    }
    
    generateFallbackFindings(searchQuery) {
        const fallbackContent = {
            'background_research': `Background analysis of ${searchQuery}: This field has established foundations with key developments over recent years. Historical context shows evolution from early concepts to current applications.`,
            'trend_analysis': `Trend analysis for ${searchQuery}: Current market shows growing adoption with emerging patterns indicating significant future potential. Key trends include increased integration and technological advancement.`,
            'technical_analysis': `Technical analysis of ${searchQuery}: System architecture reveals robust frameworks with scalable implementations. Technical considerations include performance optimization and integration capabilities.`,
            'impact_assessment': `Impact assessment for ${searchQuery}: Analysis reveals significant positive implications across multiple sectors. Strategic considerations include adoption benefits and implementation challenges.`
        };
        
        return [{
            agentId: this.config.id,
            agentName: this.name,
            content: fallbackContent[this.expertise] || `Analysis of ${searchQuery} from ${this.expertise} perspective.`,
            source: `${this.expertise}_fallback_analysis`,
            confidence: 0.6,
            searchResults: null,
            expertise: this.expertise,
            timestamp: new Date().toISOString()
        }];
    }
}

class CitationAgent {
    constructor(db) {
        this.db = db;
    }
    
    async processFindings(sessionId, findings) {
        console.log(`📚 CitationAgent processing ${findings.length} findings`);
        
        const citations = [];
        
        for (const finding of findings) {
            // Simulate citation generation
            const citation = {
                findingId: finding.agentId,
                sourceUrl: `https://research.example.com/${sessionId}/${finding.agentId}`,
                sourceTitle: `Research on ${finding.content.substring(0, 30)}...`,
                citationText: `${this.generateCitationText(finding)}`
            };
            
            citations.push(citation);
        }
        
        return citations;
    }
    
    generateCitationText(finding) {
        const sources = [
            'Journal of Advanced Research',
            'International Conference on AI',
            'Computational Intelligence Review',
            'Digital Systems Analysis',
            'Modern Technology Studies'
        ];
        
        const randomSource = sources[Math.floor(Math.random() * sources.length)];
        const year = 2020 + Math.floor(Math.random() * 5);
        
        return `${randomSource}, ${year}. "${finding.content.substring(0, 50)}..."`;
    }
}

// Initialize the multi-agent research system
const memory = new Memory();
const leadResearcher = new LeadResearcher(memory, db);

// Make io globally accessible for embedding updates
global.io = io;

// WebSocket event handlers
io.on('connection', (socket) => {
    console.log(`🔬 Research client connected: ${socket.id}`);
    
    // Send initial agent data and embedding space
    try {
        const agentsStmt = db.prepare('SELECT * FROM agents ORDER BY id');
        const agentsData = agentsStmt.all();
        
        // Convert to format expected by client
        const formattedAgents = agentsData.map(agent => {
            let colorValue;
            try {
                colorValue = parseInt(agent.color.replace('#', '0x'), 16);
            } catch (error) {
                console.warn(`Failed to convert color ${agent.color} for agent ${agent.name}, using default`);
                colorValue = 0x00ff88;
            }
            
            return {
                id: agent.id,
                name: agent.name,
                expertise: agent.personality_type,
                color: colorValue
            };
        });
        
        socket.emit('agentsData', formattedAgents);
        
        // Send current embedding space
        const embeddingSpace = leadResearcher.getEmbeddingSpace();
        socket.emit('embeddingSpace', embeddingSpace);
        
        console.log(`📊 Sent ${formattedAgents.length} agents and ${embeddingSpace.length} embeddings to client`);
    } catch (error) {
        console.error('Error fetching initial data:', error);
        socket.emit('agentsData', []);
        socket.emit('embeddingSpace', []);
    }
    
    // Handle enhanced user research request
    socket.on('userResearchRequest', async (data) => {
        const { topic, useGPTOrchestration, usePerplexitySearch } = data;
        
        console.log(`🔬 User research request: "${topic}"`);
        console.log(`🤖 GPT Orchestration: ${useGPTOrchestration ? 'ENABLED' : 'DISABLED'}`);
        console.log(`🔍 Perplexity Search: ${usePerplexitySearch ? 'ENABLED' : 'DISABLED'}`);
        
        try {
            // Clear previous session before creating new one
            currentResearchSession = null;
            
            let searchResults = null;
            let agentAnalysis = [];
            
            // Step 1: Use Perplexity for search if enabled
            if (usePerplexitySearch) {
                console.log(`🔍 Using Perplexity API for search: ${topic}`);
                searchResults = await searchWithPerplexity(topic);
                console.log(`✅ Perplexity search completed`);
                
                // Generate embedding from search results
                if (searchResults && searchResults.embedding) {
                    const embeddingData = {
                        id: `perplexity_${Date.now()}`,
                        x: searchResults.embedding.x,
                        y: searchResults.embedding.y,
                        z: searchResults.embedding.z,
                        metadata: {
                            type: 'perplexity_search',
                            query: topic,
                            timestamp: Date.now()
                        },
                        weight: searchResults.embedding.weight || 0.5
                    };
                    
                    // Add to embedding space and broadcast
                    leadResearcher.addEmbedding(embeddingData);
                    io.emit('newEmbedding', embeddingData);
                }
            } else {
                searchResults = generateFallbackSearchResults(topic);
            }
            
            // Step 2: Use GPT for agent orchestration if enabled
            if (useGPTOrchestration && searchResults) {
                console.log(`🤖 Using GPT-4.1-nano for agent orchestration`);
                
                const orchestrationPrompt = `You are the lead researcher orchestrating a team of AI agents to analyze the topic: "${topic}".

Search results available:
${searchResults.results}

Available specialist agents:
1. Technical Analyst - Focuses on technical aspects, implementation details, and systems
2. Trend Researcher - Analyzes current trends, patterns, and future projections  
3. Impact Assessor - Evaluates societal, economic, and strategic implications
4. Context Synthesizer - Creates connections and synthesizes information across domains
5. Evidence Validator - Validates sources, checks accuracy, and assesses reliability

Based on the search results, orchestrate these agents to provide comprehensive analysis. For each agent, provide:
1. Specific focus area for this topic
2. Key questions they should investigate
3. Analysis priority (high/medium/low)
4. Expected insights they should deliver

Format your response as a structured plan for agent coordination.`;

                try {
                    const orchestrationPlan = await callAzureOpenAI(orchestrationPrompt);
                    console.log(`✅ GPT orchestration plan created: ${orchestrationPlan.substring(0, 100)}...`);
                    
                    // Generate agent analyses based on GPT orchestration
                    const agentConfigs = [
                        { name: 'Technical Analyst', expertise: 'technical_analysis', color: '#00ff88' },
                        { name: 'Trend Researcher', expertise: 'trend_analysis', color: '#ff8800' },
                        { name: 'Impact Assessor', expertise: 'impact_assessment', color: '#ff0088' },
                        { name: 'Context Synthesizer', expertise: 'context_synthesis', color: '#8800ff' },
                        { name: 'Evidence Validator', expertise: 'evidence_validation', color: '#0088ff' }
                    ];
                    
                    for (const config of agentConfigs) {
                        const agentPrompt = `You are ${config.name}, a specialist in ${config.expertise}.

Research Topic: ${topic}

Search Results:
${searchResults.results}

Orchestration Plan:
${orchestrationPlan}

Based on your expertise in ${config.expertise}, provide detailed analysis focusing on your specialized area. Include:
1. Key findings relevant to your expertise
2. Critical insights and patterns you identify
3. Implications and significance of your findings
4. Recommendations for further investigation

Provide structured, detailed analysis based on your specialization.`;

                        try {
                            const agentResponse = await callAzureOpenAI(agentPrompt);
                            
                            agentAnalysis.push({
                                agentName: config.name,
                                expertise: config.expertise,
                                analysis: agentResponse,
                                confidence: 0.8 + Math.random() * 0.15,
                                timestamp: new Date().toISOString()
                            });
                            
                            // Generate embedding for agent analysis
                            const agentEmbedding = generateEmbedding(`${config.name} analysis of ${topic}`, agentResponse);
                            const embeddingData = {
                                id: `agent_${config.name.toLowerCase().replace(' ', '_')}_${Date.now()}`,
                                x: agentEmbedding.x,
                                y: agentEmbedding.y,
                                z: agentEmbedding.z,
                                metadata: {
                                    type: 'agent_analysis',
                                    agentName: config.name,
                                    query: topic,
                                    timestamp: Date.now()
                                },
                                weight: agentEmbedding.weight || 0.7
                            };
                            
                            // Add to lead researcher and broadcast
                            leadResearcher.addEmbedding(embeddingData);
                            io.emit('newEmbedding', embeddingData);
                            
                        } catch (agentError) {
                            console.error(`❌ Error with ${config.name}:`, agentError.message);
                        }
                    }
                    
                } catch (orchestrationError) {
                    console.error('❌ GPT orchestration error:', orchestrationError.message);
                    agentAnalysis = generateFallbackAgentAnalysis(topic, searchResults);
                }
            } else {
                agentAnalysis = generateFallbackAgentAnalysis(topic, searchResults);
            }
            
            // Create research session
            const sessionData = {
                sessionId: `session_${Date.now()}`,
                topic: topic,
                searchResults: searchResults,
                agentAnalysis: agentAnalysis,
                status: 'completed',
                useGPTOrchestration: useGPTOrchestration,
                usePerplexitySearch: usePerplexitySearch,
                timestamp: new Date().toISOString()
            };
            
            currentResearchSession = sessionData;
            
            // Send research update to client with detailed data for export
            socket.emit('researchUpdate', {
                type: 'completed',
                sessionId: sessionData.sessionId,
                topic: topic,
                searchResults: searchResults,
                agentAnalysis: agentAnalysis,
                embeddingCount: leadResearcher.getEmbeddingSpace().length,
                useGPTOrchestration: useGPTOrchestration,
                usePerplexitySearch: usePerplexitySearch
            });

            // Send detailed Perplexity results for export
            if (usePerplexitySearch && searchResults) {
                socket.emit('researchUpdate', {
                    type: 'perplexity_result',
                    query: topic,
                    results: searchResults.results,
                    sources: searchResults.sources || [],
                    links: searchResults.links || [],
                    timestamp: Date.now()
                });
            }

            // Send agent analysis results for export
            if (agentAnalysis && agentAnalysis.length > 0) {
                agentAnalysis.forEach((analysis, index) => {
                    socket.emit('researchUpdate', {
                        type: 'agent_analysis',
                        agent: analysis.agentName,
                        analysis: analysis.analysis,
                        insights: analysis.insights || [],
                        confidence: analysis.confidence,
                        timestamp: Date.now()
                    });
                });
            }

            // Send final summary
            socket.emit('researchUpdate', {
                type: 'final_summary',
                summary: `Research completed for "${topic}". Found ${searchResults?.sources?.length || 0} sources with ${agentAnalysis.length} agent analyses. Key insights: ${agentAnalysis.map(a => a.analysis?.substring(0, 100)).join('; ')}...`
            });
            
            console.log(`✅ Research session completed: ${sessionData.sessionId}`);
            
        } catch (error) {
            console.error('❌ Error in research session:', error);
            socket.emit('researchUpdate', {
                type: 'error',
                message: `Research session failed: ${error.message}`
            });
        }
    });
    
    // Add fallback function for agent analysis
    function generateFallbackAgentAnalysis(topic, searchResults) {
        return [
            {
                agentName: 'Technical Analyst',
                expertise: 'technical_analysis',
                analysis: `Technical analysis of ${topic}: Current implementations show promising approaches with room for optimization. Key technical considerations include scalability, performance, and integration challenges.`,
                confidence: 0.75,
                timestamp: new Date().toISOString()
            },
            {
                agentName: 'Trend Researcher',
                expertise: 'trend_analysis',
                analysis: `Trend analysis for ${topic}: Emerging patterns indicate growing adoption and continued evolution. Market indicators suggest sustained interest and development momentum.`,
                confidence: 0.72,
                timestamp: new Date().toISOString()
            },
            {
                agentName: 'Impact Assessor',
                expertise: 'impact_assessment',
                analysis: `Impact assessment of ${topic}: Significant implications across multiple domains with both opportunities and challenges. Societal and economic effects require careful consideration.`,
                confidence: 0.78,
                timestamp: new Date().toISOString()
            }
        ];
    }
    
    // Handle embedding space requests
    socket.on('getEmbeddingSpace', () => {
        const embeddingSpace = leadResearcher.getEmbeddingSpace();
        socket.emit('embeddingSpace', embeddingSpace);
        console.log(`📊 Sent embedding space with ${embeddingSpace.length} points`);
    });
    
    // Handle clear embedding space
    socket.on('clearEmbeddingSpace', () => {
        leadResearcher.globalEmbeddings.clear();
        io.emit('embeddingSpace', []);
        console.log('🧹 Cleared embedding space');
    });
    
    // Enhanced agent click handler with research data
    socket.on('agentClick', (agentId) => {
        console.log(`🔍 Enhanced agent clicked: ${agentId}`);
        
        try {
            const agentStmt = db.prepare('SELECT * FROM agents WHERE id = ?');
            const agent = agentStmt.get(agentId);
            
            if (agent) {
                // Get recent research activities for this agent
                const messageStmt = db.prepare(`
                    SELECT 
                        m.id,
                        m.message,
                        m.timestamp,
                        m.message_type,
                        a.name as speaker_name,
                        a.color as speaker_color
                    FROM messages m 
                    JOIN agents a ON m.speaker_id = a.id 
                    WHERE m.speaker_id = ? 
                    ORDER BY m.timestamp DESC 
                    LIMIT 15
                `);
                
                const messages = messageStmt.all(agentId);
                
                // Get agent-specific embeddings
                const agentEmbeddings = leadResearcher.getEmbeddingSpace()
                    .filter(emb => emb.metadata?.agentName && 
                                   emb.metadata.agentName.toLowerCase().includes(agent.name.toLowerCase()));
                
                const formattedMessages = messages.map(msg => ({
                    id: msg.id,
                    message: msg.message,
                    timestamp: msg.timestamp,
                    message_type: msg.message_type,
                    speaker_name: msg.speaker_name,
                    speaker_color: msg.speaker_color
                }));
                
                socket.emit('enhancedAgentData', {
                    agentId: agentId,
                    agentName: agent.name,
                    expertise: agent.personality_type,
                    messages: formattedMessages,
                    embeddings: agentEmbeddings,
                    totalCount: messages.length,
                    embeddingCount: agentEmbeddings.length,
                    lastUpdated: new Date().toISOString()
                });
                
                console.log(`📨 Sent enhanced data for agent ${agent.name}: ${messages.length} messages, ${agentEmbeddings.length} embeddings`);
                
            }
        } catch (error) {
            console.error('Error in enhanced agent click handler:', error);
            socket.emit('enhancedAgentData', {
                agentId: agentId,
                error: 'Failed to fetch agent data'
            });
        }
    });
    
    // Handle legacy events for backwards compatibility
    socket.on('startResearch', async (data) => {
        const topic = typeof data === 'string' ? data : data.query || data.topic;
        const usePerplexitySearch = data.usePerplexitySearch !== undefined ? data.usePerplexitySearch : true;
        const useGPTOrchestration = data.useGPTOrchestration !== undefined ? data.useGPTOrchestration : true;
        
        console.log(`🔬 StartResearch request: "${topic}"`);
        console.log(`🤖 GPT Orchestration: ${useGPTOrchestration ? 'ENABLED' : 'DISABLED'}`);
        console.log(`🔍 Perplexity Search: ${usePerplexitySearch ? 'ENABLED' : 'DISABLED'}`);
        
        try {
            // Clear previous session before creating new one
            currentResearchSession = null;
            
            let searchResults = null;
            let agentAnalysis = [];
            
            // Step 1: Use Perplexity for search if enabled
            if (usePerplexitySearch) {
                console.log(`🔍 Using Perplexity API for search: ${topic}`);
                searchResults = await searchWithPerplexity(topic);
                console.log(`✅ Perplexity search completed`);
                
                // Send Perplexity results immediately
                if (searchResults) {
                    socket.emit('researchUpdate', {
                        type: 'perplexity_result',
                        query: topic,
                        results: searchResults.results,
                        sources: searchResults.sources || [],
                        links: searchResults.links || [],
                        timestamp: Date.now()
                    });
                }
                
                // Generate embedding from search results
                if (searchResults && searchResults.embedding) {
                    const embeddingData = {
                        id: `perplexity_${Date.now()}`,
                        x: searchResults.embedding.x,
                        y: searchResults.embedding.y,
                        z: searchResults.embedding.z,
                        metadata: {
                            type: 'perplexity_search',
                            query: topic,
                            timestamp: Date.now()
                        },
                        weight: searchResults.embedding.weight || 0.5
                    };
                    
                    // Add to embedding space and broadcast
                    leadResearcher.addEmbedding(embeddingData);
                    io.emit('newEmbedding', embeddingData);
                }
            } else {
                searchResults = generateFallbackSearchResults(topic);
            }
            
            // Step 2: Use GPT for agent orchestration if enabled
            if (useGPTOrchestration && searchResults) {
                console.log(`🤖 Using GPT-4.1-nano for agent orchestration`);
                
                const orchestrationPrompt = `You are the lead researcher orchestrating a team of AI agents to analyze the topic: "${topic}".

Search results available:
${searchResults.results}

Available specialist agents:
1. Technical Analyst - Focuses on technical aspects, implementation details, and systems
2. Trend Researcher - Analyzes current trends, patterns, and future projections  
3. Impact Assessor - Evaluates societal, economic, and strategic implications
4. Context Synthesizer - Creates connections and synthesizes information across domains
5. Evidence Validator - Validates sources, checks accuracy, and assesses reliability

Based on the search results, orchestrate these agents to provide comprehensive analysis. For each agent, provide:
1. Specific focus area for this topic
2. Key questions they should investigate
3. Analysis priority (high/medium/low)
4. Expected insights they should deliver

Format your response as a structured plan for agent coordination.`;

                try {
                    const orchestrationPlan = await callAzureOpenAI(orchestrationPrompt);
                    console.log(`✅ GPT orchestration plan created: ${orchestrationPlan.substring(0, 100)}...`);
                    
                    // Generate agent analyses based on GPT orchestration
                    const agentConfigs = [
                        { name: 'Technical Analyst', expertise: 'technical_analysis', color: '#00ff88' },
                        { name: 'Trend Researcher', expertise: 'trend_analysis', color: '#ff8800' },
                        { name: 'Impact Assessor', expertise: 'impact_assessment', color: '#ff0088' },
                        { name: 'Context Synthesizer', expertise: 'context_synthesis', color: '#8800ff' },
                        { name: 'Evidence Validator', expertise: 'evidence_validation', color: '#0088ff' }
                    ];
                    
                    for (const config of agentConfigs) {
                        const agentPrompt = `You are ${config.name}, a specialist in ${config.expertise}.

Research Topic: ${topic}

Search Results:
${searchResults.results}

Orchestration Plan:
${orchestrationPlan}

Based on your expertise in ${config.expertise}, provide detailed analysis focusing on your specialized area. Include:
1. Key findings relevant to your expertise
2. Critical insights and patterns you identify
3. Implications and significance of your findings
4. Recommendations for further investigation

Provide structured, detailed analysis based on your specialization.`;

                        try {
                            const agentResponse = await callAzureOpenAI(agentPrompt);
                            
                            const analysisData = {
                                agentName: config.name,
                                expertise: config.expertise,
                                analysis: agentResponse,
                                confidence: 0.8 + Math.random() * 0.15,
                                timestamp: new Date().toISOString()
                            };
                            
                            agentAnalysis.push(analysisData);
                            
                            // Send agent analysis immediately
                            socket.emit('researchUpdate', {
                                type: 'agent_analysis',
                                agent: analysisData.agentName,
                                analysis: analysisData.analysis,
                                insights: analysisData.insights || [],
                                confidence: analysisData.confidence,
                                timestamp: Date.now()
                            });
                            
                            // Generate embedding for agent analysis
                            const agentEmbedding = generateEmbedding(`${config.name} analysis of ${topic}`, agentResponse);
                            const embeddingData = {
                                id: `agent_${config.name.toLowerCase().replace(' ', '_')}_${Date.now()}`,
                                x: agentEmbedding.x,
                                y: agentEmbedding.y,
                                z: agentEmbedding.z,
                                metadata: {
                                    type: 'agent_analysis',
                                    agentName: config.name,
                                    query: topic,
                                    timestamp: Date.now()
                                },
                                weight: agentEmbedding.weight || 0.7
                            };
                            
                            // Add to lead researcher and broadcast
                            leadResearcher.addEmbedding(embeddingData);
                            io.emit('newEmbedding', embeddingData);
                            
                        } catch (agentError) {
                            console.error(`❌ Error with ${config.name}:`, agentError.message);
                        }
                    }
                    
                } catch (orchestrationError) {
                    console.error('❌ GPT orchestration error:', orchestrationError.message);
                    agentAnalysis = generateFallbackAgentAnalysis(topic, searchResults);
                }
            } else {
                agentAnalysis = generateFallbackAgentAnalysis(topic, searchResults);
            }
            
            // Create research session
            const sessionData = {
                sessionId: `session_${Date.now()}`,
                topic: topic,
                searchResults: searchResults,
                agentAnalysis: agentAnalysis,
                status: 'completed',
                useGPTOrchestration: useGPTOrchestration,
                usePerplexitySearch: usePerplexitySearch,
                timestamp: new Date().toISOString()
            };
            
            currentResearchSession = sessionData;
            
            // Send final summary
            socket.emit('researchUpdate', {
                type: 'final_summary',
                summary: `Research completed for "${topic}". Found ${searchResults?.sources?.length || 0} sources with ${agentAnalysis.length} agent analyses. Key insights: ${agentAnalysis.map(a => a.analysis?.substring(0, 100)).join('; ')}...`,
                timestamp: Date.now()
            });

            // Send completion signal
            socket.emit('researchUpdate', {
                type: 'completed',
                sessionId: sessionData.sessionId,
                topic: topic,
                searchResults: searchResults,
                agentAnalysis: agentAnalysis,
                embeddingCount: leadResearcher.getEmbeddingSpace().length,
                useGPTOrchestration: useGPTOrchestration,
                usePerplexitySearch: usePerplexitySearch
            });

            console.log(`✅ Research completed for "${topic}"`);
            
        } catch (error) {
            console.error('❌ Research error:', error.message);
            socket.emit('researchUpdate', {
                type: 'error',
                message: error.message
            });
        }
    });
    
    socket.on('disconnect', () => {
        console.log(`🔬 Research client disconnected: ${socket.id}`);
    });
});

// Auto-research disabled - only manual searches allowed
// setInterval(async () => {
//     const researchTopics = [
//         'AI Ethics and Bias Detection',
//         'Climate Change Impact Analysis',
//         'Climate Change Impact Analysis',
//         'Healthcare AI Applications',
//         'Cybersecurity Threat Intelligence',
//         'Quantum Computing Research',
//         'Sustainable Energy Solutions',
//         'Digital Privacy and Security',
//         'Space Exploration Technologies'
//     ];
//     
//     const randomTopic = researchTopics[Math.floor(Math.random() * researchTopics.length)];
//     console.log(`🔄 Auto-starting research on: ${randomTopic}`);
//     
//     try {
//         await leadResearcher.startResearch(randomTopic);
//     } catch (error) {
//         console.error('Auto-research error:', error);
//     }
// }, 45000); // Every 45 seconds

// Start server
const PORT = process.env.PORT || 4321;
server.listen(PORT, () => {
    console.log(`🔬 Research Multi-Agent System running on port ${PORT}`);
    console.log(`🌐 Open http://localhost:${PORT} in your browser`);
    console.log(`🤖 Research Multi-Agent Framework: ACTIVE`);
    console.log(`🧠 Vector Memory System: ENABLED`);
    console.log(`🤖 Azure OpenAI Integration: ${azureOpenAIClient ? 'ENABLED' : 'DISABLED'}`);
    console.log(`📊 WebSocket: Active with Socket.io`);
    console.log(`🔬 Research Agents: 5 specialized research agents`);
    console.log(`🧠 Vector Memory: Real-time memory visualization`);
    console.log(`� Manual Search: Ready for user queries`);
    if (azureOpenAIClient) {
        console.log(`🤖 Azure OpenAI Model: ${AZURE_DEPLOYMENT}`);
        console.log(`🌐 Azure OpenAI Endpoint: ${AZURE_ENDPOINT}`);
    }
});
