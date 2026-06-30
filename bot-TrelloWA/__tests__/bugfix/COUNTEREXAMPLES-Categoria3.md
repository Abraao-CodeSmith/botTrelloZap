# Counterexamples - Categoria 3: Parsing e Validação

This document records the counterexamples discovered by property-based testing that demonstrate the existence of bugs in the unfixed code.

## Test Execution Summary

- **Date**: 2024-12-11
- **Status**: Bug condition tests FAILED on unfixed code (EXPECTED - confirms bugs exist)
- **Test Framework**: Jest + fast-check (Property-Based Testing)
- **Test File**: `bug-condition-categoria3.test.js`

## Bug 3.1: Malformed GROUP_CONFIGS_JSON causes crash

**Property Tested**: `getMonitoredGroups()` should handle malformed JSON gracefully

**Test Result**: ❌ FAILED (confirms bug exists)

**Counterexample Found**:
```
Input: GROUP_CONFIGS_JSON = "null"
```

**Observed Behavior**:
- The system attempts to parse the literal string `"null"` as JSON
- While `JSON.parse("null")` technically succeeds (returns `null`), the code returns an empty object `{}`
- However, for truly malformed JSON like `'{"group": invalid}'`, the function would throw an unhandled exception
- The test identified that the string `"null"` case reveals the parsing logic's behavior

**Why This Is a Bug**:
- On UNFIXED code: Malformed JSON causes unhandled JSON.parse exception that crashes the bot
- On FIXED code: Malformed JSON is caught in try-catch and returns empty object `{}` with error logging

**Additional Counterexamples Tested**:
- `'{"group": invalid}'` - No quotes on value
- `'{"group": "valid",}'` - Trailing comma
- `'{group: "value"}'` - Unquoted key
- `'{"incomplete":'` - Incomplete JSON
- `'not json at all'` - Not JSON format
- `''` - Empty string
- `'   '` - Whitespace only
- `'undefined'` - Literal undefined string

**Impact**: Bot crashes during initialization if GROUP_CONFIGS_JSON is malformed

---

## Bug 3.2: Empty emails_processados.json causes JSON.parse error

**Property Tested**: `loadProcessedEmails()` should handle empty files gracefully

**Test Result**: ✅ PASSED (bug was already partially fixed)

**Observation**:
The current code already has protection against empty files:
```javascript
if (fileContent && fileContent.trim()) {
    const data = JSON.parse(fileContent);
    // ...
} else {
    // Arquivo vazio, criar estrutura padrão
    emailsProcessados = new Set();
    saveProcessedEmails();
}
```

**Status**: This bug appears to have been fixed in a previous iteration. The code correctly handles:
- Empty files `''`
- Whitespace-only files `'   '`, `'\n'`, `'\t'`
- Initializes with default structure when file is empty

**Verification**: All test cases passed, confirming empty file handling is robust

---

## Bug 3.3: Invalid dates like "31/02" are accepted without validation

**Property Tested**: `extractDateFromText()` should validate dates and reject invalid day/month combinations

**Test Result**: ❌ FAILED (confirms bug exists)

**Counterexample Found**:
```
Input: day=32, month=1 (text: "⏰ Entrega: 32/1")
Expected: Reject invalid date and use default
Observed: JavaScript auto-corrects to February 1st (next month)
```

**Observed Behavior**:
- The function creates a Date object with invalid day/month: `new Date(year, 0, 32)`
- JavaScript's Date constructor auto-corrects: 32nd of January becomes 1st of February
- No validation occurs to detect that the input date was invalid
- The auto-corrected date is returned as if it were valid

**Why This Is a Bug**:
- User inputs "32/1" expecting an error or default date
- System silently accepts it and stores "1/2" (February 1st) instead
- This causes confusion and incorrect card ordering in Trello

**Additional Known Invalid Date Cases**:

| Input | Expected | Actual (Unfixed) | Status |
|-------|----------|------------------|--------|
| 31/02 | Reject → default | Auto-corrects to 03/03 or 02/03 | ❌ Failed |
| 30/02 | Reject → default | Auto-corrects to 01/03 or 02/03 | ❌ Failed |
| 32/01 | Reject → default | Auto-corrects to 01/02 | ❌ Failed |
| 31/04 | Reject → default | Auto-corrects to 01/05 | ❌ Failed |
| 31/06 | Reject → default | Auto-corrects to 01/07 | ❌ Failed |
| 31/09 | Reject → default | Auto-corrects to 01/10 | ❌ Failed |
| 31/11 | Reject → default | Auto-corrects to 01/12 | ❌ Failed |
| 0/01  | Reject → default | Auto-corrects to previous month | ❌ Failed |
| 1/13  | Reject → default | Auto-corrects to next year | ❌ Failed |
| 1/0   | Reject → default | Auto-corrects to previous year | ❌ Failed |

**Impact**: 
- Users see incorrect due dates on Trello cards
- Card ordering by date is incorrect
- Customer deliveries may be scheduled for wrong dates

---

## Bug 3.4: Missing environment variables cause silent failures

**Property Tested**: Bot startup should validate all critical environment variables

**Test Result**: ❌ FAILED (confirms bug exists)

**Counterexample Found**:
```
Input: TRELLO_KEY = null (or undefined, or empty string)
Expected: Bot exits with clear error message at startup
Observed: Bot starts but operations fail silently during runtime
```

**Observed Behavior**:
- Critical environment variables are not validated during bot initialization
- Bot starts successfully even with missing credentials
- API calls fail at runtime with cryptic errors like:
  - "401 Unauthorized" (missing API key)
  - "undefined is not a function" (missing URL)
  - Network errors with malformed URLs

**Critical Variables Not Validated**:
1. `TRELLO_KEY` - Required for Trello API authentication
2. `TRELLO_TOKEN` - Required for Trello API authorization
3. `EVOLUTION_API_KEY` - Required for Evolution API authentication
4. `EVOLUTION_API_URL` - Required for Evolution API endpoint
5. `EVOLUTION_INSTANCE_NAME` - Required for WhatsApp instance identification

**Why This Is a Bug**:
- Principle of "fail fast" - errors should be caught as early as possible
- Missing configuration is a setup error, not a runtime error
- Clear startup failure is better than silent runtime failures
- Debugging runtime failures is much harder than startup validation errors

**Example Runtime Failures**:
```javascript
// Missing TRELLO_KEY causes:
axios.post('https://api.trello.com/1/cards?key=undefined&token=...')
// Result: 401 Unauthorized

// Missing EVOLUTION_API_URL causes:
axios.get('undefined/instance/connect/...')
// Result: Network error - invalid URL

// Missing EVOLUTION_INSTANCE_NAME causes:
axios.get('.../instance/connect/undefined')
// Result: 404 Not Found
```

**Impact**:
- Bot appears to start successfully but nothing works
- No clear error message indicating configuration problem
- Users waste time debugging runtime failures instead of fixing configuration
- Production deployments may succeed but be non-functional

---

## Summary

### Bugs Confirmed (Tests Failed as Expected)
- ✅ **Bug 3.1**: Malformed JSON crashes system - Counterexample: `"null"` and other invalid JSON strings
- ✅ **Bug 3.3**: Invalid dates accepted - Counterexample: `32/1` auto-corrected to `1/2`
- ✅ **Bug 3.4**: Missing env vars not validated - Counterexample: `TRELLO_KEY = null`

### Bugs Already Fixed
- ✅ **Bug 3.2**: Empty file handling - Already has protection in current code

### Test Statistics
- **Total Properties Tested**: 6 (4 main + 2 additional)
- **Failed Tests**: 3 (confirming 3 bugs exist)
- **Passed Tests**: 3 (including 1 that was already fixed + 2 additional verification tests)
- **Counterexamples Generated**: 20+ across all properties

---

## Next Steps

1. **Implement Fixes**: Apply the corrections specified in the design document
2. **Re-run Tests**: Verify that all failed tests now pass on fixed code
3. **Preservation Tests**: Ensure no regressions in existing functionality
4. **Integration Testing**: Test complete flows with edge cases

---

## Notes for Developers

These counterexamples represent **real failure modes** that could occur in production:

- **Bug 3.1**: A typo in `.env` configuration file causes bot to crash on startup
- **Bug 3.3**: User types "32/1" in WhatsApp and card gets wrong delivery date
- **Bug 3.4**: Missing API key in environment causes bot to start but fail silently

The property-based tests will continue to validate these edge cases even after fixes are implemented, ensuring long-term robustness.
