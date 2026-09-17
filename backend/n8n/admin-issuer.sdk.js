import { workflow, node, trigger, expr } from '@n8n/workflow-sdk';

const start = trigger({
  type: 'n8n-nodes-base.manualTrigger',
  version: 1,
  config: { name: 'Issue admin access manually', parameters: {}, position: [0, 0] },
  output: [{}],
});

const prepare = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Prepare restricted admin grant',
    parameters: {
      mode: 'raw',
      jsonOutput: expr("{{ { clientRecordId: '__portal_admin__', scope: 'portal:admin', expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() } }}"),
      options: {},
    },
    position: [240, 0],
  },
  output: [{ clientRecordId: '__portal_admin__', scope: 'portal:admin', expiresAt: '2099-01-01T00:00:00.000Z' }],
});

const generate = node({
  type: 'n8n-nodes-base.crypto',
  version: 2,
  config: {
    name: 'Generate random admin token',
    parameters: { action: 'generate', dataPropertyName: 'data', encodingType: 'base64', stringLength: 43 },
    position: [480, 0],
  },
  output: [{ data: 'random-base64' }],
});

const encode = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Encode URL-safe admin token',
    parameters: {
      mode: 'raw',
      jsonOutput: expr("{{ (() => { const raw=$('Generate random admin token').first().json.data; if(typeof raw!=='string') throw new Error('token_generation_failed'); const token=raw.replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,''); if(!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('invalid_token_entropy'); return {token}; })() }}"),
      options: {},
    },
    position: [720, 0],
  },
  output: [{ token: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' }],
});

const hash = node({
  type: 'n8n-nodes-base.crypto',
  version: 2,
  config: {
    name: 'Hash admin token',
    parameters: {
      action: 'hash',
      type: 'SHA256',
      binaryData: false,
      value: expr("{{ $('Encode URL-safe admin token').first().json.token }}"),
      dataPropertyName: 'tokenHash',
      encoding: 'hex',
    },
    position: [960, 0],
  },
  output: [{ tokenHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }],
});

const store = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Store restricted admin grant',
    parameters: {
      resource: 'row',
      operation: 'insert',
      dataTableId: { __rl: true, mode: 'id', value: 'guf9ynWoJBgyN0dF' },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          tokenHash: expr("{{ $('Hash admin token').first().json.tokenHash }}"),
          clientRecordId: '__portal_admin__',
          expiresAt: expr("{{ $('Prepare restricted admin grant').first().json.expiresAt }}"),
          revokedAt: expr('{{ null }}'),
          scope: 'portal:admin',
        },
        schema: [
          { id: 'tokenHash', displayName: 'tokenHash', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'clientRecordId', displayName: 'clientRecordId', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'expiresAt', displayName: 'expiresAt', required: false, defaultMatch: false, display: true, type: 'date', canBeUsedToMatch: true },
          { id: 'revokedAt', displayName: 'revokedAt', required: false, defaultMatch: false, display: true, type: 'date', canBeUsedToMatch: true },
          { id: 'scope', displayName: 'scope', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
        ],
      },
      options: {},
    },
    position: [1200, 0],
  },
  output: [{ id: 1, tokenHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', clientRecordId: '__portal_admin__', expiresAt: '2099-01-01T00:00:00.000Z', revokedAt: null, scope: 'portal:admin' }],
});

const finish = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Return one-time admin token',
    parameters: {
      mode: 'raw',
      jsonOutput: expr("{{ (() => { const saved=$('Store restricted admin grant').first().json; const expected=$('Prepare restricted admin grant').first().json; const digest=$('Hash admin token').first().json.tokenHash; if(!saved.id||saved.tokenHash!==digest||saved.clientRecordId!=='__portal_admin__'||saved.scope!=='portal:admin'||Date.parse(saved.expiresAt)!==Date.parse(expected.expiresAt)||saved.revokedAt!==null) throw new Error('admin_grant_persistence_failed'); return {token:$('Encode URL-safe admin token').first().json.token,expiresAt:expected.expiresAt,grantId:saved.id,scope:'portal:admin'}; })() }}"),
      options: {},
    },
    position: [1440, 0],
  },
  output: [{ token: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', expiresAt: '2099-01-01T00:00:00.000Z', grantId: 1, scope: 'portal:admin' }],
});

const note = node({
  type: 'n8n-nodes-base.stickyNote',
  version: 1,
  config: {
    name: 'Admin access policy',
    parameters: {
      content: '### Restricted portal:admin issuer\nManual execution only. Creates a global portal grant valid for exactly 24 hours. The raw token appears once in the final node; only its SHA-256 hash is stored. Revoke early by setting `revokedAt` in `schulzePortalGrants`. Never embed this token in a customer Hub.',
      height: 192,
      color: 5,
    },
    position: [560, 176],
  },
  output: [{}],
});

export default workflow('schulze-portal-admin-access', 'Schulze Portal · Issue restricted admin access')
  .add(start).to(prepare).to(generate).to(encode).to(hash).to(store).to(finish)
  .add(note);
