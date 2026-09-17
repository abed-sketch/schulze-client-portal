import { LanguageSwitch, useLanguage } from "./i18n";
import { useEffect, useState } from "react";
import {
  bootstrap,
  bootstrapLearningSuite,
  PortalError,
  type BootstrapResponse,
  type ErrorCode,
} from "./api/portal";
import { Leads } from "./components/Leads";
import { subscribePortalInvalidations } from "./api/realtime";
import "./admin.css";
import { requestLearningSuiteToken } from "./api/learningSuite";

type State =
  | { kind: "loading" }
  | { kind: "ready"; data: BootstrapResponse }
  | { kind: "error"; code: ErrorCode };

const messages: Record<ErrorCode, [string, string]> = {
  "ls-required": ["Bitte in LearningSuite öffnen", "Öffnen Sie das Vertriebsportal in Ihrem angemeldeten LearningSuite-Konto. Falls es bereits dort geöffnet ist, laden Sie die LearningSuite-Seite neu."],
  "not-provisioned": ["Ihr Zugang ist noch nicht zugeordnet", "Ihre bestätigte LearningSuite-E-Mail muss beim Hauptkontakt Ihres Kundenkontos hinterlegt sein. Bitte wenden Sie sich an Ihr Schulze-Team."],
  "invalid-link": [
    "Dieser Link ist nicht gültig",
    "Bitte öffnen Sie Ihren persönlichen Vertriebsportal-Link erneut in LearningSuite. Falls der Zugang abgelaufen ist, wenden Sie sich an Ihr Schulze-Team.",
  ],
  configuration: [
    "Das Portal wird vorbereitet",
    "Ihr Zugang ist noch nicht vollständig eingerichtet. Bitte wenden Sie sich an Ihr Schulze-Team.",
  ],
  "rate-limit": [
    "Einen Moment bitte",
    "Es gab gerade zu viele Anfragen. Bitte versuchen Sie es in einer Minute erneut.",
  ],
  service: [
    "Ihre Übersicht ist gerade nicht erreichbar",
    "Bitte versuchen Sie es in Kürze erneut. Ihre Daten bleiben erhalten.",
  ],
  timeout: [
    "Das Laden dauert länger als erwartet",
    "Bitte prüfen Sie Ihre Verbindung und versuchen Sie es erneut.",
  ],
};

export function App({ token }: { token: string | null }) {
  const { t } = useLanguage();
  const [state, setState] = useState<State>(
    { kind: "loading" },
  );
  const [attempt, setAttempt] = useState(0);
  const [presentation, setPresentation] = useState<{key:string;mode:BootstrapResponse["mode"];multi:boolean} | null>(null);

  useEffect(() => {
    const c = new AbortController();
    let active: AbortController | null = null;
    let revoked = false;
    let debounce: number | undefined;
    setState({ kind: "loading" });
    const refresh = async () => {
      if (active || revoked || c.signal.aborted || document.hidden) return;
      const request = new AbortController();
      active = request;
      const signal = AbortSignal.any([c.signal, request.signal]);
      try {
        let data: BootstrapResponse;
        if (token) data = await bootstrap(import.meta.env.VITE_API_BASE_URL || "", token, signal);
        else {
          const sessionToken = await requestLearningSuiteToken(signal);
          try { data = await bootstrapLearningSuite(sessionToken,signal); }
          catch (error) {
            if (!(error instanceof PortalError) || error.code !== 'ls-required') throw error;
            data = await bootstrapLearningSuite(await requestLearningSuiteToken(signal),signal);
          }
        }
        if (!signal.aborted && active === request) {
          setPresentation({key:data.mode + ':' + (data.sessionKey || 'legacy'),mode:data.mode,multi:data.clients.length>1});
          setState({ kind: "ready", data });
        }
      } catch (e) {
        if (!signal.aborted && active === request) {
          const code = e instanceof PortalError ? e.code : "service";
          revoked = code === "invalid-link";
          setState({ kind: "error", code });
        }
      } finally {
        if (active === request) active = null;
      }
    };
    const invalidate = () => {
      if (!token) {
        active?.abort();
        active = null;
        setState({kind:"loading"});
      }
      window.clearTimeout(debounce);
      debounce = window.setTimeout(() => { void refresh(); }, 300);
    };
    const unsubscribe = subscribePortalInvalidations({
      url: import.meta.env.VITE_SUPABASE_URL || "https://zwtmlrzwqnluosrdbjfv.supabase.co",
      publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_OZuJ4MY2fQDjbmgEnzQ_Eg_ux5stSq0",
      onInvalidate: invalidate,
    });
    void refresh();
    const interval = window.setInterval(() => { void refresh(); }, 60000);
    window.addEventListener("focus", invalidate);
    document.addEventListener("visibilitychange", invalidate);
    return () => {
      c.abort();
      unsubscribe();
      window.clearInterval(interval);
      window.clearTimeout(debounce);
      window.removeEventListener("focus", invalidate);
      document.removeEventListener("visibilitychange", invalidate);
    };
  }, [token, attempt]);

  const ready = state.kind === "ready" ? state.data : null;
  const isAdmin = ready?.mode === "admin";

  return (
    <>
      <a className="skip-link" href="#main">
        {t("Zum Inhalt")}
      </a>
      <header className="topbar">
        <a className="brand" href="#main" aria-label="Schulze Marketing">
          <span className="brand-mark" aria-hidden="true">
            s<span>.</span>
          </span>
          <span>
            SCHULZE<small>MARKETING</small>
          </span>
        </a>
        <div className="portal-label">{t("VERTRIEBSPORTAL")}</div>
        <div className="company">
          <span className="company-icon" aria-hidden="true">
            ▦
          </span>
          <span>
            {ready ? t(ready.customer.name) : t("Ihr Kundenportal")}
            <small>{isAdmin ? t("Schulze Teamansicht") : t("Persönlicher Bereich")}</small>
          </span>
        </div>
        <LanguageSwitch />
      </header>
      <main id="main">
        <div className="breadcrumb">
          {t("Vertriebsportal")} <span aria-hidden="true">/</span>{" "}
          <strong>{isAdmin ? t("Alle Kunden-Interessenten") : t("Interessenten")}</strong>
        </div>
        <div className="page-heading">
          <div>
            <div className="eyebrow">
              {isAdmin ? t("SCHULZE TEAMANSICHT") : t("GEMEINSAM WACHSEN")}
            </div>
            <h1>
              {isAdmin ? (
                <>
                  {t("Alle Kundenleads")}
                  <br className="heading-break" /> {t("im Überblick")}<span>.</span>
                </>
              ) : (
                <>
                  {t("Aus Kontakten werden")}
                  <br className="heading-break" /> {t("Möglichkeiten")}<span>.</span>
                </>
              )}
            </h1>
            <p>
              {isAdmin
                ? t("Kundenübergreifende Leseansicht für das Schulze-Team.")
                : t("Ihre Interessenten. Klar im Blick. Immer auf dem aktuellen Stand.")}
            </p>
          </div>
          <div className="heading-symbol" aria-hidden="true">
            <span>↗</span>
            <i />
          </div>
        </div>
        {presentation && state.kind !== 'error' && (
          <div aria-busy={!ready}>
            <Leads key={presentation.key} mode={presentation.mode} showClientFilter={presentation.multi} clients={ready?.clients || []} leads={ready?.leads || []} />
          </div>
        )}
        {state.kind === "ready" ? null : state.kind === "loading" ? (
          <section
            className="loading leads-panel"
            role="status"
            aria-live="polite"
          >
            <div className="loading-title">
              {t("Ihre Interessenten werden geladen …")}
            </div>
            {Array.from({ length: 5 }, (_, i) => (
              <div className="skeleton-row" key={i}>
                <i />
                <i />
                <i />
              </div>
            ))}
          </section>
        ) : (
          <section className="error-state leads-panel" role="alert">
            <div className="state-icon" aria-hidden="true">
              {state.code === "invalid-link" ? "◇" : "↻"}
            </div>
            <h2>{t(messages[state.code][0])}</h2>
            <p>{t(messages[state.code][1])}</p>
            {!["invalid-link", "configuration"].includes(state.code) && (
              <button
                className="primary"
                onClick={() => setAttempt((a) => a + 1)}
              >
                {t("Erneut versuchen")}
              </button>
            )}
          </section>
        )}
        <footer>
          <span>SCHULZE MARKETING</span>
          <p>{t("Ihr Vertrieb. Unser gemeinsamer Fortschritt.")}</p>
          <span className="footer-private">
            {isAdmin ? t("Geschützte Teamansicht") : t("Persönlicher Kundenbereich")}
          </span>
        </footer>
      </main>
    </>
  );
}
