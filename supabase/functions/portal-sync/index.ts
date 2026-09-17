import { createClient } from "npm:@supabase/supabase-js@2";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  },
});

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

function diagnostics(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  const keys = [
    "clientsScanned", "targetsScanned", "leadsScanned", "peopleScanned",
    "clientsIncluded", "leadsIncluded", "skippedTargets", "skippedLeads",
  ];
  const output: Record<string, number> = {};
  for (const key of keys) {
    const number = input[key];
    if (typeof number !== "number" || !Number.isSafeInteger(number) || number < 0) {
      throw new Error("invalid_diagnostics");
    }
    output[key] = number;
  }
  return output;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const { url, key } = getAdminConfiguration();
    const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    if (!(await authorized(req, supabase))) return json({ error: "unauthorized" }, 401);

    const contentLength = Number(req.headers.get("content-length") || "0");
    if (Number.isFinite(contentLength) && contentLength > 25_000_000) {
      return json({ error: "payload_too_large" }, 413);
    }

    const body: unknown = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid_payload");
    const input = body as Record<string, unknown>;
    if (!Array.isArray(input.clients) || !Array.isArray(input.leads)) throw new Error("invalid_payload");
    if (input.clients.length > 10000 || input.leads.length > 100000) throw new Error("invalid_payload");
    const safeDiagnostics = diagnostics(input.diagnostics);

    // Transitional old writers may update data, but cannot refresh access freshness.
    const hasAccess = Object.prototype.hasOwnProperty.call(input, "accessStatus");
    if (hasAccess && (!Array.isArray(input.access) || input.access.length > 10000 ||
        !["missing", "invalid", "ready"].includes(String(input.accessStatus)))) throw new Error("invalid_access");
    const { data, error } = await supabase.rpc(hasAccess ? "portal_replace_snapshot_with_access" : "portal_replace_snapshot", {
      p_clients: input.clients,
      p_leads: input.leads,
      ...(hasAccess ? { p_access: input.access, p_access_status: input.accessStatus, p_access_table_id: input.accessTableId ?? null, p_snapshot_started_at: input.snapshotStartedAt ?? null } : {}),
    });
    if (error) throw error;

    await supabase
      .from("portal_events")
      .delete()
      .lt("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    return json({ ok: true, snapshot: data, diagnostics: safeDiagnostics });
  } catch (error) {
    // SQL/PostgREST codes are safe operational metadata; never log rows or credentials.
    const candidate = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    const code = /^[A-Z0-9]{5,10}$/.test(candidate) ? candidate : "SYNC_FAILED";
    console.error("portal-sync failed", code);
    return json({ error: "sync_failed", code }, 400);
  }
});
