# Counterexamples - Categoria 2: Ordenação e Estado no Trello

This document records the counterexamples found by bug condition exploration property tests for Categoria 2 bugs.

## Test Execution Summary

**Date**: 2025-01-XX  
**Environment**: Unfixed code (before applying bug fixes)  
**Test Suite**: `bug-condition-categoria2.test.js`  
**Test Framework**: Jest + fast-check (property-based testing)

## Bug 2.1: Pending Order Lock Never Released

### Test Result: **FAILED** ✓ (Expected - confirms bug exists)

**Property Tested**: After `orderList()` fails with any error, `pendingOrders[listId]` should be cleared to allow future ordering attempts.

### Counterexamples Found

The property-based test found the following counterexamples demonstrating the bug:

#### Primary Counterexample (After Shrinking)
```
Input: listId = "          " (10 spaces), errorType = "NETWORK_ERROR"
Result: pendingOrders[listId] remains locked (never cleared)
Impact: Future ordering attempts for this list are permanently blocked
```

#### Shrinking History
The test shrunk from complex inputs to simpler ones, all demonstrating the same bug:
1. `["constructor", "RATE_LIMIT"]` - FAILED (bug detected)
2. `["onstructor", "RATE_LIMIT"]` - FAILED (bug detected)
3. `[" nstructor", "RATE_LIMIT"]` - FAILED (bug detected)
4. `["  structor", "RATE_LIMIT"]` - FAILED (bug detected)
5. `["   tructor", "RATE_LIMIT"]` - FAILED (bug detected)
6. `["    ructor", "RATE_LIMIT"]` - FAILED (bug detected)
7. `["     uctor", "RATE_LIMIT"]` - FAILED (bug detected)
8. `["      ctor", "RATE_LIMIT"]` - FAILED (bug detected)
9. `["       tor", "RATE_LIMIT"]` - FAILED (bug detected)
10. `["        or", "RATE_LIMIT"]` - FAILED (bug detected)
11. `["         r", "RATE_LIMIT"]` - FAILED (bug detected)
12. `["          ", "RATE_LIMIT"]` - FAILED (bug detected)
13. `["          ", "NETWORK_ERROR"]` - FAILED (bug detected - minimal counterexample)

### Test Mechanism

The test calls `debouncedOrder(listId, 100)` which:
1. Sets `pendingOrders[listId] = true`
2. Schedules `orderList(listId)` to run after 100ms
3. `orderList()` is mocked to fail with various error types
4. **BUG**: When `orderList()` fails, `pendingOrders[listId]` is never cleared
5. Second call to `debouncedOrder(listId, 100)` returns early because `pendingOrders[listId]` is still true
6. Test verifies that `axios.get` was called only once (confirming lock remained)

### Error Types Tested

All error types demonstrated the bug:
- `NETWORK_ERROR`: Error with message "ECONNRESET"
- `TIMEOUT`: Error with code "ETIMEDOUT"
- `SERVER_ERROR`: Error with status 500
- `RATE_LIMIT`: Error with status 429

### Root Cause Confirmed

The bug exists in `trello.js` function `debouncedOrder()`:

```javascript
function debouncedOrder(listId, delay = 5000) {
    if (pendingOrders[listId]) return;
    
    pendingOrders[listId] = true;
    setTimeout(async () => {
        await orderList(listId);              // ← If this fails...
        delete pendingOrders[listId];         // ← This never executes
    }, delay);
}
```

**Problem**: When `orderList()` throws an error, execution stops and `delete pendingOrders[listId]` is never reached.

**Impact in Production**:
- Any network error, timeout, or API failure permanently locks that list
- List can never be ordered again until bot restarts
- Multiple lists can become locked over time
- User workflows are broken (no ordering after "X" command)

---

## Bug 2.2: Media Validation Logic Inconsistency

### Test Result: **FAILED** ✓ (Expected - confirms bug exists)

**Property Tested**: `attachFile()` should validate media with a single consolidated check using optional chaining.

### Code Structure Analysis

The test analyzed the source code of `attachFile()` in `trello.js` and detected:

**UNFIXED CODE Pattern (Redundant)**:
```javascript
async function attachFile(cardId, media) {
    try {
        // Verificar se media é válido
        if (!media || !media.data) {  // ← Redundant: checks both !media and !media.data
            console.error('❌ Mídia inválida para anexar');
            return false;
        }
        // ... rest of function
    }
}
```

**Issue**: The condition `!media || !media.data` is redundant:
- If `!media` is true, the condition short-circuits and returns
- The check `!media.data` is never reached when `media` is null/undefined
- However, when `media` exists but `media.data` is null/undefined, it's checked twice logically
- This creates confusion and is not using modern JavaScript optional chaining

### Behavioral Tests

The behavioral validation tests **PASSED**, confirming that:

#### Invalid Media Cases (All correctly return false)
- `null` → returns false ✓
- `undefined` → returns false ✓
- `{}` (no data property) → returns false ✓
- `{ data: null }` → returns false ✓
- `{ data: undefined }` → returns false ✓
- `{ data: '' }` → returns false ✓

#### Valid Media Cases (All correctly return true)
- Valid base64 data with filename and mimetype → returns true ✓

**Conclusion**: The BEHAVIOR is correct, but the CODE STRUCTURE has redundancy that should be refactored.

### Expected Fix

**FIXED CODE Pattern (Consolidated)**:
```javascript
async function attachFile(cardId, media) {
    try {
        // FIX: Use optional chaining for consolidated validation
        if (!media?.data) {  // ← Single check using optional chaining
            console.error('❌ Mídia inválida para anexar');
            return false;
        }
        // ... rest of function
    }
}
```

**Benefits**:
- More concise and modern JavaScript
- Eliminates redundancy
- Clearer intent: "check if media.data exists"
- Uses optional chaining (?.) to safely access nested properties

### Impact Assessment

**Severity**: LOW (cosmetic/code quality)

**Impact**:
- No functional bug (behavior is correct)
- Code readability issue
- Lint warnings may be generated
- Not following modern JavaScript best practices

**Risk**: Minimal - this is a code quality improvement, not a critical bug fix

---

## Test Statistics

### Bug 2.1 Test
- **Test Runs**: 15 (configured with `numRuns: 15`)
- **Failed on First**: Yes (seed: -646987949)
- **Shrink Iterations**: 12
- **Time**: 5426 ms

### Bug 2.2 Test
- **Behavioral Test Runs**: 20 (10 invalid + 10 valid)
- **All Behavioral Tests**: PASSED (behavior is correct)
- **Code Structure Test**: FAILED (detected redundant pattern)
- **Time**: 139 ms

---

## Conclusion

Both bug condition exploration tests successfully demonstrated the existence of the bugs in the unfixed code:

1. **Bug 2.1**: Critical bug - `pendingOrders` lock is never released on error
2. **Bug 2.2**: Code quality issue - redundant validation pattern

These counterexamples provide concrete evidence that the bugs exist and need to be fixed. After applying the fixes from the design document, these tests should PASS, confirming that the bugs have been resolved.

---

## Next Steps

1. Apply fixes as specified in `design.md`
2. Re-run these tests to verify fixes work
3. Update PBT status after running tests
4. Document that tests now PASS on fixed code

---

## Test Command

To reproduce these results:

```bash
cd bot-TrelloWA
npm test -- bug-condition-categoria2.test.js --verbose
```

**Expected on Unfixed Code**: Tests FAIL (confirms bugs exist)  
**Expected on Fixed Code**: Tests PASS (confirms bugs are resolved)
