import React from "react";
import { createRoot } from "react-dom/client";
import { LanguageProvider } from "./i18n";
import { App } from "./App";
import { consumeToken } from "./api/token";
import "./styles.css";
const token = consumeToken(new URL(window.location.href), (path) =>
  window.history.replaceState(null, "", path),
);
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <LanguageProvider><App token={token} /></LanguageProvider>
  </React.StrictMode>,
);
