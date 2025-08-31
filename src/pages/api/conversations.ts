import type { APIRoute } from 'astro';
import { agentDB } from '../../lib/database';

export const GET: APIRoute = async ({ url }) => {
    try {
        const searchParams = url.searchParams;
        const conversationId = searchParams.get('id');
        const limit = parseInt(searchParams.get('limit') || '20');

        if (conversationId) {
            // Get specific conversation
            const messages = agentDB.getConversationMessages(parseInt(conversationId), limit);
            return new Response(JSON.stringify({
                success: true,
                conversationId: parseInt(conversationId),
                messages
            }), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        } else {
            // Get all active conversations
            const conversations = agentDB.getActiveConversations();
            const stats = agentDB.getConversationStats();
            
            return new Response(JSON.stringify({
                success: true,
                conversations,
                stats
            }), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        }
    } catch (error) {
        console.error('Error fetching conversations:', error);
        return new Response(JSON.stringify({
            success: false,
            error: 'Failed to fetch conversations'
        }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }
};
