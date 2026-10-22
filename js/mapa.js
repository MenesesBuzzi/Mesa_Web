// SUSSURROS · planta com zoom/arrasto, peões e Fichas de Sala.
import { DADOS } from './dados.js';
import { esc } from './util.js';

const M = DADOS.mansao;
const PEAO = 150;        // diâmetro do peão em px da planta (1 casa ≈ 233 px)

export class Mapa {
  constructor(el, mundo, cb) {
    this.el = el; this.mundo = mundo; this.cb = cb;
    this.s = 0.2; this.tx = 0; this.ty = 0;
    this.ponteiros = new Map(); this.arrasto = null; this.pinca = null;
    this.peoes = new Map(); this.fichas = new Map();
    this.camPeoes = mundo.querySelector('#camada-peoes');
    this.camFichas = mundo.querySelector('#camada-fichas');
    const img = mundo.querySelector('#planta');
    img.src = M.img; img.width = M.largura; img.height = M.altura;
    mundo.style.width = M.largura + 'px'; mundo.style.height = M.altura + 'px';
    el.addEventListener('pointerdown', (e) => this._down(e));
    el.addEventListener('pointermove', (e) => this._move(e));
    el.addEventListener('pointerup', (e) => this._up(e));
    el.addEventListener('pointercancel', (e) => this._up(e, true));
    el.addEventListener('wheel', (e) => { e.preventDefault(); const r = el.getBoundingClientRect(); this.zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
    new ResizeObserver(() => { if (!this._ajustado) { this.ajustar(); } else this._limitar(); }).observe(el);
    this._criarFichas();
  }
  aplicar() { this.mundo.style.transform = `translate(${this.tx}px, ${this.ty}px) scale(${this.s})`; }
  ajustar() {
    const r = this.el.getBoundingClientRect(); if (!r.width || !r.height) return;
    this.s = Math.min(r.width / M.largura, r.height / M.altura) * 0.98;
    this.tx = (r.width - M.largura * this.s) / 2; this.ty = (r.height - M.altura * this.s) / 2;
    this._ajustado = true; this.aplicar();
  }
  focar(x, y, s) {
    const r = this.el.getBoundingClientRect(); this.s = s || Math.max(this.s, 0.45);
    this.tx = r.width / 2 - x * this.s; this.ty = r.height / 2 - y * this.s; this._limitar(); this.aplicar();
  }
  zoom(f, cx, cy) {
    const r = this.el.getBoundingClientRect();
    if (cx == null) { cx = r.width / 2; cy = r.height / 2; }
    const min = Math.min(r.width / M.largura, r.height / M.altura) * 0.6, max = 2.5;
    const ns = Math.max(min, Math.min(max, this.s * f)); const k = ns / this.s;
    this.tx = cx - (cx - this.tx) * k; this.ty = cy - (cy - this.ty) * k; this.s = ns; this._limitar(); this.aplicar();
  }
  _limitar() {
    const r = this.el.getBoundingClientRect(); const w = M.largura * this.s, h = M.altura * this.s; const m = 80;
    this.tx = w < r.width ? Math.max(Math.min(this.tx, r.width - w), 0) : Math.min(m, Math.max(r.width - w - m, this.tx));
    this.ty = h < r.height ? Math.max(Math.min(this.ty, r.height - h), 0) : Math.min(m, Math.max(r.height - h - m, this.ty));
  }
  paraMundo(cx, cy) { const r = this.el.getBoundingClientRect(); return { x: (cx - r.left - this.tx) / this.s, y: (cy - r.top - this.ty) / this.s }; }

  _down(e) {
    if (e.target.closest('.zoom, .lobby, .sala-atual')) return;
    this.el.setPointerCapture?.(e.pointerId);
    this.ponteiros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.ponteiros.size === 2) {
      const [a, b] = [...this.ponteiros.values()];
      this.pinca = { d: Math.hypot(a.x - b.x, a.y - b.y), s: this.s }; this.arrasto = null; return;
    }
    const peao = e.target.closest('.peao'); const ficha = e.target.closest('.ficha');
    if (peao) {
      const alvo = peao.dataset.alvo; const p = this.paraMundo(e.clientX, e.clientY);
      const pos = this.peoes.get(alvo)?.pos || { x: 0, y: 0 };
      this.arrasto = { tipo: peao.classList.contains('arrastavel') ? 'peao' : 'toque', alvo, el: peao, ox: p.x - pos.x, oy: p.y - pos.y, x0: e.clientX, y0: e.clientY, movido: false, ultimoEnvio: 0 };
    } else if (ficha) {
      this.arrasto = { tipo: 'ficha', sala: ficha.dataset.sala, x0: e.clientX, y0: e.clientY, tx: this.tx, ty: this.ty, movido: false };
    } else this.arrasto = { tipo: 'pan', x0: e.clientX, y0: e.clientY, tx: this.tx, ty: this.ty, movido: false };
  }
  _move(e) {
    if (!this.ponteiros.has(e.pointerId)) return;
    this.ponteiros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pinca && this.ponteiros.size === 2) {
      const [a, b] = [...this.ponteiros.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
      const r = this.el.getBoundingClientRect(); const cx = (a.x + b.x) / 2 - r.left, cy = (a.y + b.y) / 2 - r.top;
      this.zoom((this.pinca.s * d / this.pinca.d) / this.s, cx, cy); return;
    }
    const a = this.arrasto; if (!a) return;
    const dx = e.clientX - a.x0, dy = e.clientY - a.y0;
    if (!a.movido && Math.hypot(dx, dy) > 6) a.movido = true;
    if (!a.movido) return;
    if (a.tipo === 'peao') {
      const p = this.paraMundo(e.clientX, e.clientY);
      const x = Math.max(0, Math.min(M.largura, p.x - a.ox)), y = Math.max(0, Math.min(M.altura, p.y - a.oy));
      this._posicionar(a.alvo, x, y); a.el.classList.add('arrastando');
      const agora = performance.now();
      if (agora - a.ultimoEnvio > 90) { a.ultimoEnvio = agora; this.cb.aoSoltarPeao(a.alvo, x, y, false); }
    } else if (a.tipo === 'pan' || a.tipo === 'ficha' || a.tipo === 'toque') {
      if (a.tx == null) { a.tx = this.tx; a.ty = this.ty; a.x0 = e.clientX; a.y0 = e.clientY; return; }
      this.tx = a.tx + dx; this.ty = a.ty + dy; this._limitar(); this.aplicar();
    }
  }
  _up(e, cancel) {
    this.ponteiros.delete(e.pointerId);
    if (this.ponteiros.size < 2) this.pinca = null;
    const a = this.arrasto; this.arrasto = null; if (!a || cancel) { if (a?.el) a.el.classList.remove('arrastando'); return; }
    if (a.tipo === 'peao' && a.movido) {
      a.el.classList.remove('arrastando'); const pos = this.peoes.get(a.alvo).pos;
      this.cb.aoSoltarPeao(a.alvo, pos.x, pos.y, true);
    } else if ((a.tipo === 'peao' || a.tipo === 'toque') && !a.movido) this.cb.aoTocarPeao(a.alvo);
    else if (a.tipo === 'ficha' && !a.movido) this.cb.aoTocarFicha(a.sala);
  }

  _criarFichas() {
    for (const s of M.salas) {
      if (!s.ficha) continue;
      const d = document.createElement('button');
      d.className = 'ficha'; d.dataset.sala = s.nome; d.setAttribute('aria-label', `Ficha de ${s.nome}`);
      const tam = M.raioFicha * 2;
      Object.assign(d.style, { left: (s.ficha[0] - M.raioFicha) + 'px', top: (s.ficha[1] - M.raioFicha) + 'px', width: tam + 'px', height: tam + 'px' });
      d.innerHTML = `<img alt="" draggable="false"><span class="ficha-selo"></span>`;
      this.camFichas.appendChild(d); this.fichas.set(s.nome, d);
    }
  }
  _posicionar(alvo, x, y) {
    const p = this.peoes.get(alvo); if (!p) return;
    p.pos = { x, y }; p.el.style.transform = `translate(${x - PEAO / 2}px, ${y - PEAO / 2}px)`;
  }
  moverRemoto(alvo, x, y) {
    if (this.arrasto && this.arrasto.alvo === alvo && this.arrasto.movido) return;
    this._posicionar(alvo, x, y);
  }

  atualizar(v) {
    const meu = v.eu?.id; const vistos = new Set();
    const fichasDisp = v.fase !== 'lobby';
    for (const [sala, el] of this.fichas) {
      const f = v.fichas[sala]; el.hidden = !fichasDisp || !f || f.estado === 'pega';
      if (!f) continue;
      const img = el.querySelector('img'); const selo = el.querySelector('.ficha-selo');
      const src = f.estado === 'revelada' ? DADOS.fichas[f.ficha].img : DADOS.versoFicha;
      if (img.getAttribute('src') !== src) img.src = src;
      const conhecida = f.estado === 'oculta' && v.eu?.fichasConhecidas?.[sala];
      selo.textContent = conhecida ? 'você viu: ' + DADOS.fichas[conhecida].tipo : '';
      selo.hidden = !conhecida; el.classList.toggle('revelada', f.estado === 'revelada');
    }
    const lista = v.jogadores.filter(j => j.hospede != null && j.pos).map(j => ({ alvo: j.id, img: DADOS.hospedes[j.hospede].peao, nome: j.apelido, corrente: j.corrente, meu: j.id === meu, pos: j.pos, desconectado: !j.conectado }));
    if (v.fase !== 'lobby') lista.push({ alvo: 'palhaco', img: DADOS.palhaco.peao, nome: 'Palhaço', corrente: false, meu: false, palhaco: true, pos: v.palhaco });
    for (const p of lista) {
      vistos.add(p.alvo);
      let reg = this.peoes.get(p.alvo);
      if (!reg) {
        const el = document.createElement('div'); el.className = 'peao'; el.dataset.alvo = p.alvo;
        el.style.width = el.style.height = PEAO + 'px';
        el.innerHTML = `<img class="peao-img" alt="" draggable="false"><img class="peao-corrente" alt="" draggable="false" src="${DADOS.corrente}"><span class="peao-nome"></span>`;
        this.camPeoes.appendChild(el); reg = { el, pos: null }; this.peoes.set(p.alvo, reg);
      }
      const el = reg.el;
      const im = el.querySelector('.peao-img'); if (im.getAttribute('src') !== p.img) im.src = p.img;
      el.querySelector('.peao-nome').textContent = p.nome;
      el.querySelector('.peao-corrente').hidden = !p.corrente;
      el.classList.toggle('meu', p.meu); el.classList.toggle('palhaco', !!p.palhaco);
      el.classList.toggle('arrastavel', p.meu || !!p.palhaco); el.classList.toggle('fora', !!p.desconectado);
      this.moverRemoto(p.alvo, p.pos.x, p.pos.y);
    }
    for (const [k, reg] of this.peoes) if (!vistos.has(k)) { reg.el.remove(); this.peoes.delete(k); }
  }
}
export { esc };
