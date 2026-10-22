// Fixture-only execution of the actual compiled server cookie adapter. No provider client is created.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const ts = require('typescript');
const source = fs.readFileSync(path.join(root, 'lib/supabase/server.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
let ready = false, clientCalls = 0, adapter, writes = [], rejectCookies = false, rejectWrite = false;
const original = [{name: 'fixture-session', value: 'fixture-value'}];
const store = {getAll: () => original, set: (...args) => { if (rejectWrite) throw Error('read-only component'); writes.push(args); }};
const exportsObject = {};
vm.runInNewContext(compiled, {
 exports: exportsObject, process: {env: {NEXT_PUBLIC_SUPABASE_URL: 'https://example.invalid', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture'}},
 require(name) {
  if (name === 'next/headers') return { cookies: async () => { await Promise.resolve(); if (rejectCookies) throw Error('fixture cookies failure'); ready = true; return store; } };
  if (name === '@supabase/ssr') return {createServerClient: (url, key, options) => { assert.ok(ready); assert.equal(url, 'https://example.invalid'); clientCalls++; adapter = options.cookies; return {fixture: true}; }};
  throw Error('Unexpected import: ' + name);
 },
});
(async () => {
 assert.equal((await exportsObject.createClient()).fixture, true);
 assert.equal(clientCalls, 1); assert.equal(adapter.getAll(), original);
 const options = {httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60};
 adapter.setAll([{name: 'fixture-session', value: 'changed', options}]);
 assert.deepEqual(writes, [['fixture-session', 'changed', options]]);
 rejectWrite = true; adapter.setAll([{name: 'fixture-session', value: 'ignored', options}]);
 rejectCookies = true; await assert.rejects(exportsObject.createClient(), /fixture cookies failure/);
 assert.equal(clientCalls, 1);
 console.log('Actual async cookie adapter: awaited cookie store, read/write flags, read-only component, and failed cookie access fixtures PASS; zero provider calls');
})().catch(error => { console.error(error); process.exitCode = 1; });
