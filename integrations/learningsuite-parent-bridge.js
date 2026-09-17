/* Install in LearningSuite tenant Custom Code, alongside the existing Welcome Form bridge. */
(() => {
  window.__schulzePortalBridgeCleanup?.();
  let app;
  try {
    app = new URL('https://schulze-client-portal-production.up.railway.app/');
    if (app.protocol !== 'https:' || app.username || app.password || app.search || app.hash) return;
  } catch { return; }
  let installed = true;
  const approved = (source) => Array.from(document.querySelectorAll('iframe')).find((frame) =>
    frame.contentWindow === source && frame.src === app.href && frame.isConnected);
  const receive = async (event) => {
    if (!installed || event.origin !== app.origin || !event.source || !approved(event.source)) return;
    const data = event.data;
    if (!data || data.type !== 'LS_GET_TOKEN' || data.version !== 1 ||
        typeof data.requestId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(data.requestId)) return;
    const source = event.source;

    const reply = (payload) => {
      if (installed && approved(source)) source.postMessage({ version: 1, requestId: data.requestId, ...payload }, app.origin);
    };
    try {
      // Never share a token acquisition between request IDs: the account may change.
      let timer;
      const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Unavailable')), 8000); });
      let token;
      try { token = await Promise.race([Promise.resolve().then(() => window.authManager?.getAccessToken()), timeout]); }
      finally { clearTimeout(timer); }
      if (typeof token !== 'string' || !token || token.length > 16384 || /\s/.test(token)) throw new Error('Unavailable');
      reply({ type: 'LS_TOKEN', token });
    } catch {
      reply({ type: 'LS_TOKEN_ERROR' });
    }
  };
  window.addEventListener('message', receive);
  window.__schulzePortalBridgeCleanup = () => {
    installed = false;
    window.removeEventListener('message', receive);
  };
})();

