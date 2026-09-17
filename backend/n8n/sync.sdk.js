import { workflow, node, trigger, newCredential, expr } from '@n8n/workflow-sdk';

const manual = trigger({
  type: 'n8n-nodes-base.manualTrigger',
  version: 1,
  config: { name: 'Run portal sync manually', parameters: {}, position: [0, 120] },
  output: [{}],
});

const schedule = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: {
    name: 'Every 5 minutes',
    parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 5 }] } },
    position: [0, 320],
  },
  output: [{}],
});

const airtable = newCredential('Schulze x Apex Airtable', 'oun3u0zdIMOShiCK');
const internalBearer = newCredential('Schulze Portal Supabase', 'MpEnClmtG7bhzNBS');
const base = { __rl: true, mode: 'id', value: 'appAutw0Fvsuk2pfJ' };

const clients = node({
  type: 'n8n-nodes-base.airtable', version: 2.2,
  config: {
    name: 'Read portal clients',
    parameters: {
      authentication: 'airtableTokenApi', base, resource: 'record', operation: 'search',
      table: { __rl: true, mode: 'id', value: 'tblfPwZLXgjYuFMsc' },
      returnAll: true,
      options: { fields: ['Client Name', 'Client ID', 'Target Companies'] },
    },
    credentials: { airtableTokenApi: airtable },
    alwaysOutputData: true,
    position: [300, 220],
  },
  output: [{ id: 'recAAAAAAAAAAAAAA', fields: { 'Client Name': 'Example', 'Target Companies': [] } }],
});

const targets = node({
  type: 'n8n-nodes-base.airtable', version: 2.2,
  config: {
    name: 'Read portal target companies',
    parameters: {
      authentication: 'airtableTokenApi', base, resource: 'record', operation: 'search',
      table: { __rl: true, mode: 'id', value: 'tbln087XtgwIP7HPG' },
      returnAll: true,
      options: { fields: ['Client', 'Leads', 'Website'] },
    },
    credentials: { airtableTokenApi: airtable },
    alwaysOutputData: true,
    executeOnce: true,
    position: [560, 220],
  },
  output: [{ id: 'recBBBBBBBBBBBBBB', fields: { Client: [], Leads: [] } }],
});

const leads = node({
  type: 'n8n-nodes-base.airtable', version: 2.2,
  config: {
    name: 'Read portal leads',
    parameters: {
      authentication: 'airtableTokenApi', base, resource: 'record', operation: 'search',
      table: { __rl: true, mode: 'id', value: 'tblYeDa6ZbNL5YGTb' },
      returnAll: true,
      options: { fields: ['Lead Name', 'Target Company', 'Linked Person', 'Lead Status', 'Notes', 'Source'] },
    },
    credentials: { airtableTokenApi: airtable },
    alwaysOutputData: true,
    executeOnce: true,
    position: [820, 220],
  },
  output: [{ id: 'recCCCCCCCCCCCCCC', fields: { 'Target Company': [], 'Linked Person': [] } }],
});

const people = node({
  type: 'n8n-nodes-base.airtable', version: 2.2,
  config: {
    name: 'Read portal people',
    parameters: {
      authentication: 'airtableTokenApi', base, resource: 'record', operation: 'search',
      table: { __rl: true, mode: 'id', value: 'tblf2AsiyZTb306JQ' },
      returnAll: true,
      options: { fields: ['Full Name', 'Email', 'Phone', 'Role/Title'] },
    },
    credentials: { airtableTokenApi: airtable },
    alwaysOutputData: true,
    executeOnce: true,
    position: [1080, 220],
  },
  output: [{ id: 'recDDDDDDDDDDDDDD', fields: { 'Full Name': 'Example' } }],
});

const buildSnapshot = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: {
    name: 'Build fail-closed snapshot',
    parameters: {
      mode: 'runOnceForAllItems', language: 'javaScript',
      jsCode: `const recordPattern=/^rec[A-Za-z0-9]{14}$/;
const fail=()=>{throw new Error('portal_source_data_invalid');};
const field=(r)=>r&&r.fields&&typeof r.fields==='object'&&!Array.isArray(r.fields)?r.fields:r;
const actual=(name,max)=>{const all=$(name).all().map(i=>i.json);if(all.length>max)fail();return all.filter(r=>r&&typeof r==='object'&&!Array.isArray(r)&&Object.keys(r).length);};
const unique=(name,max)=>{const rows=actual(name,max),seen=new Set();for(const r of rows){if(typeof r.id!=='string'||!recordPattern.test(r.id)||seen.has(r.id))fail();seen.add(r.id);}return rows;};
const links=(v,max)=>{if(v==null)return[];if(!Array.isArray(v)||v.length>max)fail();const out=[],seen=new Set();for(const id of v){if(typeof id!=='string'||!recordPattern.test(id)||seen.has(id))fail();seen.add(id);out.push(id);}return out;};
const text=(v,max=100000)=>{if(v==null||v==='')return null;if(typeof v!=='string'||v.length>max)fail();return v;};
const clientRows=unique('Read portal clients',10000),targetRows=unique('Read portal target companies',100000),leadRows=unique('Read portal leads',100000),personRows=unique('Read portal people',100000);
const clients=[],clientTargets=new Map();
for(const row of clientRows){const f=field(row),clientName=text(f['Client Name'],10000);if(!clientName||!clientName.trim())fail();const clientId=text(f['Client ID'],200);clients.push({airtableClientId:row.id,clientId,clientName,sourceUpdatedAt:null});clientTargets.set(row.id,new Set(links(f['Target Companies'],10000)));}
clients.sort((a,b)=>a.airtableClientId.localeCompare(b.airtableClientId));
const personById=new Map(personRows.map(r=>[r.id,field(r)]));
const targetById=new Map();let skippedTargets=0;
for(const row of targetRows){const f=field(row),owners=links(f.Client,100),owner=owners.length===1?owners[0]:null;if(!owner||!clientTargets.has(owner)||!clientTargets.get(owner).has(row.id)){skippedTargets++;continue;}targetById.set(row.id,{clientId:owner,leadIds:new Set(links(f.Leads,10000)),website:text(f.Website,10000)});}
const normalizedLeads=[];let skippedLeads=0;
for(const row of leadRows){const f=field(row),targetIds=links(f['Target Company'],100),targetId=targetIds.length===1?targetIds[0]:null,target=targetId?targetById.get(targetId):null;if(!target||!target.leadIds.has(row.id)){skippedLeads++;continue;}const personIds=links(f['Linked Person'],100);if(personIds.length>1){skippedLeads++;continue;}const requested=personIds[0]||null,p=requested?personById.get(requested):null,personId=p?requested:null,leadName=text(f['Lead Name'],10000)||text(p&&p['Full Name'],10000)||'Unbenannter Interessent';normalizedLeads.push({airtableLeadId:row.id,airtableClientId:target.clientId,airtableTargetCompanyId:targetId,airtablePersonId:personId,leadName,contactName:text(p&&p['Full Name'],10000),status:text(f['Lead Status'],10000),website:target.website,notes:text(f.Notes),email:text(p&&p.Email,10000),phone:text(p&&p.Phone,10000),position:text(p&&p['Role/Title'],10000),source:text(f.Source,10000),sourceUpdatedAt:null});}
normalizedLeads.sort((a,b)=>a.airtableLeadId.localeCompare(b.airtableLeadId));
return [{json:{clients,leads:normalizedLeads,diagnostics:{clientsScanned:clientRows.length,targetsScanned:targetRows.length,leadsScanned:leadRows.length,peopleScanned:personRows.length,clientsIncluded:clients.length,leadsIncluded:normalizedLeads.length,skippedTargets,skippedLeads}}}];`,
    },
    position: [1340, 220],
  },
  output: [{ clients: [], leads: [], diagnostics: { clientsScanned: 0, targetsScanned: 0, leadsScanned: 0, peopleScanned: 0, clientsIncluded: 0, leadsIncluded: 0, skippedTargets: 0, skippedLeads: 0 } }],
});

const replaceSnapshot = node({
  type: 'n8n-nodes-base.httpRequest', version: 4.5,
  config: {
    name: 'Replace Supabase portal snapshot',
    parameters: {
      method: 'POST',
      url: 'https://zwtmlrzwqnluosrdbjfv.supabase.co/functions/v1/portal-sync',
      authentication: 'genericCredentialType', genericAuthType: 'httpBearerAuth',
      sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: expr('{{ $json }}'),
      options: {
        redirect: { redirect: { followRedirects: false } },
        response: { response: { responseFormat: 'json' } },
        timeout: 30000,
      },
    },
    credentials: { httpBearerAuth: internalBearer },
    position: [1600, 220],
  },
  output: [{ ok: true, snapshot: { clients: 0, leads: 0, deletedClients: 0, deletedLeads: 0 }, diagnostics: {} }],
});

const validateAck = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: {
    name: 'Validate sync acknowledgement',
    parameters: {
      mode: 'runOnceForAllItems', language: 'javaScript',
      jsCode: `const value=$input.first().json;
const nonNegative=(v)=>Number.isSafeInteger(v)&&v>=0;
if(!value||value.ok!==true||!value.snapshot||!value.diagnostics)throw new Error('portal_sync_failed');
for(const key of ['clients','leads','deletedClients','deletedLeads'])if(!nonNegative(value.snapshot[key]))throw new Error('portal_sync_failed');
for(const key of ['clientsScanned','targetsScanned','leadsScanned','peopleScanned','clientsIncluded','leadsIncluded','skippedTargets','skippedLeads'])if(!nonNegative(value.diagnostics[key]))throw new Error('portal_sync_failed');
return [{json:{ok:true,snapshot:value.snapshot,diagnostics:value.diagnostics}}];`,
    },
    position: [1860, 220],
  },
  output: [{ ok: true, snapshot: {}, diagnostics: {} }],
});

export default workflow('schulze-portal-airtable-supabase-sync', 'Schulze Portal · Airtable → Supabase sync')
  .add(manual).to(clients)
  .add(schedule).to(clients)
  .add(clients).to(targets).to(leads).to(people).to(buildSnapshot).to(replaceSnapshot).to(validateAck);
