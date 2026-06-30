// scripts/setup-data.js
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '../data');

if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log('📁 Pasta data criada');
}

const processadosFile = path.join(dataDir, 'processados.json');
const emailsFile = path.join(dataDir, 'emails_processados.json');

if (!fs.existsSync(processadosFile)) {
    fs.writeFileSync(processadosFile, JSON.stringify({ mensagens: [], acoesTrello: [] }, null, 2));
    console.log('✅ Criado processados.json');
} else {
    console.log('✅ processados.json já existe');
}

if (!fs.existsSync(emailsFile)) {
    fs.writeFileSync(emailsFile, JSON.stringify({ emails: [] }, null, 2));
    console.log('✅ Criado emails_processados.json');
} else {
    console.log('✅ emails_processados.json já existe');
}

console.log('✅ Arquivos de dados configurados!');