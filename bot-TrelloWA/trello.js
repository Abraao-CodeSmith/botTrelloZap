const axios = require('axios');
const FormData = require('form-data');
const { extractDateFromText } = require('./utils');

// Configurações
const TRELLO_KEY = process.env.TRELLO_KEY;
const TRELLO_TOKEN = process.env.TRELLO_TOKEN;
const MEMBRO_LASER = process.env.MEMBER_LASER;
const MEMBRO_SILK = process.env.MEMBER_SILK;

// Controle de ordenação pendente
const pendingOrders = {};

async function createCard(nome, desc, groupConfig) {
    let membros = [...groupConfig.membrosPadrao];
    const descLower = desc.toLowerCase();

    if (descLower.includes('laser') || descLower.includes('gravação') || descLower.includes('gravacao')) {
        if (!membros.includes(MEMBRO_LASER)) membros.push(MEMBRO_LASER);
    }
    if (descLower.includes('silk') || descLower.includes('serigrafia')) {
        if (!membros.includes(MEMBRO_SILK)) membros.push(MEMBRO_SILK);
    }

    const dataEntrega = extractDateFromText(desc);

    const response = await axios.post(`https://api.trello.com/1/cards`, null, {
        params: {
            key: TRELLO_KEY,
            token: TRELLO_TOKEN,
            name: nome,
            desc: desc,
            due: dataEntrega,
            idList: groupConfig.idListaTrello,
            idMembers: membros.join(','),
            pos: 'top'
        }
    });

    console.log(`✅ Cartão criado: ${nome}`);
    return response.data;
}

async function attachFile(cardId, media) {
    try {
        // Verificar se media é válido
        if (!media?.data) {
            console.error('❌ Mídia inválida para anexar');
            return false;
        }

        // Em ambiente de teste, simular sucesso
        if (process.env.NODE_ENV === 'test') {
            console.log(`📎 [TESTE] Arquivo simulado anexado ao cartão ${cardId}`);
            return true;
        }

        console.log(`🔄 Preparando arquivo para anexação...`);
        console.log(`   Card ID: ${cardId}`);
        console.log(`   Nome: ${media.filename}`);
        console.log(`   MIME: ${media.mimetype}`);

        // Criar FormData
        const form = new FormData();
        const buffer = Buffer.from(media.data, 'base64');

        console.log(`   Tamanho do buffer: ${(buffer.length / 1024 / 1024).toFixed(2)}MB`);

        // Adicionar arquivo ao FormData
        form.append('file', buffer, {
            filename: media.filename || `anexo_${Date.now()}`,
            contentType: media.mimetype || 'application/octet-stream'
        });

        console.log('🔄 Enviando para Trello...');

        // ✅ IMPORTANTE: Usar form.getHeaders() para que Axios configure o boundary automaticamente
        const response = await axios.post(
            `https://api.trello.com/1/cards/${cardId}/attachments`,
            form,
            {
                params: {
                    key: TRELLO_KEY,
                    token: TRELLO_TOKEN
                },
                headers: form.getHeaders(),  // ✅ Isso configura o boundary corretamente!
                maxContentLength: Infinity,  // Permitir arquivos grandes
                maxBodyLength: Infinity      // Permitir corpo grande
            }
        );

        console.log(`✅ Arquivo anexado com sucesso!`);
        console.log(`   ID do anexo: ${response.data.id}`);
        console.log(`   URL: ${response.data.url}`);

        return true;

    } catch (error) {
        console.error('❌ ERRO ao anexar arquivo:');
        console.error(`   Mensagem: ${error.message}`);

        if (error.response?.status) {
            console.error(`   Status HTTP: ${error.response.status}`);
            console.error(`   Resposta:`, error.response.data);
        }

        if (error.code === 'ECONNREFUSED') {
            console.error('   💡 Conexão recusada - verifique se consegue acessar api.trello.com');
        }

        console.error(`   Stack:`, error.stack.substring(0, 300));

        return false;
    }
}

async function orderList(listId, retries = 3) {
    try {
        const response = await axios.get(`https://api.trello.com/1/lists/${listId}/cards`, {
            params: {
                key: TRELLO_KEY,
                token: TRELLO_TOKEN
            }
        });

        const cards = response.data.filter(c => c.due);
        if (cards.length <= 1) return;

        cards.sort((a, b) => new Date(a.due) - new Date(b.due));

        for (let i = 0; i < cards.length; i++) {
            await axios.put(`https://api.trello.com/1/cards/${cards[i].id}`, null, {
                params: {
                    key: TRELLO_KEY,
                    token: TRELLO_TOKEN,
                    pos: i + 1
                }
            });
            await new Promise(resolve => setTimeout(resolve, 300));
        }

        console.log(`⚖️ Lista ${listId} ordenada com sucesso`);
        return true;
    } catch (error) {
        if (error.response?.status === 429 && retries > 0) {
            console.warn(`⏳ Rate limit do Trello. Tentando novamente em 10s... (${retries})`);
            await new Promise(resolve => setTimeout(resolve, 10000));
            return orderList(listId, retries - 1);
        }
        console.error('❌ Erro ao ordenar lista:', error.message);
        return false;
    }
}

function debouncedOrder(listId, delay = 5000) {
    if (pendingOrders[listId]) return;

    pendingOrders[listId] = true;
    setTimeout(async () => {
        try {
            await orderList(listId);
        } finally {
            delete pendingOrders[listId];
        }
    }, delay);
}

async function getCardDetails(cardId) {
    try {
        const response = await axios.get(`https://api.trello.com/1/cards/${cardId}`, {
            params: {
                key: TRELLO_KEY,
                token: TRELLO_TOKEN
            }
        });
        return response.data;
    } catch (error) {
        console.error(`❌ Erro ao buscar detalhes do cartão:`, error.message);
        throw error;
    }
}

module.exports = {
    createCard,
    attachFile,
    orderList,
    debouncedOrder,
    getCardDetails
};