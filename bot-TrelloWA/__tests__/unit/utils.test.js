const { 
    sleep, 
    extractDateFromText, 
    formatDate 
} = require('../../utils');

describe('Utils Module', () => {
    describe('sleep function', () => {
        test('should wait for specified milliseconds', async () => {
            const start = Date.now();
            await sleep(100);
            const end = Date.now();
            expect(end - start).toBeGreaterThanOrEqual(90);
        });
    });

    describe('extractDateFromText', () => {
        test('should extract date from text with "hoje"', () => {
            const text = '⏰ Entrega: hoje às 15:30';
            const result = extractDateFromText(text);
            const date = new Date(result);
            
            expect(date.getHours()).toBe(15);
            expect(date.getMinutes()).toBe(30);
        });

        test('should extract date from text with "amanhã"', () => {
            const text = '⏰ Para: amanhã 14:00';
            const result = extractDateFromText(text);
            const date = new Date(result);
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            
            expect(date.getDate()).toBe(tomorrow.getDate());
            expect(date.getHours()).toBe(14);
        });

        test('should return default time (18:00) if no time specified', () => {
            const text = '⏰ Entrega: hoje';
            const result = extractDateFromText(text);
            const date = new Date(result);
            
            expect(date.getHours()).toBe(18);
            expect(date.getMinutes()).toBe(0);
        });

        test('should return current date if no date found', () => {
            const text = 'Mensagem sem data';
            const result = extractDateFromText(text);
            const date = new Date(result);
            const now = new Date();
            
            expect(date.getDate()).toBe(now.getDate());
        });
    });

    describe('formatDate', () => {
        test('should format date correctly', () => {
            const date = '2024-12-25T15:30:00.000Z';
            const formatted = formatDate(date);
            
            expect(formatted).toMatch(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/);
        });
    });
});