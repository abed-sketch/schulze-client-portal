// These pure functions are embedded verbatim in sync.sdk.js and tested directly.
export function discoverPortalAccess(schema) {
  if (!schema || !Array.isArray(schema.tables)) throw new Error('portal_schema_read_invalid');
  const matches = schema.tables.filter(t => t.name === 'Portal Access');
  if (!matches.length) return { status: 'missing', tableId: null };
  const table = matches[0];
  const invalid = { status: 'invalid', tableId: /^tbl[A-Za-z0-9]{14}$/.test(table.id) ? table.id : null };
  if (matches.length !== 1 || !invalid.tableId || !Array.isArray(table.fields)) return invalid;
  const field = name => table.fields.filter(f => f.name === name);
  const exactly = (name, type) => field(name).length === 1 && field(name)[0].type === type;
  if (!exactly('Email', 'email') || !exactly('Role', 'singleSelect') ||
      !exactly('Active', 'checkbox') || !exactly('Client', 'multipleRecordLinks')) return invalid;
  const choices = field('Role')[0].options?.choices?.map(c => c.name).sort();
  const link = field('Client')[0].options;
  if (JSON.stringify(choices) !== '["Admin","Client"]' ||
      link?.linkedTableId !== 'tblfPwZLXgjYuFMsc' || link?.prefersSingleRecordLink !== true) return invalid;
  return { status: 'ready', tableId: table.id };
}

export function normalizePortalAccess(rows, clientIds) {
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
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
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
}
