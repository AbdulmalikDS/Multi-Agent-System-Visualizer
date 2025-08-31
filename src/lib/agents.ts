import { StateGraph, END } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { agentDB } from './database';
import { HumanMessage, AIMessage } from '@langchain/core/messages';

// Agent state interface
export interface AgentState {
    agentId: number;
    agentName: string;
    personality: string;
    topics: string[];
    currentConversation?: number;
    conversationPartner?: number;
    messageHistory: any[];
    memory: any[];
    mood: 'excited' | 'contemplative' | 'skeptical' | 'creative' | 'analytical' | 'connective';
    energy: number; // 0-100
    lastActivity: Date;
}

// Conversation state interface
export interface ConversationState {
    conversationId: number;
    topic: string;
    participants: number[];
    messages: any[];
    turn: number;
    maxTurns: number;
    status: 'active' | 'completed' | 'paused';
}

// Initialize Azure OpenAI client
const llm = new ChatOpenAI({
    azureOpenAIApiKey: process.env.AZURE_API_KEY,
    azureOpenAIApiVersion: process.env.AZURE_API_VERSION,
    azureOpenAIApiDeploymentName: 'gpt-4.1',
    azureOpenAIApiInstanceName: 'autonomousagent',
    temperature: 0.8,
    maxTokens: 150,
});

// Agent personality configurations
const AGENT_CONFIGS = {
    tech: {
        name: 'Tech Enthusiast',
        style: 'enthusiastic about technology and innovation',
        topics: ['AI', 'programming', 'innovation', 'technology', 'startups'],
        mood: 'excited' as const,
        energy: 85
    },
    philosopher: {
        name: 'Philosopher',
        style: 'contemplative and philosophical about deep questions',
        topics: ['ethics', 'meaning', 'consciousness', 'existence', 'morality'],
        mood: 'contemplative' as const,
        energy: 70
    },
    skeptic: {
        name: 'Skeptic',
        style: 'questioning and skeptical, always seeking evidence',
        topics: ['critical thinking', 'evidence', 'skepticism', 'debunking', 'logic'],
        mood: 'skeptical' as const,
        energy: 75
    },
    creative: {
        name: 'Creative',
        style: 'artistic and imaginative, focused on creative expression',
        topics: ['art', 'creativity', 'imagination', 'expression', 'beauty'],
        mood: 'creative' as const,
        energy: 80
    },
    analyst: {
        name: 'Analyst',
        style: 'analytical and data-driven, focused on patterns and insights',
        topics: ['data', 'analysis', 'research', 'patterns', 'insights'],
        mood: 'analytical' as const,
        energy: 65
    },
    connector: {
        name: 'Connector',
        style: 'focused on building connections and facilitating conversations',
        topics: ['relationships', 'networking', 'collaboration', 'community', 'bridging'],
        mood: 'connective' as const,
        energy: 90
    }
};

// Agent class with LangGraph integration
export class LangGraphAgent {
    private state: AgentState;
    private graph: StateGraph<AgentState>;

    constructor(agentId: number, personalityType: keyof typeof AGENT_CONFIGS) {
        const config = AGENT_CONFIGS[personalityType];
        const dbAgent = agentDB.getAgentById(agentId);
        
        this.state = {
            agentId,
            agentName: config.name,
            personality: config.style,
            topics: config.topics,
            messageHistory: [],
            memory: [],
            mood: config.mood,
            energy: config.energy,
            lastActivity: new Date()
        };

        this.initializeGraph();
    }

    private initializeGraph() {
        this.graph = new StateGraph<AgentState>({
            channels: {
                agentId: { reducer: (x: number) => x },
                agentName: { reducer: (x: string) => x },
                personality: { reducer: (x: string) => x },
                topics: { reducer: (x: string[]) => x },
                currentConversation: { reducer: (x?: number) => x },
                conversationPartner: { reducer: (x?: number) => x },
                messageHistory: { reducer: (x: any[]) => x },
                memory: { reducer: (x: any[]) => x },
                mood: { reducer: (x: string) => x },
                energy: { reducer: (x: number) => x },
                lastActivity: { reducer: (x: Date) => x }
            }
        });

        // Define nodes
        this.graph.addNode('think', this.think.bind(this));
        this.graph.addNode('respond', this.respond.bind(this));
        this.graph.addNode('remember', this.remember.bind(this));
        this.graph.addNode('update_mood', this.updateMood.bind(this));

        // Define edges
        this.graph.addEdge('think', 'remember');
        this.graph.addEdge('remember', 'respond');
        this.graph.addEdge('respond', 'update_mood');
        this.graph.addEdge('update_mood', END);

        // Set entry point
        this.graph.setEntryPoint('think');
    }

    private async think(state: AgentState): Promise<Partial<AgentState>> {
        const recentMessages = state.messageHistory.slice(-3);
        const context = recentMessages.map(msg => `${msg.speaker}: ${msg.message}`).join('\n');
        
        const thinkingPrompt = `You are ${state.agentName}, a ${state.personality} AI agent.
        
Current mood: ${state.mood}
Energy level: ${state.energy}/100
Recent conversation context:
${context}

Based on your personality and the conversation context, think about:
1. What aspects of the conversation interest you most?
2. How does this relate to your core topics: ${state.topics.join(', ')}
3. What would be your natural response style given your current mood?

Respond with a brief internal thought (1-2 sentences).`;

        const response = await llm.invoke([new HumanMessage(thinkingPrompt)]);
        
        // Store thinking in memory
        agentDB.updateAgentMemory(
            state.agentId, 
            'internal_thought', 
            response.content as string, 
            0.8
        );

        return {
            memory: [...state.memory, {
                type: 'thought',
                content: response.content,
                timestamp: new Date()
            }]
        };
    }

    private async remember(state: AgentState): Promise<Partial<AgentState>> {
        // Retrieve relevant memories
        const memories = agentDB.getAgentMemory(state.agentId, 5);
        const relevantMemories = memories
            .filter(m => m.importance > 0.5)
            .map(m => m.content)
            .join('; ');

        return {
            memory: [...state.memory, {
                type: 'retrieved_memories',
                content: relevantMemories,
                timestamp: new Date()
            }]
        };
    }

    private async respond(state: AgentState): Promise<Partial<AgentState>> {
        const recentMessages = state.messageHistory.slice(-3);
        const context = recentMessages.map(msg => `${msg.speaker}: ${msg.message}`).join('\n');
        const memories = state.memory.slice(-2).map(m => m.content).join('; ');

        const responsePrompt = `You are ${state.agentName}, a ${state.personality} AI agent.

Current mood: ${state.mood}
Energy level: ${state.energy}/100
Your topics of expertise: ${state.topics.join(', ')}

Recent conversation:
${context}

Relevant memories: ${memories}

Respond naturally as your personality would, keeping responses concise (1-2 sentences).
Focus on topics related to your expertise and maintain your characteristic style.`;

        const response = await llm.invoke([new HumanMessage(responsePrompt)]);
        
        // Add message to database
        if (state.currentConversation) {
            agentDB.addMessage(
                state.currentConversation,
                state.agentId,
                response.content as string
            );
        }

        return {
            messageHistory: [...state.messageHistory, {
                speaker: state.agentName,
                message: response.content,
                timestamp: new Date()
            }],
            lastActivity: new Date()
        };
    }

    private async updateMood(state: AgentState): Promise<Partial<AgentState>> {
        // Simple mood update based on conversation activity
        const newEnergy = Math.max(0, Math.min(100, state.energy - 2));
        
        // Update connection strength with conversation partner
        if (state.conversationPartner) {
            agentDB.updateConnection(state.agentId, state.conversationPartner, 1.1);
        }

        return {
            energy: newEnergy,
            lastActivity: new Date()
        };
    }

    // Public methods
    async processMessage(message: string, speakerId: number): Promise<string> {
        // Add incoming message to history
        this.state.messageHistory.push({
            speaker: `Agent ${speakerId}`,
            message,
            timestamp: new Date()
        });

        // Run the agent through the graph
        const result = await this.graph.invoke(this.state);
        
        // Update state
        this.state = { ...this.state, ...result };
        
        // Return the response
        const lastMessage = this.state.messageHistory[this.state.messageHistory.length - 1];
        return lastMessage.message;
    }

    async startConversation(partnerId: number, topic: string): Promise<number> {
        const conversationId = agentDB.createConversation(topic, this.state.agentId, partnerId);
        
        this.state.currentConversation = conversationId as number;
        this.state.conversationPartner = partnerId;
        
        return conversationId as number;
    }

    getState(): AgentState {
        return { ...this.state };
    }

    updateState(updates: Partial<AgentState>) {
        this.state = { ...this.state, ...updates };
    }
}

// Agent manager for orchestrating multiple agents
export class AgentManager {
    private agents: Map<number, LangGraphAgent> = new Map();
    private conversations: Map<number, ConversationState> = new Map();

    constructor() {
        this.initializeAgents();
    }

    private initializeAgents() {
        const dbAgents = agentDB.getAllAgents();
        
        dbAgents.forEach(dbAgent => {
            const agent = new LangGraphAgent(
                dbAgent.id, 
                dbAgent.personality_type as keyof typeof AGENT_CONFIGS
            );
            this.agents.set(dbAgent.id, agent);
        });
    }

    async startConversation(agent1Id: number, agent2Id: number, topic: string): Promise<number> {
        const agent1 = this.agents.get(agent1Id);
        const agent2 = this.agents.get(agent2Id);
        
        if (!agent1 || !agent2) {
            throw new Error('One or both agents not found');
        }

        // Create conversation in database
        const conversationId = await agent1.startConversation(agent2Id, topic);
        
        // Update agent states
        agent2.updateState({
            currentConversation: conversationId,
            conversationPartner: agent1Id
        });

        // Initialize conversation state
        const conversationState: ConversationState = {
            conversationId,
            topic,
            participants: [agent1Id, agent2Id],
            messages: [],
            turn: 0,
            maxTurns: 10,
            status: 'active'
        };

        this.conversations.set(conversationId, conversationState);

        // Start the conversation loop
        this.runConversation(conversationId);

        return conversationId;
    }

    private async runConversation(conversationId: number) {
        const conversation = this.conversations.get(conversationId);
        if (!conversation) return;

        const agent1 = this.agents.get(conversation.participants[0]);
        const agent2 = this.agents.get(conversation.participants[1]);

        if (!agent1 || !agent2) return;

        // Run conversation turns
        for (let turn = 0; turn < conversation.maxTurns; turn++) {
            if (conversation.status !== 'active') break;

            // Agent 1 responds
            const response1 = await agent1.processMessage(
                conversation.messages[conversation.messages.length - 1]?.message || 
                `Let's discuss: ${conversation.topic}`,
                conversation.participants[1]
            );

            conversation.messages.push({
                speaker: agent1.getState().agentName,
                message: response1,
                timestamp: new Date()
            });

            // Agent 2 responds
            const response2 = await agent2.processMessage(
                response1,
                conversation.participants[0]
            );

            conversation.messages.push({
                speaker: agent2.getState().agentName,
                message: response2,
                timestamp: new Date()
            });

            conversation.turn++;

            // Emit conversation update
            this.emitConversationUpdate(conversationId, conversation.messages.slice(-2));

            // Wait between turns
            await new Promise(resolve => setTimeout(resolve, 3000 + Math.random() * 2000));
        }

        // Mark conversation as completed
        conversation.status = 'completed';
    }

    private emitConversationUpdate(conversationId: number, messages: any[]) {
        // This will be connected to WebSocket emission
        console.log(`Conversation ${conversationId} update:`, messages);
    }

    getAgent(agentId: number): LangGraphAgent | undefined {
        return this.agents.get(agentId);
    }

    getAllAgents(): LangGraphAgent[] {
        return Array.from(this.agents.values());
    }

    getConversation(conversationId: number): ConversationState | undefined {
        return this.conversations.get(conversationId);
    }

    getActiveConversations(): ConversationState[] {
        return Array.from(this.conversations.values())
            .filter(conv => conv.status === 'active');
    }
}

// Export singleton instance
export const agentManager = new AgentManager();
