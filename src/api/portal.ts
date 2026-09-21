import { TOKEN_PATTERN } from "./token.ts";

export type PortalMode = "customer" | "admin";
export type PortalClient = {
  id: string;
  clientId: string | null;
  name: string;
};
export type Lead = {
  id: string;
  name: string;
  contactName: string | null;
  status: string | null;
  website: string | null;
  notes: string | null;
  email: string | null;
  phone: string | null;
  position: string | null;
  source: string | null;
  clientRecordId: string | null;
  clientName: string | null;
};
export type BootstrapResponse = {
  sessionKey?: string;
  mode: PortalMode;
  customer: { name: string };
  clients: PortalClient[];
  leads: Lead[];
};

export type LeadUpdateInput = {
  requestId: string;
  leadId: string;
  interactionText?: string;
  dealPhase?: string;
  interactionDate?: string;
};

export type LeadUpdateResponse = {
  ok: true;
  leadId: string;
  interaction: { requested: boolean; created: boolean; reused: boolean };
  dealPhase: { requested: string | null; updated: boolean; previous: string | null };
};
export type ErrorCode =
  | "ls-required"
  | "not-provisioned"
  | "invalid-link"
  | "configuration"
  | "rate-limit"
  | "service"
  | "timeout";

export class PortalError extends Error {
  code: ErrorCode;
  constructor(code: ErrorCode) {
    super(code);
    this.name = "PortalError";
    this.code = code;
  }
}

const recordId = /^rec[A-Za-z0-9]{14}$/;
const optional = [
  "contactName",
  "status",
  "website",
  "notes",
  "email",
  "phone",
  "position",
  "source",
] as const;

function record(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function nullableString(v: unknown, max = 100000): string | null {
  if (v === null) return null;
  if (typeof v !== "string" || v.length > max) throw new PortalError("service");
  return v;
}

function parseResponse(v: unknown): BootstrapResponse {
  if (
    !record(v) ||
    !record(v.customer) ||
    typeof v.customer.name !== "string" ||
    !v.customer.name.trim() ||
    !Array.isArray(v.leads)
  )
    throw new PortalError("service");

  const mode: PortalMode =
    v.mode === undefined
      ? "customer"
      : v.mode === "customer" || v.mode === "admin"
        ? v.mode
        : (() => {
            throw new PortalError("service");
          })();
  if (v.leads.length > (mode === "admin" ? 100000 : 10000))
    throw new PortalError("service");
  const clients: PortalClient[] = [];
  const clientById = new Map<string, PortalClient>();

  if (mode === "admin" || (Array.isArray(v.clients) && v.clients.length > 0)) {
    if (!Array.isArray(v.clients) || v.clients.length > 10000)
      throw new PortalError("service");
    for (const raw of v.clients) {
      if (
        !record(raw) ||
        typeof raw.id !== "string" ||
        !recordId.test(raw.id) ||
        clientById.has(raw.id) ||
        typeof raw.name !== "string" ||
        !raw.name.trim()
      )
        throw new PortalError("service");
      const clientId = nullableString(raw.clientId, 200);
      const client = { id: raw.id, clientId, name: raw.name };
      clients.push(client);
      clientById.set(client.id, client);
    }
  }

  const ids = new Set<string>();
  const leads = v.leads.map((r: unknown): Lead => {
    if (
      !record(r) ||
      typeof r.id !== "string" ||
      !r.id ||
      ids.has(r.id) ||
      typeof r.name !== "string" ||
      !r.name.trim()
    )
      throw new PortalError("service");
    ids.add(r.id);

    const lead = {
      id: r.id,
      name: r.name,
      clientRecordId: null,
      clientName: null,
    } as Lead;
    for (const key of optional) lead[key] = nullableString(r[key]);

    if (mode === "admin" || clients.length > 0) {
      if (
        typeof r.clientRecordId !== "string" ||
        !recordId.test(r.clientRecordId) ||
        typeof r.clientName !== "string" ||
        !r.clientName.trim()
      )
        throw new PortalError("service");
      const client = clientById.get(r.clientRecordId);
      if (!client || client.name !== r.clientName)
        throw new PortalError("service");
      lead.clientRecordId = r.clientRecordId;
      lead.clientName = r.clientName;
    }
    return lead;
  });

  if (v.sessionKey !== undefined && (typeof v.sessionKey !== 'string' || !/^[a-f0-9]{64}$/.test(v.sessionKey))) throw new PortalError('service');
  return { mode, customer: { name: v.customer.name }, clients, leads, ...(v.sessionKey ? {sessionKey:v.sessionKey as string} : {}) };
}

export async function bootstrap(
  base: string,
  token: string,
  signal?: AbortSignal,
): Promise<BootstrapResponse> {
  let url: URL;
  try {
    url = new URL(base);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error();
  } catch {
    throw new PortalError("configuration");
  }
  if (!TOKEN_PATTERN.test(token)) throw new PortalError("invalid-link");
  signal?.throwIfAborted();
  url.pathname =
    url.pathname.replace(/\/$/, "") + "/customer-portal/bootstrap";
  const timeout = AbortSignal.timeout(25000);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      referrerPolicy: "no-referrer",
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    if (response.status === 401 || response.status === 403)
      throw new PortalError("invalid-link");
    if (response.status === 429) throw new PortalError("rate-limit");
    if (!response.ok) throw new PortalError("service");
    return parseResponse(await response.json());
  } catch (e) {
    if (signal?.aborted) throw signal.reason;
    if (timeout.aborted) throw new PortalError("timeout");
    if (e instanceof PortalError) throw e;
    throw new PortalError("service");
  }
}

/** LS tokens go only to the endpoint that verifies them with LearningSuite. */
export async function bootstrapLearningSuite(token: string, signal?: AbortSignal): Promise<BootstrapResponse> {
  const timeout = AbortSignal.timeout(20000);
  try {
    const response = await fetch('https://zwtmlrzwqnluosrdbjfv.supabase.co/functions/v1/portal-session', {
      method:'GET', headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},
      credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',
      signal:signal?AbortSignal.any([signal,timeout]):timeout,
    });
    if(response.status===401) throw new PortalError('ls-required');
    if(response.status===403) throw new PortalError('not-provisioned');
    if(response.status===429) throw new PortalError('rate-limit');
    if(!response.ok) throw new PortalError('service');
    return parseResponse(await response.json());
  } catch(error) {
    if(signal?.aborted) throw signal.reason;
    if(timeout.aborted) throw new PortalError('timeout');
    if(error instanceof PortalError) throw error;
    throw new PortalError('service');
  }
}


function apiBase(base: string): URL {
  let url: URL;
  try {
    url = new URL(base);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error();
  } catch {
    throw new PortalError("configuration");
  }
  return url;
}

export async function updateExistingLead(
  base: string,
  learningSuiteToken: string,
  input: LeadUpdateInput,
  signal?: AbortSignal,
): Promise<LeadUpdateResponse> {
  const url = apiBase(base);
  if (!/^[^\s]{1,16384}$/.test(learningSuiteToken))
    throw new PortalError("ls-required");
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(input.requestId))
    throw new PortalError("service");
  if (!/^rec[A-Za-z0-9]{14}$/.test(input.leadId))
    throw new PortalError("service");

  const interactionText = input.interactionText?.trim() || "";
  const dealPhase = input.dealPhase?.trim() || "";
  if (!interactionText && !dealPhase) throw new PortalError("service");
  if (interactionText.length > 5000 || dealPhase.length > 100)
    throw new PortalError("service");

  url.pathname =
    url.pathname.replace(/\/$/, "") + "/customer-portal/lead-update";
  const timeout = AbortSignal.timeout(25000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${learningSuiteToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requestId: input.requestId,
        leadId: input.leadId,
        interactionText,
        dealPhase,
        interactionDate: input.interactionDate || new Date().toISOString(),
      }),
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      referrerPolicy: "no-referrer",
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });

    if (response.status === 401) throw new PortalError("ls-required");
    if (response.status === 403) throw new PortalError("not-provisioned");
    if (response.status === 429) throw new PortalError("rate-limit");
    if (!response.ok) throw new PortalError("service");

    const value: unknown = await response.json();
    if (
      !record(value) ||
      value.ok !== true ||
      typeof value.leadId !== "string" ||
      value.leadId !== input.leadId ||
      !record(value.interaction) ||
      typeof value.interaction.requested !== "boolean" ||
      typeof value.interaction.created !== "boolean" ||
      typeof value.interaction.reused !== "boolean" ||
      !record(value.dealPhase) ||
      typeof value.dealPhase.updated !== "boolean"
    )
      throw new PortalError("service");

    return value as LeadUpdateResponse;
  } catch (e) {
    if (signal?.aborted) throw signal.reason;
    if (timeout.aborted) throw new PortalError("timeout");
    if (e instanceof PortalError) throw e;
    throw new PortalError("service");
  }
}
