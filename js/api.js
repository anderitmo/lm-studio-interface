/**
 * Conexão com a API do LM Studio (formato OpenAI-compatible)
 */
const ApiClient = {
    async request(endpoint, method = 'GET', body = null) {
        const settings = StorageManager.getSettings();
        const url = `${settings.endpoint}${endpoint}`;
        
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json'
            }
        };
        
        if (body) {
            options.body = JSON.stringify(body);
        }
        
        const response = await fetch(url, options);
        
        if (!response.ok) {
            const errorText = await response.text().catch(() => '');
            throw new Error(`HTTP ${response.status}: ${response.statusText}${errorText ? ' - ' + errorText : ''}`);
        }
        
        return response;
    },

    // ===== Models =====
    async listModels() {
        try {
            const response = await this.request('/v1/models');
            const data = await response.json();
            return data.data || [];
        } catch (error) {
            console.error('Erro ao listar modelos:', error);
            throw error;
        }
    },

    // ===== Chat Completion =====
    async sendMessage(messages, onChunk = null) {
        const settings = StorageManager.getSettings();
        
        const body = {
            model: settings.model,
            messages: messages,
            temperature: settings.temperature,
            max_tokens: settings.maxTokens,
            top_p: settings.topP,
            stream: !!onChunk
        };

        if (onChunk) {
            return await this.streamChat(body, onChunk);
        } else {
            return await this.completeChat(body);
        }
    },

    async completeChat(body) {
        const response = await this.request('/v1/chat/completions', 'POST', body);
        const data = await response.json();
        
        return {
            content: data.choices[0]?.message?.content || '',
            tokens: {
                prompt: data.usage?.prompt_tokens || 0,
                completion: data.usage?.completion_tokens || 0,
                total: data.usage?.total_tokens || 0
            }
        };
    },

    async streamChat(body, onChunk) {
        const response = await this.request('/v1/chat/completions', 'POST', body);
        
        if (!response.body) {
            throw new Error('Streaming não suportado pelo navegador');
        }
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullContent = '';
        let tokenUsage = { prompt: 0, completion: 0, total: 0 };
        
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n').filter(line => line.trim() !== '');
                
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const jsonStr = line.substring(6);
                        if (jsonStr === '[DONE]') continue;
                        
                        try {
                            const data = JSON.parse(jsonStr);
                            const delta = data.choices[0]?.delta?.content || '';
                            fullContent += delta;
                            
                            // Atualizar uso de tokens (geralmente vem no último chunk)
                            if (data.usage) {
                                tokenUsage = {
                                    prompt: data.usage.prompt_tokens || 0,
                                    completion: data.usage.completion_tokens || 0,
                                    total: data.usage.total_tokens || 0
                                };
                            }
                            
                            // Estimar tokens de completion baseado no conteúdo
                            if (!data.usage && delta) {
                                tokenUsage.completion += this.estimateTokens(delta);
                            }
                            
                            onChunk({
                                content: fullContent,
                                delta: delta,
                                tokens: tokenUsage,
                                done: false
                            });
                        } catch (e) {
                            // Ignora chunks mal formatados
                        }
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }
        
        return {
            content: fullContent,
            tokens: tokenUsage
        };
    },

    // ===== Image Generation =====
    async generateImage(prompt) {
        const settings = StorageManager.getSettings();
        
        const body = {
            model: settings.model,
            prompt: prompt,
            n: 1,
            size: '1024x1024'
        };

        try {
            const response = await this.request('/v1/images/generations', 'POST', body);
            const data = await response.json();
            
            if (data.data && data.data.length > 0) {
                return {
                    imageUrl: data.data[0].url || data.data[0].b64_json,
                    isBase64: !!data.data[0].b64_json,
                    revisedPrompt: data.data[0].revised_prompt || null
                };
            }
            throw new Error('Nenhuma imagem retornada');
        } catch (error) {
            // Se o endpoint de imagens não existir, tenta via chat
            if (error.message.includes('404') || error.message.includes('Not Found')) {
                console.log('Endpoint de imagens não disponível, tentando via chat...');
                return null;
            }
            throw error;
        }
    },

    // ===== Embeddings (para RAG futuro) =====
    async createEmbedding(input) {
        const settings = StorageManager.getSettings();
        
        const body = {
            model: settings.model,
            input: Array.isArray(input) ? input : [input]
        };

        const response = await this.request('/v1/embeddings', 'POST', body);
        const data = await response.json();
        
        return data.data.map(item => item.embedding);
    },

    // ===== Utilitários =====
    estimateTokens(text) {
        // Estimativa simples: ~4 caracteres por token
        return Math.ceil((text || '').length / 4);
    },

    buildMessages(conversation, newContent, attachments = []) {
        const messages = [];
        
        // Adicionar mensagens anteriores
        if (conversation) {
            for (const msg of conversation.messages) {
                if (msg.role === 'user' || msg.role === 'assistant') {
                    messages.push({
                        role: msg.role,
                        content: msg.content
                    });
                }
            }
        }
        
        // Construir mensagem do usuário com anexos
        let userContent = newContent;
        
        if (attachments.length > 0) {
            // Se houver anexos, construir conteúdo multimodelo
            const contentParts = [];
            
            if (newContent) {
                contentParts.push({ type: 'text', text: newContent });
            }
            
            for (const attachment of attachments) {
                if (attachment.type.startsWith('image/')) {
                    contentParts.push({
                        type: 'image_url',
                        image_url: {
                            url: `data:${attachment.type};base64,${attachment.base64}`
                        }
                    });
                } else if (attachment.extractedText) {
                    // Adicionar texto extraído como contexto
                    contentParts.push({
                        type: 'text',
                        text: `\n--- Conteúdo do arquivo: ${attachment.name} ---\n${attachment.extractedText}\n--- Fim do arquivo ---\n`
                    });
                }
            }
            
            if (contentParts.length > 0) {
                messages.push({ role: 'user', content: contentParts });
            } else {
                messages.push({ role: 'user', content: newContent || '(arquivo anexado)' });
            }
        } else {
            messages.push({ role: 'user', content: newContent || '' });
        }
        
        return messages;
    },

    async testConnection() {
        try {
            await this.request('/v1/models');
            return true;
        } catch {
            return false;
        }
    }
};