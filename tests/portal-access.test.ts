import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverPortalAccess, normalizePortalAccess } from '../backend/n8n/access.js';
const client='recAAAAAAAAAAAAAA', other='recBBBBBBBBBBBBBB';
const row=(id='recCCCCCCCCCCCCCC', fields={})=>({id,fields:{Email:' ADMIN@Example.com ',Role:'Admin',Active:true,...fields}});
const table={id:'tblAAAAAAAAAAAAAA',name:'Portal Access',fields:[{name:'Email',type:'email'},{name:'Role',type:'singleSelect',options:{choices:[{name:'Client'},{name:'Admin'}]}},{name:'Active',type:'checkbox'},{name:'Client',type:'multipleRecordLinks',options:{linkedTableId:'tblfPwZLXgjYuFMsc',prefersSingleRecordLink:true}}]};
test('discovery distinguishes missing, invalid and exact valid schema',()=>{
 assert.deepEqual(discoverPortalAccess({tables:[]}),{status:'missing',tableId:null});
 assert.equal(discoverPortalAccess({tables:[table]}).status,'ready');
 assert.equal(discoverPortalAccess({tables:[table,table]}).status,'invalid');
 assert.equal(discoverPortalAccess({tables:[{...table,fields:[]}]}).status,'invalid');
 assert.throws(()=>discoverPortalAccess({error:'forbidden'}));
});
test('access normalizes email, requires checked Active and exact explicit roles',()=>{
 assert.deepEqual(normalizePortalAccess([row()],[client]).access,[{airtableAccessId:row().id,email:'admin@example.com',role:'Admin',clientId:null,active:true}]);
 assert.equal(normalizePortalAccess([row(undefined,{Active:undefined})],[client]).access[0].active,false);
 for(const fields of [{Role:'admin'},{Role:'portal:admin'},{Email:'bad'},{Active:'true'},{Client:[client]},{Role:'Client'},{Role:'Client',Client:[other]},{Role:'Client',Client:[client,other]}]) assert.equal(normalizePortalAccess([row(undefined,fields)],[client]).access.length,0);
});
test('duplicate grants fail closed including active/inactive conflict; multiple client grants work',()=>{
 assert.equal(normalizePortalAccess([row(),row('recDDDDDDDDDDDDDD',{Active:false})],[client]).access.length,0);
 assert.equal(normalizePortalAccess([row(undefined,{Role:'Client',Client:[client]}),row('recDDDDDDDDDDDDDD',{Role:'Client',Client:[other]})],[client,other]).access.length,2);
 assert.throws(()=>normalizePortalAccess([row(),row()],[client]));
 assert.throws(()=>normalizePortalAccess(Array(10001).fill({}),[]));
 assert.deepEqual(normalizePortalAccess([{}],[]).access,[]);
});

test('deployed Code nodes execute tested access rules, including missing and empty table paths', async()=>{
 const {readWorkflowConfig}=await import('../scripts/read-workflow-config.mjs');
 const nodes=readWorkflowConfig('backend/n8n/sync.sdk.js');
 const discovery=nodes.find((n:{name:string})=>n.name==='Validate portal access schema');
 assert.ok(discovery);
 const fn=new Function('$input',discovery.parameters.jsCode);
 assert.deepEqual(fn({first:()=>({json:{tables:[table]}})})[0].json,discoverPortalAccess({tables:[table]}));
 const build=nodes.find((n:{name:string})=>n.name==='Build fail-closed snapshot');
 assert.ok(build);
 for(const status of ['missing','invalid','ready']){
  const data:Record<string,unknown[]>={
   'Begin ordered portal snapshot':[{snapshotStartedAt:new Date().toISOString()}],
   'Read portal clients':[{id:client,'Client Name':'Alpha'}],
   'Read portal target companies':[{}],'Read portal leads':[{}],'Read portal people':[{}],
   'Validate portal access schema':[{status,tableId:status==='missing'?null:table.id}],
   'Read portal access':[{}],
  };
  const result: {accessStatus:string;access:unknown[];clients:unknown[]}=new Function('$',build.parameters.jsCode)((name:string)=>{
   if(name==='Read portal access'&&status!=='ready') throw new Error('unexecuted node referenced');
   return {all:()=>data[name].map(json=>({json})),first:()=>({json:data[name][0]})};
  })[0].json;
  assert.equal(result.accessStatus,status);
  assert.deepEqual(result.access,[]);
  assert.equal(result.clients.length,1);
 }
});
