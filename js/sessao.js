// SUSSURROS · sessão: liga o motor (só no host) à rede e à interface.
// Protocolo (JSON):
//   convidado → host: {t:'entrar', apelido, token}  |  {t:'acao', pedido, a:{t:..., ...}}
//   host → convidado: {t:'bemvindo', id, token} | {t:'visao', v} | {t:'pos', alvo, x, y} | {t:'resposta', pedido, ok, erro, ...} | {t:'expulso'}
// A "visão" de cada convidado é montada por motor.visao(estado, idDoConvidado): nela só vai o que ele pode ver.
import * as Motor from './motor.js';
import { HostRede, ClienteRede, gerarCodigo } from './rede.js';

const TESTE = new URLSearchParams(location.search).has('teste');
if (TESTE) window.__sus = { recebidas: [], enviadas: [] };

const chaveToken = (c) => `sussurros-token-${c}`;
const chaveHost = (c) => `sussurros-host-${c}`;
export function salaSalva() {
  try { const c = localStorage.getItem('sussurros-host-ultima'); if (!c) return null; const s = localStorage.getItem(chaveHost(c)); return s ? { codigo: c, estado: JSON.parse(s) } : null; } catch (_) { return null; }
}

// Respostas privadas: só campos que pertencem a quem pediu.
function resposta(r) { const o = { ok: r.ok }; if (r.erro) o.erro = r.erro; if (r.carta) o.carta = r.carta; if (r.ficha) o.ficha = r.ficha; if (r.face) o.face = r.face; return o; }

export class SessaoHost {
  constructor({ apelido, moderador, salvo, aoVisao, aoPos, aoAviso }) {
    Object.assign(this, { apelido, moderador, salvo, aoVisao, aoPos, aoAviso });
    this.ehHost = true; this.conns = new Map(); this._agendado = false;
  }
  async iniciar() {
    this.rede = new HostRede({ aoMensagem: (c, m) => this._msg(c, m), aoFechar: (c) => this._fechou(c) });
    let codigo = this.salvo ? this.salvo.codigo : gerarCodigo();
    for (let i = 0; i < 8; i++) {
      try { await this.rede.abrir(codigo); break; }
      catch (err) {
        if (err.type === 'unavailable-id' && !this.salvo) { codigo = gerarCodigo(); continue; }
        if (err.type === 'unavailable-id' && i < 7) { await new Promise(r => setTimeout(r, 4000)); continue; }
        throw new Error(err.type === 'unavailable-id' ? 'O código antigo ainda está preso no servidor. Tente de novo em 1 minuto.' : 'Não consegui falar com o servidor de sinalização (' + (err.type || err.message) + ').');
      }
    }
    this.codigo = codigo;
    if (this.salvo) { this.e = this.salvo.estado; for (const j of Object.values(this.e.jogadores)) if (!j.ehHost) j.conectado = false; }
    else this.e = Motor.novoJogo(codigo, { moderador: this.moderador });
    let token = localStorage.getItem(chaveToken(codigo));
    const r = Motor.entrar(this.e, { apelido: this.apelido, token, ehHost: true });
    this.meuId = r.id; this.e.hostId = r.id; if (r.token) localStorage.setItem(chaveToken(codigo), r.token);
    localStorage.setItem('sussurros-host-ultima', codigo);
    this._transmitir();
    window.addEventListener('beforeunload', () => this._salvar());
  }
  _msg(conn, m) {
    if (TESTE) window.__sus.recebidas.push(JSON.stringify(m));
    if (m.t === 'entrar') {
      const r = Motor.entrar(this.e, { apelido: m.apelido, token: m.token });
      if (!r.ok) { this.rede.enviar(conn, { t: 'resposta', pedido: 0, ok: false, erro: r.erro }); setTimeout(() => conn.close(), 500); return; }
      for (const [c, id] of this.conns) if (id === r.id && c !== conn) { this.conns.delete(c); try { c.close(); } catch (_) {} }
      this.conns.set(conn, r.id);
      this.rede.enviar(conn, { t: 'bemvindo', id: r.id, token: this.e.jogadores[r.id].token });
      this._agendar(); return;
    }
    const id = this.conns.get(conn); if (!id) return;
    if (m.t === 'acao') this._processar(id, m.a, conn, m.pedido);
  }
  _fechou(conn) { const id = this.conns.get(conn); if (!id) return; this.conns.delete(conn); if ([...this.conns.values()].includes(id)) return; Motor.desconectar(this.e, id); this._agendar(); }
  _processar(id, a, conn, pedido) {
    const r = Motor.acao(this.e, id, a);
    if (conn) this.rede.enviar(conn, { t: 'resposta', pedido, ...resposta(r) });
    if (r.expulso) for (const [c, i] of this.conns) if (i === r.expulso) { this.rede.enviar(c, { t: 'expulso' }); this.conns.delete(c); setTimeout(() => c.close(), 300); }
    if (r.ok && r.leve) {
      const alvo = a.alvo === 'palhaco' ? 'palhaco' : id; const p = alvo === 'palhaco' ? this.e.palhaco : this.e.jogadores[id].pos;
      const msg = { t: 'pos', alvo, x: p.x, y: p.y };
      for (const [c, i] of this.conns) if (i !== id) this.rede.enviar(c, msg);
      if (id !== this.meuId) this.aoPos(msg);
    } else if (r.ok) this._agendar();
    return resposta(r);
  }
  enviar(a) { return Promise.resolve(this._processar(this.meuId, a, null)); }
  _agendar() { if (this._agendado) return; this._agendado = true; setTimeout(() => { this._agendado = false; this._transmitir(); }, 0); }
  _transmitir() {
    for (const [c, id] of this.conns) this.rede.enviar(c, { t: 'visao', v: Motor.visao(this.e, id) });
    this.aoVisao(Motor.visao(this.e, this.meuId));
    clearTimeout(this._ts); this._ts = setTimeout(() => this._salvar(), 400);
  }
  _salvar() { try { localStorage.setItem(chaveHost(this.codigo), JSON.stringify(this.e)); } catch (_) {} }
  linkConvite() { return location.origin + location.pathname + '#' + this.codigo; }
  sair() { this._salvar(); this.rede?.fechar(); }
  apagarSalvo() { localStorage.removeItem(chaveHost(this.codigo)); localStorage.removeItem('sussurros-host-ultima'); }
}

export class SessaoCliente {
  constructor({ codigo, apelido, aoVisao, aoPos, aoAviso, aoConexao, aoExpulso }) {
    Object.assign(this, { codigo, apelido, aoVisao, aoPos, aoAviso, aoConexao, aoExpulso });
    this.ehHost = false; this.pedidos = new Map(); this.n = 0;
  }
  async iniciar() {
    this.rede = new ClienteRede({
      aoMensagem: (m) => this._msg(m),
      aoEstado: (s) => { if (s === 'conectado') this._entrar(); this.aoConexao?.(s); },
    });
    await this.rede.conectar(this.codigo);
    await new Promise((ok, falha) => { this._bemvindo = ok; this._recusado = falha; setTimeout(() => falha(new Error('O host não aceitou a entrada.')), 15000); });
  }
  _entrar() { this.rede.enviar({ t: 'entrar', apelido: this.apelido, token: localStorage.getItem(chaveToken(this.codigo)) }); }
  _msg(m) {
    if (TESTE) window.__sus.recebidas.push(JSON.stringify(m));
    switch (m.t) {
      case 'bemvindo': this.meuId = m.id; localStorage.setItem(chaveToken(this.codigo), m.token); this._bemvindo?.(); this._bemvindo = null; break;
      case 'visao': this.aoVisao(m.v); break;
      case 'pos': this.aoPos(m); break;
      case 'resposta': {
        if (m.pedido === 0 && !m.ok) { this._recusado?.(new Error(m.erro)); return; }
        const p = this.pedidos.get(m.pedido); if (p) { this.pedidos.delete(m.pedido); p(m); }
        break;
      }
      case 'expulso': this.rede.fechar(); this.aoExpulso?.(); break;
    }
  }
  enviar(a) {
    const pedido = ++this.n;
    if (TESTE) window.__sus.enviadas.push(JSON.stringify(a));
    return new Promise((ok) => {
      this.pedidos.set(pedido, ok); this.rede.enviar({ t: 'acao', pedido, a });
      setTimeout(() => { if (this.pedidos.delete(pedido)) ok({ ok: false, erro: 'Sem resposta do host.' }); }, 10000);
    });
  }
  linkConvite() { return location.origin + location.pathname + '#' + this.codigo; }
  sair() { this.rede?.fechar(); }
}
