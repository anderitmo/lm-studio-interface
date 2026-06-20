/**
 * Aplicação principal - Interface LM Studio
 */
const App = {
    currentAttachments: [],
    isProcessing: false,
    abortController: null,

    async init() {
        console.log('🚀 Inicializando LM Studio Interface...');
        
        // Inicializar módulos
        ThemeManager.init();
        
        // Carregar configurações
        this.loadSettings();
        
        // Inicializar conversa
        this.initConversation();
        
        // Configurar eventos
        this.setupEventListeners();
        
        // Carregar lista de conversas na sidebar
        this.loadChatList();
        
        // Abrir sidebar por padrão
        document.getElementById('sidebar').classList.add('open');
        
        // Carregar modelos disponíveis
        await this.refreshModels();
        
        console.log('✅ LM Studio Interface inicializada!');
    },

    // ===== Configurações =====
    loadSettings() {
        const settings = StorageManager.getSettings();
        
        document.getElementById('apiEndpoint').value = settings.endpoint;
        document.getElementById('temperature').value = settings.temperature;
        document.getElementById('maxTokens').value = settings.maxTokens;
        document.getElementById('topP').value = settings.topP;
        document.getElementById('contextWindow').value = settings.contextWindow;
        
        if (settings.model) {
            document.getElementById('modelBadge').textContent = settings.model;
        }
    },

    saveSettings() {
        const settings = {
            endpoint: document.getElementById('apiEndpoint').value.trim(),
            model: document.getElementById('modelSelect').value,
            temperature: parseFloat(document.getElementById('temperature').value) || 0.7,
            maxTokens: parseInt(document.getElementById('maxTokens').value) || 4096,
            topP: parseFloat(document.getElementById('topP').value) || 0.95,
            contextWindow: parseInt(document.getElementById('contextWindow').value) || 32768
        };
        
        StorageManager.saveSettings(settings);
        
        // Atualizar badge do modelo
        const badge = document.getElementById('modelBadge');
        badge.textContent = settings.model || 'Nenhum modelo';
        
        this.closeSettings();
        this.showToast('Configurações salvas!', 'success');
    },

    // ===== Modelos =====
    async refreshModels() {
        const select = document.getElementById('modelSelect');
        const badge = document.getElementById('modelBadge');
        
        try {
            select.innerHTML = '<option value="">Carregando...</option>';
            
            const models = await ApiClient.listModels();
            
            select.innerHTML = '<option value="">Selecione um modelo...</option>';
            
            if (models.length === 0) {
                select.innerHTML = '<option value="">Nenhum modelo disponível</option>';
                badge.textContent = 'Nenhum modelo';
                return;
            }
            
            const settings = StorageManager.getSettings();
            
            for (const model of models) {
                const id = model.id || model;
                const option = document.createElement('option');
                option.value = id;
                option.textContent = id;
                select.appendChild(option);
            }
            
            // Selecionar modelo salvo
            if (settings.model) {
                select.value = settings.model;
                badge.textContent = settings.model;
            }
            
            this.showToast(`${models.length} modelo(s) carregado(s)`, 'success');
        } catch (error) {
            console.error('Erro ao carregar modelos:', error);
            select.innerHTML = '<option value="">Erro ao conectar</option>';
            badge.textContent = '⚠️ Sem conexão';
            this.showToast(`Erro ao conectar: ${error.message}`, 'error');
        }
    },

    // ===== Conversa =====
    initConversation() {
        let conversation = StorageManager.getCurrentConversation();
        
        if (!conversation) {
            conversation = StorageManager.createConversation();
        }
        
        this.renderMessages(conversation);
        this.updateTokenStats(conversation);
    },

    newConversation() {
        StorageManager.deselectConversation();
        const conversation = StorageManager.createConversation();
        
        // Limpar área de chat
        const container = document.getElementById('chatMessages');
        container.innerHTML = `
            <div class="welcome-message">
                <div class="welcome-icon">🤖</div>
                <h2>Bem-vindo ao LM Studio Interface</h2>
                <p>Selecione um modelo nas configurações e comece a conversar.</p>
                <p class="welcome-hint">Você pode anexar PDFs, documentos, imagens e planilhas para criar um contexto RAG.</p>
            </div>
        `;
        
        this.resetTokenStats();
        this.currentAttachments = [];
        this.updateAttachmentPreview();
        
        // Atualizar sidebar
        this.loadChatList(document.getElementById('searchChat').value);
        
        this.closeSettings();
        this.showToast('Nova conversa iniciada!', 'success');
    },

    renderMessages(conversation) {
        const container = document.getElementById('chatMessages');
        
        if (!conversation || conversation.messages.length === 0) {
            container.innerHTML = `
                <div class="welcome-message">
                    <div class="welcome-icon">🤖</div>
                    <h2>Bem-vindo ao LM Studio Interface</h2>
                    <p>Selecione um modelo nas configurações e comece a conversar.</p>
                    <p class="welcome-hint">Você pode anexar PDFs, documentos, imagens e planilhas para criar um contexto RAG.</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = '';
        
        for (const msg of conversation.messages) {
            this.appendMessageToUI(msg);
        }
        
        // Scroll para o final
        this.scrollToBottom();
    },

    appendMessageToUI(message) {
        const container = document.getElementById('chatMessages');
        
        // Remover welcome se existir
        const welcome = container.querySelector('.welcome-message');
        if (welcome) welcome.remove();
        
        const div = document.createElement('div');
        div.className = `message ${message.role}`;
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        // Renderizar conteúdo (Markdown para assistente, texto puro para usuário)
        if (message.role === 'assistant') {
            contentDiv.innerHTML = marked.parse(message.content);
            // Aplicar syntax highlight
            contentDiv.querySelectorAll('pre code').forEach((block) => {
                hljs.highlightElement(block);
            });
        } else {
            // Verificar se é conteúdo multimídia (array de partes)
            if (Array.isArray(message.content)) {
                for (const part of message.content) {
                    if (part.type === 'text') {
                        const p = document.createElement('p');
                        p.textContent = part.text;
                        contentDiv.appendChild(p);
                    } else if (part.type === 'image_url') {
                        const img = document.createElement('img');
                        img.src = part.image_url.url;
                        img.className = 'generated-image';
                        img.alt = 'Imagem anexada';
                        contentDiv.appendChild(img);
                    }
                }
            } else {
                contentDiv.textContent = message.content;
            }
        }
        
        div.appendChild(contentDiv);
        
        // Anexos
        if (message.attachments && message.attachments.length > 0) {
            const attDiv = document.createElement('div');
            attDiv.className = 'message-attachments';
            
            for (const att of message.attachments) {
                const chip = document.createElement('span');
                chip.className = 'attachment-chip';
                chip.innerHTML = `<span class="file-icon">📎</span> ${att}`;
                attDiv.appendChild(chip);
            }
            
            div.appendChild(attDiv);
        }
        
        // Timestamp
        if (message.timestamp) {
            const time = document.createElement('div');
            time.className = 'message-timestamp';
            time.textContent = StorageManager.formatTimestamp(message.timestamp);
            div.appendChild(time);
        }
        
        container.appendChild(div);
        this.scrollToBottom();
    },

    // ===== Envio de Mensagens =====
    async sendMessage() {
        const input = document.getElementById('messageInput');
        const text = input.value.trim();
        
        if (!text && this.currentAttachments.length === 0) return;
        if (this.isProcessing) return;
        
        const settings = StorageManager.getSettings();
        if (!settings.model) {
            this.showToast('Selecione um modelo nas configurações!', 'error');
            return;
        }
        
        this.isProcessing = true;
        this.setInputState(false);
        
        // Obter/ criar conversa
        let conversation = StorageManager.getCurrentConversation();
        if (!conversation) {
            conversation = StorageManager.createConversation();
        }
        
        // Processar anexos
        const attachments = [...this.currentAttachments];
        
        // Construir mensagens para a API
        const messages = ApiClient.buildMessages(conversation, text, attachments);
        
        // Criar mensagem do usuário na UI
        const userMessage = {
            role: 'user',
            content: text,
            attachments: attachments.map(a => a.name),
            timestamp: new Date().toISOString(),
            tokens: { prompt: 0, completion: 0 }
        };
        
        this.appendMessageToUI(userMessage);
        
        // Salvar mensagem do usuário
        const savedConv = StorageManager.addMessage(conversation.id, userMessage);
        
        // Limpar input e anexos
        input.value = '';
        this.currentAttachments = [];
        this.updateAttachmentPreview();
        this.autoResizeInput();
        
        // Mostrar indicador de digitação
        this.showTyping(true);
        
        // Criar elemento para resposta
        const assistantDiv = document.createElement('div');
        assistantDiv.className = 'message assistant';
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.id = 'streamingContent';
        assistantDiv.appendChild(contentDiv);
        
        const container = document.getElementById('chatMessages');
        const welcome = container.querySelector('.welcome-message');
        if (welcome) welcome.remove();
        container.appendChild(assistantDiv);
        
        // Abort controller para cancelar
        this.abortController = new AbortController();
        
        let fullResponse = '';
        let tokenUsage = { prompt: 0, completion: 0, total: 0 };
        
        try {
            // Enviar com streaming
            const result = await ApiClient.sendMessage(messages, (chunk) => {
                fullResponse = chunk.content;
                tokenUsage = chunk.tokens;
                
                // Atualizar conteúdo em tempo real
                contentDiv.innerHTML = marked.parse(fullResponse);
                contentDiv.querySelectorAll('pre code').forEach((block) => {
                    hljs.highlightElement(block);
                });
                
                this.scrollToBottom();
            });
            
            // Resultado final
            if (result) {
                fullResponse = result.content || fullResponse;
                tokenUsage = result.tokens || tokenUsage;
            }
            
        } catch (error) {
            if (error.name === 'AbortError') {
                fullResponse = '[Mensagem cancelada]';
            } else {
                console.error('Erro ao enviar mensagem:', error);
                fullResponse = `**Erro:** ${error.message}`;
                this.showToast(`Erro: ${error.message}`, 'error');
            }
        } finally {
            this.showTyping(false);
            this.isProcessing = false;
            this.setInputState(true);
            this.abortController = null;
            
            // Remover ID de streaming e fixar conteúdo
            contentDiv.id = '';
            contentDiv.innerHTML = marked.parse(fullResponse);
            contentDiv.querySelectorAll('pre code').forEach((block) => {
                hljs.highlightElement(block);
            });
            
            // Adicionar timestamp
            const time = document.createElement('div');
            time.className = 'message-timestamp';
            time.textContent = StorageManager.formatTimestamp(new Date().toISOString());
            assistantDiv.appendChild(time);
            
            // Salvar resposta do assistente
            const assistantMessage = {
                role: 'assistant',
                content: fullResponse,
                timestamp: new Date().toISOString(),
                tokens: tokenUsage
            };
            
            StorageManager.addMessage(conversation.id, assistantMessage);
            
            // Atualizar estatísticas
            this.updateTokenStats(StorageManager.getCurrentConversation());
            this.scrollToBottom();
        }
    },

    // ===== Geração de Imagens =====
    async generateImage() {
        const input = document.getElementById('messageInput');
        const text = input.value.trim();
        
        if (!text) {
            this.showToast('Digite um prompt para gerar a imagem!', 'warning');
            return;
        }
        
        if (this.isProcessing) return;
        
        this.isProcessing = true;
        this.setInputState(false);
        
        // Mostrar indicador
        this.showTyping(true);
        
        const container = document.getElementById('chatMessages');
        const welcome = container.querySelector('.welcome-message');
        if (welcome) welcome.remove();
        
        // Mensagem do usuário
        const userDiv = document.createElement('div');
        userDiv.className = 'message user';
        const userContent = document.createElement('div');
        userContent.className = 'message-content';
        userContent.textContent = `🎨 Gerar imagem: ${text}`;
        userDiv.appendChild(userContent);
        container.appendChild(userDiv);
        
        try {
            const result = await ApiClient.generateImage(text);
            
            this.showTyping(false);
            
            if (result && result.imageUrl) {
                // Exibir imagem gerada
                const assistantDiv = document.createElement('div');
                assistantDiv.className = 'message assistant';
                const imgContent = document.createElement('div');
                imgContent.className = 'message-content';
                
                if (result.revisedPrompt) {
                    const p = document.createElement('p');
                    p.textContent = `Prompt revisado: ${result.revisedPrompt}`;
                    imgContent.appendChild(p);
                }
                
                const img = document.createElement('img');
                
                if (result.isBase64) {
                    img.src = `data:image/png;base64,${result.imageUrl}`;
                } else {
                    img.src = result.imageUrl;
                }
                
                img.className = 'generated-image';
                img.alt = text;
                img.loading = 'lazy';
                imgContent.appendChild(img);
                
                const time = document.createElement('div');
                time.className = 'message-timestamp';
                time.textContent = StorageManager.formatTimestamp(new Date().toISOString());
                
                assistantDiv.appendChild(imgContent);
                assistantDiv.appendChild(time);
                container.appendChild(assistantDiv);
                
                // Salvar no histórico
                const conversation = StorageManager.getCurrentConversation();
                if (conversation) {
                    const assistantMessage = {
                        role: 'assistant',
                        content: `![Imagem gerada](${img.src})`,
                        timestamp: new Date().toISOString(),
                        tokens: { prompt: ApiClient.estimateTokens(text), completion: 0 }
                    };
                    StorageManager.addMessage(conversation.id, assistantMessage);
                }
                
                input.value = '';
                this.autoResizeInput();
            } else {
                // Fallback: tentar via chat
                const assistantDiv = document.createElement('div');
                assistantDiv.className = 'message assistant';
                const contentDiv = document.createElement('div');
                contentDiv.className = 'message-content';
                contentDiv.innerHTML = '<p><em>Tentando gerar a descrição da imagem via chat...</em></p>';
                assistantDiv.appendChild(contentDiv);
                container.appendChild(assistantDiv);
                
                // Enviar como mensagem normal pedindo descrição
                const settings = StorageManager.getSettings();
                const messages = [
                    { 
                        role: 'user', 
                        content: `Descreva em detalhes como seria a imagem: "${text}". Apenas descreva, não analise.` 
                    }
                ];
                
                const result = await ApiClient.sendMessage(messages);
                contentDiv.innerHTML = marked.parse(result.content);
                this.updateTokenStats(StorageManager.getCurrentConversation());
            }
            
        } catch (error) {
            this.showTyping(false);
            console.error('Erro ao gerar imagem:', error);
            this.showToast(`Erro ao gerar imagem: ${error.message}`, 'error');
            
            const errorDiv = document.createElement('div');
            errorDiv.className = 'message assistant';
            const errorContent = document.createElement('div');
            errorContent.className = 'message-content';
            errorContent.innerHTML = `<p>❌ **Erro ao gerar imagem:** ${error.message}</p>`;
            errorDiv.appendChild(errorContent);
            container.appendChild(errorDiv);
        } finally {
            this.isProcessing = false;
            this.setInputState(true);
            this.scrollToBottom();
        }
    },

    // ===== UI Helpers =====
    showTyping(show) {
        const indicator = document.getElementById('typingIndicator');
        indicator.style.display = show ? 'flex' : 'none';
        
        if (show) {
            this.scrollToBottom();
        }
    },

    scrollToBottom() {
        const container = document.getElementById('chatContainer');
        setTimeout(() => {
            container.scrollTop = container.scrollHeight;
        }, 50);
    },

    setInputState(enabled) {
        const input = document.getElementById('messageInput');
        const sendBtn = document.getElementById('sendBtn');
        const attachBtn = document.getElementById('attachBtn');
        const imageBtn = document.getElementById('imageGenBtn');
        
        input.disabled = !enabled;
        sendBtn.disabled = !enabled;
        attachBtn.disabled = !enabled;
        imageBtn.disabled = !enabled;
    },

    autoResizeInput() {
        const input = document.getElementById('messageInput');
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    },

    // ===== Token Stats =====
    updateTokenStats(conversation) {
        if (!conversation) {
            this.resetTokenStats();
            return;
        }
        
        const promptTokens = conversation.promptTokens || 0;
        const completionTokens = conversation.completionTokens || 0;
        const total = conversation.totalTokens || 0;
        const contextWindow = parseInt(document.getElementById('contextWindow').value) || 32768;
        
        document.getElementById('promptTokens').textContent = promptTokens.toLocaleString();
        document.getElementById('completionTokens').textContent = completionTokens.toLocaleString();
        document.getElementById('totalTokens').textContent = total.toLocaleString();
        
        const percent = Math.min((total / contextWindow) * 100, 100);
        document.getElementById('contextBarFill').style.width = percent + '%';
        document.getElementById('contextText').textContent = percent.toFixed(1) + '%';
        
        // Mudar cor da barra conforme uso
        const barFill = document.getElementById('contextBarFill');
        if (percent > 90) {
            barFill.style.background = 'var(--danger)';
        } else if (percent > 70) {
            barFill.style.background = 'var(--warning)';
        } else {
            barFill.style.background = 'var(--accent-color)';
        }
    },

    resetTokenStats() {
        document.getElementById('promptTokens').textContent = '0';
        document.getElementById('completionTokens').textContent = '0';
        document.getElementById('totalTokens').textContent = '0';
        document.getElementById('contextBarFill').style.width = '0%';
        document.getElementById('contextText').textContent = '0%';
    },

    // ===== Anexos =====
    async handleFiles(files) {
        const fileArray = Array.from(files);
        
        for (const file of fileArray) {
            try {
                const parsed = await DocumentParser.parse(file);
                
                // Verificar tamanho máximo do texto extraído
                if (parsed.extractedText && parsed.extractedText.length > 50000) {
                    parsed.extractedText = parsed.extractedText.substring(0, 50000) + 
                        '\n\n[...Texto truncado por ser muito extenso]';
                }
                
                this.currentAttachments.push(parsed);
            } catch (error) {
                console.error(`Erro ao processar ${file.name}:`, error);
                this.showToast(`Erro ao processar ${file.name}`, 'error');
            }
        }
        
        this.updateAttachmentPreview();
        this.showToast(`${fileArray.length} arquivo(s) anexado(s)`, 'success');
    },

    updateAttachmentPreview() {
        const container = document.getElementById('attachmentPreview');
        
        if (this.currentAttachments.length === 0) {
            container.innerHTML = '';
            return;
        }
        
        container.innerHTML = '';
        
        for (let i = 0; i < this.currentAttachments.length; i++) {
            const att = this.currentAttachments[i];
            const div = document.createElement('div');
            div.className = 'attachment-item';
            
            div.innerHTML = `
                <span class="file-icon">${DocumentParser.getFileIcon({ name: att.name })}</span>
                <span class="file-name" title="${att.name}">${att.name}</span>
                <button class="remove-attachment" data-index="${i}" title="Remover">×</button>
            `;
            
            container.appendChild(div);
        }
        
        // Eventos para remover
        container.querySelectorAll('.remove-attachment').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.dataset.index);
                this.currentAttachments.splice(index, 1);
                this.updateAttachmentPreview();
            });
        });
    },

    // ===== Settings Panel =====
    toggleSettings() {
        const panel = document.getElementById('settingsPanel');
        panel.classList.toggle('open');
    },

    closeSettings() {
        document.getElementById('settingsPanel').classList.remove('open');
    },

    // ===== Toast =====
    showToast(message, type = 'info') {
        const existing = document.querySelector('.toast');
        if (existing) existing.remove();
        
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };
        
        toast.innerHTML = `${icons[type] || 'ℹ️'} ${message}`;
        document.body.appendChild(toast);
        
        // Animar
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });
        
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },

    // ===== Sidebar =====
    loadChatList(filter = '') {
        const list = document.getElementById('chatList');
        const conversations = StorageManager.getConversations();
        const currentId = StorageManager.getCurrentConversationId();
        
        list.innerHTML = '';
        
        const filtered = filter
            ? conversations.filter(c => c.title.toLowerCase().includes(filter.toLowerCase()))
            : conversations;
        
        if (filtered.length === 0) {
            list.innerHTML = `
                <div class="sidebar-empty">
                    <p>${filter ? 'Nenhuma conversa encontrada' : 'Nenhuma conversa ainda'}</p>
                </div>
            `;
            return;
        }
        
        for (const conv of filtered) {
            const item = document.createElement('div');
            item.className = 'chat-list-item' + (conv.id === currentId ? ' active' : '');
            item.dataset.id = conv.id;
            
            const date = StorageManager.formatDate(conv.createdAt);
            const title = conv.title || 'Nova conversa';
            
            item.innerHTML = `
                <span class="chat-icon">💬</span>
                <div class="chat-info">
                    <div class="chat-title" title="${title.replace(/"/g, '"')}">${title}</div>
                    <div class="chat-date">${date}</div>
                </div>
                <div class="chat-actions">
                    <button class="chat-action-btn export-btn" title="Exportar em Markdown">📥</button>
                    <button class="chat-action-btn delete-btn" title="Excluir conversa">🗑️</button>
                </div>
            `;
            
            // Event: clicar na conversa
            item.addEventListener('click', (e) => {
                // Não disparar se clicou nos botões de ação
                if (e.target.closest('.chat-action-btn')) return;
                this.switchConversation(conv.id);
            });
            
            // Event: exportar
            item.querySelector('.export-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                this.exportConversationMD(conv.id);
            });
            
            // Event: deletar
            item.querySelector('.delete-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteConversation(conv.id);
            });
            
            list.appendChild(item);
        }
    },
    
    switchConversation(id) {
        const conversation = StorageManager.getConversationById(id);
        if (!conversation) return;
        
        StorageManager.setCurrentConversationId(id);
        this.renderMessages(conversation);
        this.updateTokenStats(conversation);
        this.currentAttachments = [];
        this.updateAttachmentPreview();
        this.loadChatList(document.getElementById('searchChat').value);
        this.closeSettings();
    },
    
    deleteConversation(id) {
        const conversation = StorageManager.getConversationById(id);
        if (!conversation) return;
        
        if (!confirm(`Tem certeza que deseja excluir "${conversation.title}"?`)) return;
        
        const wasCurrent = StorageManager.getCurrentConversationId() === id;
        StorageManager.deleteConversationById(id);
        
        // Se era a conversa atual, criar nova ou mostrar welcome
        if (wasCurrent) {
            const remaining = StorageManager.getConversations();
            if (remaining.length > 0) {
                this.switchConversation(remaining[0].id);
            } else {
                const container = document.getElementById('chatMessages');
                container.innerHTML = `
                    <div class="welcome-message">
                        <div class="welcome-icon">🤖</div>
                        <h2>Bem-vindo ao LM Studio Interface</h2>
                        <p>Selecione um modelo nas configurações e comece a conversar.</p>
                        <p class="welcome-hint">Você pode anexar PDFs, documentos, imagens e planilhas para criar um contexto RAG.</p>
                    </div>
                `;
                this.resetTokenStats();
            }
        }
        
        this.loadChatList(document.getElementById('searchChat').value);
        this.showToast('Conversa excluída!', 'success');
    },
    
    exportConversationMD(id) {
        const markdown = StorageManager.exportToMarkdown(id);
        if (!markdown) {
            this.showToast('Erro ao exportar conversa', 'error');
            return;
        }
        
        const conversation = StorageManager.getConversationById(id);
        const filename = (conversation.title || 'conversa')
            .replace(/[^a-zA-Z0-9\u00C0-\u024F\s]/g, '')
            .trim()
            .substring(0, 50)
            .replace(/\s+/g, '_')
            .toLowerCase() + '.md';
        
        const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.showToast('Conversa exportada!', 'success');
    },
    
    filterChatList() {
        const query = document.getElementById('searchChat').value;
        this.loadChatList(query);
    },

    // ===== Event Listeners =====
    setupEventListeners() {
        // Settings
        document.getElementById('settingsToggle').addEventListener('click', () => this.toggleSettings());
        document.getElementById('saveSettings').addEventListener('click', () => this.saveSettings());
        document.getElementById('clearChat').addEventListener('click', () => this.newConversation());
        document.getElementById('refreshModels').addEventListener('click', () => this.refreshModels());
        
        // Sidebar
        document.getElementById('sidebarToggle').addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('open');
        });
        
        document.getElementById('newChatBtn').addEventListener('click', () => {
            this.newConversation();
            this.loadChatList();
        });
        
        document.getElementById('searchChat').addEventListener('input', () => {
            this.filterChatList();
        });
        
        // Model selection
        document.getElementById('modelSelect').addEventListener('change', (e) => {
            const settings = StorageManager.getSettings();
            settings.model = e.target.value;
            StorageManager.saveSettings(settings);
            
            const badge = document.getElementById('modelBadge');
            badge.textContent = settings.model || 'Nenhum modelo';
        });
        
        // Envio de mensagens
        document.getElementById('sendBtn').addEventListener('click', () => this.sendMessage());
        
        document.getElementById('messageInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        
        document.getElementById('messageInput').addEventListener('input', () => this.autoResizeInput());
        
        // Geração de imagem
        document.getElementById('imageGenBtn').addEventListener('click', () => this.generateImage());
        
        // Anexo de arquivos
        document.getElementById('attachBtn').addEventListener('click', () => {
            document.getElementById('fileInput').click();
        });
        
        document.getElementById('fileInput').addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleFiles(e.target.files);
                e.target.value = '';
            }
        });
        
        // Drag & Drop
        this.setupDragAndDrop();
        
        // Fechar settings ao clicar fora
        document.addEventListener('click', (e) => {
            const panel = document.getElementById('settingsPanel');
            const toggle = document.getElementById('settingsToggle');
            if (panel.classList.contains('open') && 
                !panel.contains(e.target) && 
                !toggle.contains(e.target)) {
                this.closeSettings();
            }
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Ctrl+Shift+N: Nova conversa
            if (e.ctrlKey && e.shiftKey && e.key === 'N') {
                e.preventDefault();
                this.newConversation();
            }
            // Ctrl+Shift+,: Configurações
            if (e.ctrlKey && e.shiftKey && e.key === ',') {
                e.preventDefault();
                this.toggleSettings();
            }
            // Escape: Fechar settings
            if (e.key === 'Escape') {
                this.closeSettings();
            }
        });
    },

    setupDragAndDrop() {
        const overlay = document.getElementById('dragOverlay');
        let dragCounter = 0;
        
        document.addEventListener('dragenter', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dragCounter++;
            overlay.classList.add('active');
        });
        
        document.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dragCounter--;
            if (dragCounter === 0) {
                overlay.classList.remove('active');
            }
        });
        
        document.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
        
        document.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            overlay.classList.remove('active');
            dragCounter = 0;
            
            if (e.dataTransfer.files.length > 0) {
                this.handleFiles(e.dataTransfer.files);
            }
        });
        
        // Prevenir comportamento padrão de arrastar arquivos
        document.addEventListener('dragenter', (e) => e.preventDefault());
        document.addEventListener('dragover', (e) => e.preventDefault());
        document.addEventListener('dragleave', (e) => e.preventDefault());
    }
};

// ===== Toast Styles (injetados dinamicamente) =====
const toastStyles = document.createElement('style');
toastStyles.textContent = `
    .toast {
        position: fixed;
        top: -60px;
        left: 50%;
        transform: translateX(-50%);
        padding: 10px 20px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        z-index: 1000;
        transition: top 0.3s ease;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        display: flex;
        align-items: center;
        gap: 8px;
        white-space: nowrap;
    }
    .toast.show {
        top: 12px;
    }
    .toast-success {
        background: #28a745;
        color: #fff;
    }
    .toast-error {
        background: #dc3545;
        color: #fff;
    }
    .toast-warning {
        background: #ffc107;
        color: #1a1a1a;
    }
    .toast-info {
        background: #0066cc;
        color: #fff;
    }
    [data-theme="dark"] .toast-info {
        background: #4da6ff;
    }
    [data-theme="dark"] .toast-warning {
        color: #1a1a1a;
    }
`;
document.head.appendChild(toastStyles);

// ===== Inicializar quando o DOM estiver pronto =====
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});