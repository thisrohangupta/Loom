// REST client. Every /api call is scoped to the current workspace (?ws=) and
// carries the share token (&token=) when one is held for it.

let currentWs: string | null = null;

export function setCurrentWs(ws: string | null) {
  currentWs = ws;
}
export function getCurrentWs() {
  return currentWs;
}

// Share tokens kept per workspace in localStorage; an invite link delivers one.
export function getToken(ws: string | null): string | null {
  if (!ws) return null;
  try {
    return JSON.parse(localStorage.getItem("loom.tokens") || "{}")[ws] || null;
  } catch {
    return null;
  }
}
export function setToken(ws: string, t: string | null) {
  let m: Record<string, string> = {};
  try {
    m = JSON.parse(localStorage.getItem("loom.tokens") || "{}");
  } catch {
    /* ignore */
  }
  if (t) m[ws] = t;
  else delete m[ws];
  localStorage.setItem("loom.tokens", JSON.stringify(m));
}

function withWs(path: string): string {
  if (!currentWs || !path.startsWith("/api/") || path.startsWith("/api/workspaces")) return path;
  let p = path + (path.includes("?") ? "&" : "?") + "ws=" + encodeURIComponent(currentWs);
  const tok = getToken(currentWs);
  if (tok) p += "&token=" + encodeURIComponent(tok);
  return p;
}

async function handle(r: Response) {
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.error || r.statusText);
  }
  return r.json();
}

export const api = {
  get: (path: string) => fetch(withWs(path)).then(handle),
  send: (method: string, path: string, body?: unknown) =>
    fetch(withWs(path), {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
    }).then(handle),
  post: (path: string, body?: unknown) => api.send("POST", path, body),
  put: (path: string, body?: unknown) => api.send("PUT", path, body),
  del: (path: string) => api.send("DELETE", path),
};
