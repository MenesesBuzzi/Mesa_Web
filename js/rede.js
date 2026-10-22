// SUSSURROS · rede peer-to-peer (PeerJS + servidor público de sinalização 0.peerjs.com).
// O host abre um Peer com ID fixo "sussurros-mesa-<CÓDIGO>"; os convidados se conectam a ele.
// Depois da sinalização, os dados vão direto de navegador para navegador (WebRTC DataChannel).
import { CONFIG } from './config.js';

const PREFIXO = 'sussurros-mesa-';
const LETRAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function gerarCodigo() { let s = ''; const a = new Uint32Array(5); crypto.getRandomValues(a); for (const n of a) s += LETRAS[n % LETRAS.length]; return s; }
export function normalizarCodigo(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5); }

function opcoesPeer() {
  const o = { debug: CONFIG.debugPeer ? 2 : 0, config: { iceServers: CONFIG.iceServers } };
  if (CONFIG.servidorPeer) Object.assign(o, CONFIG.servidorPeer);
  return o;
}

// ---------- HOST ----------
export class HostRede {
  constructor({ aoMensagem, aoFechar }) { this.aoMensagem = aoMensagem; this.aoFechar = aoFechar; this.conexoes = new Set(); }
  abrir(codigo) {
    return new Promise((ok, falha) => {
      const peer = new Peer(PREFIXO + codigo, opcoesPeer());
      this.peer = peer; let aberto = false;
      peer.on('open', () => { aberto = true; ok(codigo); });
      peer.on('error', (err) => {
        if (!aberto) { peer.destroy(); falha(err); }
        else console.warn('[host] erro PeerJS', err.type, err);
      });
      peer.on('disconnected', () => { if (!peer.destroyed) setTimeout(() => { try { peer.reconnect(); } catch (_) {} }, 1500); });
      peer.on('connection', (conn) => {
        conn.on('open', () => this.conexoes.add(conn));
        conn.on('data', (d) => { try { this.aoMensagem(conn, typeof d === 'string' ? JSON.parse(d) : d); } catch (e) { console.warn('[host] mensagem ruim', e); } });
        const fim = () => { if (this.conexoes.delete(conn)) this.aoFechar(conn); };
        conn.on('close', fim); conn.on('error', fim);
      });
    });
  }
  enviar(conn, msg) { if (conn && conn.open) conn.send(msg); }
  fechar() { try { this.peer?.destroy(); } catch (_) {} }
}

// ---------- CONVIDADO ----------
export class ClienteRede {
  constructor({ aoMensagem, aoEstado }) { this.aoMensagem = aoMensagem; this.aoEstado = aoEstado; this.tentativas = 0; this.encerrado = false; }
  conectar(codigo) {
    this.codigo = codigo;
    return new Promise((ok, falha) => {
      const peer = new Peer(opcoesPeer()); this.peer = peer; let resolvido = false;
      const desiste = (msg) => { if (!resolvido) { resolvido = true; falha(new Error(msg)); } };
      const t = setTimeout(() => desiste('O host não respondeu. Confira o código.'), 20000);
      peer.on('error', (err) => {
        if (err.type === 'peer-unavailable') { clearTimeout(t); desiste('Sala não encontrada. Confira o código (ou o host fechou a aba).'); }
        else if (!resolvido) { clearTimeout(t); desiste('Falha de rede: ' + err.type); }
        else console.warn('[cliente] erro PeerJS', err.type);
      });
      peer.on('open', () => {
        const conn = peer.connect(PREFIXO + codigo, { reliable: true, serialization: 'json' });
        this.conn = conn;
        conn.on('open', () => { clearTimeout(t); resolvido = true; this.tentativas = 0; this.aoEstado('conectado'); ok(); });
        conn.on('data', (d) => this.aoMensagem(d));
        conn.on('close', () => this._caiu());
        conn.on('error', () => this._caiu());
      });
    });
  }
  _caiu() {
    if (this.encerrado || this._reconectando) return;
    this._reconectando = true; this.aoEstado('caiu');
    const tenta = async () => {
      if (this.encerrado) return;
      this.tentativas++;
      try { this.peer?.destroy(); await this.conectar(this.codigo); this._reconectando = false; this.aoEstado('voltou'); }
      catch (e) { if (this.tentativas < 20) setTimeout(tenta, 3000); else { this._reconectando = false; this.aoEstado('perdido'); } }
    };
    setTimeout(tenta, 1500);
  }
  enviar(msg) { if (this.conn && this.conn.open) this.conn.send(msg); }
  fechar() { this.encerrado = true; try { this.peer?.destroy(); } catch (_) {} }
}
