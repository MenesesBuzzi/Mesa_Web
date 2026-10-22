// Utilidades pequenas da interface.
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
let _t;
export function aviso(txt, tipo = '') {
  const el = $('#aviso'); el.textContent = txt; el.className = 'aviso visivel ' + tipo;
  clearTimeout(_t); _t = setTimeout(() => { el.className = 'aviso'; }, tipo === 'erro' ? 4500 : 2800);
}
export async function copiar(txt) {
  try { await navigator.clipboard.writeText(txt); return true; }
  catch (_) { const t = document.createElement('textarea'); t.value = txt; document.body.appendChild(t); t.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (_) {} t.remove(); return ok; }
}
export function hora(t) { const d = new Date(t); return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
