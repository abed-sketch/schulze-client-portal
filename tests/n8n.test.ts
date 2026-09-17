import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateRequest, resolveGrant, clientScope, targetScope, leadScope, normalize, batches } from '../backend/n8n/logic.ts';

const client='recAAAAAAAAAAAAAA';
const other='recBBBBBBBBBBBBBB';
const target='recCCCCCCCCCCCCCC';
const lead='recDDDDDDDDDDDDDD';
const person='recEEEEEEEEEEEEEE';
const hash='a'.repeat(64);
const grant={tokenHash:hash,clientRecordId:client,scope:'portal:read',expiresAt:'2099-01-01T00:00:00.000Z',revokedAt:null};
const clientRecord={id:client,'Client Name':'Test A','Target Companies':[target]};
const targetRecord={id:target,Client:[client],Leads:[lead],Website:'https://example.test'};
const leadRecord={id:lead,'Target Company':[target],'Linked Person':[person],'Lead Name':'Example',Notes:'Allowed'};
const req={headers:{authorization:'Bearer '+'A'.repeat(43),origin:'https://portal.test'},query:{},body:{}};

test('request rejects missing/duplicate credentials, selectors, body and wrong origin',()=>{
  assert.equal(validateRequest(req,'https://portal.test').valid,true);
  for(const r of [{...req,headers:{}},{...req,headers:{authorization:[req.headers.authorization]}},{...req,query:{customer:'KD015'}},{...req,body:{clientRecordId:other}},{...req,headers:{...req.headers,origin:'https://evil.test'}},{...req,headers:{authorization:req.headers.authorization+', another'}}]) assert.equal(validateRequest(r,'https://portal.test').valid,false);
});
test('grant authorization requires one exact live scoped grant',()=>{
  assert.equal(resolveGrant([grant],hash).clientRecordId,client);
  for(const rows of [[],[grant,grant],[{...grant,tokenHash:'b'.repeat(64)}],[{...grant,expiresAt:'2020-01-01'}],[{...grant,expiresAt:'invalid'}],[{...grant,revokedAt:'2026-01-01'}],[{...grant,scope:'admin'}],[{...grant,clientRecordId:'KD014'}]]) assert.equal(resolveGrant(rows,hash).valid,false);
});
test('ownership rejects foreign targets, shared clients and missing fetched records',()=>{
  const scope=clientScope([clientRecord],client);
  for(const records of [[],[{...targetRecord,Client:[other]}],[{...targetRecord,Client:[client,other]}],[{...targetRecord,id:other}]]) assert.throws(()=>targetScope(records,scope));
});
test('lead cannot cross target boundary; ambiguous person fails closed',()=>{
  const scope=targetScope([targetRecord],clientScope([clientRecord],client));
  for(const records of [[{...leadRecord,'Target Company':[other]}],[{...leadRecord,'Target Company':[target,other]}],[{...leadRecord,'Linked Person':[person,other]}],[]]) assert.throws(()=>leadScope(records,scope));
});
test('normalization allowlists fields and joins only authorized people',()=>{
  const scope=leadScope([leadRecord],targetScope([targetRecord],clientScope([clientRecord],client)));
  const result=normalize([{id:person,'Full Name':'Synthetic Person',Email:'test@example.test',Notes:'PRIVATE'}],scope);
  assert.deepEqual(Object.keys(result),['customer','leads']);
  assert.equal(result.leads[0].notes,'Allowed');
  assert.equal(result.leads[0].email,'test@example.test');
  assert.equal(JSON.stringify(result).includes('PRIVATE'),false);
  assert.equal(JSON.stringify(result).includes('recAAAA'),false);
  assert.throws(()=>normalize([{id:other}],scope));
});
test('empty scopes return empty list; missing person returns null fields',()=>{
  const empty=leadScope([{}],targetScope([{}],clientScope([{id:client,'Client Name':'Test A'}],client)));
  assert.deepEqual(normalize([{}],empty),{customer:{name:'Test A'},leads:[]});
  const scope=leadScope([{...leadRecord,'Linked Person':[]}],targetScope([targetRecord],clientScope([clientRecord],client)));
  assert.equal(normalize([{}],scope).leads[0].email,null);
});
test('bounded exact-ID queries never become unfiltered or accept formula injection',()=>{
  assert.equal(batches([])[0].formula,'FALSE()');
  assert.throws(()=>batches(["recX') OR TRUE()"]));
  assert.equal(batches([client])[0].formula,`OR(RECORD_ID()='${client}')`);
  assert.throws(()=>clientScope([{...clientRecord,'Target Companies':Array(501).fill(target)}],client));
});

test('multiple query batches cover every ID exactly once',()=>{
  const all=Array.from({length:101},(_,i)=>'rec'+String(i).padStart(14,'0'));
  const queries=batches(all);
  assert.deepEqual(queries.map(q=>(q.formula.match(/RECORD_ID/g)||[]).length),[50,50,1]);
  for(const id of all) assert.equal(queries.filter(q=>q.formula.includes(id)).length,1);
});

test('deployable exports preserve privacy, caller restrictions and API error wiring',()=>{
  for(const name of ['bootstrap','issuer']){
    const workflow=JSON.parse(readFileSync(new URL('../backend/n8n/'+name+'.workflow.json',import.meta.url),'utf8'));
    assert.equal(workflow.active,false);
    assert.equal(workflow.settings.saveDataSuccessExecution,'none');
    assert.equal(workflow.settings.saveDataErrorExecution,'none');
    assert.equal(workflow.settings.saveManualExecutions,false);
    assert.equal(workflow.settings.saveExecutionProgress,false);
    if(name==='issuer'){
      assert.equal(workflow.settings.callerPolicy,'none');
      assert.equal(workflow.nodes.some((n:{type:string})=>n.type==='n8n-nodes-base.webhook'),false);
      assert.equal(workflow.nodes.find((n:{name:string})=>n.name==='Generate random access token').parameters.stringLength,43);
    } else {
      for(const node of workflow.nodes.filter((n:{onError?:string})=>n.onError==='continueErrorOutput')) assert.equal(workflow.connections[node.name].main[1][0].node,'Return service error');
    }
    for(const node of workflow.nodes.filter((n:{type:string})=>n.type==='n8n-nodes-base.airtable')) assert.equal(node.parameters.operation,'search');
  }
});
