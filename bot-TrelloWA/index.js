require('dotenv').config();
const express = require('express');
const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');

const evolutionApi = require('./evolution');
const trelloApi = require('./trello');
const emailService = require('./email');
const { extractDateFromText } = require('./utils');
const { getSupabase } = require('./data/supabase');

// ===== CACHE E ESTADO =====
let mensagensCache = new Set();
const activeSessions = new Map();

async function carregarEstadoDoSupabase() {
    try {
        const supabase = getSupabase();

        // Carregar mensagens (limite de 2000 mais recentes)
        const { data: msgs } = await supabase.from('processed_messages')
            .select('message_id').order('created_at', { ascending: false }).limit(2000);

        if (msgs) {
            msgs.forEach(m => mensagensCache.add(m.message_id));
        }

        // Carregar sessões cadastradas
        const { data: sessions } = await supabase.from('active_sessions').select('*');
        if (sessions) {
            sessions.forEach(s => activeSessions.set(s.author_phone, s.trello_card_id));
        }

        console.log(`☁️ Supabase: Cache montado com ${mensagensCache.size} mensagens e ${activeSessions.size} sessões abertas.`);
    } catch (e) {
        console.error('❌ Falha ao tentar sincronizar cache inicial do Supabase:', e.message);
    }
}

// ===== CONFIGURAÇÕES DOS GRUPOS =====
const groups = evolutionApi.getMonitoredGroups();

// ===== HANDLER DE MENSAGENS =====
async function handleMessage(msg, groupConfig) {
    const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
    const author = msg.key?.participant || msg.key?.remoteJid;
    const msgId = msg.key?.id;

    console.log('\n' + '━'.repeat(70));
    console.log('📨 PROCESSANDO MENSAGEM');
    console.log('━'.repeat(70));
    console.log(`ID: ${msgId}`);
    console.log(`Remetente: ${author}`);
    console.log(`Texto: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"`);
    console.log(`Grupo: ${groupConfig?.nomeIdentificador || 'DESCONHECIDO'}`);

    if (!text && !msg.message?.imageMessage && !msg.message?.documentMessage) {
        console.log('⚠️  Mensagem vazia e sem mídia - IGNORANDO');
        return;
    }

    if (mensagensCache.has(msgId)) {
        console.log('⚠️  Mensagem já processada - IGNORANDO');
        return;
    }

    // Criar novo pedido
    if (text.includes('👤 Cliente')) {
        console.log('\n✅ Encontrado "👤 Cliente" - Criando cartão!');

        const nameMatch = text.match(/👤 Cliente[:\s]*(.*)/i);
        const cardName = nameMatch ? nameMatch[1].trim() : 'Novo Pedido';

        console.log(`   Nome do cartão: "${cardName}"`);
        console.log(`   ID da lista: ${groupConfig?.idListaTrello || 'NÃO CONFIGURADO'}`);

        try {
            console.log('🔄 Chamando trelloApi.createCard()...');
            const card = await trelloApi.createCard(cardName, text, groupConfig);

            if (!card || !card.id) {
                console.error('❌ Card foi criado mas sem ID válido');
                console.error('   Resposta:', card);
                return;
            }

            console.log('✅ SUCESSO! Cartão criado:');
            console.log(`   Card ID: ${card.id}`);
            console.log(`   URL: ${card.url || 'N/A'}`);

            mensagensCache.add(msgId);
            const supabase = getSupabase();
            supabase.from('processed_messages').insert([{ message_id: msgId }]).then().catch(err => console.error('Erro no Supabase (Mensagens):', err.message));

            // IMPORTANTE: Salvar sessão ativa EXATAMENTE com o autor da mensagem
            activeSessions.set(author, card.id);
            console.log(`   🔐 Sessão ativa criada para: ${author} -> Card: ${card.id}`);

            supabase.from('active_sessions').upsert([{ author_phone: author, trello_card_id: card.id }]).then().catch(err => console.error('Erro no Supabase (Sessões):', err.message));

            // ✅ NÃO ENVIAR MENSAGEM PARA O WHATSAPP - SÓ LOG NO TERMINAL
            console.log('✅ Cartão pronto para receber anexos (imagens/documentos)');

        } catch (error) {
            console.error('❌ ERRO ao criar cartão:');
            console.error(`   Mensagem: ${error.message}`);
            if (error.response?.data) {
                console.error(`   Resposta:`, error.response.data);
            }
            console.error(`   Stack:`, error.stack);
        }

        console.log('━'.repeat(70) + '\n');
        return;
    }

    // Anexar mídia
    const activeCardId = activeSessions.get(author);

    if (msg.message?.imageMessage || msg.message?.documentMessage) {
        console.log('\n📎 MÍDIA DETECTADA');
        console.log('━'.repeat(70));

        if (!activeCardId) {
            console.log('⚠️  Nenhuma sessão ativa para este usuário');
            console.log(`   Remetente (ID): ${author}`);
            console.log(`   Sessões ativas no momento: ${Array.from(activeSessions.keys()).join(', ') || 'nenhuma'}`);
            console.log('   💡 Para anexar, o mesmo usuário que criou o cartão ("👤 Cliente") deve enviar a imagem.');
            console.log('━'.repeat(70) + '\n');
            return;
        }

        console.log(`✅ Sessão ativa encontrada: ${activeCardId}`);

        // 1. Validação PRÉVIA (Evita baixar o arquivo desnecessariamente economizando CPU/Memória)
        const fileLength = msg.message?.imageMessage?.fileLength || msg.message?.documentMessage?.fileLength;
        const declaredSizeInBytes = fileLength ? parseInt(fileLength, 10) : 0;
        const limitBytes = 10 * 1024 * 1024; // 10MB
        const declaredSizeMB = declaredSizeInBytes ? (declaredSizeInBytes / 1024 / 1024).toFixed(2) : null;

        if (declaredSizeInBytes > 0) {
            console.log(`[VERIFICAÇÃO DE LIMITE PRÉVIA] FileLength declarado: ${declaredSizeMB}MB`);
            if (declaredSizeInBytes > limitBytes) {
                console.warn(`❌ [REJEITADO] O arquivo excede o limite estrito do Trello (Limite: 10MB | Declarado: ${declaredSizeMB}MB)`);
                console.warn(`⚠️  Download cancelado para evitar consumo de memória.`);
                console.log('━'.repeat(70) + '\n');
                return;
            }
            console.log(`   [APROVADO] Tamanho declarado dentro do limite.`);
        } else {
            console.log(`ℹ️ [VERIFICAÇÃO DE LIMITE PRÉVIA] Tamanho não declarado. Procedendo com checagem pós-download.`);
        }

        try {
            console.log('🔄 Baixando mídia...');
            const media = await evolutionApi.downloadMedia(msg);

            if (!media) {
                console.error('❌ Falha ao baixar mídia (downloadMedia retornou null)');
                console.log('━'.repeat(70) + '\n');
                return;
            }

            if (!media.data) {
                console.error('❌ Mídia baixada mas sem dados base64');
                console.log('━'.repeat(70) + '\n');
                return;
            }

            // 2. Validação PÓS-DOWNLOAD (Segurança dupla sobre o tamanho real em base64)
            const sizeInBytes = (media.data.length * 3) / 4;
            const sizeMB = (sizeInBytes / 1024 / 1024).toFixed(2);

            console.log(`[VERIFICAÇÃO DE LIMITE PÓS-DOWNLOAD]`);
            console.log(`   Nome do arquivo: ${media.filename}`);
            console.log(`   MIME type: ${media.mimetype}`);
            console.log(`   Tamanho real: ${sizeMB}MB / 10MB`);

            if (sizeInBytes > limitBytes) {
                console.warn(`❌ [REJEITADO] O arquivo decodificado excede o limite do Trello (${sizeMB}MB > 10MB)`);
                console.log('━'.repeat(70) + '\n');
                return;
            }

            console.log(`   [APROVADO] Procedendo com anexação...`);
            console.log('🔄 Anexando arquivo ao cartão...');
            await trelloApi.attachFile(activeCardId, media);

            console.log('✅ SUCESSO! Arquivo anexado ao cartão');
            console.log(`   Card: ${activeCardId}`);
            console.log(`   Arquivo: ${media.filename}`);

        } catch (error) {
            console.error('❌ ERRO ao processar mídia:');
            console.error(`   Mensagem: ${error.message}`);
            if (error.response?.data) {
                console.error(`   Resposta:`, error.response.data);
            }
            console.error(`   Stack:`, error.stack);
        }

        console.log('━'.repeat(70) + '\n');
        return;
    }

    // Finalizar sessão
    if (/^[xX]+$/.test(text) && activeSessions.has(author)) {
        console.log('\n✅ Comando "XXX" detectado - Finalizando sessão');
        console.log('━'.repeat(70));

        const cardId = activeSessions.get(author);
        activeSessions.delete(author);
        getSupabase().from('active_sessions').delete().eq('author_phone', author).then().catch(err => console.error('Erro no Supabase (Deletar Sessões):', err.message));

        trelloApi.debouncedOrder(groupConfig.idListaTrello);

        console.log(`✅ Sessão finalizada`);
        console.log(`   Usuário: ${author}`);
        console.log(`   Card: ${cardId}`);
        console.log('━'.repeat(70) + '\n');

        // ✅ NÃO ENVIAR MENSAGEM PARA O WHATSAPP - SÓ LOG NO TERMINAL
    }

    console.log('━'.repeat(70) + '\n');
}

// ===== SERVIDOR EXPRESS =====
const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ===== REGISTRAR WEBHOOK ROUTER =====
app.use(evolutionApi.getWebhookRouter());

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        evolutionConnected: evolutionApi.isConnected(),
        messagesProcessed: mensagensCache.size
    });
});

app.get('/status', (req, res) => {
    res.json({
        groups: Object.keys(groups),
        activeSessions: Array.from(activeSessions.keys()),
        cacheSize: {
            messages: mensagensCache.size
        },
        limits: {
            maxFileSizeTrello: '10MB',
            maxPayloadExpress: '50MB'
        }
    });
});

app.post('/webhook/trello', async (req, res) => {
    const action = req.body.action;
    if (!action) return res.sendStatus(200);

    console.log('📨 Webhook do Trello:', action.type, action.data?.card?.name);

    res.sendStatus(200);
});

// Middleware Global de Tratamento de Erros (Captura Erro 413 do bodyParser)
app.use((err, req, res, next) => {
    if (err.status === 413) {
        console.error('\n❌ [EXPRESS] Requisição rejeitada: Payload maior que 50MB (Express Limit Exceeded)');
        return res.status(413).json({
            error: 'Payload Too Large',
            message: 'O arquivo enviado excede o limite máximo permitido pelo servidor de 50MB.',
            limit: '50mb'
        });
    }
    console.error('\n❌ [EXPRESS] Erro não tratado:', err.message);
    res.status(500).json({ error: 'Internal Server Error' });
});

// ===== INÍCIO DO BOT =====
async function main() {
    if (!process.env.EVOLUTION_API_URL || !process.env.EVOLUTION_API_KEY || !process.env.TRELLO_KEY || !process.env.TRELLO_TOKEN || !process.env.EVOLUTION_INSTANCE_NAME) {
        console.error('❌ Variáveis de ambiente críticas ausentes (Verifique EVOLUTION_INSTANCE_NAME)');
        process.exit(1);
    }

    console.log('🚀 Iniciando Bot Trello-WA v3.0...');
    console.log('📌 Ambiente:', process.env.NODE_ENV || 'development');

    // Testar e carregar BD remoto antes da API Evolution ligar
    await carregarEstadoDoSupabase();

    // Iniciar servidor Express
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`🌐 Servidor rodando na porta ${PORT}`);
        console.log(`   Health check: http://localhost:${PORT}/health`);
        console.log(`   Status: http://localhost:${PORT}/status`);
    });

    // Inicializar Evolution API
    const initialized = await evolutionApi.initialize(handleMessage);
    if (!initialized) {
        console.error('❌ Falha ao inicializar Evolution API');
        console.log('Verifique se:');
        console.log('1. Evolution API está rodando em:', process.env.EVOLUTION_API_URL);
        console.log('2. API_KEY está correta');
        console.log('3. Instância existe e está conectada');
        console.warn('⚠️ O servidor continuará rodando para manter a porta aberta no Render, mas a integração do WhatsApp não funcionará até ser consertada.');
    }

    // Inicializar serviço de email
    await emailService.initializeGmail();
    emailService.startMonitoring(evolutionApi);

    console.log('\n✅ Bot pronto e funcionando!');
    console.log(`📊 Grupos monitorados: ${Object.keys(groups).length}`);
    console.log('📡 Aguardando webhooks...\n');
    console.log('━'.repeat(70));
    console.log('💡 Comandos:');
    console.log('   👤 Cliente [Nome] - Criar novo pedido');
    console.log('   [Enviar imagem/documento] - Anexar ao cartão ativo');
    console.log('   XXX - Finalizar sessão');
    console.log('━'.repeat(70) + '\n');
}

// Tratamento de encerramento
process.on('SIGINT', () => {
    console.log('\n🛑 Encerrando bot...');
    evolutionApi.shutdown();
    emailService.stopMonitoring();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Encerrando bot...');
    evolutionApi.shutdown();
    emailService.stopMonitoring();
    process.exit(0);
});

// Executar
main().catch(error => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
});
