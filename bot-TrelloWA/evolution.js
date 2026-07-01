const axios = require('axios');
const express = require('express');

let isConnected = false;
let messageHandler = null;

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL;
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;
const INSTANCE_NAME = process.env.EVOLUTION_INSTANCE_NAME;

async function checkConnection() {
    try {
        const response = await axios.get(`${EVOLUTION_API_URL}/instance/connectionState/${INSTANCE_NAME}`, {
            headers: { 'apikey': EVOLUTION_API_KEY }
        });

        isConnected = response.data?.instance?.state === 'open';
        console.log(`🔌 Status da instância: ${isConnected ? 'Conectada' : 'Desconectada'}`);
        return isConnected;
    } catch (error) {
        console.error('❌ Erro ao verificar conexão:', error.message);
        return false;
    }
}

// ===== WEBHOOK (substitui o polling) =====

async function setupWebhook() {
    try {
        const baseUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 3000}`;
        const webhookUrl = `${baseUrl}/webhook/evolution`;

        console.log(`🔗 Registrando webhook na Evolution API...`);
        console.log(`   URL registrada: ${webhookUrl}`);

        const response = await axios.post(`${EVOLUTION_API_URL}/webhook/set/${INSTANCE_NAME}`, {
            webhook: {
                enabled: true,
                url: webhookUrl,
                byEvents: false,
                base64: false,
                events: [
                    'MESSAGES_UPSERT'
                ]
            }
        }, {
            headers: {
                'apikey': EVOLUTION_API_KEY,
                'Content-Type': 'application/json'
            }
        });

        console.log('✅ Webhook registrado com sucesso na Evolution API');
        console.log(`   Resposta:`, response.data);
        return true;
    } catch (error) {
        console.error('❌ ERRO ao registrar webhook:');
        console.error(`   Status: ${error.response?.status}`);
        console.error(`   Mensagem: ${error.message}`);
        if (error.response?.data) {
            console.error(`   Resposta:`, error.response.data);
        }
        return false;
    }
}

function getWebhookRouter() {
    const router = express.Router();

    router.post('/webhook/evolution', (req, res) => {
        // Responder imediatamente para a Evolution API não dar timeout
        res.sendStatus(200);

        const body = req.body;
        const event = body.event;

        console.log('\n' + '='.repeat(70));
        console.log('🔔 WEBHOOK RECEBIDO');
        console.log('='.repeat(70));
        console.log(`Evento: ${event}`);

        // Aceita tanto 'messages.upsert' quanto 'MESSAGES_UPSERT'
        if (event !== 'messages.upsert' && event !== 'MESSAGES_UPSERT') {
            console.log(`⚠️  Evento não é MESSAGES_UPSERT, ignorando`);
            return;
        }

        const data = body.data;
        if (!data) {
            console.log('⚠️  Dados vazios no webhook');
            return;
        }

        if (!messageHandler) {
            console.warn('⚠️  Message handler não está registrado!');
            return;
        }

        // data pode ser um array de mensagens ou um único objeto
        const messages = Array.isArray(data) ? data : [data];
        const groups = getMonitoredGroups();

        console.log(`📨 ${messages.length} mensagem(ns) recebida(s)`);
        console.log(`📋 ${Object.keys(groups).length} grupo(s) monitorado(s)`);

        for (const msg of messages) {
            // Ignorar mensagens enviadas pelo próprio bot
            if (msg.key?.fromMe) {
                console.log('ℹ️  Mensagem do próprio bot, ignorando');
                continue;
            }

            const remoteJid = msg.key?.remoteJid;
            if (!remoteJid) {
                console.log('⚠️  remoteJid não encontrado na mensagem');
                continue;
            }

            // Verificar se é de um grupo monitorado
            const groupConfig = groups[remoteJid];
            if (!groupConfig) {
                console.log(`ℹ️  Grupo ${remoteJid} não está monitorado`);
                continue;
            }

            const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
            console.log(`✅ Processando: ${groupConfig.nomeIdentificador}`);
            console.log(`   Texto: "${text.substring(0, 60)}${text.length > 60 ? '...' : ''}"`);
            console.log(`   Remetente: ${msg.key?.participant || msg.key?.remoteJid}`);

            // Processar assincronamente
            messageHandler(msg, groupConfig).catch(err => {
                console.error('❌ Erro ao processar mensagem do webhook:', err.message);
            });
        }

        console.log('='.repeat(70) + '\n');
    });

    return router;
}

// ===== INICIALIZAÇÃO =====

async function initialize(handler) {
    messageHandler = handler;

    const connected = await checkConnection();

    if (connected) {
        await setupWebhook();
        await syncGroups();
        console.log('✅ Evolution API inicializada com sucesso');
    } else {
        console.error('❌ Instância não está conectada ao WhatsApp');
        console.log('💡 Verifique se você já escaneou o QR code na Evolution API');
    }

    return connected;
}

// ===== ENVIO E MÍDIA =====

async function sendMessage(to, text, options = {}) {
    try {
        await axios.post(`${EVOLUTION_API_URL}/message/sendText/${INSTANCE_NAME}`, {
            number: to,
            text: text,
            delay: options.delay || 1000
        }, {
            headers: { 'apikey': EVOLUTION_API_KEY }
        });

        console.log(`✅ Mensagem enviada para ${to}`);
        return true;
    } catch (error) {
        console.error(`❌ Erro ao enviar mensagem para ${to}:`, error.message);
        return false;
    }
}

async function downloadMedia(message) {
    try {
        const mediaType = message.message?.imageMessage ? 'image' :
            message.message?.documentMessage ? 'document' : null;

        if (!mediaType) {
            console.log('⚠️  Nenhum tipo de mídia detectado na mensagem');
            return null;
        }

        console.log(`🔄 Baixando ${mediaType}...`);

        const response = await axios.post(`${EVOLUTION_API_URL}/chat/getBase64FromMediaMessage/${INSTANCE_NAME}`, {
            message: message,
            convertToMp4: false
        }, {
            headers: { 
                'apikey': EVOLUTION_API_KEY,
                'Content-Type': 'application/json'
            }
        });

        console.log(`   ✅ Resposta recebida`);
        console.log(`   Tipo de resposta: ${typeof response.data}`);
        console.log(`   Chaves: ${Object.keys(response.data || {}).join(', ')}`);

        // Tenta múltiplos caminhos possíveis para os dados
        const base64Data = response.data?.base64 ||
            response.data?.data?.base64 ||
            response.data?.media?.base64 ||
            (typeof response.data === 'string' ? response.data : null);

        if (!base64Data) {
            console.error('❌ Não foi encontrado base64 na resposta');
            console.error('   Resposta completa:', JSON.stringify(response.data).substring(0, 200));
            return null;
        }

        const filename = message.message?.documentMessage?.fileName || `media_${Date.now()}`;
        const mimetype = message.message?.documentMessage?.mimetype || 'application/octet-stream';

        console.log(`   ✅ Base64 extraído (${(base64Data.length / 1024).toFixed(2)}KB)`);

        return {
            data: base64Data,
            filename: filename,
            mimetype: mimetype
        };

    } catch (error) {
        console.error('❌ ERRO ao baixar mídia:');
        console.error(`   Mensagem: ${error.message}`);
        if (error.response?.status) {
            console.error(`   Status HTTP: ${error.response.status}`);
            console.error(`   Resposta:`, error.response.data);
        }
        return null;
    }
}

// ===== GRUPOS =====

async function syncGroups() {
    try {
        console.log('🔄 Sincronizando grupos...');

        const response = await axios.get(`${EVOLUTION_API_URL}/group/fetchAllGroups/${INSTANCE_NAME}`, {
            headers: { 'apikey': EVOLUTION_API_KEY, 'Content-Type': 'application/json' },
            params: { getParticipants: false }
        });

        const groups = response.data;
        console.log(`📊 Encontrados ${groups.length} grupos no WhatsApp`);

        return groups;
    } catch (error) {
        console.error('❌ Erro ao sincronizar grupos:', error.message);
        return [];
    }
}

function getMonitoredGroups() {
    try {
        const parsed = JSON.parse(process.env.GROUP_CONFIGS_JSON || '{}');
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
        console.error('Erro ao parsear GROUP_CONFIGS_JSON');
        return {};
    }
}

function shutdown() {
    console.log('Evolution API service finalizado');
}

module.exports = {
    checkConnection,
    initialize,
    sendMessage,
    downloadMedia,
    syncGroups,
    getMonitoredGroups,
    getWebhookRouter,
    shutdown,
    isConnected: () => isConnected
};
