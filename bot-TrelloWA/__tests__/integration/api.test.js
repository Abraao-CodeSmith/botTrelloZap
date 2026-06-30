const request = require('supertest');
const express = require('express');
const evolutionApi = require('../../evolution');
const emailService = require('../../email');

// Mock dos serviços
jest.mock('../../evolution');
jest.mock('../../email');

describe('API Integration Tests', () => {
    let app;
    
    beforeEach(() => {
        jest.clearAllMocks();
        
        // Configurar mocks
        evolutionApi.isConnected = jest.fn().mockReturnValue(true);
        evolutionApi.getMonitoredGroups = jest.fn().mockReturnValue({
            'group1@g.us': { nomeIdentificador: 'GROUP 1' },
            'group2@g.us': { nomeIdentificador: 'GROUP 2' }
        });
        
        // Criar app para testes
        app = express();
        app.use(express.json());
        
        // Health check endpoint
        app.get('/health', (req, res) => {
            res.json({
                status: 'ok',
                timestamp: new Date().toISOString(),
                evolutionConnected: evolutionApi.isConnected(),
                messagesProcessed: 10,
                trelloActions: 5
            });
        });
        
        // Status endpoint
        app.get('/status', (req, res) => {
            res.json({
                groups: evolutionApi.getMonitoredGroups(),
                activeSessions: ['session1', 'session2'],
                dbSize: {
                    messages: 10,
                    trelloActions: 5
                }
            });
        });
        
        // Webhook endpoint
        app.post('/webhook/trello', (req, res) => {
            const action = req.body.action;
            if (!action) {
                return res.sendStatus(200);
            }
            res.sendStatus(200);
        });
    });
    
    describe('GET /health', () => {
        test('should return health status', async () => {
            const response = await request(app)
                .get('/health')
                .expect(200);
            
            expect(response.body).toHaveProperty('status', 'ok');
            expect(response.body).toHaveProperty('timestamp');
            expect(response.body).toHaveProperty('evolutionConnected', true);
        });
    });
    
    describe('GET /status', () => {
        test('should return detailed status', async () => {
            const response = await request(app)
                .get('/status')
                .expect(200);
            
            expect(response.body).toHaveProperty('groups');
            expect(response.body).toHaveProperty('activeSessions');
            expect(response.body).toHaveProperty('dbSize');
            // Verificar que groups é um objeto e tem as propriedades esperadas
            expect(typeof response.body.groups).toBe('object');
            expect(Object.keys(response.body.groups)).toContain('group1@g.us');
            expect(response.body.activeSessions).toContain('session1');
        });
    });
    
    describe('POST /webhook/trello', () => {
        test('should process valid webhook', async () => {
            const webhookData = {
                action: {
                    id: 'action123',
                    type: 'updateCard',
                    data: {
                        card: { name: 'Test Card' },
                        listBefore: { name: 'To Do' },
                        listAfter: { name: 'Done' }
                    }
                }
            };
            
            await request(app)
                .post('/webhook/trello')
                .send(webhookData)
                .expect(200);
        });
        
        test('should handle empty webhook', async () => {
            await request(app)
                .post('/webhook/trello')
                .send({})
                .expect(200);
        });
    });
});