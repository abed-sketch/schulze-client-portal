import { useLanguage } from "../i18n";
import { useMemo, useState } from "react";
import type {
  Lead,
  LeadUpdateInput,
  PortalClient,
  PortalMode,
} from "../api/portal";

const value = (s: string | null) => s?.trim() || "—";
const recordId = /^rec[A-Za-z0-9]{14}$/;
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
  const { t } = useLanguage();
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
      {t(status || "Ohne Status")}
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
  showClientFilter = false,
  clients,
  canEdit = false,
  onUpdate,
}: {
  leads: Lead[];
  mode: PortalMode;
  showClientFilter?: boolean;
  clients: PortalClient[];
  canEdit?: boolean;
  onUpdate?: (input: LeadUpdateInput) => Promise<void>;
}) {
  const { t, language } = useLanguage();
  const isAdmin = mode === "admin";
  const showClients = isAdmin || showClientFilter || clients.length > 1;
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [client, setClient] = useState("");
  const [sort, setSort] = useState<SortKey>(showClients ? "clientName" : "name");
  const [desc, setDesc] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [interactionText, setInteractionText] = useState("");
  const [dealPhase, setDealPhase] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [notice, setNotice] = useState("");

  const statuses = useMemo(
    () =>
      [...new Set(leads.map((l) => l.status || "__no_status__"))].sort((a, b) =>
        a.localeCompare(b, language),
      ),
    [leads, language],
  );

  const editableStatuses = useMemo(
    () => statuses.filter((s) => s !== "__no_status__"),
    [statuses],
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase(language);
    return leads
      .filter(
        (l) =>
          (!client || l.clientRecordId === client) &&
          (!status || (l.status || "__no_status__") === status) &&
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
            t(l.status || "Ohne Status"),
          ].some((v) => v?.toLocaleLowerCase(language).includes(needle)),
      )
      .sort(
        (a, b) =>
          (a[sort] || "").localeCompare(b[sort] || "", language, {
            numeric: true,
          }) * (desc ? -1 : 1),
      );
  }, [leads, search, status, client, sort, desc, language, t]);

  function changeSort(key: SortKey) {
    setDesc(sort === key ? !desc : false);
    setSort(key);
  }

  function openEditor(lead: Lead) {
    setEditing(lead);
    setInteractionText("");
    setDealPhase(lead.status || "");
    setSaveError("");
    setNotice("");
  }

  function closeEditor() {
    if (saving) return;
    setEditing(null);
    setInteractionText("");
    setDealPhase("");
    setSaveError("");
  }

  async function saveEdit() {
    if (!editing || !onUpdate || saving) return;
    const interaction = interactionText.trim();
    const phaseChanged = dealPhase !== (editing.status || "");
    if (!interaction && !phaseChanged) {
      setSaveError(t("Bitte fügen Sie eine Interaktion hinzu oder ändern Sie die Dealphase."));
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      await onUpdate({
        requestId: crypto.randomUUID(),
        leadId: editing.id,
        interactionText: interaction || undefined,
        dealPhase: dealPhase || undefined,
        interactionDate: new Date().toISOString(),
      });
      setNotice(t("Änderung gespeichert. Die Übersicht aktualisiert sich automatisch."));
      setEditing(null);
      setInteractionText("");
      setDealPhase("");
    } catch {
      setSaveError(t("Änderung konnte nicht gespeichert werden. Bitte versuchen Sie es erneut."));
    } finally {
      setSaving(false);
    }
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

  const editable = (lead: Lead) =>
    canEdit && !isAdmin && Boolean(onUpdate) && recordId.test(lead.id);

  return (
    <section
      className="leads-panel"
      aria-label={isAdmin ? t("Alle Kunden-Interessenten") : t("Ihre Interessenten")}
    >
      <div className="panel-top">
        <div>
          <h2>
            {isAdmin ? t("Alle Kunden-Interessenten") : t("Alle Interessenten")}{" "}
            <span className="count">{leads.length}</span>
          </h2>
          <p>
            {isAdmin
              ? t("Kunden, Kontakte und ihr aktueller Stand auf einen Blick.")
              : t("Ihre Kontakte und ihr aktueller Stand auf einen Blick.")}
          </p>
        </div>
        <span className="read-only">
          <span aria-hidden="true">◉</span>{" "}
          {isAdmin
            ? t("Team-Leseansicht")
            : canEdit
              ? t("Kundenansicht")
              : t("Leseansicht")}
        </span>
      </div>

      {isAdmin && (
        <div className="admin-banner" role="status">
          <strong>{t("Admin-Leseansicht")}</strong>
          <span>
            {t("Dieser geschützte Zugang zeigt Leads aller Kunden. Änderungen sind hier nicht möglich.")}
          </span>
        </div>
      )}

      {notice && (
        <div className="save-notice" role="status">
          {notice}
        </div>
      )}

      <div className="toolbar">
        <label className="search">
          <span aria-hidden="true">⌕</span>
          <span className="sr-only">{t("Interessenten suchen")}</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              isAdmin
                ? t("Kunde, Name, Unternehmen oder Kontakt suchen …")
                : t("Name, Unternehmen oder Kontakt suchen …")
            }
            type="search"
          />
        </label>
        {showClients && (
          <label className="filter">
            <span>{t("Kunde")}</span>
            <select
              aria-label={t("Kunde")}
              value={client}
              onChange={(e) => setClient(e.target.value)}
            >
              <option value="">{t("Alle Kunden")}</option>
              {clients.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="filter">
          <span>{t("Status")}</span>
          <select
            aria-label={t("Status")}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">{t("Alle Status")}</option>
            {statuses.map((s) => (
              <option value={s} key={s}>
                {t(s === "__no_status__" ? "Ohne Status" : s)}
              </option>
            ))}
          </select>
        </label>
        <label className="mobile-sort">
          <span className="sr-only">{t("Sortieren nach")}</span>
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as SortKey);
              setDesc(false);
            }}
          >
            {showClients && <option value="clientName">{t("Kunde A–Z")}</option>}
            <option value="name">{t("Name A–Z")}</option>
            <option value="status">{t("Status A–Z")}</option>
            <option value="source">{t("Quelle A–Z")}</option>
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
              ? t("Keine passenden Interessenten")
              : isAdmin
                ? t("Noch keine synchronisierten Interessenten")
                : t("Hier beginnt Ihre Übersicht")}
          </h3>
          <p>
            {leads.length
              ? t("Passen Sie Ihre Suche oder die Filter an.")
              : isAdmin
                ? t("Sobald eindeutig zugeordnete Leads synchronisiert wurden, erscheinen sie hier.")
                : t("Sobald neue Interessenten vorliegen, finden Sie diese hier.")}
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
              {t("Filter zurücksetzen")}
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <caption className="sr-only">
                {t("Interessenten mit Kunde, Status, Kontaktinformationen und Notizen")}
              </caption>
              <thead>
                <tr>
                  {showClients && heading("clientName", t("Kunde"))}
                  {heading("name", t("Interessent / Kontakt"))}
                  {heading("status", t("Dealphase"))}
                  <th>{t("Kontaktdaten")}</th>
                  <th>{t("Website")}</th>
                  <th>{t("Position")}</th>
                  {heading("source", t("Quelle"))}
                  <th>{t("Notizen")}</th>
                  {canEdit && !isAdmin && <th>{t("Aktion")}</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((l) => (
                  <tr key={l.id}>
                    {showClients && (
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
                    {canEdit && !isAdmin && (
                      <td>
                        {editable(l) ? (
                          <button
                            className="edit-lead"
                            onPointerDown={() => openEditor(l)}
                            onClick={() => openEditor(l)}
                          >
                            {t("Aktualisieren")}
                          </button>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    )}
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
                  {showClients && (
                    <div className="wide">
                      <dt>{t("Kunde")}</dt>
                      <dd>
                        <span className="client-chip">{value(l.clientName)}</span>
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt>{t("Kontakt")}</dt>
                    <dd>
                      <Contact lead={l} />
                    </dd>
                  </div>
                  <div>
                    <dt>{t("Website")}</dt>
                    <dd>
                      <Website url={l.website} />
                    </dd>
                  </div>
                  <div>
                    <dt>{t("Position")}</dt>
                    <dd>{value(l.position)}</dd>
                  </div>
                  <div>
                    <dt>{t("Quelle")}</dt>
                    <dd>{value(l.source)}</dd>
                  </div>
                  <div className="wide">
                    <dt>{t("Notizen")}</dt>
                    <dd>
                      <Notes notes={l.notes} />
                    </dd>
                  </div>
                </dl>
                {editable(l) && (
                  <button
                    className="edit-lead card-edit"
                    onPointerDown={() => openEditor(l)}
                    onClick={() => openEditor(l)}
                  >
                    {t("Interaktion hinzufügen / Dealphase ändern")}
                  </button>
                )}
              </article>
            ))}
          </div>
        </>
      )}

      {editing && (
        <div className="lead-editor-backdrop" onMouseDown={closeEditor}>
          <div
            className="lead-editor"
            role="dialog"
            aria-modal="true"
            aria-labelledby="lead-editor-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="lead-editor-heading">
              <div>
                <div className="eyebrow">{t("BESTEHENDEN LEAD AKTUALISIEREN")}</div>
                <h3 id="lead-editor-title">{editing.name}</h3>
                <p>{t("Fügen Sie eine Interaktion hinzu oder ändern Sie die Dealphase.")}</p>
              </div>
              <button
                className="close-editor"
                type="button"
                aria-label={t("Schließen")}
                onClick={closeEditor}
                disabled={saving}
              >
                ×
              </button>
            </div>

            <label className="editor-field">
              <span>{t("Dealphase")}</span>
              <select
                value={dealPhase}
                onChange={(event) => setDealPhase(event.target.value)}
                disabled={saving}
              >
                {!editing.status && <option value="">{t("Keine Änderung")}</option>}
                {editableStatuses.map((s) => (
                  <option value={s} key={s}>
                    {t(s)}
                  </option>
                ))}
              </select>
            </label>

            <label className="editor-field">
              <span>{t("Neue Interaktion")}</span>
              <textarea
                rows={5}
                maxLength={5000}
                value={interactionText}
                onChange={(event) => setInteractionText(event.target.value)}
                placeholder={t("Was wurde mit diesem Interessenten besprochen oder vereinbart?")}
                disabled={saving}
              />
              <small>
                {interactionText.length}/5000
              </small>
            </label>

            {saveError && (
              <div className="editor-error" role="alert">
                {saveError}
              </div>
            )}

            <div className="editor-actions">
              <button className="secondary" type="button" onClick={closeEditor} disabled={saving}>
                {t("Abbrechen")}
              </button>
              <button className="primary" type="button" onClick={() => void saveEdit()} disabled={saving}>
                {saving ? t("Speichern …") : t("Speichern")}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="panel-footer" role="status">
        {filtered.length} {t("von")} {leads.length} {t("Interessenten")}
        <span>
          {isAdmin
            ? t("Nur für das autorisierte Schulze-Team sichtbar")
            : t("Nur für Ihr Unternehmen sichtbar")}
        </span>
      </div>
    </section>
  );
}
