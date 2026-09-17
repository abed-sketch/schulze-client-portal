import { useEffect, useRef, useState } from "react";
import {
  bootstrap,
  PortalError,
  type BootstrapResponse,
  type ErrorCode,
} from "./api/portal";
import { subscribePortalInvalidations } from "./api/realtime";
import { Leads } from "./components/Leads";
type State =
  | { kind: "loading" }
  | { kind: "ready"; data: BootstrapResponse }
  | { kind: "error"; code: ErrorCode };
const messages: Record<ErrorCode, [string, string]> = {
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
const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || "https://zwtmlrzwqnluosrdbjfv.supabase.co";
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "sb_publishable_OZuJ4MY2fQDjbmgEnzQ_Eg_ux5stSq0";
export function App({ token }: { token: string | null }) {
  const [state, setState] = useState<State>(
    token ? { kind: "loading" } : { kind: "error", code: "invalid-link" },
  );
  const [attempt, setAttempt] = useState(0);
  const realtimeDebounce = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!token) return;
    const c = new AbortController();
    setState((current) =>
      current.kind === "ready" ? current : { kind: "loading" },
    );
    bootstrap(import.meta.env.VITE_API_BASE_URL || "", token, c.signal)
      .then((data) => {
        if (!c.signal.aborted) setState({ kind: "ready", data });
      })
      .catch((e) => {
        if (!c.signal.aborted)
          setState({
            kind: "error",
            code: e instanceof PortalError ? e.code : "service",
          });
      });
    return () => c.abort();
  }, [token, attempt]);

  useEffect(() => {
    if (!token) return;
    const unsubscribe = subscribePortalInvalidations({
      url: supabaseUrl,
      publishableKey: supabasePublishableKey,
      onInvalidate: () => {
        if (realtimeDebounce.current !== undefined)
          window.clearTimeout(realtimeDebounce.current);
        realtimeDebounce.current = window.setTimeout(
          () => setAttempt((value) => value + 1),
          350,
        );
      },
    });
    return () => {
      if (realtimeDebounce.current !== undefined)
        window.clearTimeout(realtimeDebounce.current);
      unsubscribe();
    };
  }, [token]);

  return (
    <>
      <a className="skip-link" href="#main">
        Zum Inhalt
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
        <div className="portal-label">VERTRIEBSPORTAL</div>
        <div className="company">
          <span className="company-icon" aria-hidden="true">
            ▦
          </span>
          <span>
            {state.kind === "ready"
              ? state.data.customer.name
              : "Ihr Kundenportal"}
            <small>
              {state.kind === "ready" && state.data.mode === "admin"
                ? "Schulze Teamansicht"
                : "Persönlicher Bereich"}
            </small>
          </span>
        </div>
      </header>
      <main id="main">
        <div className="breadcrumb">
          Vertriebsportal <span aria-hidden="true">/</span>{" "}
          <strong>Interessenten</strong>
        </div>
        <div className="page-heading">
          <div>
            <div className="eyebrow">GEMEINSAM WACHSEN</div>
            <h1>
              Aus Kontakten werden
              <br className="heading-break" /> Möglichkeiten<span>.</span>
            </h1>
            <p>
              {state.kind === "ready" && state.data.mode === "admin"
                ? "Alle Kunden-Interessenten. Zentral im Blick. Immer auf dem aktuellen Stand."
                : "Ihre Interessenten. Klar im Blick. Immer auf dem aktuellen Stand."}
            </p>
          </div>
          <div className="heading-symbol" aria-hidden="true">
            <span>↗</span>
            <i />
          </div>
        </div>
        {state.kind === "ready" ? (
          <Leads leads={state.data.leads} admin={state.data.mode === "admin"} />
        ) : state.kind === "loading" ? (
          <section
            className="loading leads-panel"
            role="status"
            aria-live="polite"
          >
            <div className="loading-title">
              Ihre Interessenten werden geladen …
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
            <h2>{messages[state.code][0]}</h2>
            <p>{messages[state.code][1]}</p>
            {!["invalid-link", "configuration"].includes(state.code) && (
              <button
                className="primary"
                onClick={() => setAttempt((a) => a + 1)}
              >
                Erneut versuchen
              </button>
            )}
          </section>
        )}
        <footer>
          <span>SCHULZE MARKETING</span>
          <p>Ihr Vertrieb. Unser gemeinsamer Fortschritt.</p>
          <span className="footer-private">
            {state.kind === "ready" && state.data.mode === "admin"
              ? "Interne Schulze-Teamansicht"
              : "Persönlicher Kundenbereich"}
          </span>
        </footer>
      </main>
    </>
  );
}
