import { workflow, node, trigger, newCredential, expr } from '@n8n/workflow-sdk';

const portalOrigin = 'https://schulze-client-portal-production.up.railway.app';
const internalBearer = newCredential('Schulze Portal Supabase', 'MpEnClmtG7bhzNBS');

const webhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Portal bootstrap',
    parameters: {
      authentication: 'none',
      httpMethod: 'GET',
      path: 'customer-portal/bootstrap',
      responseMode: 'responseNode',
      options: { allowedOrigins: portalOrigin },
    },
    position: [0, 320],
  },
  output: [{ headers: {}, query: {}, body: {} }],
});

const validateRequest = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Validate portal request',
    parameters: {
      mode: 'raw',
      jsonOutput: expr(`{{ (function validate(req, origin) {
        const headers = req.headers || {};
        const authorization = headers.authorization;
        const valid = typeof authorization === 'string' &&
          /^Bearer [A-Za-z0-9_-]{43}$/.test(authorization) &&
          Object.keys(req.query || {}).length === 0 &&
          Object.keys(req.body || {}).length === 0 &&
          (headers.origin === undefined || headers.origin === origin);
        return { valid, token: valid ? authorization.slice(7) : '' };
      })($('Portal bootstrap').first().json, '${portalOrigin}') }}`),
      options: {},
    },
    onError: 'continueErrorOutput',
    position: [240, 320],
  },
  output: [{ valid: true, token: 'A'.repeat(43) }],
});

const requestAccepted = node({
  type: 'n8n-nodes-base.if',
  version: 2.3,
  config: {
    name: 'Request accepted',
    parameters: {
      conditions: {
        options: { caseSensitive: true, typeValidation: 'strict' },
        combinator: 'and',
        conditions: [{
          leftValue: expr("{{ $('Validate portal request').first().json.valid }}"),
          rightValue: true,
          operator: { type: 'boolean', operation: 'equals' },
        }],
      },
    },
    position: [480, 240],
  },
  output: [{}, {}],
});

const hashToken = node({
  type: 'n8n-nodes-base.crypto',
  version: 2,
  config: {
    name: 'Hash access token',
    parameters: {
      action: 'hash',
      type: 'SHA256',
      binaryData: false,
      value: expr("{{ $('Validate portal request').first().json.token }}"),
      dataPropertyName: 'tokenHash',
      encoding: 'hex',
    },
    onError: 'continueErrorOutput',
    position: [720, 160],
  },
  output: [{ tokenHash: 'a'.repeat(64) }],
});

const findGrant = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Find access grant',
    parameters: {
      resource: 'row',
      operation: 'get',
      dataTableId: { __rl: true, mode: 'id', value: 'guf9ynWoJBgyN0dF' },
      matchType: 'allConditions',
      filters: {
        conditions: [{
          keyName: 'tokenHash',
          condition: 'eq',
          keyValue: expr("{{ $('Hash access token').first().json.tokenHash }}"),
        }],
      },
      returnAll: false,
      limit: 2,
    },
    alwaysOutputData: true,
    onError: 'continueErrorOutput',
    position: [960, 80],
  },
  output: [{ tokenHash: 'a'.repeat(64), clientRecordId: 'recAAAAAAAAAAAAAA', scope: 'portal:read', expiresAt: '2099-01-01T00:00:00.000Z', revokedAt: null }],
});

const authorize = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Authorize access grant',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `const recordPattern=/^rec[A-Za-z0-9]{14}$/;
const rows=$input.all().map(item=>item.json).filter(row=>row&&typeof row==='object'&&!Array.isArray(row)&&Object.keys(row).length>0);
const hash=$('Hash access token').first().json.tokenHash;
const grant=rows[0];
const scope=grant?.scope;
const clientRecordId=grant?.clientRecordId;
const scoped=(scope==='portal:read'&&typeof clientRecordId==='string'&&recordPattern.test(clientRecordId))||(scope==='portal:admin'&&clientRecordId==='__portal_admin__');
const expiresAt=typeof grant?.expiresAt==='string'?Date.parse(grant.expiresAt):NaN;
const valid=rows.length===1&&typeof hash==='string'&&/^[a-f0-9]{64}$/.test(hash)&&grant.tokenHash===hash&&scoped&&(grant.revokedAt===null||grant.revokedAt==='')&&Number.isFinite(expiresAt)&&expiresAt>Date.now();
return [{json:{valid,scope:valid?scope:'',clientRecordId:valid?clientRecordId:''}}];`,
    },
    onError: 'continueErrorOutput',
    position: [1200, 0],
  },
  output: [{ valid: true, scope: 'portal:read', clientRecordId: 'recAAAAAAAAAAAAAA' }],
});

const grantAccepted = node({
  type: 'n8n-nodes-base.if',
  version: 2.3,
  config: {
    name: 'Grant accepted',
    parameters: {
      conditions: {
        options: { caseSensitive: true, typeValidation: 'strict' },
        combinator: 'and',
        conditions: [{
          leftValue: expr("{{ $('Authorize access grant').first().json.valid }}"),
          rightValue: true,
          operator: { type: 'boolean', operation: 'equals' },
        }],
      },
    },
    position: [1440, -80],
  },
  output: [{}, {}],
});

const readModel = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Read Supabase portal model',
    parameters: {
      method: 'POST',
      url: 'https://zwtmlrzwqnluosrdbjfv.supabase.co/functions/v1/portal-read-model',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpBearerAuth',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ { scope: $('Authorize access grant').first().json.scope, clientRecordId: $('Authorize access grant').first().json.clientRecordId } }}"),
      options: {
        redirect: { redirect: { followRedirects: false } },
        response: { response: { responseFormat: 'json' } },
        timeout: 30000,
      },
    },
    credentials: { httpBearerAuth: internalBearer },
    onError: 'continueErrorOutput',
    retryOnFail: true,
    maxTries: 2,
    waitBetweenTries: 1000,
    position: [1680, -160],
  },
  output: [{ mode: 'customer', customer: { name: 'Example' }, clients: [], leads: [] }],
});

const validateModel = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Validate Supabase portal model',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `const value=$input.first()?.json;
const grant=$('Authorize access grant').first().json;
const recordPattern=/^rec[A-Za-z0-9]{14}$/;
const fail=()=>{throw new Error('portal_data_unavailable');};
const object=(v)=>v&&typeof v==='object'&&!Array.isArray(v)?v:null;
const required=(v,max=10000)=>{if(typeof v!=='string'||!v.trim()||v.length>max)fail();return v;};
const optional=(v,max=100000)=>{if(v===undefined||v===null||v==='')return null;if(typeof v!=='string'||v.length>max)fail();return v;};
const source=object(value);if(!source)fail();
const customer=object(source.customer);if(!customer)fail();
const customerName=required(customer.name,10000);
if(!Array.isArray(source.leads))fail();
const normalizeLead=(raw,admin,clientById)=>{const lead=object(raw);if(!lead)fail();const id=required(lead.id,200);const name=required(lead.name,10000);const normalized={id,name,contactName:optional(lead.contactName,10000),status:optional(lead.status,10000),website:optional(lead.website,10000),notes:optional(lead.notes),email:optional(lead.email,10000),phone:optional(lead.phone,10000),position:optional(lead.position,10000),source:optional(lead.source,10000),clientRecordId:null,clientName:null};if(admin){const clientRecordId=required(lead.clientRecordId,50);const clientName=required(lead.clientName,10000);if(!recordPattern.test(clientRecordId)||clientById.get(clientRecordId)!==clientName)fail();normalized.clientRecordId=clientRecordId;normalized.clientName=clientName;}else if((lead.clientRecordId!==undefined&&lead.clientRecordId!==null)||(lead.clientName!==undefined&&lead.clientName!==null))fail();return normalized;};
if(grant.scope==='portal:read'&&recordPattern.test(grant.clientRecordId)){
  if(source.mode!=='customer'||source.leads.length>10000)fail();
  if(source.clients!==undefined&&(!Array.isArray(source.clients)||source.clients.length!==0))fail();
  const seen=new Set();const leads=source.leads.map(raw=>{const lead=normalizeLead(raw,false,new Map());if(seen.has(lead.id))fail();seen.add(lead.id);return lead;});
  return [{json:{mode:'customer',customer:{name:customerName},clients:[],leads}}];
}
if(grant.scope==='portal:admin'&&grant.clientRecordId==='__portal_admin__'){
  if(source.mode!=='admin'||!Array.isArray(source.clients)||source.clients.length>10000||source.leads.length>100000)fail();
  const clientById=new Map();const clients=source.clients.map(raw=>{const client=object(raw);if(!client)fail();const id=required(client.id,50);if(!recordPattern.test(id)||clientById.has(id))fail();const name=required(client.name,10000);const clientId=optional(client.clientId,200);clientById.set(id,name);return{id,clientId,name};});
  const seen=new Set();const leads=source.leads.map(raw=>{const lead=normalizeLead(raw,true,clientById);if(seen.has(lead.id))fail();seen.add(lead.id);return lead;});
  return [{json:{mode:'admin',customer:{name:customerName},clients,leads}}];
}
fail();`,
    },
    onError: 'continueErrorOutput',
    position: [1920, -240],
  },
  output: [{ mode: 'customer', customer: { name: 'Example' }, clients: [], leads: [] }],
});

const responseHeaders = {
  entries: [
    { name: 'Cache-Control', value: 'no-store' },
    { name: 'Referrer-Policy', value: 'no-referrer' },
    { name: 'X-Content-Type-Options', value: 'nosniff' },
    { name: 'Access-Control-Allow-Origin', value: portalOrigin },
    { name: 'Vary', value: 'Origin' },
  ],
};

const success = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Return customer portal',
    parameters: {
      respondWith: 'json',
      responseBody: expr("{{ $('Validate Supabase portal model').first().json }}"),
      options: { responseCode: 200, responseHeaders },
    },
    executeOnce: true,
    position: [2160, -320],
  },
  output: [{}],
});

const reject = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Reject access',
    parameters: {
      respondWith: 'json',
      responseBody: { error: 'unauthorized', message: 'Dieser Link ist ungültig oder abgelaufen.' },
      options: { responseCode: 401, responseHeaders },
    },
    executeOnce: true,
    position: [1680, 160],
  },
  output: [{}],
});

const serviceError = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Return service error',
    parameters: {
      respondWith: 'json',
      responseBody: { error: 'service_unavailable', message: 'Die Daten konnten nicht geladen werden.' },
      options: { responseCode: 503, responseHeaders },
    },
    executeOnce: true,
    position: [2160, 80],
  },
  output: [{}],
});

const note = node({
  type: 'n8n-nodes-base.stickyNote',
  version: 1,
  config: {
    name: 'Private Supabase read model',
    parameters: {
      content: '### Private Supabase portal read model\nBearer token → hashed grant → exact `portal:read` customer or `portal:admin` sentinel → authenticated Supabase Edge Function → strict response validation. Airtable remains the source of truth, but this request path reads Supabase only.',
      color: 2,
    },
    position: [1480, 400],
  },
  output: [{}],
});

export default workflow('schulze-portal-read-model', 'Schulze Portal · Read customer leads')
  .add(webhook).to(validateRequest)
  .add(validateRequest).to(requestAccepted, { sourceIndex: 0 }).to(serviceError, { sourceIndex: 1 })
  .add(requestAccepted).to(hashToken, { sourceIndex: 0 }).to(reject, { sourceIndex: 1 })
  .add(hashToken).to(findGrant, { sourceIndex: 0 }).to(serviceError, { sourceIndex: 1 })
  .add(findGrant).to(authorize, { sourceIndex: 0 }).to(serviceError, { sourceIndex: 1 })
  .add(authorize).to(grantAccepted, { sourceIndex: 0 }).to(serviceError, { sourceIndex: 1 })
  .add(grantAccepted).to(readModel, { sourceIndex: 0 }).to(reject, { sourceIndex: 1 })
  .add(readModel).to(validateModel, { sourceIndex: 0 }).to(serviceError, { sourceIndex: 1 })
  .add(validateModel).to(success, { sourceIndex: 0 }).to(serviceError, { sourceIndex: 1 })
  .add(note);
