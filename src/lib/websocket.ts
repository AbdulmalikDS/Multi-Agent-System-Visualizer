import { Server as SocketIOServer } from 'socket.io';
import { agentManager } from './agents';
import { agentDB } from './database';

export class WebSocketManager {
    private io: SocketIOServer;
    private connectedClients: Set<string> = new Set();

    constructor(server: any) {
        this.io = new SocketIOServer(server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });

        this.setupEventHandlers();
        this.startPeriodicUpdates();
    }

    private setupEventHandlers() {
        this.io.on('connection', (socket) => {
            console.log('Client connected:', socket.id);
            this.connectedClients.add(socket.id);

            // Send initial data
            this.sendInitialData(socket);

            // Handle agent click
            socket.on('agentClick', (agentId: number) => {
                this.handleAgentClick(socket, agentId);
            });

            // Handle conversation request
            socket.on('startConversation', (data: { agent1Id: number, agent2Id: number, topic: string }) => {
                this.handleStartConversation(socket, data);
            });

            // Handle disconnect
            socket.on('disconnect', () => {
                console.log('Client disconnected:', socket.id);
                this.connectedClients.delete(socket.id);
            });
        });
    }

    private async sendInitialData(socket: any) {
        try {
            // Send agents data
            const agents = agentDB.getAllAgents();
            const agentStats = agentDB.getAgentStats();
            
            const enrichedAgents = agents.map(agent => {
                const stats = agentStats.find(s => s.id === agent.id);
                return {
                    id: agent.id,
                    name: agent.name,
                    color: agent.color,
                    topics: JSON.parse(agent.topics),
                    style: agent.style,
                    stats: {
                        conversation_count: stats?.conversation_count || 0,
                        message_count: stats?.message_count || 0,
                        avg_connection_strength: stats?.avg_connection_strength || 0
                    }
                };
            });

            socket.emit('agentsData', enrichedAgents);

            // Send conversations data
            const conversations = agentDB.getActiveConversations();
            socket.emit('conversationsData', conversations);

            // Send network connections
            const connections = agentDB.getNetworkConnections();
            socket.emit('networkConnections', connections);

        } catch (error) {
            console.error('Error sending initial data:', error);
        }
    }

    private async handleAgentClick(socket: any, agentId: number) {
        try {
            const agent = agentDB.getAgentById(agentId);
            if (!agent) {
                socket.emit('error', { message: 'Agent not found' });
                return;
            }

            const memories = agentDB.getAgentMemory(agentId, 10);
            const stats = agentDB.getAgentStats().find(s => s.id === agentId);

            socket.emit('agentDetails', {
                id: agent.id,
                name: agent.name,
                personality: {
                    style: agent.style,
                    topics: JSON.parse(agent.topics)
                },
                memories: memories,
                stats: {
                    conversation_count: stats?.conversation_count || 0,
                    message_count: stats?.message_count || 0,
                    avg_connection_strength: stats?.avg_connection_strength || 0
                }
            });
        } catch (error) {
            console.error('Error handling agent click:', error);
            socket.emit('error', { message: 'Failed to get agent details' });
        }
    }

    private async handleStartConversation(socket: any, data: { agent1Id: number, agent2Id: number, topic: string }) {
        try {
            const conversationId = await agentManager.startConversation(
                data.agent1Id, 
                data.agent2Id, 
                data.topic
            );

            socket.emit('conversationStarted', {
                conversationId,
                message: 'Conversation started successfully'
            });

            // Broadcast to all clients
            this.io.emit('conversationUpdate', {
                type: 'new_conversation',
                conversationId,
                topic: data.topic,
                participants: [data.agent1Id, data.agent2Id]
            });

        } catch (error) {
            console.error('Error starting conversation:', error);
            socket.emit('error', { message: 'Failed to start conversation' });
        }
    }

    private startPeriodicUpdates() {
        // Update all clients every 5 seconds
        setInterval(() => {
            this.broadcastUpdates();
        }, 5000);

        // Start automatic conversations every 10 seconds
        setInterval(() => {
            this.startRandomConversation();
        }, 10000);
    }

    private async broadcastUpdates() {
        try {
            // Get updated data
            const conversations = agentDB.getActiveConversations();
            const connections = agentDB.getNetworkConnections();
            const stats = agentDB.getConversationStats();

            // Broadcast to all connected clients
            this.io.emit('systemUpdate', {
                conversations,
                connections,
                stats,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('Error broadcasting updates:', error);
        }
    }

    private async startRandomConversation() {
        try {
            const agents = agentDB.getAllAgents();
            if (agents.length < 2) return;

            // Get random agents
            const agent1 = agents[Math.floor(Math.random() * agents.length)];
            let agent2 = agents[Math.floor(Math.random() * agents.length)];
            while (agent2.id === agent1.id) {
                agent2 = agents[Math.floor(Math.random() * agents.length)];
            }

            // Check if agents are already in conversation
            const activeConversations = agentDB.getActiveConversations();
            const agent1InConversation = activeConversations.some(c => 
                c.agent1_id === agent1.id || c.agent2_id === agent1.id
            );
            const agent2InConversation = activeConversations.some(c => 
                c.agent1_id === agent2.id || c.agent2_id === agent2.id
            );

            if (agent1InConversation || agent2InConversation) return;

            // Topics for random conversations
            const topics = [
                "the future of artificial intelligence",
                "the nature of consciousness",
                "creativity and technology",
                "ethics in AI development",
                "the role of data in society",
                "collaboration between humans and AI",
                "the meaning of intelligence",
                "innovation and progress"
            ];

            const topic = topics[Math.floor(Math.random() * topics.length)];
            
            await agentManager.startConversation(agent1.id, agent2.id, topic);

        } catch (error) {
            console.error('Error starting random conversation:', error);
        }
    }

    // Public method to emit conversation updates
    public emitConversationUpdate(conversationId: number, messages: any[]) {
        this.io.emit('conversationUpdate', {
            type: 'new_messages',
            conversationId,
            messages
        });
    }

    // Public method to emit agent state updates
    public emitAgentUpdate(agentId: number, state: any) {
        this.io.emit('agentUpdate', {
            agentId,
            state,
            timestamp: new Date().toISOString()
        });
    }

    // Get connected clients count
    public getConnectedClientsCount(): number {
        return this.connectedClients.size;
    }
}
