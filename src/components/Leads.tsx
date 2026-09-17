import { useMemo, useState } from "react";
import type { Lead, PortalClient, PortalMode } from "../api/portal";

const value = (s: string | null) => s?.trim() || "—";
type SortKey = "name" | "status" | "source" | "clientName";

function Website({ url }: { url: string | null }) {
  if (!url) return <span className="muted">—</span>;
  try {
    const u = new URL(url);
    if (!["https:", "http:"].includes(u.protocol) || u.username || u.password)
      throw new Error();
    return (
      <a href={u.href} target="_blank" rel="noopener noreferrer">
        {u.hostname.replace(/^www\./, "")} <span aria-hidden="true">↗</span>
      </a>
    );
  } catch {
    return <span>{url}</span>;
  }
}

function Contact({ lead }: { lead: Lead }) {
  return (
    <div className="contact-lines">
      {lead.email && /^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(lead.email) ? (
        <a href={`mailto:${encodeURIComponent(lead.email)}`}>{lead.email}</a>
      ) : (
        <span>{value(lead.email)}</span>
      )}
      {lead.phone && /^[+\d ()\-./]+$/.test(lead.phone) ? (
        <a className="muted" href={`tel:${lead.phone.replace(/[^+\d]/g, "")}`}>
          {lead.phone}
        </a>
      ) : (
        <span className="muted">{value(lead.phone)}</span>
      )}
    </div>
  );
}

function Badge({ status }: { status: string | null }) {
  const s = status?.toLowerCase() || "";
  const tone = /gewonnen|won|kunde/.test(s)
    ? "green"
    : /verloren|lost|abgelehnt/.test(s)
      ? "gray"
      : /termin|meeting|gespräch/.test(s)
        ? "purple"
        : /kontakt|contact|progress/.test(s)
          ? "blue"
          : "amber";
  return (
    <span className={`badge ${tone}`}>
      <span aria-hidden="true" />
      {status || "Ohne Status"}
    </span>
  );
}

function Notes({ notes }: { notes: string | null }) {
  return notes ? (
    <details className="notes">
      <summary>{notes.length > 65 ? notes.slice(0, 65) + "…" : notes}</summary>
      <p>{notes}</p>
    </details>
  ) : (
    <span className="muted">—</span>
  );
}

export function Leads({
  leads,
  mode,
  clients,
}: {
  leads: Lead[];
  mode: PortalMode;
  clients: PortalClient[];
}) {
  const isAdmin = mode === "admin";
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [client, setClient] = useState("");
  const [sort, setSort] = useState<SortKey>(isAdmin ? "clientName" : "name");
  const [desc, setDesc] = useState(false);

  const statuses = useMemo(
    () =>
      [...new Set(leads.map((l) => l.status || "Ohne Status"))].sort((a, b) =>
        a.localeCompare(b, "de"),
      ),
    [leads],
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("de");
    return leads
      .filter(
        (l) =>
          (!client || l.clientRecordId === client) &&
          (!status || (l.status || "Ohne Status") === status) &&
          [
            l.name,
            l.clientName,
            l.contactName,
            l.email,
            l.phone,
            l.position,
            l.website,
            l.notes,
            l.source,
            l.status,
          ].some((v) => v?.toLocaleLowerCase("de").includes(needle)),
      )
      .sort(
        (a, b) =>
          (a[sort] || "").localeCompare(b[sort] || "", "de", {
            numeric: true,
          }) * (desc ? -1 : 1),
      );
  }, [leads, search, status, client, sort, desc]);

  function changeSort(key: SortKey) {
    setDesc(sort === key ? !desc : false);
    setSort(key);
  }

  const heading = (key: SortKey, label: string) => (
    <th aria-sort={sort === key ? (desc ? "descending" : "ascending") : "none"}>
      <button className="sort" onClick={() => changeSort(key)}>
        {label}
        <span aria-hidden="true">
          {sort === key ? (desc ? "↓" : "↑") : "↕"}
        </span>
      </button>
    </th>
  );

  return (
    <section
      className="leads-panel"
      aria-label={isAdmin ? "Alle Kunden-Interessenten" : "Ihre Interessenten"}
    >
      <div className="panel-top">
        <div>
          <h2>
            {isAdmin ? "Alle Kunden-Interessenten" : "Alle Interessenten"}{" "}
            <span className="count">{leads.length}</span>
          </h2>
          <p>
            {isAdmin
              ? "Kunden, Kontakte und ihr aktueller Stand auf einen Blick."
              : "Ihre Kontakte und ihr aktueller Stand auf einen Blick."}
          </p>
        </div>
        <span className="read-only">
          <span aria-hidden="true">◉</span>{" "}
          {isAdmin ? "Team-Leseansicht" : "Leseansicht"}
        </span>
      </div>

      {isAdmin && (
        <div className="admin-banner" role="status">
          <strong>Admin-Leseansicht</strong>
          <span>
            Dieser kurzlebige Zugang zeigt Leads aller Kunden. Änderungen sind hier nicht möglich.
          </span>
        </div>
      )}

      <div className="toolbar">
        <label className="search">
          <span aria-hidden="true">⌕</span>
          <span className="sr-only">Interessenten suchen</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              isAdmin
                ? "Kunde, Name, Unternehmen oder Kontakt suchen …"
                : "Name, Unternehmen oder Kontakt suchen …"
            }
            type="search"
          />
        </label>
        {isAdmin && (
          <label className="filter">
            <span>Kunde</span>
            <select
              aria-label="Kunde"
              value={client}
              onChange={(e) => setClient(e.target.value)}
            >
              <option value="">Alle Kunden</option>
              {clients.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="filter">
          <span>Status</span>
          <select
            aria-label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">Alle Status</option>
            {statuses.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="mobile-sort">
          <span className="sr-only">Sortieren nach</span>
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as SortKey);
              setDesc(false);
            }}
          >
            {isAdmin && <option value="clientName">Kunde A–Z</option>}
            <option value="name">Name A–Z</option>
            <option value="status">Status A–Z</option>
            <option value="source">Quelle A–Z</option>
          </select>
        </label>
      </div>

      {!filtered.length ? (
        <div className="empty">
          <div className="state-icon" aria-hidden="true">
            ⌕
          </div>
          <h3>
            {leads.length
              ? "Keine passenden Interessenten"
              : isAdmin
                ? "Noch keine synchronisierten Interessenten"
                : "Hier beginnt Ihre Übersicht"}
          </h3>
          <p>
            {leads.length
              ? "Passen Sie Ihre Suche oder die Filter an."
              : isAdmin
                ? "Sobald eindeutig zugeordnete Leads synchronisiert wurden, erscheinen sie hier."
                : "Sobald neue Interessenten vorliegen, finden Sie diese hier."}
          </p>
          {leads.length > 0 && (
            <button
              className="secondary"
              onClick={() => {
                setSearch("");
                setStatus("");
                setClient("");
              }}
            >
              Filter zurücksetzen
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <caption className="sr-only">
                Interessenten mit Kunde, Status, Kontaktinformationen und Notizen
              </caption>
              <thead>
                <tr>
                  {isAdmin && heading("clientName", "Kunde")}
                  {heading("name", "Interessent / Kontakt")}
                  {heading("status", "Dealphase")}
                  <th>Kontaktdaten</th>
                  <th>Website</th>
                  <th>Position</th>
                  {heading("source", "Quelle")}
                  <th>Notizen</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l) => (
                  <tr key={l.id}>
                    {isAdmin && (
                      <td>
                        <span className="client-chip">{value(l.clientName)}</span>
                      </td>
                    )}
                    <td>
                      <div className="lead-name">
                        <span className="avatar" aria-hidden="true">
                          {l.name.trim().slice(0, 1)}
                        </span>
                        <div>
                          <strong>{l.name}</strong>
                          <small>{value(l.contactName)}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <Badge status={l.status} />
                    </td>
                    <td>
                      <Contact lead={l} />
                    </td>
                    <td>
                      <Website url={l.website} />
                    </td>
                    <td>{value(l.position)}</td>
                    <td>
                      <span className="source">{value(l.source)}</span>
                    </td>
                    <td>
                      <Notes notes={l.notes} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="cards">
            {filtered.map((l) => (
              <article className="lead-card" key={l.id}>
                <div className="card-heading">
                  <div>
                    <h3>{l.name}</h3>
                    <p>{value(l.contactName)}</p>
                  </div>
                  <Badge status={l.status} />
                </div>
                <dl>
                  {isAdmin && (
                    <div className="wide">
                      <dt>Kunde</dt>
                      <dd>
                        <span className="client-chip">{value(l.clientName)}</span>
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt>Kontakt</dt>
                    <dd>
                      <Contact lead={l} />
                    </dd>
                  </div>
                  <div>
                    <dt>Website</dt>
                    <dd>
                      <Website url={l.website} />
                    </dd>
                  </div>
                  <div>
                    <dt>Position</dt>
                    <dd>{value(l.position)}</dd>
                  </div>
                  <div>
                    <dt>Quelle</dt>
                    <dd>{value(l.source)}</dd>
                  </div>
                  <div className="wide">
                    <dt>Notizen</dt>
                    <dd>
                      <Notes notes={l.notes} />
                    </dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        </>
      )}
      <div className="panel-footer" role="status">
        {filtered.length} von {leads.length} Interessenten
        <span>
          {isAdmin
            ? "Nur für das autorisierte Schulze-Team sichtbar"
            : "Nur für Ihr Unternehmen sichtbar"}
        </span>
      </div>
    </section>
  );
}
