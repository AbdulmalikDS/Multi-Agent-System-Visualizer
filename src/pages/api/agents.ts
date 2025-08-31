import type { APIRoute } from 'astro';
import { agentManager } from '../../lib/agents';
import { agentDB } from '../../lib/database';

export const GET: APIRoute = async () => {
    try {
        const agents = agentDB.getAllAgents();
        const agentStats = agentDB.getAgentStats();
        
        // Combine agent data with stats
        const enrichedAgents = agents.map(agent => {
            const stats = agentStats.find(s => s.id === agent.id);
            return {
                ...agent,
                topics: JSON.parse(agent.topics),
                stats: {
                    conversation_count: stats?.conversation_count || 0,
                    message_count: stats?.message_count || 0,
                    avg_connection_strength: stats?.avg_connection_strength || 0
                }
            };
        });

        return new Response(JSON.stringify({
            success: true,
            agents: enrichedAgents
        }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    } catch (error) {
        console.error('Error fetching agents:', error);
        return new Response(JSON.stringify({
            success: false,
            error: 'Failed to fetch agents'
        }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }
};

export const POST: APIRoute = async ({ request }) => {
    try {
        const body = await request.json();
        const { agent1Id, agent2Id, topic } = body;

        if (!agent1Id || !agent2Id || !topic) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Missing required parameters: agent1Id, agent2Id, topic'
            }), {
                status: 400,
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        }

        const conversationId = await agentManager.startConversation(agent1Id, agent2Id, topic);

        return new Response(JSON.stringify({
            success: true,
            conversationId,
            message: 'Conversation started successfully'
        }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    } catch (error) {
        console.error('Error starting conversation:', error);
        return new Response(JSON.stringify({
            success: false,
            error: 'Failed to start conversation'
        }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }
};
