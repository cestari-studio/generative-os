#!/usr/bin/env node
/**
 * Formal JSON-Schema validation for evidence artifacts, using the repo's own Ajv.
 * Usage: node validate-evidence.mjs <schemaPath> <evidencePath>
 * Prints {"valid": bool, "errors": [...]} and exits 0/1 accordingly.
 */
import { readFileSync } from 'node:fs';
import Ajv from 'ajv';

const [, , schemaPath, evidencePath] = process.argv;
const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
const data = JSON.parse(readFileSync(evidencePath, 'utf8'));

const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(schema);
const valid = validate(data);

console.log(JSON.stringify({ valid, errors: valid ? [] : validate.errors }));
process.exit(valid ? 0 : 1);
