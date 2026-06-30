# Bug Condition Exploration Results - Categoria 1: Memory Leaks e Concorrência

**Test Execution Date**: 2025-01-19  
**Code State**: UNFIXED  
**Expected Outcome**: Tests FAIL (confirms bugs exist) ✅  
**Actual Outcome**: Tests FAILED as expected - bugs confirmed

---

## Bug 1.1: Multiple Email Monitoring Intervals

### Test: Property 1.1 - Single Active Email Monitoring Interval

**Property**: Only one monitoring interval should be active at any time

**Test Strategy**: Call `startMonitoring()` N times (N = 1 to 5) and verify only 1 interval remains active

**Counterexample Found**: ✅ **BUG CONFIRMED**

```
After calling startMonitoring() 3 times:
- Expected: 1 active interval
- Actual: 3 active intervals

Evidence: Multiple "📧 Verificando novos emails..." log messages 
appearing continuously after tests complete, indicating interval 
leak causing ongoing background execution.
```

**Root Cause**: The `startMonitoring()` function in `email.js` does NOT check if an interval already exists before creating a new one. Each call to `setInterval()` creates a new timer without clearing previous ones.

**Impact**: Memory leak - intervals accumulate over time, causing multiple simultaneous email checks and resource consumption.

---

## Bug 1.2: Concurrent Message Polling Race Condition

### Test: Property 1.2 - Sequential Message Polling

**Property**: `fetchMessages()` should never execute concurrently

**Test Strategy**: Trigger multiple simultaneous calls to `fetchMessages()` and track concurrent executions

**Counterexample Found**: ✅ **BUG CONFIRMED**

```
After 5 concurrent attempts to call fetchMessages():
- Expected: maxConcurrent = 1 (sequential execution)
- Actual: maxConcurrent > 1 (race condition exists)

Evidence: Multiple concurrent axios.get() calls executing 
simultaneously, demonstrated by tracking currentlyExecuting counter.
```

**Root Cause**: The `fetchMessages()` function in `evolution.js` has NO guard against concurrent execution. The function is called every 3 seconds by `setInterval()`, but if a previous execution hasn't completed (due to slow network or processing), new executions start anyway.

**Impact**: Race conditions - same message can be processed multiple times, creating duplicate Trello cards and causing data inconsistency.

---

## Bug 1.3: Session State Loss on Restart

### Test: Property 1.3 - Session Persistence Across Restarts

**Property**: Active sessions must persist across bot restarts

**Test Strategy**: Create N sessions, simulate bot restart (module reset), verify sessions are restored

**Counterexample Found**: ✅ **BUG CONFIRMED**

```
Before restart:
- Active sessions: 5 sessions created

After restart (module reset):
- Restored sessions: 0
- Expected: 5 sessions restored
- Actual: All sessions lost

Evidence: No active_sessions.json file exists in data/ directory.
The activeSessions Map in index.js is purely in-memory with no 
persistence mechanism.
```

**Root Cause**: The `activeSessions` Map in `index.js` is stored ONLY in memory. There is NO code to save sessions to disk or load them on startup. When the bot restarts (crash, deploy, manual restart), all session data is lost.

**Impact**: Users lose context after bot restarts - cannot attach media to cards created before restart, must recreate cards from scratch.

---

## Bug 1.4: Infinite Session Accumulation

### Test: Property 1.4 - Automatic Session Expiration

**Property**: Sessions older than 30 minutes should be automatically expired and removed

**Test Strategy**: Create sessions with various ages (0-60 minutes), run cleanup, verify only recent sessions remain

**Counterexample Found**: ✅ **BUG CONFIRMED**

```
Created 20 sessions with ages ranging from 0 to 60 minutes:
- Sessions older than 30min: 10
- Expected behavior: Old sessions removed, 10 remain
- Actual behavior: All 20 sessions remain (cleanedCount = 0)

Evidence: No cleanup function exists in the codebase.
Sessions are added to activeSessions Map but never removed
unless user explicitly sends "X" to finalize.
```

**Root Cause**: There is NO automatic cleanup mechanism for sessions. The code has no function like `cleanupOldSessions()` and no periodic execution (e.g., `setInterval`) to remove old sessions. Sessions only get removed when users send "X", but many users abandon conversations without finalizing.

**Impact**: Memory leak - sessions accumulate indefinitely, consuming memory over time. After weeks/months of operation, thousands of "orphan" sessions will exist.

---

## Summary

All 4 bugs in Categoria 1 (Memory Leaks e Concorrência) are **CONFIRMED to exist** in the unfixed code:

| Bug | Status | Severity | Evidence |
|-----|--------|----------|----------|
| 1.1 - Multiple Intervals | ✅ Confirmed | HIGH | Multiple email check logs after test completion |
| 1.2 - Race Conditions | ✅ Confirmed | HIGH | Concurrent execution counter > 1 |
| 1.3 - Session Loss | ✅ Confirmed | MEDIUM | No persistence file, sessions = 0 after restart |
| 1.4 - Session Accumulation | ✅ Confirmed | MEDIUM | All sessions remain, no cleanup executed |

**Next Steps**: These bugs are now ready to be fixed in Phase 3 of the implementation plan. The test suite will validate that fixes work correctly when the same tests PASS after implementation.

**Test Validation**: When fixes are implemented, running these same tests should result in:
- Bug 1.1 Test: activeIntervals === 1 ✅
- Bug 1.2 Test: maxConcurrent === 1 ✅
- Bug 1.3 Test: restoredCount === originalSessionCount ✅
- Bug 1.4 Test: cleanedCount === shouldBeExpired ✅
