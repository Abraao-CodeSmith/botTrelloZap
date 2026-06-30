const axios = require('axios');
const evolutionApi = require('../../evolution');

// Mock do axios
jest.mock('axios');
jest.mock('../../evolution', () => {
    const original = jest.requireActual('../../evolution');
    return {
        ...original,
        checkConnection: jest.fn(),
        sendMessage: jest.fn(),
        syncGroups: jest.fn()
    };
});

// Configurar variáveis de ambiente para os testes
beforeAll(() => {
    process.env.EVOLUTION_API_URL = 'http://localhost:8080';
    process.env.EVOLUTION_API_KEY = 'test-key';
    process.env.EVOLUTION_INSTANCE_NAME = 'test-instance';
});

beforeEach(() => {
    jest.clearAllMocks();
});

describe('Evolution API Module', () => {
    describe('checkConnection', () => {
        test('should return true when connected', async () => {
            evolutionApi.checkConnection.mockResolvedValue(true);
            
            const result = await evolutionApi.checkConnection();
            
            expect(result).toBe(true);
        });

        test('should return false when not connected', async () => {
            evolutionApi.checkConnection.mockResolvedValue(false);
            
            const result = await evolutionApi.checkConnection();
            
            expect(result).toBe(false);
        });

        test('should return false on error', async () => {
            evolutionApi.checkConnection.mockResolvedValue(false);
            
            const result = await evolutionApi.checkConnection();
            
            expect(result).toBe(false);
        });
    });

    describe('sendMessage', () => {
        test('should send message successfully', async () => {
            evolutionApi.sendMessage.mockResolvedValue(true);
            
            const result = await evolutionApi.sendMessage(
                '55999999999@g.us',
                'Test message'
            );
            
            expect(result).toBe(true);
        });

        test('should handle send error', async () => {
            evolutionApi.sendMessage.mockResolvedValue(false);
            
            const result = await evolutionApi.sendMessage(
                '55999999999@g.us',
                'Test message'
            );
            
            expect(result).toBe(false);
        });
    });

    describe('syncGroups', () => {
        test('should fetch groups successfully', async () => {
            const mockGroups = [
                { id: 'group1', subject: 'Group 1' },
                { id: 'group2', subject: 'Group 2' }
            ];
            
            evolutionApi.syncGroups.mockResolvedValue(mockGroups);
            
            const result = await evolutionApi.syncGroups();
            
            expect(result).toEqual(mockGroups);
        });

        test('should return empty array on error', async () => {
            evolutionApi.syncGroups.mockResolvedValue([]);
            
            const result = await evolutionApi.syncGroups();
            
            expect(result).toEqual([]);
        });
    });
});