import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = name => JSON.parse(readFileSync(new URL(`../backend/n8n/${name}.workflow.json`, import.meta.url), 'utf8'));
const sync = workflow('airtable-supabase-sync');
const read = workflow('supabase-bootstrap');
const admin = workflow('admin-issuer');
const run = (graph, name, input = [], references = {}) => {
  const code = graph.nodes.find(n => n.name === name).parameters.jsCode;
  const items = rows => rows.map(json => ({ json }));
  return new Function('$input', '$', code)(
    { all: () => items(input), first: () => items(input)[0] },
    name => ({ all: () => items(references[name]), first: () => items(references[name])[0] }),
  )[0].json;
};
const id = suffix => 'rec' + suffix.repeat(14);
const a = id('A'), b = id('B'), target = id('T'), lead = id('L');
const source = () => ({
  'Read portal clients': [{ id: a, 'Client Name': 'Client A', 'Target Companies': [target] }, { id: b, 'Client Name': 'Client B' }],
  'Read portal target companies': [{ id: target, Client: [a], Leads: [lead] }],
  'Read portal leads': [{ id: lead, 'Lead Name': 'Synthetic lead', 'Target Company': [target] }],
  'Read portal people': [{}],
});
test('sync resolves two clients and assigns the lead only to its verified owner', () => {
  const result = run(sync, 'Build fail-closed snapshot', [], source());
  assert.equal(result.clients.length, 2);
  assert.equal(result.leads.length, 1);
  assert.equal(result.leads[0].airtableClientId, a);
});
test('ambiguous or inconsistent ownership never enters the read model', () => {
  for (const owners of [[a, b], [b], []]) {
    const fixture = source();
    fixture['Read portal target companies'][0].Client = owners;
    assert.equal(run(sync, 'Build fail-closed snapshot', [], fixture).leads.length, 0);
  }
});
test('duplicate source records reject the whole snapshot', () => {
  const fixture = source();
  fixture['Read portal leads'].push(fixture['Read portal leads'][0]);
  assert.throws(() => run(sync, 'Build fail-closed snapshot', [], fixture), /portal_source_data_invalid/);
});
const grant = () => ({ tokenHash: 'a'.repeat(64), clientRecordId: a, scope: 'portal:read', expiresAt: new Date(Date.now() + 60000).toISOString(), revokedAt: null });
const authorize = rows => run(read, 'Authorize access grant', rows, { 'Hash access token': [{ tokenHash: 'a'.repeat(64) }] });
test('customer and exact admin sentinel grants are accepted', () => {
  assert.equal(authorize([grant()]).valid, true);
  assert.equal(authorize([{ ...grant(), scope: 'portal:admin', clientRecordId: '__portal_admin__' }]).valid, true);
});
test('revoked, expired, duplicate and mismatched admin grants are rejected', () => {
  for (const rows of [[], [grant(), grant()], [{ ...grant(), revokedAt: new Date().toISOString() }], [{ ...grant(), expiresAt: '2000-01-01' }], [{ ...grant(), scope: 'portal:admin' }], [{ ...grant(), clientRecordId: '__portal_admin__' }]]) {
    assert.equal(authorize(rows).valid, false);
  }
});
test('customer grant cannot consume an admin response', () => {
  assert.throws(() => run(read, 'Validate Supabase portal model', [{ mode: 'admin', customer: { name: 'Team' }, leads: [], clients: [] }], { 'Authorize access grant': [grant()] }), /portal_data_unavailable/);
});
test('admin issuer is manual-only and execution payloads are not persisted', () => {
  assert.equal(admin.settings.callerPolicy, 'none');
  assert.deepEqual(admin.nodes.filter(n => /trigger|webhook/i.test(n.type)).map(n => n.type), ['n8n-nodes-base.manualTrigger']);
  for (const graph of [sync, read, admin]) {
    assert.equal(graph.settings.saveDataSuccessExecution, 'none');
    assert.equal(graph.settings.saveDataErrorExecution, 'none');
    assert.equal(graph.settings.saveManualExecutions, false);
  }
});
