type RealtimeOptions = {
  url: string;
  publishableKey: string;
  onInvalidate: () => void;
};

function websocketUrl(base: string, key: string) {
  const url = new URL(base);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash)
    throw new Error("invalid_supabase_url");
  url.protocol = "wss:";
  url.pathname = "/realtime/v1/websocket";
  url.searchParams.set("apikey", key);
  url.searchParams.set("vsn", "1.0.0");
  return url.toString();
}

export function subscribePortalInvalidations({
  url,
  publishableKey,
  onInvalidate,
}: RealtimeOptions): () => void {
  if (!url || !publishableKey) return () => {};

  let closed = false;
  let socket: WebSocket | null = null;
  let heartbeat: number | undefined;
  let reconnect: number | undefined;
  let ref = 0;

  const nextRef = () => String(++ref);
  const clearTimers = () => {
    if (heartbeat !== undefined) window.clearInterval(heartbeat);
    if (reconnect !== undefined) window.clearTimeout(reconnect);
    heartbeat = undefined;
    reconnect = undefined;
  };

  const connect = () => {
    if (closed) return;
    clearTimers();
    try {
      socket = new WebSocket(websocketUrl(url, publishableKey));
    } catch {
      reconnect = window.setTimeout(connect, 5000);
      return;
    }

    socket.addEventListener("open", () => {
      socket?.send(
        JSON.stringify({
          topic: "realtime:public:portal_events",
          event: "phx_join",
          payload: {
            config: {
              broadcast: { ack: false, self: false },
              presence: { key: "" },
              postgres_changes: [
                { event: "INSERT", schema: "public", table: "portal_events" },
              ],
            },
          },
          ref: nextRef(),
        }),
      );
      heartbeat = window.setInterval(() => {
        if (socket?.readyState === WebSocket.OPEN) {
          socket.send(
            JSON.stringify({
              topic: "phoenix",
              event: "heartbeat",
              payload: {},
              ref: nextRef(),
            }),
          );
        }
      }, 25000);
    });

    socket.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(String(event.data));
        if (
          message?.event === "postgres_changes" &&
          message?.topic === "realtime:public:portal_events"
        ) {
          onInvalidate();
        }
      } catch {
        // Ignore malformed or unrelated realtime frames.
      }
    });

    socket.addEventListener("close", () => {
      if (heartbeat !== undefined) window.clearInterval(heartbeat);
      heartbeat = undefined;
      if (!closed) reconnect = window.setTimeout(connect, 3000);
    });

    socket.addEventListener("error", () => socket?.close());
  };

  connect();
  return () => {
    closed = true;
    clearTimers();
    socket?.close();
  };
}
