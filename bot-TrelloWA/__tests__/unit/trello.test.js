// Aumentar timeout para testes com delays
jest.setTimeout(30000);

const axios = require('axios');
const trelloApi = require('../../trello');

// Mock do axios
jest.mock('axios');

describe('Trello Module', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.resetModules();

        process.env.TRELLO_KEY = 'test-key';
        process.env.TRELLO_TOKEN = 'test-token';
        process.env.MEMBER_LASER = 'laser-id';
        process.env.MEMBER_SILK = 'silk-id';
    });

    const mockGroupConfig = {
        idListaTrello: 'list-id',
        membrosPadrao: ['member1', 'member2']
    };

    describe('createCard', () => {
        test('should create a card successfully', async () => {
            const mockCard = { id: 'card123', name: 'Test Card' };
            axios.post.mockResolvedValue({ data: mockCard });

            const result = await trelloApi.createCard(
                'Test Card',
                '👤 Cliente: João\n⏰ Entrega: hoje 15:00',
                mockGroupConfig
            );

            expect(axios.post).toHaveBeenCalled();
            expect(result).toEqual(mockCard);
        });

        test('should add laser member if description contains "laser"', async () => {
            axios.post.mockResolvedValue({ data: { id: 'card123' } });

            await trelloApi.createCard(
                'Test Card',
                '👤 Cliente: João\nPedido de laser',
                mockGroupConfig
            );

            const callArgs = axios.post.mock.calls[0];
            expect(callArgs[2].params.idMembers).toContain('laser-id');
        });

        test('should add silk member if description contains "silk"', async () => {
            axios.post.mockResolvedValue({ data: { id: 'card123' } });

            await trelloApi.createCard(
                'Test Card',
                '👤 Cliente: João\nPedido de silk',
                mockGroupConfig
            );

            const callArgs = axios.post.mock.calls[0];
            expect(callArgs[2].params.idMembers).toContain('silk-id');
        });
    });

    describe('attachFile', () => {
        test('should attach file to card', async () => {
            // Forçar ambiente de produção para testar o fluxo real
            const originalEnv = process.env.NODE_ENV;
            process.env.NODE_ENV = 'production';

            axios.post.mockResolvedValue({ data: {} });

            const media = {
                data: 'base64encodeddata',
                filename: 'test.pdf',
                mimetype: 'application/pdf'
            };

            const result = await trelloApi.attachFile('card123', media);

            expect(result).toBe(true);
            expect(axios.post).toHaveBeenCalled();

            process.env.NODE_ENV = originalEnv;
        });

        test('should handle invalid media', async () => {
            const result = await trelloApi.attachFile('card123', null);

            expect(result).toBe(false);
        });
    });

    describe('orderList', () => {
        test('should order cards by due date', async () => {
            const mockCards = [
                { id: 'card1', due: '2024-12-25T18:00:00Z' },
                { id: 'card2', due: '2024-12-20T18:00:00Z' },
                { id: 'card3', due: '2024-12-30T18:00:00Z' }
            ];

            axios.get.mockResolvedValue({ data: mockCards });
            axios.put.mockResolvedValue({ data: {} });

            await trelloApi.orderList('list-id');

            // Deve chamar put para cada card (3 vezes)
            expect(axios.put).toHaveBeenCalledTimes(3);
        });

        test('should handle rate limiting with retries', async () => {
            const mockCards = [{ id: 'card1', due: '2024-12-25T18:00:00Z' }];

            axios.get.mockResolvedValue({ data: mockCards });
            // Simular falha na primeira tentativa
            axios.put.mockRejectedValue({ response: { status: 429 } });

            try {
                await trelloApi.orderList('list-id', 1);
            } catch (error) {
                // Esperado que falhe
                expect(axios.put).toHaveBeenCalled();
            }
        });

        test('should handle empty cards list', async () => {
            axios.get.mockResolvedValue({ data: [] });

            await trelloApi.orderList('list-id');

            expect(axios.put).not.toHaveBeenCalled();
        });

        test('should handle cards without due date', async () => {
            const mockCards = [
                { id: 'card1', due: '2024-12-25T18:00:00Z' },
                { id: 'card2', due: null },
                { id: 'card3', due: '2024-12-20T18:00:00Z' }
            ];

            axios.get.mockResolvedValue({ data: mockCards });
            axios.put.mockResolvedValue({ data: {} });

            await trelloApi.orderList('list-id');

            // Deve ordenar apenas cards com due date (card1 e card3)
            expect(axios.put).toHaveBeenCalledTimes(2);
        });
    });
});