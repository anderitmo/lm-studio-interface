/**
 * Gerenciamento de armazenamento (localStorage)
 */
const StorageManager = {
    STORAGE_KEY_SETTINGS: 'lmstudio_settings',
    STORAGE_KEY_CONVERSATIONS: 'lmstudio_conversations',
    STORAGE_KEY_CURRENT_ID: 'lmstudio_current_id',

    // ===== Settings =====
    getSettings() {
        try {
            const data = localStorage.getItem(this.STORAGE_KEY_SETTINGS);
            return data ? JSON.parse(data) : this.getDefaultSettings();
        } catch {
            return this.getDefaultSettings();
        }
    },

    getDefaultSettings() {
        return {
            endpoint: 'http://192.168.0.12:1234',
            model: '',
            temperature: 0.7,
            maxTokens: 4096,
            topP: 0.95,
            contextWindow: 32768
        };
    },

    saveSettings(settings) {
        localStorage.setItem(this.STORAGE_KEY_SETTINGS, JSON.stringify(settings));
    },

    // ===== Conversations =====
    getConversations() {
        try {
            const data = localStorage.getItem(this.STORAGE_KEY_CONVERSATIONS);
            return data ? JSON.parse(data) : [];
        } catch {
            return [];
        }
    },

    saveConversations(conversations) {
        localStorage.setItem(this.STORAGE_KEY_CONVERSATIONS, JSON.stringify(conversations));
    },

    getCurrentConversationId() {
        return localStorage.getItem(this.STORAGE_KEY_CURRENT_ID) || null;
    },

    setCurrentConversationId(id) {
        if (id) {
            localStorage.setItem(this.STORAGE_KEY_CURRENT_ID, id);
        } else {
            localStorage.removeItem(this.STORAGE_KEY_CURRENT_ID);
        }
    },

    getCurrentConversation() {
        const id = this.getCurrentConversationId();
        if (!id) return null;
        const conversations = this.getConversations();
        return conversations.find(c => c.id === id) || null;
    },

    createConversation() {
        const conversation = {
            id: this.generateId(),
            title: 'Nova conversa',
            messages: [],
            createdAt: new Date().toISOString(),
            totalTokens: 0,
            promptTokens: 0,
            completionTokens: 0
        };
        
        const conversations = this.getConversations();
        conversations.unshift(conversation);
        this.saveConversations(conversations);
        this.setCurrentConversationId(conversation.id);
        
        return conversation;
    },

    updateConversation(conversation) {
        const conversations = this.getConversations();
        const index = conversations.findIndex(c => c.id === conversation.id);
        if (index !== -1) {
            conversations[index] = conversation;
            this.saveConversations(conversations);
        }
    },

    addMessage(conversationId, message) {
        const conversations = this.getConversations();
        const conv = conversations.find(c => c.id === conversationId);
        if (!conv) return null;
        
        conv.messages.push(message);
        
        // Atualizar totais de tokens
        if (message.tokens) {
            conv.promptTokens = (conv.promptTokens || 0) + (message.tokens.prompt || 0);
            conv.completionTokens = (conv.completionTokens || 0) + (message.tokens.completion || 0);
            conv.totalTokens = (conv.promptTokens || 0) + (conv.completionTokens || 0);
        }
        
        // Atualizar título baseado na primeira mensagem do usuário
        if (conv.messages.length === 1 && message.role === 'user') {
            conv.title = message.content.substring(0, 50) + (message.content.length > 50 ? '...' : '');
        }
        
        this.saveConversations(conversations);
        return conv;
    },

    clearCurrentConversation() {
        const id = this.getCurrentConversationId();
        if (!id) return;
        
        const conversations = this.getConversations();
        const index = conversations.findIndex(c => c.id === id);
        if (index !== -1) {
            conversations.splice(index, 1);
            this.saveConversations(conversations);
        }
        this.setCurrentConversationId(null);
    },

    deselectConversation() {
        this.setCurrentConversationId(null);
    },

    deleteConversationById(id) {
        const conversations = this.getConversations();
        const index = conversations.findIndex(c => c.id === id);
        if (index !== -1) {
            conversations.splice(index, 1);
            this.saveConversations(conversations);
        }
        // Se a conversa deletada era a atual, limpar currentId
        const currentId = this.getCurrentConversationId();
        if (currentId === id) {
            this.setCurrentConversationId(null);
        }
    },

    getConversationById(id) {
        const conversations = this.getConversations();
        return conversations.find(c => c.id === id) || null;
    },

    exportToMarkdown(conversationId) {
        const conversation = this.getConversationById(conversationId);
        if (!conversation) return null;

        const lines = [];
        lines.push(`# ${conversation.title}`);
        lines.push('');
        lines.push(`**Data:** ${this.formatDate(conversation.createdAt)}`);
        lines.push('');
        lines.push('---');
        lines.push('');

        for (const msg of conversation.messages) {
            if (msg.role === 'user') {
                lines.push('## Você');
                lines.push('');
                if (Array.isArray(msg.content)) {
                    for (const part of msg.content) {
                        if (part.type === 'text') {
                            lines.push(part.text);
                        } else if (part.type === 'image_url') {
                            lines.push(`![Imagem anexada](${part.image_url.url})`);
                        }
                    }
                } else {
                    lines.push(msg.content);
                }
            } else if (msg.role === 'assistant') {
                lines.push('## Assistente');
                lines.push('');
                lines.push(msg.content);
            }

            if (msg.attachments && msg.attachments.length > 0) {
                lines.push('');
                lines.push(`*Anexos: ${msg.attachments.join(', ')}*`);
            }

            if (msg.timestamp) {
                lines.push('');
                lines.push(`*${this.formatTimestamp(msg.timestamp)}*`);
            }

            lines.push('');
            lines.push('---');
            lines.push('');
        }

        return lines.join('\n');
    },

    // ===== Utilities =====
    generateId() {
        return 'conv_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    },

    formatTimestamp(isoString) {
        const date = new Date(isoString);
        return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    },

    formatDate(isoString) {
        const date = new Date(isoString);
        const hoje = new Date();
        const ontem = new Date(hoje);
        ontem.setDate(ontem.getDate() - 1);
        
        if (date.toDateString() === hoje.toDateString()) {
            return 'Hoje ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        } else if (date.toDateString() === ontem.toDateString()) {
            return 'Ontem ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        }
        return date.toLocaleDateString('pt-BR') + ' ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }
};