import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveGrant, normalizeSnapshot } from '../backend/n8n/logic.ts';

const client='recAAAAAAAAAAAAAA';
const other='recBBBBBBBBBBBBBB';
const target='recCCCCCCCCCCCCCC';
const lead='recDDDDDDDDDDDDDD';
const person='recEEEEEEEEEEEEEE';
const hash='a'.repeat(64);
const live={tokenHash:hash,expiresAt:'2099-01-01T00:00:00.000Z',revokedAt:null};

test('grant resolver supports only exact customer and restricted admin scopes',()=>{
  assert.deepEqual(resolveGrant([{...live,scope:'portal:read',clientRecordId:client}],hash),{valid:true,scope:'portal:read',clientRecordId:client});
  assert.deepEqual(resolveGrant([{...live,scope:'portal:admin',clientRecordId:'__portal_admin__'}],hash),{valid:true,scope:'portal:admin',clientRecordId:'__portal_admin__'});
  for (const grant of [
    {...live,scope:'portal:admin',clientRecordId:client},
    {...live,scope:'portal:read',clientRecordId:'__portal_admin__'},
    {...live,scope:'portal:root',clientRecordId:'__portal_admin__'},
  ]) assert.equal(resolveGrant([grant],hash).valid,false);
});

test('full snapshot allowlists fields and joins a valid owned lead',()=>{
  const result=normalizeSnapshot(
    [{id:client,fields:{'Client Name':'Alpha GmbH','Client ID':'KD014','Target Companies':[target],Private:'hidden'}}],
    [{id:target,fields:{Client:[client],Leads:[lead],Website:'https://alpha.test',Private:'hidden'}}],
    [{id:lead,fields:{'Target Company':[target],'Linked Person':[person],'Lead Name':'Example','Lead Status':'New',Notes:'Allowed',Source:'LinkedIn',Private:'hidden'}}],
    [{id:person,fields:{'Full Name':'Person',Email:'p@example.test',Phone:'+49 1','Role/Title':'CEO',Private:'hidden'}}],
  );
  assert.deepEqual(result.clients,[{airtableClientId:client,clientId:'KD014',clientName:'Alpha GmbH',primaryContactEmail:null,sourceUpdatedAt:null}]);
  assert.equal(result.leads.length,1);
  assert.deepEqual(result.leads[0],{
    airtableLeadId:lead,airtableClientId:client,airtableTargetCompanyId:target,airtablePersonId:person,
    leadName:'Example',contactName:'Person',status:'New',website:'https://alpha.test',notes:'Allowed',
    email:'p@example.test',phone:'+49 1',position:'CEO',source:'LinkedIn',sourceUpdatedAt:null,
  });
  assert.deepEqual(result.diagnostics,{clientsScanned:1,targetsScanned:1,leadsScanned:1,peopleScanned:1,clientsIncluded:1,leadsIncluded:1,skippedTargets:0,skippedLeads:0});
  assert.equal(JSON.stringify(result).includes('Private'),false);
  assert.equal(JSON.stringify(result).includes('hidden'),false);
});

test('snapshot skips unowned, ambiguous and cross-linked records instead of attaching them',()=>{
  const result=normalizeSnapshot(
    [
      {id:client,fields:{'Client Name':'Alpha','Target Companies':[target]}},
      {id:other,fields:{'Client Name':'Beta','Target Companies':[]}},
    ],
    [{id:target,fields:{Client:[],Leads:[lead],Website:'https://unsafe.test'}}],
    [{id:lead,fields:{'Target Company':[target],'Linked Person':[],'Lead Name':'Unsafe'}}],
    [],
  );
  assert.equal(result.clients.length,2);
  assert.deepEqual(result.leads,[]);
  assert.equal(result.diagnostics.skippedTargets,1);
  assert.equal(result.diagnostics.skippedLeads,1);

  const cross=normalizeSnapshot(
    [
      {id:client,fields:{'Client Name':'Alpha','Target Companies':[target]}},
      {id:other,fields:{'Client Name':'Beta','Target Companies':[]}},
    ],
    [{id:target,fields:{Client:[other],Leads:[lead]}}],
    [{id:lead,fields:{'Target Company':[target],'Linked Person':[],'Lead Name':'Unsafe'}}],
    [],
  );
  assert.deepEqual(cross.leads,[]);
  assert.equal(cross.diagnostics.skippedTargets,1);
});

test('snapshot rejects duplicate source IDs, malformed clients and excessive inputs',()=>{
  assert.throws(()=>normalizeSnapshot([{id:client,fields:{'Client Name':'A'}},{id:client,fields:{'Client Name':'A'}}],[],[],[]));
  assert.throws(()=>normalizeSnapshot([{id:'bad',fields:{'Client Name':'A'}}],[],[],[]));
  assert.throws(()=>normalizeSnapshot([{id:client,fields:{'Client Name':''}}],[],[],[]));
  assert.throws(()=>normalizeSnapshot(Array.from({length:10001},()=>({})),[],[],[]));
});

test('access matches only a reciprocal primary contact with a valid normalized email',()=>{
 const clientRow={id:client,fields:{'Client Name':'Alpha','Primary Contact':[person]}};
 const primary={id:person,fields:{Email:' OWNER@Example.com ',Clients:[client]}};
 assert.equal(normalizeSnapshot([clientRow],[],[],[primary]).clients[0].primaryContactEmail,'owner@example.com');
 for(const people of [[],[{...primary,fields:{...primary.fields,Clients:[other]}}],[{...primary,fields:{...primary.fields,Email:'bad'}}]]) {
  assert.equal(normalizeSnapshot([clientRow],[],[],people).clients[0].primaryContactEmail,null);
 }
 assert.equal(normalizeSnapshot([{...clientRow,fields:{...clientRow.fields,'Primary Contact':[person,other]}}],[],[],[primary]).clients[0].primaryContactEmail,null);
});
