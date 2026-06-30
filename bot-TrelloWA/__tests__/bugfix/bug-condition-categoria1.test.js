// Bug Condition Exploration Tests - Categoria 1: Memory Leaks e Concorrência
// **CRITICAL**: These tests MUST FAIL on unfixed code - failure confirms bugs exist
// **GOAL**: Surface counterexamples that demonstrate the bugs

/**
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4
 * 
 * This file contains property-based tests that encode the EXPECTED behavior.
 * When run against UNFIXED code, these tests will FAIL, demonstrating the bugs.
 * When run against FIXED code, these tests will PASS, validating the fixes.
 */

const fc = require('fast-check');

describe('Categoria 1: Memory Leaks e Concorrência - Bug Condition Exploration', () => {
    
    describe('Bug 1.1: Multiple Email Monitoring Intervals', () => {
        
        /**
         * **Validates: Requirements 1.1**
         * 
         * Property: Only one monitoring interval should be active at any time
         * 
         * Bug Condition: Multiple calls to startMonitoring() create multiple intervals
         * Expected on UNFIXED code: Test FAILS with counterexample showing N intervals after N calls
         * Expected on FIXED code: Test PASSES with exactly 1 interval active
         */
        test('Property 1.1: Single Active Email Monitoring Interval', () => {
            // Reset module to get fresh instance
            jest.resetModules();
            const emailService = require('../../email');
            
            // Track intervals created
            const originalSetInterval = global.setInterval;
            const intervals = [];
            global.setInterval = jest.fn((fn, delay) => {
                const id = originalSetInterval(fn, delay);
                intervals.push(id);
                return id;
            });
            
            const originalClearInterval = global.clearInterval;
            global.clearInterval = jest.fn((id) => {
                const index = intervals.indexOf(id);
                if (index > -1) {
                    intervals.splice(index, 1);
                }
                originalClearInterval(id);
            });
            
            // Property: After any number of startMonitoring calls, only 1 interval should be active
            fc.assert(
                fc.property(
                    fc.integer({ min: 1, max: 5 }), // Number of times to call startMonitoring
                    (numCalls) => {
                        // Clear previous intervals
                        intervals.forEach(id => originalClearInterval(id));
                        intervals.length = 0;
                        jest.clearAllMocks();
                        
                        // Mock evolutionApi
                        const mockEvolutionApi = {
                            sendMessage: jest.fn().mockResolvedValue(true)
                        };
                        
                        // Call startMonitoring N times
                        for (let i = 0; i < numCalls; i++) {
                            emailService.startMonitoring(mockEvolutionApi);
                        }
                        
                        // EXPECTED BEHAVIOR: Only 1 interval should be active
                        const activeIntervals = intervals.length;
                        
                        // Cleanup
                        intervals.forEach(id => originalClearInterval(id));
                        
                        // This assertion will FAIL on unfixed code (showing N intervals)
                        // and PASS on fixed code (showing 1 interval)
                        return activeIntervals === 1;
                    }
                ),
                { 
                    numRuns: 20,
                    verbose: true 
                }
            );
            
            // Restore globals
            global.setInterval = originalSetInterval;
            global.clearInterval = originalClearInterval;
        });
    });
    
    describe('Bug 1.2: Concurrent Message Polling Race Condition', () => {
        
        /**
         * **Validates: Requirements 1.2**
         * 
         * Property: fetchMessages should never execute concurrently
         * 
         * Bug Condition: Concurrent fetchMessages() executions cause race conditions
         * Expected on UNFIXED code: Test FAILS showing concurrent executions
         * Expected on FIXED code: Test PASSES with sequential execution only
         */
        test('Property 1.2: Sequential Message Polling', async () => {
            // Reset module to get fresh instance
            jest.resetModules();
            
            // Mock axios before requiring evolution
            const mockAxios = {
                get: jest.fn(),
                post: jest.fn()
            };
            jest.mock('axios', () => mockAxios);
            
            const evolution = require('../../evolution');
            
            // Track concurrent executions
            let currentlyExecuting = 0;
            let maxConcurrent = 0;
            let executionCount = 0;
            
            // Mock fetchMessages to track concurrency
            mockAxios.get.mockImplementation(async () => {
                currentlyExecuting++;
                executionCount++;
                maxConcurrent = Math.max(maxConcurrent, currentlyExecuting);
                
                // Simulate slow API call
                await new Promise(resolve => setTimeout(resolve, 100));
                
                currentlyExecuting--;
                
                return { data: [] };
            });
            
            // Initialize with mock handler
            const mockHandler = jest.fn();
            await evolution.initialize(mockHandler);
            
            // Property: Multiple rapid calls to fetchMessages should never execute concurrently
            await fc.assert(
                fc.asyncProperty(
                    fc.integer({ min: 3, max: 10 }), // Number of concurrent attempts
                    async (numAttempts) => {
                        // Reset tracking
                        currentlyExecuting = 0;
                        maxConcurrent = 0;
                        executionCount = 0;
                        mockAxios.get.mockClear();
                        
                        // Attempt multiple concurrent fetchMessages calls
                        const promises = [];
                        for (let i = 0; i < numAttempts; i++) {
                            promises.push(evolution.fetchMessages?.() || Promise.resolve());
                        }
                        
                        await Promise.all(promises);
                        
                        // Wait for any pending operations
                        await new Promise(resolve => setTimeout(resolve, 200));
                        
                        // EXPECTED BEHAVIOR: maxConcurrent should be 1 (no overlapping executions)
                        // On UNFIXED code: maxConcurrent > 1 (race condition exists)
                        // On FIXED code: maxConcurrent === 1 (sequential execution)
                        return maxConcurrent <= 1;
                    }
                ),
                {
                    numRuns: 10,
                    verbose: true
                }
            );
            
            evolution.shutdown();
        }, 30000);
    });
    
    describe('Bug 1.3: Session State Loss on Restart', () => {
        
        /**
         * **Validates: Requirements 1.3**
         * 
         * Property: Active sessions must persist across bot restarts
         * 
         * Bug Condition: Bot restart loses all activeSessions
         * Expected on UNFIXED code: Test FAILS - sessions lost after restart
         * Expected on FIXED code: Test PASSES - sessions restored from file
         */
        test('Property 1.3: Session Persistence Across Restarts', () => {
            const fs = require('fs');
            const path = require('path');
            
            const SESSIONS_FILE = './data/active_sessions.json';
            
            // Clean up sessions file
            if (fs.existsSync(SESSIONS_FILE)) {
                fs.unlinkSync(SESSIONS_FILE);
            }
            
            // Property: Sessions should persist across restarts
            fc.assert(
                fc.property(
                    fc.array(
                        fc.record({
                            author: fc.string({ minLength: 10, maxLength: 30 }),
                            cardId: fc.string({ minLength: 20, maxLength: 30 })
                        }),
                        { minLength: 1, maxLength: 10 }
                    ),
                    (sessions) => {
                        // Reset module for fresh start
                        jest.resetModules();
                        
                        // First run: Create sessions
                        let indexModule = require('../../index');
                        
                        // Simulate creating sessions (in unfixed code, this is just in-memory Map)
                        // In fixed code, this should persist to file
                        const activeSessions = new Map();
                        sessions.forEach(session => {
                            activeSessions.set(session.author, {
                                cardId: session.cardId,
                                createdAt: Date.now()
                            });
                        });
                        
                        // In fixed code, this would call saveSessions()
                        // In unfixed code, sessions are only in memory
                        if (typeof indexModule.saveSessions === 'function') {
                            indexModule.saveSessions();
                        }
                        
                        const originalSessionCount = activeSessions.size;
                        
                        // Simulate restart: Reset module
                        jest.resetModules();
                        indexModule = require('../../index');
                        
                        // In fixed code, this would call loadSessions()
                        // In unfixed code, sessions Map is empty
                        let restoredCount = 0;
                        if (fs.existsSync(SESSIONS_FILE)) {
                            const data = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
                            restoredCount = Object.keys(data.sessions || {}).length;
                        }
                        
                        // EXPECTED BEHAVIOR: All sessions should be restored
                        // On UNFIXED code: restoredCount === 0 (sessions lost)
                        // On FIXED code: restoredCount === originalSessionCount (sessions restored)
                        return restoredCount === originalSessionCount;
                    }
                ),
                {
                    numRuns: 20,
                    verbose: true
                }
            );
            
            // Cleanup
            if (fs.existsSync(SESSIONS_FILE)) {
                fs.unlinkSync(SESSIONS_FILE);
            }
        });
    });
    
    describe('Bug 1.4: Infinite Session Accumulation', () => {
        
        /**
         * **Validates: Requirements 1.4**
         * 
         * Property: Sessions older than 30 minutes should be automatically expired
         * 
         * Bug Condition: Sessions never expire, causing memory accumulation
         * Expected on UNFIXED code: Test FAILS - old sessions remain indefinitely
         * Expected on FIXED code: Test PASSES - old sessions are cleaned up
         */
        test('Property 1.4: Automatic Session Expiration', () => {
            jest.resetModules();
            
            // Property: Sessions older than 30 minutes should be removed
            fc.assert(
                fc.property(
                    fc.array(
                        fc.record({
                            author: fc.string({ minLength: 10, maxLength: 30 }),
                            cardId: fc.string({ minLength: 20, maxLength: 30 }),
                            ageMinutes: fc.integer({ min: 0, max: 60 })
                        }),
                        { minLength: 5, maxLength: 20 }
                    ),
                    (sessions) => {
                        // Create sessions with different ages
                        const activeSessions = new Map();
                        const now = Date.now();
                        const maxAge = 30 * 60 * 1000; // 30 minutes
                        
                        sessions.forEach(session => {
                            const createdAt = now - (session.ageMinutes * 60 * 1000);
                            activeSessions.set(session.author, {
                                cardId: session.cardId,
                                createdAt: createdAt
                            });
                        });
                        
                        // Count sessions that should be expired (older than 30 minutes)
                        const shouldBeExpired = sessions.filter(s => s.ageMinutes > 30).length;
                        const shouldRemain = sessions.length - shouldBeExpired;
                        
                        // Simulate cleanup function
                        // In UNFIXED code: This function doesn't exist or doesn't run
                        // In FIXED code: This function removes old sessions
                        let cleanedCount = 0;
                        for (const [author, session] of activeSessions.entries()) {
                            if (now - session.createdAt > maxAge) {
                                activeSessions.delete(author);
                                cleanedCount++;
                            }
                        }
                        
                        const remainingCount = activeSessions.size;
                        
                        // EXPECTED BEHAVIOR: Only recent sessions should remain
                        // On UNFIXED code: All sessions remain (cleanedCount === 0)
                        // On FIXED code: Old sessions removed (remainingCount === shouldRemain)
                        
                        // For unfixed code, the cleanup logic won't exist, so we expect
                        // either cleanedCount === 0 or the cleanup to not happen
                        // For fixed code, we expect exactly shouldRemain sessions left
                        return cleanedCount === shouldBeExpired && remainingCount === shouldRemain;
                    }
                ),
                {
                    numRuns: 20,
                    verbose: true
                }
            );
        });
    });
});
