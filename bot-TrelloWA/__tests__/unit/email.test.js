const emailService = require('../../email');
const evolutionApi = require('../../evolution');

// Mocks simplificados
jest.mock('../../evolution');
jest.mock('googleapis', () => ({
    google: {
        auth: {
            OAuth2: jest.fn().mockImplementation(() => ({
                setCredentials: jest.fn()
            }))
        },
        gmail: jest.fn().mockReturnValue({
            users: {
                getProfile: jest.fn().mockResolvedValue({ data: { email: 'test@example.com' } }),
                messages: {
                    list: jest.fn().mockResolvedValue({ data: {} }),
                    get: jest.fn(),
                    modify: jest.fn()
                }
            }
        })
    }
}));

jest.mock('fs', () => ({
    existsSync: jest.fn().mockReturnValue(true),
    readFileSync: jest.fn().mockReturnValue(JSON.stringify({ emails: [] })),
    writeFileSync: jest.fn(),
    mkdirSync: jest.fn()
}));

describe('Email Module', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        
        // Configurar variáveis de ambiente
        process.env.GMAIL_CLIENT_ID = 'test-client-id';
        process.env.GMAIL_CLIENT_SECRET = 'test-client-secret';
        process.env.GMAIL_REFRESH_TOKEN = 'test-refresh-token';
        process.env.GMAIL_MONITORED_EMAIL = 'test@example.com';
        process.env.GMAIL_GROUP_ALERT = 'test-group@g.us';
        process.env.EMAIL_CHECK_INTERVAL = '60000';
        process.env.NODE_ENV = 'test';
        
        // Mock do evolutionApi
        evolutionApi.sendMessage = jest.fn().mockResolvedValue(true);
    });

    describe('initializeGmail', () => {
        test('should initialize Gmail service successfully', async () => {
            const result = await emailService.initializeGmail();
            
            expect(result).toBe(true);
        });

        test('should handle missing credentials', async () => {
            const originalClientId = process.env.GMAIL_CLIENT_ID;
            process.env.GMAIL_CLIENT_ID = undefined;
            
            const result = await emailService.initializeGmail();
            
            expect(result).toBe(false);
            
            process.env.GMAIL_CLIENT_ID = originalClientId;
        });
    });

    describe('checkEmails', () => {
        test('should handle no new messages', async () => {
            await emailService.initializeGmail();
            await emailService.checkEmails(evolutionApi);
            
            expect(evolutionApi.sendMessage).not.toHaveBeenCalled();
        });
    });

    describe('startMonitoring', () => {
        test('should start email monitoring', () => {
            const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
            
            emailService.startMonitoring(evolutionApi);
            
            expect(setTimeoutSpy).toHaveBeenCalled();
            setTimeoutSpy.mockRestore();
        });
        
        test('should stop email monitoring', () => {
            const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
            
            emailService.startMonitoring(evolutionApi);
            emailService.stopMonitoring();
            
            expect(clearTimeoutSpy).toHaveBeenCalled();
            clearTimeoutSpy.mockRestore();
        });
    });
});