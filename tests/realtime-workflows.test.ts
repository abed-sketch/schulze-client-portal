import test from 'node:test';
import assert from 'node:assert/strict';
import {readWorkflowConfig} from '../scripts/read-workflow-config.mjs';
const hooks=readWorkflowConfig('backend/n8n/realtime-hooks.sdk.js');
const worker=readWorkflowConfig('backend/n8n/realtime-worker.sdk.js');
const code=(nodes:any[],name:string)=>nodes.find(n=>n.name===name).parameters.jsCode;
const prepare=new Function('$input','$',code(hooks,'Prepare hook maintenance'));
const run=(local:any[],remote:any[])=>prepare({first:()=>({json:{hooks:local}})},()=>({first:()=>({json:{webhooks:remote}})}));
const tables=['tblfPwZLXgjYuFMsc','tbln087XtgwIP7HPG','tblYeDa6ZbNL5YGTb','tblf2AsiyZTb306JQ','tblH1iaekZP1YRh2m'];
const local=tables.map((table_id,i)=>({table_id,webhook_id:'ach0000000000000'+i}));
const remote=local.map(h=>({id:h.webhook_id,notificationUrl:'https://zwtmlrzwqnluosrdbjfv.supabase.co/functions/v1/portal-airtable-events/notify',specification:{options:{filters:{recordChangeScope:h.table_id}}}}));
test('public wake accepts only a proof and cannot request trusted recovery',()=>{
 const fn=new Function('$input',code(worker,'Accept wake proof only'));
 for(const body of [{},{recovery:true},{proof:'fake',recovery:true}]) assert.deepEqual(fn({first:()=>({json:{body}})}),[]);
 const proof=crypto.randomUUID()+crypto.randomUUID();
 assert.deepEqual(fn({first:()=>({json:{body:{proof,recovery:true,leaseId:'fake'}}})}),[{json:{proof}}]);
});
test('maintenance plans exactly five owned hooks and detects expired, missing and orphan hooks',()=>{
 assert.equal(run([],[]).length,5);
 const loop:any=hooks.find((n:any)=>n.name==='Maintain one hook at a time');
 assert.ok(loop);assert.equal(loop.parameters.batchSize,1);
 assert.deepEqual(run([],[])[0].json.request.specification.options.filters.dataTypes,['tableData','tableFields','tableMetadata']);
 assert.throws(()=>run([],remote),/registry_mismatch/);
 assert.equal(run(local,remote).length,5);
 assert.ok(run(local,remote).every((r:any)=>r.json.action==='renewed'));
 assert.equal(run(local,remote.slice(1))[0].json.retireId,local[0].webhook_id);
 assert.equal(run(local,remote.slice(1))[0].json.action,'register');
 const expired=remote.map((r,i)=>i===0?{...r,expirationTime:'2020-01-01T00:00:00Z'}:r);
 assert.equal(run(local,expired)[0].json.retireRemote,local[0].webhook_id);
 const disabled=remote.map((r,i)=>i===0?{...r,isHookEnabled:false}:r);
 assert.equal(run(local,disabled)[0].json.action,'register');
});
test('worker cannot acknowledge an unsuccessful snapshot',()=>{
 const fn=new Function('$input','$',code(worker,'Require confirmed snapshot'));
 assert.throws(()=>fn({first:()=>({json:{ok:false}})},()=>({first:()=>({json:{leaseId:'lease'}})})),/not_confirmed/);
 assert.deepEqual(fn({first:()=>({json:{ok:true}})},()=>({first:()=>({json:{leaseId:'lease'}})})),[{json:{leaseId:'lease'}}]);
});
