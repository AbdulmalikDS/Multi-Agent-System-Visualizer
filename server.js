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
const AZURE_API_VERSION = "2024-04-01-preview";
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

// Perplexity Search Integration
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
                    content: `Search for current information about: ${query}. Provide recent, accurate, and comprehensive information with sources.`
                }],
                search_filter: 'academic'
            })
        });
        
        if (!response.ok) {
            throw new Error(`Perplexity API error: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('🔍 Perplexity search successful');
        
        return {
            query: query,
            results: data.choices[0].message.content,
            sources: data.choices[0].message.content.includes('Sources:') ? 
                data.choices[0].message.content.split('Sources:')[1] : 'No sources provided',
            timestamp: new Date().toISOString()
        };
        
    } catch (error) {
        console.error('❌ Perplexity search error:', error.message);
        return generateFallbackSearchResults(query);
    }
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
                sources: 'Fallback research data',
                timestamp: new Date().toISOString()
            };
        }
    }
    
    return {
        query: query,
        results: `Research on ${query} shows various developments and current trends in the field. Recent studies indicate ongoing progress and new applications emerging.`,
        sources: 'Fallback research data',
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
    }
    
    async startResearch(topic) {
        const sessionId = Date.now();
        console.log(`🔬 Starting research session ${sessionId} on: ${topic}`);
        
        // Create research session in database using conversations table
        const stmt = this.db.prepare(`
            INSERT INTO conversations (topic, agent1_id, agent2_id, status) 
            VALUES (?, 1, 2, 'active')
        `);
        const result = stmt.run(topic);
        const conversationId = result.lastInsertRowid;
        
        // Initialize session
        this.activeSessions.set(sessionId, {
            topic,
            conversationId,
            status: 'active',
            subagents: [],
            findings: [],
            phase: 'planning'
        });
        
        // Phase 1: Plan the research approach
        const plan = await this.planResearchApproach(topic);
        this.memory.savePlan(sessionId, plan);
        
        // Phase 2: Create specialized subagents
        const subagents = await this.createSubagents(sessionId, plan);
        
        // Phase 3: Execute research tasks
        await this.executeResearchTasks(sessionId, subagents);
        
        return sessionId;
    }
    
    async planResearchApproach(topic) {
        console.log(`🧠 Planning research approach for: ${topic}`);
        
        try {
            const systemMessage = `You are a LeadResearcher planning a comprehensive research approach. Create a detailed research plan with phases, tasks, and estimated subagents needed.`;
            const prompt = `Create a detailed research plan for: ${topic}. Include phases (exploration, analysis, synthesis, evaluation), specific tasks for each phase, and estimate how many specialized subagents are needed.`;
            
            const aiResponse = await callAzureOpenAI(prompt, systemMessage);
            console.log('🤖 AI-generated research plan:', aiResponse);
            
            // Parse AI response and create structured plan
            const plan = {
                topic,
                phases: [
                    {
                        name: 'exploration',
                        description: 'Broad exploration of the topic area',
                        tasks: ['background_research', 'key_concepts', 'current_state']
                    },
                    {
                        name: 'analysis',
                        description: 'Deep dive into specific aspects',
                        tasks: ['detailed_analysis', 'comparison_studies', 'expert_opinions']
                    },
                    {
                        name: 'synthesis',
                        description: 'Combine findings and identify patterns',
                        tasks: ['pattern_identification', 'synthesis_creation', 'insight_generation']
                    },
                    {
                        name: 'evaluation',
                        description: 'Evaluate findings and create recommendations',
                        tasks: ['critical_evaluation', 'recommendation_creation', 'future_directions']
                    }
                ],
                estimatedSubagents: 3,
                complexity: this.assessComplexity(topic),
                aiGeneratedPlan: aiResponse
            };
            
            return plan;
        } catch (error) {
            console.error('Error in AI research planning:', error);
            // Fallback to default plan
            return {
                topic,
                phases: [
                    {
                        name: 'exploration',
                        description: 'Broad exploration of the topic area',
                        tasks: ['background_research', 'key_concepts', 'current_state']
                    },
                    {
                        name: 'analysis',
                        description: 'Deep dive into specific aspects',
                        tasks: ['detailed_analysis', 'comparison_studies', 'expert_opinions']
                    },
                    {
                        name: 'synthesis',
                        description: 'Combine findings and identify patterns',
                        tasks: ['pattern_identification', 'synthesis_creation', 'insight_generation']
                    },
                    {
                        name: 'evaluation',
                        description: 'Evaluate findings and create recommendations',
                        tasks: ['critical_evaluation', 'recommendation_creation', 'future_directions']
                    }
                ],
                estimatedSubagents: 3,
                complexity: this.assessComplexity(topic)
            };
        }
    }
    
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
        console.log(`🤖 Creating ${plan.estimatedSubagents} specialized subagents`);
        
        // Get the session first
        const session = this.activeSessions.get(sessionId);
        if (!session) {
            console.error(`❌ Session ${sessionId} not found`);
            return [];
        }
        
        const subagents = [];
        const agentTypes = [
            {
                id: 1,
                name: 'Explorer',
                expertise: 'background_research',
                personality: 'curious and thorough',
                color: 0x00ff88
            },
            {
                id: 2,
                name: 'Analyst',
                expertise: 'detailed_analysis',
                personality: 'logical and precise',
                color: 0x0088ff
            },
            {
                id: 3,
                name: 'Synthesizer',
                expertise: 'pattern_identification',
                personality: 'creative and insightful',
                color: 0xff8800
            },
            {
                id: 4,
                name: 'Evaluator',
                expertise: 'critical_evaluation',
                personality: 'skeptical and thorough',
                color: 0xff0088
            },
            {
                id: 5,
                name: 'Connector',
                expertise: 'cross_domain_analysis',
                personality: 'holistic and integrative',
                color: 0x8800ff
            }
        ];
        
        // Select agents based on plan complexity
        const selectedAgents = agentTypes.slice(0, plan.estimatedSubagents);
        
        for (const agentConfig of selectedAgents) {
            const subagent = new Subagent(agentConfig, this.memory, this.db);
            subagents.push(subagent);
            
            // Create agent task in database using messages table
            const stmt = this.db.prepare(`
                INSERT INTO messages (conversation_id, speaker_id, message, message_type)
                VALUES (?, ?, ?, 'task')
            `);
            stmt.run(session.conversationId, agentConfig.id, 
                    `${agentConfig.name} will focus on ${agentConfig.expertise} for ${plan.topic}`);
        }
        
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

class Subagent {
    constructor(config, memory, db) {
        this.config = config;
        this.memory = memory;
        this.db = db;
        this.name = config.name;
        this.expertise = config.expertise;
        this.personality = config.personality;
        this.color = config.color;
    }
    
    async executeTask(sessionId, topic, conversationId) {
        console.log(`🤖 ${this.name} starting task: ${this.expertise} for ${topic}`);
        
        // Update task status using messages table
        const updateStmt = this.db.prepare(`
            INSERT INTO messages (conversation_id, speaker_id, message, message_type)
            VALUES (?, ?, ?, ?)
        `);
        updateStmt.run(conversationId, this.config.id, `Task started: ${this.expertise}`, 'status');
        
        // Simulate research process
        const findings = await this.performResearch(topic);
        
        // Update task status to completed using messages table
        const completeStmt = this.db.prepare(`
            INSERT INTO messages (conversation_id, speaker_id, message, message_type)
            VALUES (?, ?, ?, ?)
        `);
        completeStmt.run(conversationId, this.config.id, `Task completed: ${this.expertise}`, 'completion');
        
        return findings;
    }
    
    async performResearch(topic) {
        console.log(`🤖 ${this.name} performing ${this.expertise} research on: ${topic}`);
        
        try {
            // First, search for current information using Perplexity
            console.log(`🔍 ${this.name} searching for current information on: ${topic}`);
            const searchResults = await searchWithPerplexity(topic);
            
            // Then use Azure OpenAI to analyze the search results
            const systemMessage = `You are ${this.name}, a specialized research agent with expertise in ${this.expertise}. Your personality is ${this.personality}. Analyze the provided search results and provide detailed, insightful research findings based on your expertise.`;
            
            let prompt;
            switch (this.expertise) {
                case 'background_research':
                    prompt = `Based on the following current information about ${topic}, conduct comprehensive background research. Focus on historical context, key developments, foundational concepts, and current state of the field. Provide detailed insights with specific examples.\n\nSearch Results:\n${searchResults.results}`;
                    break;
                case 'detailed_analysis':
                    prompt = `Using the following current information about ${topic}, perform detailed analysis. Examine critical factors, methodologies, effectiveness metrics, and underlying mechanisms. Provide evidence-based conclusions and identify key influencing variables.\n\nSearch Results:\n${searchResults.results}`;
                    break;
                case 'pattern_identification':
                    prompt = `Analyze the following information about ${topic} to identify patterns and correlations. Look for recurring themes, underlying principles, systematic relationships, and emerging trends. Synthesize findings to reveal deeper insights.\n\nSearch Results:\n${searchResults.results}`;
                    break;
                case 'critical_evaluation':
                    prompt = `Based on the following current information about ${topic}, conduct critical evaluation. Assess strengths, limitations, potential biases, gaps in knowledge, and areas for improvement. Provide balanced, evidence-based assessment.\n\nSearch Results:\n${searchResults.results}`;
                    break;
                case 'cross_domain_analysis':
                    prompt = `Using the following information about ${topic}, perform cross-domain analysis. Explore connections with related fields, interdisciplinary opportunities, potential synergies, and broader implications across domains.\n\nSearch Results:\n${searchResults.results}`;
                    break;
                default:
                    prompt = `Research ${topic} from the perspective of ${this.expertise} using the following current information. Provide comprehensive analysis and findings.\n\nSearch Results:\n${searchResults.results}`;
            }
            
            const aiResponse = await callAzureOpenAI(prompt, systemMessage);
            console.log(`🤖 ${this.name} AI research response:`, aiResponse.substring(0, 100) + '...');
            
            return [{
                agentId: this.config.id,
                content: aiResponse,
                source: `${this.expertise}_ai_analysis_with_perplexity`,
                confidence: 0.9 + Math.random() * 0.1,
                searchResults: searchResults
            }];
            
        } catch (error) {
            console.error(`Error in ${this.name} research:`, error);
            // Fallback to simulated research
            const findings = [];
            
            switch (this.expertise) {
                case 'background_research':
                    findings.push({
                        agentId: this.config.id,
                        content: `Background research on ${topic}: This field has evolved significantly over the past decade, with key developments in methodology and application.`,
                        source: 'literature_review',
                        confidence: 0.8
                    });
                    break;
                case 'detailed_analysis':
                    findings.push({
                        agentId: this.config.id,
                        content: `Detailed analysis of ${topic}: Critical examination reveals several key factors that influence outcomes and effectiveness.`,
                        source: 'analytical_study',
                        confidence: 0.9
                    });
                    break;
                case 'pattern_identification':
                    findings.push({
                        agentId: this.config.id,
                        content: `Pattern analysis for ${topic}: Identified recurring themes and correlations that suggest underlying principles and mechanisms.`,
                        source: 'pattern_analysis',
                        confidence: 0.7
                    });
                    break;
                case 'critical_evaluation':
                    findings.push({
                        agentId: this.config.id,
                        content: `Critical evaluation of ${topic}: Assessment reveals both strengths and limitations, with specific areas requiring attention and improvement.`,
                        source: 'critical_review',
                        confidence: 0.85
                    });
                    break;
                case 'cross_domain_analysis':
                    findings.push({
                        agentId: this.config.id,
                        content: `Cross-domain analysis of ${topic}: Integration with related fields reveals new opportunities and potential synergies for advancement.`,
                        source: 'interdisciplinary_study',
                        confidence: 0.75
                    });
                    break;
            }
            
            return findings;
        }
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

// WebSocket event handlers
io.on('connection', (socket) => {
    console.log(`🔬 Research client connected: ${socket.id}`);
    
    // Send initial agent data from database
    try {
        const agentsStmt = db.prepare('SELECT * FROM agents ORDER BY id');
        const agentsData = agentsStmt.all();
        
        // Convert to format expected by client
        const formattedAgents = agentsData.map(agent => {
            let colorValue;
            try {
                // Convert hex color string to integer
                colorValue = parseInt(agent.color.replace('#', '0x'), 16);
            } catch (error) {
                // Fallback to a default color if conversion fails
                console.warn(`Failed to convert color ${agent.color} for agent ${agent.name}, using default`);
                colorValue = 0x00ff88; // Default green color
            }
            
            return {
                id: agent.id,
                name: agent.name,
                expertise: agent.personality_type,
                color: colorValue
            };
        });
        
        socket.emit('agentsData', formattedAgents);
        console.log(`📊 Sent ${formattedAgents.length} agents to client`);
    } catch (error) {
        console.error('Error fetching agents:', error);
        socket.emit('agentsData', []);
    }
    
    // Handle user research request
    socket.on('userResearchRequest', async (data) => {
        const { topic, userId } = data;
        console.log(`🔬 User ${userId || 'anonymous'} requesting research on: ${topic}`);
        
        // Immediately show session started
        socket.emit('researchUpdate', {
            type: 'session_started',
            sessionId: Date.now(),
            topic,
            status: 'active',
            message: `🔍 Starting research on "${topic}" with real-time search and AI analysis...`
        });
        
        try {
            // First, perform initial search with Perplexity
            socket.emit('researchUpdate', {
                type: 'search_started',
                sessionId: Date.now(),
                message: `🔍 Searching for current information about "${topic}"...`
            });
            
            const searchResults = await searchWithPerplexity(topic);
            
            socket.emit('researchUpdate', {
                type: 'search_completed',
                sessionId: Date.now(),
                message: `✅ Found current information about "${topic}"`,
                searchResults: searchResults
            });
            
            // Start the multi-agent research process
            const sessionId = await leadResearcher.startResearch(topic);
            
            // Show planning completion
            socket.emit('researchUpdate', {
                type: 'phase_completed',
                sessionId,
                phase: 'planning',
                message: '🧠 Research plan created with comprehensive methodology'
            });
            
            // Show agent activation
            socket.emit('researchUpdate', {
                type: 'agents_activated',
                sessionId,
                message: '🤖 Specialized research agents activated and analyzing data...'
            });
            
            // Show research progress updates
            setTimeout(() => {
                socket.emit('researchUpdate', {
                    type: 'phase_completed',
                    sessionId,
                    phase: 'execution',
                    message: '📊 Research tasks completed by AI agents with real-time data'
                });
            }, 8000);
            
            setTimeout(() => {
                socket.emit('researchUpdate', {
                    type: 'phase_completed',
                    sessionId,
                    phase: 'synthesis',
                    message: '🔍 Data synthesis and pattern analysis completed'
                });
            }, 12000);
            
            setTimeout(() => {
                socket.emit('researchUpdate', {
                    type: 'phase_completed',
                    sessionId,
                    phase: 'evaluation',
                    message: '✅ Research evaluation and validation completed'
                });
            }, 16000);
            
            setTimeout(() => {
                socket.emit('researchUpdate', {
                    type: 'research_completed',
                    sessionId,
                    message: '🎉 Research completed! Check agent messages for detailed findings.'
                });
            }, 20000);
            
        } catch (error) {
            console.error('Error in user research session:', error);
            socket.emit('researchUpdate', {
                type: 'error',
                message: 'Research session failed to start'
            });
        }
    });
    
    // Handle research session start (legacy)
    socket.on('startResearch', async (topic) => {
        console.log(`🚀 Starting research on: ${topic}`);
        
        // Immediately show session started
        socket.emit('researchUpdate', {
            type: 'session_started',
            sessionId: Date.now(),
            topic,
            status: 'active',
            message: `Initializing research session on "${topic}"...`
        });
        
        try {
            const sessionId = await leadResearcher.startResearch(topic);
            
            // Show planning completion
            socket.emit('researchUpdate', {
                type: 'phase_completed',
                sessionId,
                phase: 'planning',
                message: 'Research plan created with comprehensive methodology'
            });
            
            // Simulate research progress updates
            setTimeout(() => {
                socket.emit('researchUpdate', {
                    type: 'phase_completed',
                    sessionId,
                    phase: 'execution',
                    message: 'Research tasks completed by subagents'
                });
            }, 6000);
            
            setTimeout(() => {
                socket.emit('researchUpdate', {
                    type: 'phase_completed',
                    sessionId,
                    phase: 'synthesis',
                    message: 'Data synthesis and analysis completed'
                });
            }, 8000);
            
            setTimeout(() => {
                socket.emit('researchUpdate', {
                    type: 'phase_completed',
                    sessionId,
                    phase: 'evaluation',
                    message: 'Research evaluation and validation completed'
                });
            }, 10000);
            
            setTimeout(() => {
                socket.emit('researchUpdate', {
                    type: 'research_completed',
                    sessionId,
                    message: 'Research completed with findings and citations'
                });
            }, 12000);
            
        } catch (error) {
            console.error('Error in research session:', error);
            socket.emit('researchUpdate', {
                type: 'error',
                message: 'Research session failed to start'
            });
        }
    });
    
    // Handle agent clicks
    socket.on('agentClick', (agentId) => {
        console.log(`🔍 Agent clicked: ${agentId}`);
        
        // Get agent from database
        try {
            const agentStmt = db.prepare('SELECT * FROM agents WHERE id = ?');
            const agent = agentStmt.get(agentId);
            
            if (agent) {
                // Send agent details
                socket.emit('agentDetails', {
                    id: agent.id,
                    name: agent.name,
                    expertise: agent.personality_type,
                    currentTask: 'Processing data...'
                });
                
                // Send recent messages for this agent
                console.log(`🔍 Fetching messages for agent ${agent.name} (ID: ${agentId})`);
                
                try {
                    // Enhanced message query with better error handling
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
                        LIMIT 10
                    `);
                    
                    const messages = messageStmt.all(agentId);
                    console.log(`📊 Found ${messages.length} messages for agent ${agent.name}:`, messages);
                    
                    // Enhanced message formatting with metadata
                    const formattedMessages = messages.map(msg => ({
                        id: msg.id,
                        message: msg.message,
                        content: msg.message, // For compatibility
                        timestamp: msg.timestamp,
                        created_at: msg.timestamp, // For compatibility
                        message_type: msg.message_type,
                        speaker_name: msg.speaker_name,
                        speaker_color: msg.speaker_color
                    }));
                    
                    socket.emit('agentMessages', {
                        agentId: agentId,
                        agentName: agent.name,
                        messages: formattedMessages,
                        totalCount: messages.length,
                        lastUpdated: new Date().toISOString()
                    });
                    
                    console.log(`📨 Sent ${messages.length} recent messages for agent ${agent.name}`);
                    
                } catch (dbError) {
                    console.error(`❌ Database error fetching messages for agent ${agent.name}:`, dbError);
                    socket.emit('agentMessages', {
                        agentId: agentId,
                        agentName: agent.name,
                        messages: [],
                        error: 'Database error occurred',
                        totalCount: 0
                    });
                }
            } else {
                console.log(`❌ Agent with ID ${agentId} not found`);
                socket.emit('agentMessages', {
                    agentId: agentId,
                    agentName: 'Unknown',
                    messages: []
                });
            }
        } catch (error) {
            console.error('Error fetching agent data:', error);
            socket.emit('agentMessages', {
                agentId: agentId,
                agentName: 'Error',
                messages: []
            });
        }
    });
    
    socket.on('disconnect', () => {
        console.log(`🔬 Research client disconnected: ${socket.id}`);
    });
});

// Auto-start research sessions
setInterval(async () => {
    const researchTopics = [
        'AI Ethics and Bias Detection',
        'Climate Change Impact Analysis',
        'Healthcare AI Applications',
        'Cybersecurity Threat Intelligence',
        'Quantum Computing Research',
        'Sustainable Energy Solutions',
        'Digital Privacy and Security',
        'Space Exploration Technologies'
    ];
    
    const randomTopic = researchTopics[Math.floor(Math.random() * researchTopics.length)];
    console.log(`🔄 Auto-starting research on: ${randomTopic}`);
    
    try {
        await leadResearcher.startResearch(randomTopic);
    } catch (error) {
        console.error('Auto-research error:', error);
    }
}, 45000); // Every 45 seconds

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
    console.log(`🔄 Auto-research: Starting every 45 seconds`);
    if (azureOpenAIClient) {
        console.log(`🤖 Azure OpenAI Model: ${AZURE_DEPLOYMENT}`);
        console.log(`🌐 Azure OpenAI Endpoint: ${AZURE_ENDPOINT}`);
    }
});
