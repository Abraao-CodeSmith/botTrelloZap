// __tests__/setup.js
const fs = require('fs');
const path = require('path');

// Garantir que a pasta data existe
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Criar arquivos de dados se não existirem
const processadosFile = path.join(dataDir, 'processados.json');
const emailsFile = path.join(dataDir, 'emails_processados.json');

if (!fs.existsSync(processadosFile)) {
    fs.writeFileSync(processadosFile, JSON.stringify({ mensagens: [], acoesTrello: [] }, null, 2));
}

if (!fs.existsSync(emailsFile)) {
    fs.writeFileSync(emailsFile, JSON.stringify({ emails: [] }, null, 2));
}

// Configurar variáveis de ambiente para testes
process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.EVOLUTION_API_URL = 'http://localhost:8080';
process.env.EVOLUTION_API_KEY = 'test-api-key';
process.env.EVOLUTION_INSTANCE_NAME = 'test-instance';
process.env.TRELLO_KEY = 'test-trello-key';
process.env.TRELLO_TOKEN = 'test-trello-token';
process.env.TRELLO_BOARD_ID = 'test-board-id';
process.env.MEMBER_LASER = 'test-laser-id';
process.env.MEMBER_SILK = 'test-silk-id';
process.env.EMAIL_CHECK_INTERVAL = '60000';
process.env.GMAIL_CLIENT_ID = 'test-client-id';
process.env.GMAIL_CLIENT_SECRET = 'test-client-secret';
process.env.GMAIL_REFRESH_TOKEN = 'test-refresh-token';
process.env.GMAIL_MONITORED_EMAIL = 'test@example.com';
process.env.GMAIL_GROUP_ALERT = 'test-group@g.us';
process.env.GROUP_CONFIGS_JSON = JSON.stringify({
    'test-group@g.us': {
        nomeIdentificador: 'TEST GROUP',
        idListaTrello: 'test-list-id',
        membrosPadrao: ['member1', 'member2'],
        idMembroMonitorado: 'member1'
    }
});

console.log('✅ Setup de testes concluído');