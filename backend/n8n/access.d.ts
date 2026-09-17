export type AccessDiscovery = {status:'missing'|'invalid'|'ready';tableId:string|null};
export type PortalAccess = {airtableAccessId:string;email:string;role:'Admin'|'Client';clientId:string|null;active:boolean};
export function discoverPortalAccess(schema:unknown):AccessDiscovery;
export function normalizePortalAccess(rows:unknown,clientIds:string[]):{access:PortalAccess[];accessDiagnostics:{scanned:number;invalid:number;duplicates:number;included:number}};
