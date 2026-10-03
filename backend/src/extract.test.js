import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {extract} from './extract.js';
test('spreadsheet evidence extracts sheet names and working values without evaluating code',async()=>{const text=await extract('sample.xlsx',await readFile(new URL('../fixtures/sample-register.xlsx',import.meta.url)));assert.ok(text.includes('Risks'));assert.ok(text.includes('Risk | Score'));assert.ok(text.includes('Sample backup failure | 12'));});
