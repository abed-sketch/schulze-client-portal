type Row = Record<string, unknown>;
type Scope = { clientRecordId: string; customerName: string; targetIds: string[]; leadIds?: string[]; personIds?: string[]; targets?: Row[]; leads?: Row[] };
const recordPattern = /^rec[A-Za-z0-9]{14}$/;
function fail(): never { throw new Error('portal_data_unavailable'); }
function fields(row: Row): Row { return row.fields && typeof row.fields === 'object' && !Array.isArray(row.fields) ? row.fields as Row : row; }
function ids(value: unknown, max: number): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > max || value.some(id => typeof id !== 'string' || !recordPattern.test(id)) || new Set(value).size !== value.length) fail();
  return value as string[];
}
function rowsExact(rows: Row[], expected: string[]): Row[] {
  const actual=rows.filter(row=>Object.keys(row).length !== 0);
  if(actual.length!==expected.length || new Set(actual.map(r=>r.id)).size!==actual.length || actual.some(r=>typeof r.id!=='string'||!expected.includes(r.id))) fail();
  return actual;
}
function optional(value: unknown): string | null {
  if(value===undefined||value===null||value==='') return null;
  if(typeof value!=='string'||value.length>100000) fail();
  return value;
}
export function validateRequest(req: Row, origin: string) {
  const h=(req.headers||{}) as Row;
  const auth=h.authorization;
  const valid=typeof auth==='string' && /^Bearer [A-Za-z0-9_-]{43}$/.test(auth) &&
    Object.keys((req.query||{}) as object).length===0 && Object.keys((req.body||{}) as object).length===0 &&
    (h.origin===undefined || h.origin===origin);
  return {valid, token:valid ? (auth as string).slice(7) : ''};
}
export function resolveGrant(rows: Row[], hash: string, now=Date.now()) {
  const actual=rows.filter(r=>Object.keys(r).length>0);
  const g=actual[0];
  const valid=actual.length===1 && /^[a-f0-9]{64}$/.test(hash) && g.tokenHash===hash &&
    typeof g.clientRecordId==='string' && recordPattern.test(g.clientRecordId) && g.scope==='portal:read' &&
    (g.revokedAt===null||g.revokedAt==='') && typeof g.expiresAt==='string' && Number.isFinite(Date.parse(g.expiresAt)) && Date.parse(g.expiresAt)>now;
  return {valid,clientRecordId:valid ? g.clientRecordId as string : ''};
}
export function batches(values: string[]) {
  ids(values,10000);
  if(values.length===0) return [{formula:'FALSE()'}];
  const result=[];
  for(let i=0;i<values.length;i+=50) result.push({formula:'OR('+values.slice(i,i+50).map(id=>"RECORD_ID()='"+id+"'").join(',')+')'});
  return result;
}
export function clientScope(rows: Row[], clientRecordId: string): Scope {
  if(!recordPattern.test(clientRecordId)) fail();
  const row=rowsExact(rows,[clientRecordId])[0];
  const f=fields(row); const name=optional(f['Client Name']);
  if(!name) fail();
  return {clientRecordId,customerName:name,targetIds:ids(f['Target Companies'],500)};
}
export function targetScope(rows: Row[], scope: Scope): Scope {
  const targets=rowsExact(rows,scope.targetIds);
  const leadIds:string[]=[];
  for(const row of targets){
    const f=fields(row);const owners=ids(f.Client,1);
    if(owners.length!==1||owners[0]!==scope.clientRecordId) fail();
    leadIds.push(...ids(f.Leads,10000));
  }
  ids(leadIds,10000);
  return {...scope,targets,leadIds};
}
export function leadScope(rows: Row[], scope: Scope): Scope {
  const leads=rowsExact(rows,scope.leadIds||[]);const people=new Set<string>();
  for(const row of leads){
    const f=fields(row);const target=ids(f['Target Company'],1);
    if(target.length!==1||!scope.targetIds.includes(target[0])) fail();
    const parent=scope.targets?.find(t=>t.id===target[0]);
    if(!parent||!ids(fields(parent).Leads,10000).includes(row.id as string)) fail();
    for(const p of ids(f['Linked Person'],1)) people.add(p);
  }
  return {...scope,leads,personIds:[...people]};
}
export function normalize(rows: Row[], scope: Scope) {
  const people=rowsExact(rows,scope.personIds||[]);
  const leads=(scope.leads||[]).slice().sort((a,b)=>String(a.id).localeCompare(String(b.id))).map((row,index)=>{
    const f=fields(row);const t=fields(scope.targets!.find(t=>t.id===(f['Target Company'] as string[])[0])!);
    const personId=ids(f['Linked Person'],1)[0];
    const p=personId?fields(people.find(p=>p.id===personId)!):{};
    return {id:'lead-'+(index+1),name:optional(f['Lead Name'])||optional(p['Full Name'])||'Unbenannter Interessent',contactName:optional(p['Full Name']),status:optional(f['Lead Status']),website:optional(t.Website),notes:optional(f.Notes),email:optional(p.Email),phone:optional(p.Phone),position:optional(p['Role/Title']),source:optional(f.Source)};
  });
  return {customer:{name:scope.customerName},leads};
}
