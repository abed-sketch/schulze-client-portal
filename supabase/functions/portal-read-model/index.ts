import { createClient } from "npm:@supabase/supabase-js@2";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  },
});
const recordId = /^rec[A-Za-z0-9]{14}$/;
const adminSentinel = "__portal_admin__";

function getAdminConfiguration() {
  let secretKeys: Record<string, string> = {};
  try {
    secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
  } catch {
    secretKeys = {};
  }
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = secretKeys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key) throw new Error("server_configuration");
  return { url, key };
}

function internalSecret(req: Request): string | null {
  const legacy = req.headers.get("x-sync-secret")?.trim() || "";
  const match = /^Bearer ([^\s]{32,256})$/.exec(req.headers.get("authorization") || "");
  const bearer = match?.[1] || "";
  if (legacy && bearer && legacy !== bearer) return null;
  const value = bearer || legacy;
  return value.length >= 32 && value.length <= 256 ? value : null;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function authorized(req: Request, supabase: ReturnType<typeof createClient>): Promise<boolean> {
  const secret = internalSecret(req);
  if (!secret) return false;
  const digest = await sha256(secret);
  const { data, error } = await supabase
    .from("portal_sync_secrets")
    .select("name")
    .eq("name", "n8n_portal_sync")
    .eq("secret_hash", digest)
    .eq("active", true)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

async function allRows(makeQuery: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>, max: number) {
  const pageSize = 1000;
  const rows: unknown[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await makeQuery(from, from + pageSize - 1);
    if (error) throw error;
    const page = data || [];
    if (rows.length + page.length > max) throw new Error("read_model_too_large");
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows as Record<string, unknown>[];
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const { url, key } = getAdminConfiguration();
    const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    if (!(await authorized(req, supabase))) return json({ error: "unauthorized" }, 401);

    const body: unknown = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid_payload");
    const input = body as Record<string, unknown>;
    const scope = input.scope;
    const clientRecordId = input.clientRecordId;
    const customerMode = scope === "portal:read" && typeof clientRecordId === "string" && recordId.test(clientRecordId);
    const adminMode = scope === "portal:admin" && clientRecordId === adminSentinel;
    if (!customerMode && !adminMode) return json({ error: "forbidden" }, 403);

    if (customerMode) {
      const { data: clients, error: clientError } = await supabase
        .from("portal_clients")
        .select("airtable_client_id,client_id,client_name")
        .eq("airtable_client_id", clientRecordId)
        .limit(2);
      if (clientError) throw clientError;
      if (!clients || clients.length !== 1) return json({ error: "not_synced" }, 404);

      const leads = await allRows(
        (from, to) => supabase
          .from("portal_leads")
          .select("airtable_lead_id,airtable_client_id,lead_name,contact_name,status,website,notes,email,phone,position,source")
          .eq("airtable_client_id", clientRecordId)
          .order("airtable_lead_id", { ascending: true })
          .range(from, to),
        10000,
      );
      const customer = clients[0];
      return json({
        mode: "customer",
        customer: { name: customer.client_name },
        clients: [],
        leads: leads.map((lead, index) => ({
          id: `lead-${index + 1}`,
          name: lead.lead_name || lead.contact_name || "Unbenannter Interessent",
          contactName: lead.contact_name,
          status: lead.status,
          website: lead.website,
          notes: lead.notes,
          email: lead.email,
          phone: lead.phone,
          position: lead.position,
          source: lead.source,
        })),
      });
    }

    const clients = await allRows(
      (from, to) => supabase
        .from("portal_clients")
        .select("airtable_client_id,client_id,client_name")
        .order("airtable_client_id", { ascending: true })
        .range(from, to),
      10000,
    );
    const leads = await allRows(
      (from, to) => supabase
        .from("portal_leads")
        .select("airtable_lead_id,airtable_client_id,lead_name,contact_name,status,website,notes,email,phone,position,source")
        .order("airtable_client_id", { ascending: true })
        .order("airtable_lead_id", { ascending: true })
        .range(from, to),
      100000,
    );
    const clientById = new Map(clients.map((client) => [client.airtable_client_id, client]));
    for (const lead of leads) if (!clientById.has(lead.airtable_client_id)) throw new Error("orphaned_lead");

    return json({
      mode: "admin",
      customer: { name: "Schulze Marketing" },
      clients: clients.map((client) => ({
        id: client.airtable_client_id,
        clientId: client.client_id,
        name: client.client_name,
      })),
      leads: leads.map((lead, index) => ({
        id: `lead-${index + 1}`,
        clientRecordId: lead.airtable_client_id,
        clientName: clientById.get(lead.airtable_client_id)!.client_name,
        name: lead.lead_name || lead.contact_name || "Unbenannter Interessent",
        contactName: lead.contact_name,
        status: lead.status,
        website: lead.website,
        notes: lead.notes,
        email: lead.email,
        phone: lead.phone,
        position: lead.position,
        source: lead.source,
      })),
    });
  } catch {
    console.error("portal-read-model failed");
    return json({ error: "read_failed" }, 400);
  }
});
