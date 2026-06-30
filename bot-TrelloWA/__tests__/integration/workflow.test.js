const axios = require('axios');
const evolutionApi = require('../../evolution');
const trelloApi = require('../../trello');

jest.mock('axios');

describe('Integration Workflow Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        
        process.env.EVOLUTION_API_URL = 'http://localhost:8080';
        process.env.EVOLUTION_API_KEY = 'test-key';
        process.env.EVOLUTION_INSTANCE_NAME = 'test-instance';
        process.env.TRELLO_KEY = 'test-key';
        process.env.TRELLO_TOKEN = 'test-token';
        process.env.GROUP_CONFIGS_JSON = JSON.stringify({
            'test-group@g.us': {
                nomeIdentificador: 'TEST GROUP',
                idListaTrello: 'list-id',
                membrosPadrao: ['member1'],
                idMembroMonitorado: 'member1'
            }
        });
    });

    test('complete workflow: receive message -> create card -> attach file', async () => {
        // Mock do handler de mensagens
        const messageHandler = jest.fn();
        
        // Mock da Evolution API
        axios.get.mockResolvedValue({ data: { connected: true } });
        axios.post.mockResolvedValue({ data: { id: 'card123' } });

        // Inicializar Evolution API
        await evolutionApi.initialize(messageHandler);
        
        // Simular recebimento de mensagem
        const testMessage = {
            key: { id: 'msg123', remoteJid: 'test-group@g.us' },
            message: {
                conversation: '👤 Cliente: João Silva\n⏰ Entrega: hoje 15:00'
            }
        };

        // Processar mensagem
        const groups = evolutionApi.getMonitoredGroups();
        const groupConfig = groups['test-group@g.us'];
        
        // Criar cartão
        const card = await trelloApi.createCard(
            'João Silva',
            testMessage.message.conversation,
            groupConfig
        );

        expect(card.id).toBe('card123');
        expect(axios.post).toHaveBeenCalled();
    });

    test('workflow with media attachment', async () => {
        // Mock de criação de cartão
        axios.post.mockResolvedValueOnce({ data: { id: 'card123' } });
        
        // Mock de anexo
        axios.post.mockResolvedValueOnce({ data: {} });

        const groupConfig = {
            idListaTrello: 'list-id',
            membrosPadrao: ['member1']
        };

        // Criar cartão
        const card = await trelloApi.createCard('Test', 'Test description', groupConfig);
        
        // Anexar mídia
        const media = {
            data: 'base64data',
            filename: 'test.pdf'
        };
        
        const attached = await trelloApi.attachFile(card.id, media);
        
        expect(attached).toBe(true);
    });
});