// Minimal markdown -> HTML for display only (ported from the original UI).
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function markdown(md: string): string {
  const lines = (md || "").replace(/\r\n/g, "\n").split("\n");
  let out = "";
  let inCode = false;
  let code: string[] = [];
  let list: string | null = null;
  let para: string[] = [];
  const inline = (t: string) => {
    let s = escapeHtml(t);
    s = s.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, l, h) => `<a href="${escapeHtml(h)}" target="_blank" rel="noreferrer">${l}</a>`);
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

export function initials(name: string): string {
  return (name || "?").trim().slice(0, 2).toUpperCase();
}
