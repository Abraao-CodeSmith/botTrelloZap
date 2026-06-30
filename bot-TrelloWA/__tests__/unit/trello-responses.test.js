const trelloResponses = require('../fixtures/trello-responses.json');

describe('Trello Responses Fixtures', () => {
    test('should have valid createCard responses', () => {
        expect(trelloResponses.createCard).toHaveProperty('success');
        expect(trelloResponses.createCard.success).toHaveProperty('id');
        expect(trelloResponses.createCard.success).toHaveProperty('name');
        expect(trelloResponses.createCard).toHaveProperty('error');
        expect(trelloResponses.createCard).toHaveProperty('rateLimit');
    });
    
    test('should have valid getCards responses', () => {
        expect(trelloResponses.getCards).toHaveProperty('unordered');
        expect(trelloResponses.getCards).toHaveProperty('ordered');
        expect(trelloResponses.getCards.unordered).toHaveLength(3);
        expect(trelloResponses.getCards.ordered).toHaveLength(3);
    });
    
    test('should have valid webhook examples', () => {
        expect(trelloResponses.webhook).toHaveProperty('createCard');
        expect(trelloResponses.webhook).toHaveProperty('updateCard');
        expect(trelloResponses.webhook).toHaveProperty('commentCard');
        
        const createCard = trelloResponses.webhook.createCard;
        expect(createCard.action).toHaveProperty('type', 'createCard');
        expect(createCard.action.data).toHaveProperty('card');
    });
    
    test('should have valid member IDs', () => {
        expect(trelloResponses.members).toHaveProperty('padrao');
        expect(trelloResponses.members).toHaveProperty('laser');
        expect(trelloResponses.members).toHaveProperty('silk');
        expect(Array.isArray(trelloResponses.members.padrao)).toBe(true);
    });
});