const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const { getSupabase } = require('./data/supabase');

let gmail = null;
let emailTimerId = null;
let isMonitoringEmails = false;
let emailsProcessados = new Set();

const EMAILS_DB_FILE = path.join(__dirname, 'data', 'emails_processados.json');

// Função para carregar emails já processados (Muda cache de array para Set carregado da cloud)
async function loadProcessedEmails() {
    try {
        const supabase = getSupabase();
        // Load recent email IDs
        const { data: emails } = await supabase.from('processed_emails').select('email_id').limit(1000);
        if (emails) {
            emailsProcessados = new Set(emails.map(e => e.email_id));
            console.log(`📧 Carregados ${emailsProcessados.size} emails processados do Supabase`);
        } else {
            console.log('📧 Nenhum email processado anterior encontrado na tabela');
        }
    } catch (e) {
        console.error('❌ Erro na consulta do DB de emails processados: ', e.message);
    }
}

// Função para adicionar email processado na nuvem e no cache
async function addProcessedEmail(emailId) {
    if (!emailsProcessados.has(emailId)) {
        emailsProcessados.add(emailId);
        getSupabase().from('processed_emails').insert([{ email_id: emailId }]).then();
    }
}

// Função para verificar se email já foi processado na cloud (cached mode)
function isEmailProcessed(emailId) {
    return emailsProcessados.has(emailId);
}

// Decodificar base64 URL-safe
function decodeBase64URL(data) {
    try {
        let base64 = data.replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4) base64 += '=';
        return Buffer.from(base64, 'base64').toString('utf-8');
    } catch (e) {
        console.error('Erro ao decodificar base64:', e.message);
        return '[Erro ao decodificar]';
    }
}

// Extrair conteúdo do email
function extractEmailContent(payload) {
    let corpo = '';
    let assunto = '(sem assunto)';
    let remetente = '(remetente desconhecido)';
    let data = '';

    // Extrair headers
    if (payload.headers && Array.isArray(payload.headers)) {
        payload.headers.forEach(header => {
            if (header.name === 'Subject') assunto = header.value;
            if (header.name === 'From') remetente = header.value;
            if (header.name === 'Date') data = header.value;
        });
    }

    // Extrair corpo do email
    if (payload.body && payload.body.data) {
        corpo = decodeBase64URL(payload.body.data);
    } else if (payload.parts && Array.isArray(payload.parts)) {
        // Procurar parte em texto plano
        const parteTexto = payload.parts.find(part => 
            part.mimeType === 'text/plain' && part.body?.data
        );
        
        // Se não encontrar texto plano, procurar HTML
        const parteHTML = !parteTexto ? payload.parts.find(part => 
            part.mimeType === 'text/html' && part.body?.data
        ) : null;
        
        if (parteTexto) {
            corpo = decodeBase64URL(parteTexto.body.data);
        } else if (parteHTML) {
            corpo = decodeBase64URL(parteHTML.body.data);
            // Remover tags HTML
            corpo = corpo.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        }
    }

    // Limitar tamanho do corpo
    if (corpo && corpo.length > 500) {
        corpo = corpo.substring(0, 500) + '...';
    }

    // Formatar data
    let dataFormatada = '';
    if (data) {
        try {
            const dataObj = new Date(data);
            if (!isNaN(dataObj.getTime())) {
                dataFormatada = dataObj.toLocaleString('pt-BR');
            } else {
                dataFormatada = data;
            }
        } catch (e) {
            dataFormatada = data;
        }
    }

    return { assunto, remetente, corpo, dataFormatada };
}

// Inicializar serviço do Gmail
// Inicializar serviço do Gmail
async function initializeGmail() {
    try {
        // Verificar se as credenciais existem
        const clientId = process.env.GMAIL_CLIENT_ID;
        const clientSecret = process.env.GMAIL_CLIENT_SECRET;
        const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
        
        if (!clientId || clientId === 'undefined' || !clientSecret || clientSecret === 'undefined' || !refreshToken || refreshToken === 'undefined') {
            console.error('❌ Credenciais do Gmail não configuradas no .env');
            return false;
        }

        // Em ambiente de teste, não precisamos de credenciais reais
        if (process.env.NODE_ENV === 'test') {
            console.log('📧 Modo teste: Gmail simulado');
            // Criar um mock simples do gmail para testes
            gmail = {
                users: {
                    getProfile: async () => ({ data: { email: 'test@example.com' } }),
                    messages: {
                        list: async () => ({ data: {} }),
                        get: async () => ({ data: { payload: { headers: [], body: { data: '' }, parts: [] } } }),
                        modify: async () => ({})
                    }
                }
            };
            console.log('📧 Serviço de Gmail inicializado com sucesso');
            return true;
        }

        const oauth2Client = new google.auth.OAuth2(
            process.env.GMAIL_CLIENT_ID,
            process.env.GMAIL_CLIENT_SECRET,
            'https://developers.google.com/oauthplayground'
        );

        oauth2Client.setCredentials({
            refresh_token: process.env.GMAIL_REFRESH_TOKEN
        });

        gmail = google.gmail({ version: 'v1', auth: oauth2Client });
        
        // Testar conexão apenas em produção
        if (process.env.NODE_ENV !== 'test') {
            await gmail.users.getProfile({ userId: 'me' });
        }
        
        console.log('📧 Serviço de Gmail inicializado com sucesso');
        return true;
    } catch (error) {
        console.error('❌ Erro ao inicializar Gmail:', error.message);
        if (error.message && error.message.includes('invalid_grant')) {
            console.error('💡 Token de refresh expirado. Obtenha um novo token no Google OAuth Playground');
        }
        return false;
    }
}

// Verificar e processar novos emails
async function checkEmails(evolutionApi) {
    if (!gmail) {
        const initialized = await initializeGmail();
        if (!initialized) return;
    }
    
    try {
        console.log('📧 Verificando novos emails...');
        
        const query = `from:${process.env.GMAIL_MONITORED_EMAIL} is:unread`;
        const response = await gmail.users.messages.list({
            userId: 'me',
            q: query,
            maxResults: 5
        });

        if (!response.data.messages || response.data.messages.length === 0) {
            console.log('📭 Nenhum email novo encontrado');
            return;
        }

        console.log(`📨 Encontrados ${response.data.messages.length} email(s) novo(s)`);

        for (const message of response.data.messages) {
            // Verificar se já foi processado
            if (isEmailProcessed(message.id)) {
                console.log(`⏭️ Email ${message.id} já processado, ignorando`);
                continue;
            }

            // Buscar detalhes do email
            const email = await gmail.users.messages.get({
                userId: 'me',
                id: message.id,
                format: 'full'
            });

            // Extrair conteúdo
            const { assunto, remetente, corpo, dataFormatada } = extractEmailContent(email.data.payload);
            
            // Extrair nome do remetente
            let nomeRemetente = remetente;
            if (remetente.includes('<')) {
                nomeRemetente = remetente.split('<')[0].trim();
            }
            nomeRemetente = nomeRemetente.replace(/"/g, '');

            // Montar mensagem para o WhatsApp
            const mensagem = 
                `📧 *NOVO EMAIL DO CONTATO MONITORADO*\n\n` +
                `👤 *De:* ${nomeRemetente}\n` +
                `📅 *Data:* ${dataFormatada || 'Agora mesmo'}\n` +
                `📌 *Assunto:* ${assunto}\n\n` +
                `📝 *Prévia:*\n${corpo || '[Sem conteúdo]'}\n\n` +
                `🔗 *Acesse:* https://mail.google.com/`;

            // Enviar para o grupo de alerta
            const grupoAlerta = process.env.GMAIL_GROUP_ALERT;
            if (!grupoAlerta) {
                console.error('❌ GMAIL_GROUP_ALERT não configurado');
                return;
            }

            const sent = await evolutionApi.sendMessage(grupoAlerta, mensagem);
            
            if (sent) {
                console.log(`✅ Email processado: ${assunto}`);
                addProcessedEmail(message.id);
                
                // Marcar como lido no Gmail
                await gmail.users.messages.modify({
                    userId: 'me',
                    id: message.id,
                    resource: { removeLabelIds: ['UNREAD'] }
                });
            } else {
                console.log(`⚠️ Falha ao enviar notificação do email: ${assunto}`);
            }
        }
    } catch (error) {
        console.error('❌ Erro na verificação de emails:', error.message);
        if (error.response?.status === 401) {
            console.error('💡 Token expirado, tente reinicializar o serviço');
        }
    }
}

// Iniciar monitoramento periódico
async function startMonitoring(evolutionApi) {
    // Carregar emails já processados do Supabase de imediato
    await loadProcessedEmails();
    
    isMonitoringEmails = true;
    const interval = parseInt(process.env.EMAIL_CHECK_INTERVAL) || 900000;
    
    async function monitorLoop() {
        if (!isMonitoringEmails) return;
        
        await checkEmails(evolutionApi);
        
        // Aguarda o processamento inteiro de verificação de emails terminar, para só então programar o próximo check.
        emailTimerId = setTimeout(monitorLoop, interval);
    }
    
    if (emailTimerId) clearTimeout(emailTimerId);
    
    // Primeira chamada com delay inicialização
    emailTimerId = setTimeout(monitorLoop, 5000); 
    
    console.log(`📧 Monitoramento de email iniciado (intervalo: ${interval/1000} segundos)`);
}

// Parar monitoramento
function stopMonitoring() {
    isMonitoringEmails = false;
    if (emailTimerId) {
        clearTimeout(emailTimerId);
        emailTimerId = null;
        console.log('📧 Monitoramento de email parado');
    }
}

// Exportar funções
module.exports = {
    initializeGmail,
    startMonitoring,
    stopMonitoring,
    checkEmails,
    loadProcessedEmails,
    addProcessedEmail,
    isEmailProcessed
};