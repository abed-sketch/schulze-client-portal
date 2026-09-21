import { useLanguage } from "../i18n";
import { useMemo, useState } from "react";
import {
  getLeadOptions,
  PortalError,
  updateExistingLead,
  type Lead,
  type LeadOptionsResponse,
  type PortalClient,
  type PortalMode,
} from "../api/portal";
import { requestLearningSuiteToken } from "../api/learningSuite";

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
  editable = false,
}: {
  leads: Lead[];
  mode: PortalMode;
  showClientFilter?: boolean;
  clients: PortalClient[];
  editable?: boolean;
}) {
  const { t, language } = useLanguage();
  const isAdmin = mode === "admin";
  const canEdit = editable && !isAdmin;
  const showClients = isAdmin || showClientFilter || clients.length > 1;
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [client, setClient] = useState("");
  const [sort, setSort] = useState<SortKey>(showClients ? "clientName" : "name");
  const [desc, setDesc] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [dealPhase, setDealPhase] = useState("");
  const [interaction, setInteraction] = useState("");
  const [options, setOptions] = useState<LeadOptionsResponse | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editorMessage, setEditorMessage] = useState("");
  const [editorError, setEditorError] = useState("");

  const statuses = useMemo(
    () =>
      [...new Set(leads.map((l) => l.status || "__no_status__"))].sort((a, b) =>
        a.localeCompare(b, language),
      ),
    [leads, language],
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
  }, [leads, search, status, client, sort, desc, language]);

  const selectedLead = editId ? leads.find((l) => l.id === editId) || null : null;

  function changeSort(key: SortKey) {
    setDesc(sort === key ? !desc : false);
    setSort(key);
  }

  async function openEditor(lead: Lead) {
    if (!canEdit) return;
    setEditId(lead.id);
    setDealPhase(lead.status || "");
    setInteraction("");
    setEditorError("");
    setEditorMessage("");
    if (options) return;
    setOptionsLoading(true);
    try {
      const token = await requestLearningSuiteToken();
      const loaded = await getLeadOptions(
        import.meta.env.VITE_API_BASE_URL || "",
        token,
      );
      setOptions(loaded);
    } catch (error) {
      setEditorError(
        t(
          error instanceof PortalError && error.code === "not-provisioned"
            ? "Dieser Lead kann mit Ihrem Zugang nicht geändert werden."
            : "Die Bearbeitungsoptionen konnten nicht geladen werden.",
        ),
      );
    } finally {
      setOptionsLoading(false);
    }
  }

  async function saveEditor() {
    if (!selectedLead || !canEdit || saving) return;
    const text = interaction.trim();
    const phase =
      dealPhase.trim() && dealPhase.trim() !== (selectedLead.status || "")
        ? dealPhase.trim()
        : "";
    if (!text && !phase) {
      setEditorError(t("Bitte fügen Sie eine Interaktion hinzu oder ändern Sie die Dealphase."));
      return;
    }
    setSaving(true);
    setEditorError("");
    setEditorMessage("");
    try {
      const token = await requestLearningSuiteToken();
      await updateExistingLead(
        import.meta.env.VITE_API_BASE_URL || "",
        token,
        {
          requestId: crypto.randomUUID(),
          leadId: selectedLead.id,
          interactionText: text,
          dealPhase: phase,
        },
      );
      setInteraction("");
      setEditorMessage(
        t("Gespeichert. Die Änderung erscheint nach der nächsten Synchronisierung in der Übersicht."),
      );
    } catch (error) {
      setEditorError(
        t(
          error instanceof PortalError && error.code === "not-provisioned"
            ? "Dieser Lead kann mit Ihrem Zugang nicht geändert werden."
            : "Die Änderung konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.",
        ),
      );
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
              ? t("Interaktionen & Dealphase")
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

      {canEdit && (
        <div className="editable-note" role="note">
          <strong>{t("Bestehende Leads pflegen")}</strong>
          <span>
            {t("Sie können eine Interaktion ergänzen oder die Dealphase ändern. Neue Leads können hier nicht angelegt werden.")}
          </span>
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
              <option value={s} key={s}>{t(s === "__no_status__" ? "Ohne Status" : s)}</option>
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

      {canEdit && selectedLead && (
        <div className="lead-editor" aria-live="polite">
          <div className="lead-editor-header">
            <div>
              <span>{t("Bestehenden Lead aktualisieren")}</span>
              <h3>{selectedLead.name}</h3>
            </div>
            <button
              type="button"
              className="editor-close"
              onClick={() => setEditId(null)}
              aria-label={t("Schließen")}
            >
              ×
            </button>
          </div>
          <div className="lead-editor-grid">
            <label>
              <span>{t("Dealphase")}</span>
              <select
                value={dealPhase}
                onChange={(e) => setDealPhase(e.target.value)}
                disabled={optionsLoading || saving}
              >
                {!options?.dealPhaseChoices.includes(dealPhase) && dealPhase && (
                  <option value={dealPhase}>{t(dealPhase)}</option>
                )}
                {(options?.dealPhaseChoices || []).map((choice) => (
                  <option value={choice} key={choice}>{t(choice)}</option>
                ))}
              </select>
              {optionsLoading && <small>{t("Dealphasen werden geladen …")}</small>}
            </label>
            <label>
              <span>{t("Neue Interaktion")}</span>
              <textarea
                value={interaction}
                onChange={(e) => setInteraction(e.target.value)}
                maxLength={5000}
                rows={4}
                placeholder={t("Kurze Notiz zur neuen Interaktion …")}
                disabled={saving}
              />
            </label>
          </div>
          {editorError && <p className="editor-error" role="alert">{editorError}</p>}
          {editorMessage && <p className="editor-message" role="status">{editorMessage}</p>}
          <div className="editor-actions">
            <button type="button" className="secondary" onClick={() => setEditId(null)} disabled={saving}>
              {t("Abbrechen")}
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => void saveEditor()}
              disabled={saving || optionsLoading || !options}
            >
              {saving ? t("Wird gespeichert …") : t("Änderung speichern")}
            </button>
          </div>
        </div>
      )}

      {!filtered.length ? (
        <div className="empty">
          <div className="state-icon" aria-hidden="true">⌕</div>
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
                  {canEdit && <th>{t("Aktion")}</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((l) => (
                  <tr key={l.id}>
                    {showClients && (
                      <td><span className="client-chip">{value(l.clientName)}</span></td>
                    )}
                    <td>
                      <div className="lead-name">
                        <span className="avatar" aria-hidden="true">{l.name.trim().slice(0, 1)}</span>
                        <div>
                          <strong>{l.name}</strong>
                          <small>{value(l.contactName)}</small>
                        </div>
                      </div>
                    </td>
                    <td><Badge status={l.status} /></td>
                    <td><Contact lead={l} /></td>
                    <td><Website url={l.website} /></td>
                    <td>{value(l.position)}</td>
                    <td><span className="source">{value(l.source)}</span></td>
                    <td><Notes notes={l.notes} /></td>
                    {canEdit && (
                      <td>
                        <button type="button" className="edit-lead" onClick={() => void openEditor(l)}>
                          {t("Aktualisieren")}
                        </button>
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
                      <dd><span className="client-chip">{value(l.clientName)}</span></dd>
                    </div>
                  )}
                  <div><dt>{t("Kontakt")}</dt><dd><Contact lead={l} /></dd></div>
                  <div><dt>{t("Website")}</dt><dd><Website url={l.website} /></dd></div>
                  <div><dt>{t("Position")}</dt><dd>{value(l.position)}</dd></div>
                  <div><dt>{t("Quelle")}</dt><dd>{value(l.source)}</dd></div>
                  <div className="wide"><dt>{t("Notizen")}</dt><dd><Notes notes={l.notes} /></dd></div>
                </dl>
                {canEdit && (
                  <button type="button" className="edit-lead card-edit" onClick={() => void openEditor(l)}>
                    {t("Lead aktualisieren")}
                  </button>
                )}
              </article>
            ))}
          </div>
        </>
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
