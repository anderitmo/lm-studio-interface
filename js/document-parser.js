/**
 * Parser de documentos (PDF, DOCX, XLSX, TXT, imagens)
 */
const DocumentParser = {
    // ===== Configuração do PDF.js =====
    init() {
        if (typeof pdfjsLib !== 'undefined') {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
    },

    /**
     * Processa um arquivo e extrai seu conteúdo
     * @param {File} file - Arquivo a ser processado
     * @returns {Promise<Object>} Dados extraídos do arquivo
     */
    async parse(file) {
        const ext = file.name.split('.').pop().toLowerCase();
        const baseData = {
            name: file.name,
            size: file.size,
            type: file.type,
            ext: ext,
            extractedText: '',
            base64: null,
            preview: null
        };

        try {
            switch (ext) {
                case 'pdf':
                    return await this.parsePDF(file, baseData);
                case 'docx':
                case 'doc':
                    return await this.parseDOCX(file, baseData);
                case 'xlsx':
                case 'xls':
                    return await this.parseXLSX(file, baseData);
                case 'csv':
                    return await this.parseCSV(file, baseData);
                case 'txt':
                    return await this.parseTXT(file, baseData);
                case 'png':
                case 'jpg':
                case 'jpeg':
                case 'gif':
                case 'webp':
                    return await this.parseImage(file, baseData);
                default:
                    // Tenta ler como texto
                    return await this.parseTXT(file, baseData);
            }
        } catch (error) {
            console.error(`Erro ao processar ${file.name}:`, error);
            baseData.extractedText = `[Erro ao processar arquivo: ${error.message}]`;
            return baseData;
        }
    },

    /**
     * Extrai texto de PDF
     */
    async parsePDF(file, baseData) {
        if (typeof pdfjsLib === 'undefined') {
            baseData.extractedText = `[PDF: ${file.name} - Biblioteca PDF.js não carregada]`;
            return baseData;
        }

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';

        for (let i = 1; i <= Math.min(pdf.numPages, 50); i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += pageText + '\n\n';
        }

        if (pdf.numPages > 50) {
            fullText += `\n[O PDF possui ${pdf.numPages} páginas. Foram extraídas as primeiras 50 páginas.]`;
        }

        baseData.extractedText = fullText.trim();
        baseData.preview = '📄';
        return baseData;
    },

    /**
     * Extrai texto de DOCX
     */
    async parseDOCX(file, baseData) {
        if (typeof mammoth === 'undefined') {
            baseData.extractedText = `[DOCX: ${file.name} - Biblioteca Mammoth não carregada]`;
            return baseData;
        }

        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
        
        baseData.extractedText = result.value || '[Documento vazio]';
        if (result.messages && result.messages.length > 0) {
            console.warn('Avisos ao processar DOCX:', result.messages);
        }
        baseData.preview = '📝';
        return baseData;
    },

    /**
     * Extrai dados de planilhas XLSX/XLS
     */
    async parseXLSX(file, baseData) {
        if (typeof XLSX === 'undefined') {
            baseData.extractedText = `[Planilha: ${file.name} - Biblioteca SheetJS não carregada]`;
            return baseData;
        }

        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        let fullText = '';

        for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName];
            const csv = XLSX.utils.sheet_to_csv(sheet, { strip: false });
            
            fullText += `--- Planilha: ${sheetName} ---\n${csv}\n\n`;
        }

        baseData.extractedText = fullText.trim();
        baseData.preview = '📊';
        return baseData;
    },

    /**
     * Extrai texto de CSV
     */
    async parseCSV(file, baseData) {
        if (typeof XLSX === 'undefined') {
            // Fallback: ler como texto puro
            return await this.parseTXT(file, baseData);
        }

        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        let fullText = '';

        for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName];
            const csv = XLSX.utils.sheet_to_csv(sheet, { strip: false });
            fullText += `--- ${sheetName} ---\n${csv}\n\n`;
        }

        baseData.extractedText = fullText.trim();
        baseData.preview = '📊';
        return baseData;
    },

    /**
     * Lê arquivo TXT
     */
    async parseTXT(file, baseData) {
        const text = await file.text();
        baseData.extractedText = text;
        baseData.preview = '📄';
        return baseData;
    },

    /**
     * Processa imagem (converte para base64)
     */
    async parseImage(file, baseData) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                const base64 = e.target.result.split(',')[1];
                baseData.base64 = base64;
                baseData.extractedText = `[Imagem: ${file.name} (${this.formatSize(file.size)})]`;
                baseData.preview = '🖼️';
                resolve(baseData);
            };
            
            reader.onerror = () => {
                reject(new Error('Erro ao ler imagem'));
            };
            
            reader.readAsDataURL(file);
        });
    },

    /**
     * Obtém ícone para o tipo de arquivo
     */
    getFileIcon(file) {
        const ext = file.name.split('.').pop().toLowerCase();
        const icons = {
            pdf: '📄',
            docx: '📝',
            doc: '📝',
            xlsx: '📊',
            xls: '📊',
            csv: '📊',
            txt: '📃',
            png: '🖼️',
            jpg: '🖼️',
            jpeg: '🖼️',
            gif: '🖼️',
            webp: '🖼️'
        };
        return icons[ext] || '📎';
    },

    /**
     * Formata tamanho do arquivo
     */
    formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }
};

// Inicializar
DocumentParser.init();