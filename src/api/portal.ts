import { TOKEN_PATTERN } from "./token.ts";
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
};
export type BootstrapResponse = { customer: { name: string }; leads: Lead[] };
export type ErrorCode =
  "invalid-link" | "configuration" | "rate-limit" | "service" | "timeout";
export class PortalError extends Error {
  code: ErrorCode;
  constructor(code: ErrorCode) {
    super(code);
    this.name = "PortalError";
    this.code = code;
  }
}
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
function parseResponse(v: unknown): BootstrapResponse {
  if (
    !record(v) ||
    !record(v.customer) ||
    typeof v.customer.name !== "string" ||
    !v.customer.name.trim() ||
    !Array.isArray(v.leads) ||
    v.leads.length > 10000
  )
    throw new PortalError("service");
  const ids = new Set<string>();
  const leads = v.leads.map((r: unknown) => {
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
    const lead = { id: r.id, name: r.name } as Lead;
    for (const key of optional) {
      if (r[key] !== null && typeof r[key] !== "string")
        throw new PortalError("service");
      lead[key] = r[key] as string | null;
    }
    return lead;
  });
  return { customer: { name: v.customer.name }, leads };
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
  url.pathname = url.pathname.replace(/\/$/, "") + "/customer-portal/bootstrap";
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
