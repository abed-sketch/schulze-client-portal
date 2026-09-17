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
  const scope=g?.scope;
  const clientRecordId=g?.clientRecordId;
  const scoped=(scope==='portal:read' && typeof clientRecordId==='string' && recordPattern.test(clientRecordId)) ||
    (scope==='portal:admin' && clientRecordId==='__portal_admin__');
  const valid=actual.length===1 && /^[a-f0-9]{64}$/.test(hash) && g.tokenHash===hash && scoped &&
    (g.revokedAt===null||g.revokedAt==='') && typeof g.expiresAt==='string' && Number.isFinite(Date.parse(g.expiresAt)) && Date.parse(g.expiresAt)>now;
  return {valid,scope:valid ? scope as 'portal:read'|'portal:admin' : '',clientRecordId:valid ? clientRecordId as string : ''};
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


type SnapshotClient = {
  airtableClientId: string;
  clientId: string | null;
  clientName: string;
  primaryContactEmail: string | null;
  sourceUpdatedAt: null;
};
type SnapshotLead = {
  airtableLeadId: string;
  airtableClientId: string;
  airtableTargetCompanyId: string;
  airtablePersonId: string | null;
  leadName: string;
  contactName: string | null;
  status: string | null;
  website: string | null;
  notes: string | null;
  email: string | null;
  phone: string | null;
  position: string | null;
  source: string | null;
  sourceUpdatedAt: null;
};

function actualRows(rows: Row[], max: number): Row[] {
  if(!Array.isArray(rows) || rows.length>max) fail();
  return rows.filter(row=>row && typeof row==='object' && !Array.isArray(row) && Object.keys(row).length>0);
}
function uniqueSourceRows(rows: Row[], max: number): Row[] {
  const actual=actualRows(rows,max); const seen=new Set<string>();
  for(const row of actual){
    if(typeof row.id!=='string'||!recordPattern.test(row.id)||seen.has(row.id)) fail();
    seen.add(row.id);
  }
  return actual;
}
function linked(value: unknown, max: number): string[] {
  if(value===undefined||value===null) return [];
  if(!Array.isArray(value)||value.length>max) fail();
  const result:string[]=[]; const seen=new Set<string>();
  for(const id of value){
    if(typeof id!=='string'||!recordPattern.test(id)||seen.has(id)) fail();
    seen.add(id);result.push(id);
  }
  return result;
}

export function normalizeSnapshot(clientRows: Row[], targetRows: Row[], leadRows: Row[], personRows: Row[]) {
  const clientsInput=uniqueSourceRows(clientRows,10000);
  const targetsInput=uniqueSourceRows(targetRows,100000);
  const leadsInput=uniqueSourceRows(leadRows,100000);
  const peopleInput=uniqueSourceRows(personRows,100000);

  const people=new Map<string,Row>();
  for(const row of peopleInput) people.set(row.id as string,fields(row));
  const clients:SnapshotClient[]=[];
  const clientTargets=new Map<string,Set<string>>();
  for(const row of clientsInput){
    const f=fields(row); const clientName=optional(f['Client Name']);
    if(!clientName||clientName.length>10000) fail();
    const clientId=optional(f['Client ID']);
    if(clientId&&clientId.length>200) fail();
    const contacts=linked(f['Primary Contact'],100);
    const person=contacts.length===1 ? people.get(contacts[0]) : undefined;
    const candidate=person && linked(person.Clients,10000).includes(row.id as string) ? optional(person.Email)?.trim().toLowerCase() : null;
    const primaryContactEmail=candidate && candidate.length<=254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : null;
    clients.push({airtableClientId:row.id as string,clientId,clientName,primaryContactEmail,sourceUpdatedAt:null});
    clientTargets.set(row.id as string,new Set(linked(f['Target Companies'],10000)));
  }
  clients.sort((a,b)=>a.airtableClientId.localeCompare(b.airtableClientId));

  const targets=new Map<string,{clientId:string;leadIds:Set<string>;website:string|null}>();
  let skippedTargets=0;
  for(const row of targetsInput){
    const f=fields(row); const owners=linked(f.Client,100);
    const owner=owners.length===1?owners[0]:null;
    if(!owner||!clientTargets.has(owner)||!clientTargets.get(owner)!.has(row.id as string)){
      skippedTargets++;continue;
    }
    targets.set(row.id as string,{clientId:owner,leadIds:new Set(linked(f.Leads,10000)),website:optional(f.Website)});
  }

  const leads:SnapshotLead[]=[];
  let skippedLeads=0;
  for(const row of leadsInput){
    const f=fields(row); const targetIds=linked(f['Target Company'],100);
    const targetId=targetIds.length===1?targetIds[0]:null;
    const target=targetId?targets.get(targetId):undefined;
    if(!target||!target.leadIds.has(row.id as string)){
      skippedLeads++;continue;
    }
    const personIds=linked(f['Linked Person'],100);
    if(personIds.length>1){skippedLeads++;continue;}
    const requestedPersonId=personIds[0]||null;
    const person=requestedPersonId?people.get(requestedPersonId):undefined;
    const personId=person?requestedPersonId:null;
    const leadName=optional(f['Lead Name'])||optional(person?.['Full Name'])||'Unbenannter Interessent';
    if(leadName.length>10000) fail();
    leads.push({
      airtableLeadId:row.id as string,
      airtableClientId:target.clientId,
      airtableTargetCompanyId:targetId!,
      airtablePersonId:personId,
      leadName,
      contactName:optional(person?.['Full Name']),
      status:optional(f['Lead Status']),
      website:target.website,
      notes:optional(f.Notes),
      email:optional(person?.Email),
      phone:optional(person?.Phone),
      position:optional(person?.['Role/Title']),
      source:optional(f.Source),
      sourceUpdatedAt:null,
    });
  }
  leads.sort((a,b)=>a.airtableLeadId.localeCompare(b.airtableLeadId));
  return {
    clients,
    leads,
    diagnostics:{
      clientsScanned:clientsInput.length,
      targetsScanned:targetsInput.length,
      leadsScanned:leadsInput.length,
      peopleScanned:peopleInput.length,
      clientsIncluded:clients.length,
      leadsIncluded:leads.length,
      skippedTargets,
      skippedLeads,
    },
  };
}
