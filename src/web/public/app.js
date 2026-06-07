// Loom web UI — vanilla JS, no build step.

const main = document.getElementById("main");
const activityEl = document.getElementById("activity");

const api = {
  async get(path) {
    const r = await fetch(path);
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
    return r.json();
  },
  async send(method, path, body) {
    const r = await fetch(path, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
    return r.json();
  },
  put: (p, b) => api.send("PUT", p, b),
  post: (p, b) => api.send("POST", p, b),
};

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k === "html") e.innerHTML = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v != null) e.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid == null) continue;
    e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return e;
}

function toast(msg) {
  const t = el("div", { class: "toast" }, msg);
  document.body.append(t);
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => t.remove(), 300);
  }, 2200);
}

// ---- minimal markdown -> html (display only) ----
function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function markdown(md) {
  const lines = (md || "").replace(/\r\n/g, "\n").split("\n");
  let out = "", inCode = false, code = [], list = null, para = [];
  const inline = (t) => {
    let s = escapeHtml(t);
    s = s.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, l, h) => `<a href="${escapeHtml(h)}" target="_blank">${l}</a>`);
    return s;
  };
  const flushP = () => { if (para.length) { out += `<p>${inline(para.join(" "))}</p>`; para = []; } };
  const closeL = () => { if (list) { out += `</${list}>`; list = null; } };
  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      if (inCode) { out += `<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`; code = []; inCode = false; }
      else { flushP(); closeL(); inCode = true; }
      continue;
    }
    if (inCode) { code.push(line); continue; }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) { flushP(); closeL(); out += `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`; continue; }
    if (/^\s*[-*]\s+/.test(line)) { flushP(); if (list !== "ul") { closeL(); list = "ul"; out += "<ul>"; } out += `<li>${inline(line.replace(/^\s*[-*]\s+/, ""))}</li>`; continue; }
    if (/^\s*\d+\.\s+/.test(line)) { flushP(); if (list !== "ol") { closeL(); list = "ol"; out += "<ol>"; } out += `<li>${inline(line.replace(/^\s*\d+\.\s+/, ""))}</li>`; continue; }
    if (/^\s*>\s?/.test(line)) { flushP(); closeL(); out += `<blockquote>${inline(line.replace(/^\s*>\s?/, ""))}</blockquote>`; continue; }
    if (line.trim() === "") { flushP(); closeL(); continue; }
    para.push(line.trim());
  }
  if (inCode) out += `<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`;
  flushP(); closeL();
  return out;
}

// ---- websocket live updates ----
let logSink = null; // function(text, cls) when a build log is on screen
function connectWS() {
  const dot = document.getElementById("conn-dot");
  const label = document.getElementById("conn-label");
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen = () => { dot.className = "dot on"; label.textContent = "live"; };
  ws.onclose = () => {
    dot.className = "dot off"; label.textContent = "reconnecting…";
    setTimeout(connectWS, 1500);
  };
  ws.onmessage = (ev) => handleEvent(JSON.parse(ev.data));
}

function pushActivity(text) {
  const li = el("li", { html: text });
  activityEl.prepend(li);
  while (activityEl.children.length > 60) activityEl.lastChild.remove();
}

function handleEvent(e) {
  switch (e.type) {
    case "hello": return;
    case "build.start":
      logSink?.(`build ${e.data.workflowId} → ${e.data.steps.join(" → ")}\n`, "dim");
      pushActivity(`build <b>${e.data.workflowId}</b> started`);
      break;
    case "step.start":
      logSink?.(`● ${e.data.stepId} (${e.data.type}) …\n`, "dim");
      break;
    case "step.delta":
      logSink?.(e.data.text, "");
      break;
    case "step.cached":
      logSink?.(`◌ ${e.data.stepId} cached\n`, "dim");
      break;
    case "step.done": {
      const u = e.data.usage || {};
      const cost = u.costUsd != null ? ` ~$${u.costUsd.toFixed(4)}` : "";
      logSink?.(`\n✓ ${e.data.stepId} (${e.data.bytes}B ${e.data.durationMs}ms${cost})\n`, "ok");
      break;
    }
    case "step.error":
      logSink?.(`\n✗ ${e.data.stepId}: ${e.data.error}\n`, "err");
      pushActivity(`<b>${e.data.stepId}</b> failed`);
      break;
    case "build.done":
      logSink?.(e.data.ok ? `\nbuild complete\n` : `\nbuild failed at ${e.data.failedAt}\n`, e.data.ok ? "ok" : "err");
      pushActivity(`build <b>${e.data.workflowId}</b> ${e.data.ok ? "done" : "failed"}`);
      if (view === "workflows") refreshStatuses();
      break;
    case "file.changed":
      pushActivity(`edited <b>${e.data.path}</b>`);
      toast(`Updated ${e.data.path}`);
      break;
    case "snapshot":
      pushActivity(`snapshot <b>${e.data.hash || ""}</b>`);
      break;
    case "export":
      pushActivity(`exported <b>${e.data.workflowId}</b>`);
      break;
  }
}

// ---- views ----
let view = "workflows";
let workspace = null;

document.querySelectorAll(".nav").forEach((btn) =>
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    view = btn.dataset.view;
    logSink = null;
    render();
  }),
);

async function boot() {
  workspace = await api.get("/api/workspace");
  document.getElementById("ws-name").textContent = workspace.name;
  document.getElementById("ws-desc").textContent = workspace.description || "";
  const events = await api.get("/api/events?limit=20").catch(() => ({ events: [] }));
  events.events.reverse().forEach((e) => handleEvent(e));
  connectWS();
  render();
}

async function render() {
  workspace = await api.get("/api/workspace");
  if (view === "workflows") return renderWorkflows();
  if (view === "inputs") return renderInputs();
  if (view === "prompts") return renderPrompts();
  if (view === "artifacts") return renderArtifacts();
  if (view === "snapshots") return renderSnapshots();
}

function statusBadge(s) {
  const cls = s.fresh ? "fresh" : s.hasArtifact ? "stale" : "unbuilt";
  const label = s.fresh ? "fresh" : s.hasArtifact ? "stale" : "unbuilt";
  return el("span", { class: `state ${cls}` }, label);
}

const statusMaps = {};
async function refreshStatuses() {
  for (const wf of workspace.workflows) {
    try {
      const { status } = await api.get(`/api/status?workflow=${encodeURIComponent(wf.id)}`);
      statusMaps[wf.id] = Object.fromEntries(status.map((s) => [s.stepId, s]));
    } catch { /* ignore */ }
  }
  document.querySelectorAll("[data-statefor]").forEach((node) => {
    const [wfId, stepId] = node.dataset.statefor.split("::");
    const s = statusMaps[wfId]?.[stepId];
    if (s) node.replaceChildren(statusBadge(s));
  });
}

async function renderWorkflows() {
  main.replaceChildren(el("h1", { class: "page" }, "Workflows"));
  for (const wf of workspace.workflows) {
    const logEl = el("div", { class: "log", style: "display:none" });
    const setLog = () => {
      logSink = (t, cls) => {
        logEl.style.display = "block";
        const span = el("span", cls ? { class: cls } : {}, t);
        logEl.append(span);
        logEl.scrollTop = logEl.scrollHeight;
      };
    };

    const outputBox = el("div", { class: "output", style: "display:none" });

    const stepRows = wf.steps.map((step) => {
      const deps = wf.edges.filter((e) => e.to === step.id).map((e) => e.from);
      return el(
        "div", { class: "step" },
        el("span", { class: "pill" }, step.type),
        el("span", { class: "name" }, step.id),
        el("span", { class: "meta" }, `→ ${step.output}`),
        deps.length ? el("span", { class: "deps" }, `← ${deps.join(", ")}`) : null,
        el("span", { class: "spacer" }),
        el("span", { "data-statefor": `${wf.id}::${step.id}` }, "…"),
        el("button", {
          class: "btn ghost small",
          onclick: async () => {
            try {
              const { content } = await api.get(`/api/step-output?workflow=${wf.id}&step=${step.id}`);
              outputBox.style.display = "block";
              outputBox.innerHTML = markdown(content);
            } catch (err) { toast(err.message); }
          },
        }, "view"),
      );
    });

    const buildBtn = el("button", { class: "btn small" }, "Build");
    buildBtn.onclick = async () => {
      setLog();
      logEl.textContent = "";
      buildBtn.disabled = true;
      try { await api.post("/api/build", { workflow: wf.id }); }
      catch (err) { toast(err.message); }
      finally { buildBtn.disabled = false; }
    };
    const forceBtn = el("button", { class: "btn ghost small" }, "Rebuild");
    forceBtn.onclick = async () => {
      setLog(); logEl.textContent = ""; forceBtn.disabled = true;
      try { await api.post("/api/build", { workflow: wf.id, force: true }); }
      catch (err) { toast(err.message); }
      finally { forceBtn.disabled = false; }
    };
    const exportBtn = el("button", { class: "btn ghost small" }, "Export");
    exportBtn.onclick = async () => {
      try { const { url } = await api.post("/api/export", { workflow: wf.id }); window.open(url, "_blank"); }
      catch (err) { toast(err.message); }
    };

    main.append(
      el("div", { class: "card" },
        el("div", { class: "row" },
          el("h2", {}, wf.id),
          el("span", { class: "spacer" }),
          buildBtn, forceBtn, exportBtn,
        ),
        wf.description ? el("p", { class: "muted" }, wf.description) : null,
        el("div", {}, ...stepRows),
        logEl,
        outputBox,
      ),
    );
  }
  refreshStatuses();
}

async function renderFileEditor(title, files, opts = {}) {
  main.replaceChildren(el("h1", { class: "page" }, title));
  const editorCard = el("div", { class: "card", style: "display:none" });
  const listCard = el("div", { class: "card" });
  const list = el("ul", { class: "list" });

  let currentPath = null;
  const textarea = el("textarea", { class: "editor" });
  const saveBtn = el("button", { class: "btn small" }, "Save");
  const fileLabel = el("strong", {}, "");
  saveBtn.onclick = async () => {
    if (!currentPath) return;
    try { await api.put("/api/file", { path: currentPath, content: textarea.value }); toast("Saved"); }
    catch (err) { toast(err.message); }
  };
  editorCard.append(
    el("div", { class: "row" }, fileLabel, el("span", { class: "spacer" }), saveBtn),
    textarea,
  );

  const openFile = async (relPath) => {
    const { content } = await api.get(`/api/file?path=${encodeURIComponent(relPath)}`);
    currentPath = relPath;
    fileLabel.textContent = relPath;
    textarea.value = content;
    editorCard.style.display = "block";
  };

  if (!files.length) list.append(el("li", { class: "empty" }, "Nothing here yet."));
  for (const f of files) {
    const path = opts.toPath ? opts.toPath(f) : f;
    list.append(el("li", { onclick: () => openFile(path) }, el("span", { class: "fname" }, opts.label ? opts.label(f) : f)));
  }
  listCard.append(list);
  main.append(listCard, editorCard);
}

async function renderInputs() {
  const { files } = await api.get("/api/inputs");
  await renderFileEditor("Inputs", files);
}

async function renderPrompts() {
  const { prompts } = await api.get("/api/prompts");
  const promptsDir = "prompts";
  await renderFileEditor("Prompts", prompts, {
    label: (p) => p.name,
    toPath: (p) => `${promptsDir}/${p.name}`,
  });
}

async function renderArtifacts() {
  const { artifacts } = await api.get("/api/artifacts");
  main.replaceChildren(el("h1", { class: "page" }, "Artifacts"));
  if (!artifacts.length) { main.append(el("p", { class: "empty" }, "No artifacts yet — build a workflow.")); return; }
  const detail = el("div", { class: "card", style: "display:none" });
  for (const a of artifacts) {
    const u = a.usage || {};
    main.append(
      el("div", { class: "card", onclick: async () => {
        const { content } = await api.get(`/api/artifact?key=${a.key}`);
        detail.style.display = "block";
        detail.innerHTML = "";
        detail.append(
          el("div", { class: "row" }, el("h2", {}, `${a.workflowId} / ${a.stepId}`), el("span", { class: "spacer" }), el("span", { class: "hash" }, a.key.slice(0, 12))),
          el("div", { class: "output", html: markdown(content) }),
        );
        detail.scrollIntoView({ behavior: "smooth", block: "nearest" });
      } },
        el("div", { class: "row" },
          el("strong", {}, `${a.workflowId} / ${a.stepId}`),
          el("span", { class: "pill" }, a.stepType),
          el("span", { class: "spacer" }),
          el("span", { class: "muted" }, new Date(a.createdAt).toLocaleString()),
        ),
        el("div", { class: "kv" },
          el("dt", {}, "model"), el("dd", {}, a.model || "—"),
          el("dt", {}, "size"), el("dd", {}, `${a.contentBytes} B`),
          el("dt", {}, "tokens"), el("dd", {}, `${u.inputTokens ?? "?"} in / ${u.outputTokens ?? "?"} out${u.costUsd != null ? ` · ~$${u.costUsd.toFixed(4)}` : ""}`),
        ),
      ),
    );
  }
  main.append(detail);
}

async function renderSnapshots() {
  const { snapshots } = await api.get("/api/snapshots");
  main.replaceChildren(el("h1", { class: "page" }, "Snapshots"));
  const msg = el("input", { class: "text", placeholder: "Snapshot message…", style: "flex:1" });
  const btn = el("button", { class: "btn" }, "Snapshot");
  btn.onclick = async () => {
    try {
      const res = await api.post("/api/snapshot", { message: msg.value });
      if (res.ok) { toast(`Snapshot ${res.hash}`); msg.value = ""; renderSnapshots(); }
      else toast(res.reason || "Nothing to snapshot");
    } catch (err) { toast(err.message); }
  };
  main.append(el("div", { class: "card" }, el("div", { class: "row" }, msg, btn)));

  const card = el("div", { class: "card" });
  if (!snapshots.length) card.append(el("p", { class: "empty" }, "No snapshots yet."));
  const ul = el("ul", { class: "list" });
  for (const s of snapshots) {
    ul.append(el("li", {},
      el("span", { class: "hash" }, s.hash),
      el("span", {}, s.subject),
      el("span", { class: "spacer" }),
      el("span", { class: "muted" }, new Date(s.date).toLocaleString()),
    ));
  }
  card.append(ul);
  main.append(card);
}

boot().catch((err) => {
  main.replaceChildren(el("div", { class: "card" },
    el("h2", {}, "No workspace"),
    el("p", { class: "muted" }, String(err.message || err)),
    el("p", {}, "Run ", el("code", {}, "loom init"), " in a directory, then ", el("code", {}, "loom serve"), "."),
  ));
});
