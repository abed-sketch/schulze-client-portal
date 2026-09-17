import { workflow, node, trigger, ifElse, newCredential, expr } from '@n8n/workflow-sdk';

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
      options: { fields: ['Client Name', 'Client ID', 'Target Companies', 'Primary Contact'] },
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
      options: { fields: ['Full Name', 'Email', 'Phone', 'Role/Title', 'Clients'] },
    },
    credentials: { airtableTokenApi: airtable },
    alwaysOutputData: true,
    executeOnce: true,
    position: [1080, 220],
  },
  output: [{ id: 'recDDDDDDDDDDDDDD', fields: { 'Full Name': 'Example' } }],
});

// BEGIN GENERATED ACCESS NODES
const snapshotStart = node({type:'n8n-nodes-base.code',version:2,config:{name:'Begin ordered portal snapshot',position:[150,220],parameters:{mode:'runOnceForAllItems',language:'javaScript',jsCode:'return [{json:{snapshotStartedAt:new Date().toISOString()}}];'}},output:[{snapshotStartedAt:'2026-09-17T00:00:00.000Z'}]});
const accessSchema = node({
 type:'n8n-nodes-base.httpRequest',version:4.5,
 config:{name:'Discover portal access schema',executeOnce:true,position:[1340,220],
  parameters:{method:'GET',url:'https://api.airtable.com/v0/meta/bases/appAutw0Fvsuk2pfJ/tables',authentication:'predefinedCredentialType',nodeCredentialType:'airtableTokenApi',options:{redirect:{redirect:{followRedirects:false}},response:{response:{responseFormat:'json'}},timeout:20000}},
  credentials:{airtableTokenApi:airtable}},output:[{tables:[]}]});
const accessDiscovery = node({type:'n8n-nodes-base.code',version:2,
 config:{name:'Validate portal access schema',position:[1600,220],parameters:{mode:'runOnceForAllItems',language:'javaScript',jsCode:"const discoverPortalAccess = function discoverPortalAccess(schema) {\n  if (!schema || !Array.isArray(schema.tables)) throw new Error('portal_schema_read_invalid');\n  const matches = schema.tables.filter(t => t.name === 'Portal Access');\n  if (!matches.length) return { status: 'missing', tableId: null };\n  const table = matches[0];\n  const invalid = { status: 'invalid', tableId: /^tbl[A-Za-z0-9]{14}$/.test(table.id) ? table.id : null };\n  if (matches.length !== 1 || !invalid.tableId || !Array.isArray(table.fields)) return invalid;\n  const field = name => table.fields.filter(f => f.name === name);\n  const exactly = (name, type) => field(name).length === 1 && field(name)[0].type === type;\n  if (!exactly('Email', 'email') || !exactly('Role', 'singleSelect') ||\n      !exactly('Active', 'checkbox') || !exactly('Client', 'multipleRecordLinks')) return invalid;\n  const choices = field('Role')[0].options?.choices?.map(c => c.name).sort();\n  const link = field('Client')[0].options;\n  if (JSON.stringify(choices) !== '[\"Admin\",\"Client\"]' ||\n      link?.linkedTableId !== 'tblfPwZLXgjYuFMsc' || link?.prefersSingleRecordLink !== true) return invalid;\n  return { status: 'ready', tableId: table.id };\n};\nreturn [{json:discoverPortalAccess($input.first().json)}];"}},
 output:[{status:'ready',tableId:'tblAAAAAAAAAAAAAA'}]});
const accessReady = ifElse({version:2.2,config:{name:'Portal access table ready',position:[1860,220],parameters:{conditions:{options:{caseSensitive:true,leftValue:'',typeValidation:'strict'},conditions:[{leftValue:expr('{{ $json.status }}'),operator:{type:'string',operation:'equals'},rightValue:'ready'}],combinator:'and'},options:{}}}});
const accessRows = node({type:'n8n-nodes-base.airtable',version:2.2,
 config:{name:'Read portal access',executeOnce:true,alwaysOutputData:true,position:[2120,120],
  notes:'Read all pages, including inactive grants. Empty success deliberately revokes all explicit grants; API failures stop before replacement.',
  parameters:{authentication:'airtableTokenApi',base,resource:'record',operation:'search',table:{__rl:true,mode:'id',value:expr('{{ $json.tableId }}')},returnAll:true,options:{fields:['Email','Role','Client','Active']}},
  credentials:{airtableTokenApi:airtable}},output:[{}]});
// END GENERATED ACCESS NODES

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
const personById=new Map(personRows.map(r=>[r.id,field(r)]));
const clients=[],clientTargets=new Map();
for(const row of clientRows){const f=field(row),clientName=text(f['Client Name'],10000);if(!clientName||!clientName.trim())fail();const clientId=text(f['Client ID'],200);const contacts=links(f['Primary Contact'],100),p=contacts.length===1?personById.get(contacts[0]):null,candidate=p&&links(p.Clients,10000).includes(row.id)?text(p.Email,10000)?.trim().toLowerCase():null,primaryContactEmail=candidate&&candidate.length<=254&&/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(candidate)?candidate:null;clients.push({airtableClientId:row.id,clientId,clientName,primaryContactEmail,sourceUpdatedAt:null});clientTargets.set(row.id,new Set(links(f['Target Companies'],10000)));}
clients.sort((a,b)=>a.airtableClientId.localeCompare(b.airtableClientId));
const targetById=new Map();let skippedTargets=0;
for(const row of targetRows){const f=field(row),owners=links(f.Client,100),owner=owners.length===1?owners[0]:null;if(!owner||!clientTargets.has(owner)||!clientTargets.get(owner).has(row.id)){skippedTargets++;continue;}targetById.set(row.id,{clientId:owner,leadIds:new Set(links(f.Leads,10000)),website:text(f.Website,10000)});}
const normalizedLeads=[];let skippedLeads=0;
for(const row of leadRows){const f=field(row),targetIds=links(f['Target Company'],100),targetId=targetIds.length===1?targetIds[0]:null,target=targetId?targetById.get(targetId):null;if(!target||!target.leadIds.has(row.id)){skippedLeads++;continue;}const personIds=links(f['Linked Person'],100);if(personIds.length>1){skippedLeads++;continue;}const requested=personIds[0]||null,p=requested?personById.get(requested):null,personId=p?requested:null,leadName=text(f['Lead Name'],10000)||text(p&&p['Full Name'],10000)||'Unbenannter Interessent';normalizedLeads.push({airtableLeadId:row.id,airtableClientId:target.clientId,airtableTargetCompanyId:targetId,airtablePersonId:personId,leadName,contactName:text(p&&p['Full Name'],10000),status:text(f['Lead Status'],10000),website:target.website,notes:text(f.Notes),email:text(p&&p.Email,10000),phone:text(p&&p.Phone,10000),position:text(p&&p['Role/Title'],10000),source:text(f.Source,10000),sourceUpdatedAt:null});}
normalizedLeads.sort((a,b)=>a.airtableLeadId.localeCompare(b.airtableLeadId));
// BEGIN GENERATED ACCESS LOGIC
const normalizePortalAccess = function normalizePortalAccess(rows, clientIds) {
  if (!Array.isArray(rows) || rows.length > 10000) throw new Error('portal_access_limit');
  const clients = new Set(clientIds), ids = new Set(), groups = new Map();
  let scanned = 0, invalid = 0;
  for (const row of rows) {
    // n8n emits one empty object for a successfully read, empty table.
    if (row && typeof row === 'object' && !Array.isArray(row) && !Object.keys(row).length) continue;
    scanned++;
    if (!row || !/^rec[A-Za-z0-9]{14}$/.test(row.id) || ids.has(row.id)) throw new Error('portal_access_record_invalid');
    ids.add(row.id);
    const f = row.fields && typeof row.fields === 'object' && !Array.isArray(row.fields) ? row.fields : row;
    const email = typeof f.Email === 'string' ? f.Email.trim().toLowerCase() : '';
    const linked = f.Client == null ? [] : f.Client;
    if (email.length > 254 || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email) ||
        !['Admin', 'Client'].includes(f.Role) || !Array.isArray(linked) ||
        (f.Role === 'Admin' ? linked.length !== 0 : linked.length !== 1 || !clients.has(linked[0])) ||
        (f.Active != null && typeof f.Active !== 'boolean')) { invalid++; continue; }
    const clientId = f.Role === 'Client' ? linked[0] : null;
    const key = JSON.stringify([email, f.Role, clientId]);
    const group = groups.get(key) || [];
    group.push({ airtableAccessId: row.id, email, role: f.Role, clientId, active: f.Active === true });
    groups.set(key, group);
  }
  const access = [];
  let duplicates = 0;
  for (const group of groups.values()) {
    if (group.length !== 1) { duplicates += group.length; continue; }
    access.push(group[0]);
  }
  access.sort((a, b) => a.airtableAccessId.localeCompare(b.airtableAccessId));
  return { access, accessDiagnostics: { scanned, invalid, duplicates, included: access.length } };
};
const snapshotStartedAt=$('Begin ordered portal snapshot').first().json.snapshotStartedAt;
const discovery=$('Validate portal access schema').first().json;
const accessInput=discovery.status==='ready'?$('Read portal access').all().map(i=>i.json):[];
const {access,accessDiagnostics}=normalizePortalAccess(accessInput,clients.map(c=>c.airtableClientId));
// END GENERATED ACCESS LOGIC
return [{json:{clients,leads:normalizedLeads,access,accessDiagnostics,snapshotStartedAt,accessStatus:discovery.status,accessTableId:discovery.tableId,diagnostics:{clientsScanned:clientRows.length,targetsScanned:targetRows.length,leadsScanned:leadRows.length,peopleScanned:personRows.length,clientsIncluded:clients.length,leadsIncluded:normalizedLeads.length,skippedTargets,skippedLeads}}}];`,
    },
    position: [2380, 220],
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
    position: [2640, 220],
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
    position: [2900, 220],
  },
  output: [{ ok: true, snapshot: {}, diagnostics: {} }],
});

export default workflow('schulze-portal-airtable-supabase-sync', 'Schulze Portal · Airtable → Supabase sync')
  .add(manual).to(snapshotStart)
  .add(schedule).to(snapshotStart)
  .add(snapshotStart).to(clients)
  .add(clients).to(targets).to(leads).to(people).to(accessSchema).to(accessDiscovery).to(accessReady.onTrue(accessRows.to(buildSnapshot)).onFalse(buildSnapshot))
  .add(buildSnapshot).to(replaceSnapshot).to(validateAck);
