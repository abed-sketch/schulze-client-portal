/** Server-only reference boundary. Not imported by the frontend or yet wired to n8n. */
export type RelationRecord = { id: string; fields: Record<string, unknown> };
const validId = (id: unknown): id is string =>
  typeof id === "string" && /^rec[A-Za-z0-9]{14}$/.test(id);
export function authorizeLead(
  clientId: string,
  lead: RelationRecord,
  targets: RelationRecord[],
): boolean {
  if (!validId(clientId)) return false;
  const links = lead.fields["Target Company"];
  if (!Array.isArray(links) || links.length !== 1 || !validId(links[0]))
    return false;
  const matches = targets.filter((t) => t.id === links[0]);
  if (matches.length !== 1) return false;
  const owners = matches[0].fields.Client;
  return Array.isArray(owners) && owners.length === 1 && owners[0] === clientId;
}
