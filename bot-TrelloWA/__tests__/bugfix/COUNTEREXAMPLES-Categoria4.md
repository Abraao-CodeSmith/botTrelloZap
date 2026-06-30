# Counterexamples - Categoria 4: Código e Declarações

## Bug Condition Exploration - Test Results

**Test Date:** 2024
**Test Status:** ✗ FAILED (Expected - confirms bugs exist in unfixed code)
**Test File:** `bug-condition-categoria4.test.js`

---

## Bug 4.1: FormData Variable Shadowing

### Bug Condition
FormData is imported at the top of `trello.js` AND redeclared inside the `attachFile()` function, causing variable shadowing.

### Counterexample Found

```
COUNTEREXAMPLE Bug 4.1: FormData variable shadowing detected
  - Global import found at file top
  - Local import found inside attachFile()
  - This causes variable shadowing (linter warning)
```

### Location
- **File:** `bot-TrelloWA/trello.js`
- **Global import:** Line 2 - `const FormData = require('form-data');`
- **Local import:** Inside `attachFile()` function - `const FormData = require('form-data');`

### Impact
- Causes ESLint/JSHint warning about variable shadowing
- The global import is never used (dead code)
- The local import shadows the global declaration
- Confusing code structure that can lead to maintenance issues

### Expected Behavior After Fix
- Only ONE import of FormData (either global OR local, not both)
- No variable shadowing
- No linter warnings

---

## Bug 4.2: Unused Response Variable

### Bug Condition
In `attachFile()` function, the result of `axios.post()` is stored in a `response` variable, but that variable is never read or used afterwards.

### Counterexample Found

```
COUNTEREXAMPLE Bug 4.2: Unused response variable detected
  - response variable assigned in attachFile()
  - response variable never used after assignment
  - This is dead code (linter warning)
```

### Location
- **File:** `bot-TrelloWA/trello.js`
- **Function:** `attachFile()`
- **Line:** ~83 - `const response = await axios.post(...)`

### Code Snippet
```javascript
const response = await axios.post(`https://api.trello.com/1/cards/${cardId}/attachments`, form, {
    params: {
        key: TRELLO_KEY,
        token: TRELLO_TOKEN
    },
    headers: {
        ...form.getHeaders(),
        'Content-Type': 'multipart/form-data'
    }
});
// response is never used after this point
```

### Impact
- Causes ESLint warning: "'response' is declared but its value is never read"
- Dead code that serves no purpose
- Wastes memory storing unused data
- Suggests incomplete implementation or debugging code left behind

### Expected Behavior After Fix
- Either remove the `response` variable assignment: `await axios.post(...)`
- Or use the response for validation: `const response = await axios.post(...); if (response.status !== 200) ...`

---

## Bug 4.3: Duplicate googleapis Import

### Bug Condition
The `googleapis` module is imported at the top of `email.js` AND inside the `initializeGmail()` function, creating a redundant import.

### Counterexample Found

```
COUNTEREXAMPLE Bug 4.3: Duplicate googleapis import detected
  - Global import found at file top
  - Local import found inside initializeGmail()
  - This is redundant (linter warning)
  - Total import count: 2
```

### Location
- **File:** `bot-TrelloWA/email.js`
- **Global import:** Line 1 - `const { google } = require('googleapis');`
- **Local import:** Inside `initializeGmail()` function - `const { google } = require('googleapis');`

### Code Snippet
```javascript
// Line 1 - Global import (never used)
const { google } = require('googleapis');

// Later in the file...
async function initializeGmail() {
    // Line ~178 - Local import (actually used)
    const { google } = require('googleapis');
    // ...
}
```

### Impact
- Causes ESLint warning: "'google' is declared but its value is never read"
- The global import is completely unused
- Redundant code that suggests refactoring was incomplete
- Wastes module loading time (though Node.js caches modules)

### Expected Behavior After Fix
- Only ONE import of googleapis (either global OR local, not both)
- No duplicate imports
- No linter warnings

---

## Overall Code Quality Status

**Issues Found:** 3/3 (100%)

All three code quality issues were successfully detected by the bug condition exploration tests:

1. ✗ Bug 4.1: FormData variable shadowing in trello.js
2. ✗ Bug 4.2: Unused response variable in trello.js attachFile()
3. ✗ Bug 4.3: Duplicate googleapis import in email.js

These issues represent code quality problems that would be caught by a linter like ESLint and should be resolved before production deployment.

---

## Test Methodology

These tests check for code quality issues by:

1. **Reading source files:** Tests read the actual source code from `trello.js` and `email.js`
2. **Pattern matching:** Uses regex to detect variable declarations, imports, and usage patterns
3. **Static analysis:** Analyzes code structure without executing it
4. **Reporting:** Provides detailed counterexamples showing exactly where issues exist

This approach simulates what a linter (ESLint/JSHint) would detect, confirming that these bugs exist in the current unfixed codebase.

---

## Next Steps

After implementing the fixes in Phase 3 (Task 10):
1. Re-run these tests
2. Tests should PASS (no warnings found)
3. Verify linter warnings are resolved
4. Confirm code quality improvements

---

**Note:** These tests are designed to FAIL on unfixed code and PASS on fixed code. The failures above are **expected** and confirm that the bugs exist.
