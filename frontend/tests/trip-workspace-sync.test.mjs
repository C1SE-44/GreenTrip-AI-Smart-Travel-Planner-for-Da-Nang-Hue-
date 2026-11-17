import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const ts=createRequire(import.meta.url)('typescript');
test('Reopening the trip list waits for a pending metadata write',async()=>{
 const calls=[];let finish;let server={id:'a',startDate:'2026-11-10',workspaceRevision:1};
 const fetchJson=async(path,init)=>{calls.push(path);if(init?.method==='PUT')return new Promise(resolve=>{finish=()=>{server={...JSON.parse(init.body).data,workspaceRevision:2};resolve(server);};});return path==='/trip-workspaces'?{items:[server],deleted_ids:[]}:[];};
 const exports={};const storage={getItem:()=> 'alice'};
 const source=readFileSync(new URL('../src/services/tripWorkspace.ts',import.meta.url),'utf8');
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,AbortSignal,localStorage:storage,sessionStorage:storage,require:()=>({fetchJson})});
 const saving=exports.saveTripWorkspace({...server,startDate:'2026-11-17'});await new Promise(r=>setImmediate(r));
 const listing=exports.listTripWorkspaces();await new Promise(r=>setImmediate(r));assert.deepEqual(calls,['/trip-workspaces/a']);finish();await saving;
 assert.equal((await listing)[0].startDate,'2026-11-17');
});
