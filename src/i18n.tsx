import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
export type Language = "de" | "en";
const english: Record<string, string> = {
  "Bitte in LearningSuite öffnen": "Please open in LearningSuite",
  "Öffnen Sie das Vertriebsportal in Ihrem angemeldeten LearningSuite-Konto. Falls es bereits dort geöffnet ist, laden Sie die LearningSuite-Seite neu.": "Open the sales portal from your signed-in LearningSuite account. If it is already open there, reload the LearningSuite page.",
  "Ihr Zugang ist noch nicht zugeordnet": "Your access has not been assigned yet",
  "Ihre bestätigte LearningSuite-E-Mail muss beim Hauptkontakt Ihres Kundenkontos hinterlegt sein. Bitte wenden Sie sich an Ihr Schulze-Team.": "Your verified LearningSuite email must match the primary contact on your client account. Please contact your Schulze team.",
  "Meine Unternehmen": "My companies",
  "Zum Inhalt": "Skip to content",
  "VERTRIEBSPORTAL": "SALES PORTAL",
  "Ihr Kundenportal": "Your client portal",
  "Schulze Teamansicht": "Schulze team view",
  "Persönlicher Bereich": "Personal area",
  "Vertriebsportal": "Sales portal",
  "Alle Kunden-Interessenten": "All client leads",
  "Interessenten": "Leads",
  "SCHULZE TEAMANSICHT": "SCHULZE TEAM VIEW",
  "GEMEINSAM WACHSEN": "GROWING TOGETHER",
  "Alle Kundenleads": "All client leads",
  "im Überblick": "at a glance",
  "Aus Kontakten werden": "Turning contacts",
  "Möglichkeiten": "into opportunities",
  "Kundenübergreifende Leseansicht für das Schulze-Team.": "A view of all client leads for the Schulze team.",
  "Ihre Interessenten. Klar im Blick. Immer auf dem aktuellen Stand.": "Your leads. Clearly presented. Always up to date.",
  "Ihre Interessenten werden geladen …": "Loading your leads …",
  "Erneut versuchen": "Try again",
  "Ihr Vertrieb. Unser gemeinsamer Fortschritt.": "Your sales. Our shared progress.",
  "Geschützte Teamansicht": "Protected team view",
  "Persönlicher Kundenbereich": "Private client area",
  "Dieser Link ist nicht gültig": "This link is not valid",
  "Bitte öffnen Sie Ihren persönlichen Vertriebsportal-Link erneut in LearningSuite. Falls der Zugang abgelaufen ist, wenden Sie sich an Ihr Schulze-Team.": "Please reopen your personal sales portal link in LearningSuite. If your access has expired, contact your Schulze team.",
  "Das Portal wird vorbereitet": "Your portal is being prepared",
  "Ihr Zugang ist noch nicht vollständig eingerichtet. Bitte wenden Sie sich an Ihr Schulze-Team.": "Your access has not been fully configured yet. Please contact your Schulze team.",
  "Einen Moment bitte": "One moment, please",
  "Es gab gerade zu viele Anfragen. Bitte versuchen Sie es in einer Minute erneut.": "There have been too many requests. Please try again in a minute.",
  "Ihre Übersicht ist gerade nicht erreichbar": "Your overview is currently unavailable",
  "Bitte versuchen Sie es in Kürze erneut. Ihre Daten bleiben erhalten.": "Please try again shortly. Your data is safe.",
  "Das Laden dauert länger als erwartet": "Loading is taking longer than expected",
  "Bitte prüfen Sie Ihre Verbindung und versuchen Sie es erneut.": "Please check your connection and try again.",
  "Ohne Status": "No status",
  "Ihre Interessenten": "Your leads",
  "Alle Interessenten": "All leads",
  "Kunden, Kontakte und ihr aktueller Stand auf einen Blick.": "Clients, contacts and their current status at a glance.",
  "Ihre Kontakte und ihr aktueller Stand auf einen Blick.": "Your contacts and their current status at a glance.",
  "Team-Leseansicht": "Team read-only view",
  "Leseansicht": "Read-only view",
  "Admin-Leseansicht": "Admin read-only view",
  "Dieser geschützte Zugang zeigt Leads aller Kunden. Änderungen sind hier nicht möglich.": "This temporary access shows leads from all clients. Editing is not available here.",
  "Interessenten suchen": "Search leads",
  "Kunde, Name, Unternehmen oder Kontakt suchen …": "Search client, name, company or contact …",
  "Name, Unternehmen oder Kontakt suchen …": "Search name, company or contact …",
  "Kunde": "Client",
  "Alle Kunden": "All clients",
  "Status": "Status",
  "Alle Status": "All statuses",
  "Sortieren nach": "Sort by",
  "Kunde A–Z": "Client A–Z",
  "Name A–Z": "Name A–Z",
  "Status A–Z": "Status A–Z",
  "Quelle A–Z": "Source A–Z",
  "Keine passenden Interessenten": "No matching leads",
  "Noch keine synchronisierten Interessenten": "No synced leads yet",
  "Hier beginnt Ihre Übersicht": "Your overview starts here",
  "Passen Sie Ihre Suche oder die Filter an.": "Adjust your search or filters.",
  "Sobald eindeutig zugeordnete Leads synchronisiert wurden, erscheinen sie hier.": "Leads will appear here once they have a verified client owner and have been synced.",
  "Sobald neue Interessenten vorliegen, finden Sie diese hier.": "New leads will appear here as they become available.",
  "Filter zurücksetzen": "Reset filters",
  "Interessenten mit Kunde, Status, Kontaktinformationen und Notizen": "Leads with client, status, contact details and notes",
  "Interessent / Kontakt": "Lead / contact",
  "Dealphase": "Deal stage",
  "Kontaktdaten": "Contact details",
  "Website": "Website",
  "Position": "Position",
  "Quelle": "Source",
  "Notizen": "Notes",
  "Kontakt": "Contact",
  "Nur für das autorisierte Schulze-Team sichtbar": "Visible only to the authorized Schulze team",
  "Nur für Ihr Unternehmen sichtbar": "Visible only to your company",
  "Kundenansicht": "Client view",
  "Aktion": "Action",
  "Aktualisieren": "Update",
  "Interaktion hinzufügen / Dealphase ändern": "Add interaction / change deal stage",
  "BESTEHENDEN LEAD AKTUALISIEREN": "UPDATE EXISTING LEAD",
  "Fügen Sie eine Interaktion hinzu oder ändern Sie die Dealphase.": "Add an interaction or change the deal stage.",
  "Neue Interaktion": "New interaction",
  "Was wurde mit diesem Interessenten besprochen oder vereinbart?": "What was discussed or agreed with this lead?",
  "Keine Änderung": "No change",
  "Bitte fügen Sie eine Interaktion hinzu oder ändern Sie die Dealphase.": "Please add an interaction or change the deal stage.",
  "Änderung gespeichert. Die Übersicht aktualisiert sich automatisch.": "Change saved. The overview will refresh automatically.",
  "Änderung konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.": "The change could not be saved. Please try again.",
  "Schließen": "Close",
  "Abbrechen": "Cancel",
  "Speichern": "Save",
  "Speichern …": "Saving …",
  "von": "of",
  "Neu": "New",
  "Kontaktiert": "Contacted",
  "Termin vereinbart": "Meeting scheduled",
  "Gewonnen": "Won",
  "Verloren": "Lost"
};
const LanguageContext = createContext({ language: "de" as Language, setLanguage: (_: Language) => {} });
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>("de");
  useEffect(() => {
    document.documentElement.lang = language;
    document.title = language === "de" ? "Schulze Marketing · Vertriebsportal" : "Schulze Marketing · Sales portal";
  }, [language]);
  return <LanguageContext.Provider value={{ language, setLanguage }}>{children}</LanguageContext.Provider>;
}
export function useLanguage() {
  const { language, setLanguage } = useContext(LanguageContext);
  return { language, setLanguage, t: (text: string) => language === "en" ? (Object.hasOwn(english, text) ? english[text] : text) : text };
}
export function LanguageSwitch() {
  const { language, setLanguage } = useLanguage();
  return <div className="language-switch" role="group" aria-label="Sprache / Language">
    <button type="button" lang="de" aria-label="Deutsch" aria-pressed={language === "de"} onClick={() => setLanguage("de")}>DE</button>
    <button type="button" lang="en" aria-label="English" aria-pressed={language === "en"} onClick={() => setLanguage("en")}>EN</button>
  </div>;
}
