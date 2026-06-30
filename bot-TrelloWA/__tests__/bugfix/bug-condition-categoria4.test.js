// Bug Condition Exploration Tests - Categoria 4: Código e Declarações
// **CRITICAL**: These tests check for linter warnings - warnings confirm bugs exist
// **GOAL**: Surface code quality issues that would be caught by a linter

/**
 * Validates: Requirements 4.1, 4.2, 4.3
 * 
 * This file contains tests that check for code quality issues:
 * - Variable shadowing
 * - Unused variables
 * - Duplicate imports
 * 
 * When run against UNFIXED code, these tests will FAIL, demonstrating the bugs.
 * When run against FIXED code, these tests will PASS, validating the fixes.
 */

const fs = require('fs');
const path = require('path');

describe('Categoria 4: Código e Declarações - Bug Condition Exploration', () => {
    
    describe('Bug 4.1: FormData Variable Shadowing', () => {
        
        /**
         * **Validates: Requirements 4.1**
         * 
         * Property: No variable should be imported globally and then redeclared locally
         * 
         * Bug Condition: FormData imported at top AND redeclared inside attachFile()
         * Expected on UNFIXED code: Test FAILS - shadowing detected
         * Expected on FIXED code: Test PASSES - no shadowing (only one import)
         */
        test('Property 4.1: No FormData Variable Shadowing', () => {
            const trelloPath = path.join(__dirname, '../../trello.js');
            const trelloCode = fs.readFileSync(trelloPath, 'utf8');
            
            // Check for global import
            const globalImportRegex = /const\s+FormData\s*=\s*require\s*\(\s*['"]form-data['"]\s*\)/g;
            const matches = trelloCode.match(globalImportRegex);
            
            // Count occurrences of FormData import
            const importCount = matches ? matches.length : 0;
            
            // Split by functions to check if import is inside attachFile
            const hasGlobalImport = /^const\s+FormData\s*=\s*require\s*\(\s*['"]form-data['"]\s*\)/m.test(trelloCode);
            const hasLocalImport = /async function attachFile[\s\S]*?const\s+FormData\s*=\s*require\s*\(\s*['"]form-data['"]\s*\)/m.test(trelloCode);
            
            // EXPECTED BEHAVIOR: Should have only ONE FormData import (either global OR local, not both)
            // On UNFIXED code: Both imports exist (shadowing) -> test FAILS
            // On FIXED code: Only local import exists -> test PASSES
            
            // Document the counterexample
            if (hasGlobalImport && hasLocalImport) {
                console.log('COUNTEREXAMPLE Bug 4.1: FormData variable shadowing detected');
                console.log('  - Global import found at file top');
                console.log('  - Local import found inside attachFile()');
                console.log('  - This causes variable shadowing (linter warning)');
            }
            
            // The bug exists if BOTH global and local imports are present
            const hasShadowing = hasGlobalImport && hasLocalImport;
            
            // Test should FAIL on unfixed code (hasShadowing === true)
            // Test should PASS on fixed code (hasShadowing === false)
            expect(hasShadowing).toBe(false);
        });
    });
    
    describe('Bug 4.2: Unused Response Variable', () => {
        
        /**
         * **Validates: Requirements 4.2**
         * 
         * Property: Variables should be used after assignment or not declared
         * 
         * Bug Condition: response = await axios.post() but response is never read
         * Expected on UNFIXED code: Test FAILS - unused variable detected
         * Expected on FIXED code: Test PASSES - no unused variables
         */
        test('Property 4.2: No Unused Response Variables', () => {
            const trelloPath = path.join(__dirname, '../../trello.js');
            const trelloCode = fs.readFileSync(trelloPath, 'utf8');
            
            // Extract attachFile function
            const attachFileFuncRegex = /async function attachFile\([^)]*\)\s*{([\s\S]*?)^}/m;
            const funcMatch = trelloCode.match(attachFileFuncRegex);
            
            if (!funcMatch) {
                throw new Error('Could not find attachFile function');
            }
            
            const attachFileBody = funcMatch[1];
            
            // Check for response variable assignment
            const responseAssignmentRegex = /const\s+response\s*=\s*await\s+axios\.post/;
            const hasResponseAssignment = responseAssignmentRegex.test(attachFileBody);
            
            if (hasResponseAssignment) {
                // Check if response is used anywhere after assignment
                // Split by the assignment and check if 'response' appears in the code after
                const parts = attachFileBody.split(responseAssignmentRegex);
                if (parts.length >= 2) {
                    const afterAssignment = parts[1];
                    // Look for usage of response variable (excluding the assignment line itself)
                    // Remove the assignment line
                    const afterAssignmentLine = afterAssignment.substring(afterAssignment.indexOf('\n') + 1);
                    const responseUsed = /\bresponse\b/.test(afterAssignmentLine);
                    
                    // EXPECTED BEHAVIOR: If response is assigned, it should be used
                    // On UNFIXED code: response assigned but not used -> test FAILS
                    // On FIXED code: response not assigned (just await axios.post) -> test PASSES
                    
                    if (!responseUsed) {
                        console.log('COUNTEREXAMPLE Bug 4.2: Unused response variable detected');
                        console.log('  - response variable assigned in attachFile()');
                        console.log('  - response variable never used after assignment');
                        console.log('  - This is dead code (linter warning)');
                    }
                    
                    // Test should FAIL on unfixed code (unused)
                    // Test should PASS on fixed code (no assignment or used)
                    expect(responseUsed).toBe(true);
                } else {
                    // Response was assigned, we need to check more carefully
                    // This is the unfixed case - assignment exists but likely not used
                    const codeAfterAssignment = attachFileBody.substring(
                        attachFileBody.indexOf('const response = await axios.post')
                    );
                    
                    // Count if response is referenced after its assignment (excluding the declaration itself)
                    const lines = codeAfterAssignment.split('\n');
                    const usageCount = lines.slice(1).filter(line => /\bresponse\b/.test(line) && !line.trim().startsWith('//')).length;
                    
                    if (usageCount === 0) {
                        console.log('COUNTEREXAMPLE Bug 4.2: Unused response variable detected');
                        console.log('  - response variable assigned in attachFile()');
                        console.log('  - response variable never used after assignment');
                        console.log('  - This is dead code (linter warning)');
                    }
                    
                    expect(usageCount).toBeGreaterThan(0);
                }
            } else {
                // No response assignment found - this is the FIXED code
                // Test passes
                expect(hasResponseAssignment).toBe(false);
            }
        });
    });
    
    describe('Bug 4.3: Duplicate googleapis Import', () => {
        
        /**
         * **Validates: Requirements 4.3**
         * 
         * Property: Modules should be imported only once
         * 
         * Bug Condition: googleapis imported at top AND inside initializeGmail()
         * Expected on UNFIXED code: Test FAILS - duplicate import detected
         * Expected on FIXED code: Test PASSES - single import only
         */
        test('Property 4.3: No Duplicate googleapis Import', () => {
            const emailPath = path.join(__dirname, '../../email.js');
            const emailCode = fs.readFileSync(emailPath, 'utf8');
            
            // Check for global import at top of file
            const globalImportRegex = /^const\s+{\s*google\s*}\s*=\s*require\s*\(\s*['"]googleapis['"]\s*\)/m;
            const hasGlobalImport = globalImportRegex.test(emailCode);
            
            // Check for local import inside initializeGmail function
            const localImportRegex = /async function initializeGmail[\s\S]*?const\s+{\s*google\s*}\s*=\s*require\s*\(\s*['"]googleapis['"]\s*\)/m;
            const hasLocalImport = localImportRegex.test(emailCode);
            
            // Count total occurrences
            const allImportsRegex = /const\s+{\s*google\s*}\s*=\s*require\s*\(\s*['"]googleapis['"]\s*\)/g;
            const allMatches = emailCode.match(allImportsRegex);
            const importCount = allMatches ? allMatches.length : 0;
            
            // EXPECTED BEHAVIOR: Should have only ONE googleapis import (either global OR local, not both)
            // On UNFIXED code: Both imports exist (duplicate) -> test FAILS
            // On FIXED code: Only local import exists -> test PASSES
            
            // Document the counterexample
            if (hasGlobalImport && hasLocalImport) {
                console.log('COUNTEREXAMPLE Bug 4.3: Duplicate googleapis import detected');
                console.log('  - Global import found at file top');
                console.log('  - Local import found inside initializeGmail()');
                console.log('  - This is redundant (linter warning)');
                console.log(`  - Total import count: ${importCount}`);
            }
            
            // The bug exists if BOTH imports are present
            const hasDuplicateImport = hasGlobalImport && hasLocalImport;
            
            // Test should FAIL on unfixed code (hasDuplicateImport === true)
            // Test should PASS on fixed code (hasDuplicateImport === false)
            expect(hasDuplicateImport).toBe(false);
        });
    });
    
    describe('Overall Code Quality Check', () => {
        
        /**
         * Property: All code quality issues should be resolved
         * 
         * This test aggregates all three code quality checks and provides
         * a comprehensive report of issues found.
         */
        test('Property 4: All Code Quality Issues Resolved', () => {
            const trelloPath = path.join(__dirname, '../../trello.js');
            const emailPath = path.join(__dirname, '../../email.js');
            
            const trelloCode = fs.readFileSync(trelloPath, 'utf8');
            const emailCode = fs.readFileSync(emailPath, 'utf8');
            
            const issues = [];
            
            // Check Bug 4.1: FormData shadowing
            const hasGlobalFormData = /^const\s+FormData\s*=\s*require\s*\(\s*['"]form-data['"]\s*\)/m.test(trelloCode);
            const hasLocalFormData = /async function attachFile[\s\S]*?const\s+FormData\s*=\s*require\s*\(\s*['"]form-data['"]\s*\)/m.test(trelloCode);
            if (hasGlobalFormData && hasLocalFormData) {
                issues.push('Bug 4.1: FormData variable shadowing in trello.js');
            }
            
            // Check Bug 4.2: Unused response
            const hasUnusedResponse = /const\s+response\s*=\s*await\s+axios\.post/.test(trelloCode);
            if (hasUnusedResponse) {
                // Check if it's actually unused
                const attachFileFuncRegex = /async function attachFile\([^)]*\)\s*{([\s\S]*?)^}/m;
                const funcMatch = trelloCode.match(attachFileFuncRegex);
                if (funcMatch) {
                    const body = funcMatch[1];
                    const responseIndex = body.indexOf('const response = await axios.post');
                    if (responseIndex >= 0) {
                        const afterAssignment = body.substring(responseIndex + 'const response = await axios.post'.length);
                        const lines = afterAssignment.split('\n');
                        const usageCount = lines.slice(1).filter(line => /\bresponse\b/.test(line) && !line.trim().startsWith('//')).length;
                        if (usageCount === 0) {
                            issues.push('Bug 4.2: Unused response variable in trello.js attachFile()');
                        }
                    }
                }
            }
            
            // Check Bug 4.3: Duplicate googleapis import
            const hasGlobalGoogle = /^const\s+{\s*google\s*}\s*=\s*require\s*\(\s*['"]googleapis['"]\s*\)/m.test(emailCode);
            const hasLocalGoogle = /async function initializeGmail[\s\S]*?const\s+{\s*google\s*}\s*=\s*require\s*\(\s*['"]googleapis['"]\s*\)/m.test(emailCode);
            if (hasGlobalGoogle && hasLocalGoogle) {
                issues.push('Bug 4.3: Duplicate googleapis import in email.js');
            }
            
            // Report all issues
            if (issues.length > 0) {
                console.log('\nCOUNTEREXAMPLES - Code Quality Issues Found:');
                issues.forEach(issue => console.log(`  ✗ ${issue}`));
                console.log('\nThese issues would be caught by a linter (ESLint) and should be fixed.\n');
            }
            
            // EXPECTED BEHAVIOR: No code quality issues
            // On UNFIXED code: issues.length > 0 -> test FAILS
            // On FIXED code: issues.length === 0 -> test PASSES
            expect(issues.length).toBe(0);
        });
    });
});
