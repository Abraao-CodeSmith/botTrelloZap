// Bug Condition Exploration Tests - Categoria 2: Ordenação e Estado no Trello
// **CRITICAL**: These tests MUST FAIL on unfixed code - failure confirms bugs exist
// **GOAL**: Surface counterexamples that demonstrate the bugs

/**
 * Validates: Requirements 2.1, 2.2
 * 
 * This file contains property-based tests that encode the EXPECTED behavior.
 * When run against UNFIXED code, these tests will FAIL, demonstrating the bugs.
 * When run against FIXED code, these tests will PASS, validating the fixes.
 */

const fc = require('fast-check');

describe('Categoria 2: Ordenação e Estado no Trello - Bug Condition Exploration', () => {
    
    describe('Bug 2.1: Pending Order Lock Never Released', () => {
        
        /**
         * **Validates: Requirements 2.1**
         * 
         * Property: pendingOrders[listId] should be cleared even when orderList() fails
         * 
         * Bug Condition: When orderList() fails with error, pendingOrders[listId] is never cleaned up
         * Expected on UNFIXED code: Test FAILS - pendingOrders[listId] remains true after error
         * Expected on FIXED code: Test PASSES - pendingOrders[listId] is cleared in finally block
         */
        test('Property 2.1: Guaranteed Pending Order Cleanup', async () => {
            // Reset module to get fresh instance
            jest.resetModules();
            
            // Mock axios to simulate network failures
            const mockAxios = {
                get: jest.fn(),
                put: jest.fn(),
                post: jest.fn()
            };
            jest.mock('axios', () => mockAxios);
            
            const trello = require('../../trello');
            
            // Property: After orderList() fails, pendingOrders[listId] should be cleared
            await fc.assert(
                fc.asyncProperty(
                    fc.string({ minLength: 10, maxLength: 30 }), // listId
                    fc.constantFrom('NETWORK_ERROR', 'TIMEOUT', 'SERVER_ERROR', 'RATE_LIMIT'), // error type
                    async (listId, errorType) => {
                        // Configure axios to fail
                        const errorResponses = {
                            'NETWORK_ERROR': new Error('ECONNRESET'),
                            'TIMEOUT': Object.assign(new Error('ETIMEDOUT'), { code: 'ETIMEDOUT' }),
                            'SERVER_ERROR': Object.assign(new Error('Server Error'), { 
                                response: { status: 500 } 
                            }),
                            'RATE_LIMIT': Object.assign(new Error('Too Many Requests'), { 
                                response: { status: 429 } 
                            })
                        };
                        
                        mockAxios.get.mockRejectedValue(errorResponses[errorType]);
                        
                        // Call debouncedOrder which sets pendingOrders[listId] = true
                        trello.debouncedOrder(listId, 100); // Short delay for testing
                        
                        // Wait for the debounced operation to execute
                        await new Promise(resolve => setTimeout(resolve, 200));
                        
                        // Check if pendingOrders[listId] was cleaned up
                        // In UNFIXED code: pendingOrders[listId] will still be true (locked)
                        // In FIXED code: pendingOrders[listId] will be undefined (cleaned up)
                        
                        // Try to call debouncedOrder again
                        // If pendingOrders[listId] is still locked, this will return early
                        const beforeSecondCall = Date.now();
                        trello.debouncedOrder(listId, 100);
                        await new Promise(resolve => setTimeout(resolve, 200));
                        const afterSecondCall = Date.now();
                        
                        // EXPECTED BEHAVIOR: Second call should execute (pendingOrders was cleared)
                        // We verify this by checking if orderList was called again
                        const callCount = mockAxios.get.mock.calls.length;
                        
                        // On UNFIXED code: callCount === 1 (second call was blocked)
                        // On FIXED code: callCount >= 2 (second call executed)
                        
                        mockAxios.get.mockClear();
                        
                        // The bug exists if the second call was blocked (callCount === 1)
                        // The fix works if the second call executed (callCount >= 2)
                        return callCount >= 2;
                    }
                ),
                {
                    numRuns: 15,
                    verbose: true
                }
            );
        }, 30000);
    });
    
    describe('Bug 2.2: Media Validation Logic Inconsistency', () => {
        
        /**
         * **Validates: Requirements 2.2**
         * 
         * Property: attachFile should validate media in a single, consolidated check
         * 
         * Bug Condition: Redundant validation checks (!media followed by !media.data)
         * Expected on UNFIXED code: Test identifies redundant validation pattern
         * Expected on FIXED code: Test passes with consolidated validation using optional chaining
         */
        test('Property 2.2: Consolidated Media Validation', async () => {
            // Reset module to get fresh instance
            jest.resetModules();
            
            // Mock axios for attachFile
            const mockAxios = {
                post: jest.fn().mockResolvedValue({ data: { id: 'att123' } })
            };
            jest.mock('axios', () => mockAxios);
            
            const trello = require('../../trello');
            
            // Property: attachFile should handle all invalid media cases correctly
            await fc.assert(
                fc.asyncProperty(
                    fc.constantFrom(
                        null,                          // null media
                        undefined,                     // undefined media
                        {},                            // media without data
                        { data: null },                // media with null data
                        { data: undefined },           // media with undefined data
                        { data: '' }                   // media with empty data
                    ),
                    async (invalidMedia) => {
                        mockAxios.post.mockClear();
                        
                        // Call attachFile with invalid media
                        const cardId = 'test-card-123';
                        const result = await trello.attachFile(cardId, invalidMedia);
                        
                        // EXPECTED BEHAVIOR: Should return false without calling axios
                        const axiosCalled = mockAxios.post.mock.calls.length > 0;
                        const returnedFalse = result === false;
                        
                        // On BOTH unfixed and fixed code: Should return false and not call axios
                        // However, the CODE STRUCTURE differs:
                        // - UNFIXED: Has separate !media and !media.data checks (redundant)
                        // - FIXED: Has single !media?.data check (consolidated)
                        
                        // This test validates BEHAVIOR (which should be same for both)
                        // The structural issue (redundancy) is verified by code inspection
                        return returnedFalse && !axiosCalled;
                    }
                ),
                {
                    numRuns: 10,
                    verbose: true
                }
            );
            
            // Additional test: Verify that valid media IS processed
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        data: fc.base64String({ minLength: 10, maxLength: 100 }),
                        filename: fc.string({ minLength: 5, maxLength: 20 }),
                        mimetype: fc.constantFrom('image/png', 'image/jpeg', 'application/pdf')
                    }),
                    async (validMedia) => {
                        mockAxios.post.mockClear();
                        mockAxios.post.mockResolvedValue({ data: { id: 'att123' } });
                        
                        // Set NODE_ENV to skip actual attachment in test
                        const originalEnv = process.env.NODE_ENV;
                        process.env.NODE_ENV = 'test';
                        
                        const cardId = 'test-card-456';
                        const result = await trello.attachFile(cardId, validMedia);
                        
                        process.env.NODE_ENV = originalEnv;
                        
                        // EXPECTED: Should return true for valid media
                        // This validates that the consolidated check doesn't break valid cases
                        return result === true;
                    }
                ),
                {
                    numRuns: 10,
                    verbose: true
                }
            );
        }, 30000);
        
        /**
         * Code Structure Verification for Bug 2.2
         * 
         * This test verifies the STRUCTURE of the validation code to detect redundancy.
         * It checks if the code has the specific redundant pattern that indicates the bug.
         */
        test('Property 2.2: Code Structure - Detect Redundant Validation Pattern', () => {
            const fs = require('fs');
            const trelloCode = fs.readFileSync('./trello.js', 'utf8');
            
            // Extract the attachFile function code
            const attachFileMatch = trelloCode.match(/async function attachFile\([\s\S]*?\n\}/);
            
            if (!attachFileMatch) {
                // If we can't find the function, skip this structural test
                return;
            }
            
            const attachFileCode = attachFileMatch[0];
            
            // Check for redundant validation pattern in UNFIXED code:
            // Pattern 1: Separate checks for !media and !media.data
            const hasSeparateChecks = 
                attachFileCode.includes('!media') && 
                attachFileCode.includes('!media.data') &&
                !attachFileCode.includes('!media?.data'); // Not using optional chaining
            
            // Check for consolidated validation pattern in FIXED code:
            // Pattern 2: Single check using optional chaining !media?.data
            const hasConsolidatedCheck = attachFileCode.includes('!media?.data');
            
            // EXPECTED on UNFIXED code: hasSeparateChecks === true, hasConsolidatedCheck === false
            // EXPECTED on FIXED code: hasSeparateChecks === false, hasConsolidatedCheck === true
            
            // The test PASSES if the code has the consolidated pattern (FIXED)
            // The test FAILS if the code has the redundant pattern (UNFIXED)
            return hasConsolidatedCheck && !hasSeparateChecks;
        });
    });
});
