// SUSSURROS · motor da mesa (roda SÓ no navegador do host).
// Guarda o estado oficial e monta, para cada jogador, uma "visão" com só o que ele pode ver.
// Não depende de DOM nem de rede: dá para testar no Node (testes/protocolo.test.mjs).
import { DADOS } from './dados.js';

export const NIVEIS = [100, 75, 50, 25, 10];
export const BARALHOS_COMPRA = ['evento', 'distorcao', 'laco', 'pacto', 'dica', 'sanidade_100', 'sanidade_75', 'sanidade_50', 'sanidade_25', 'sanidade_10'];
// Baralhos cujo tamanho NÃO é mostrado (revelaria quem comprou Pacto ou quem recebeu carta na Noite).
const BARALHOS_SECRETOS = ['pacto', 'sanidade_10'];
const MAX_JOGADORES = 6;          // jogadores com Hóspede
const MAX_CONEXOES = 10;          // jogadores + espectadores
const LOG_MAX = 300;

export function nivelDe(s) { return s >= 76 ? 100 : s >= 51 ? 75 : s >= 26 ? 50 : s >= 11 ? 25 : 10; }

let _rng = () => {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296; }
  return Math.random();
};
export function definirAleatorio(f) { _rng = f; }
const aleat = (n) => Math.floor(_rng() * n);
export function embaralhar(a) { for (let i = a.length - 1; i > 0; i--) { const j = aleat(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
export function novoId(n = 8) { const c = 'abcdefghijkmnpqrstuvwxyz23456789'; let s = ''; for (let i = 0; i < n; i++) s += c[aleat(c.length)]; return s; }

const M = DADOS.mansao;
export function salaEm(x, y) {
  for (const s of M.salas) if (x >= s.x0 && x <= s.x1 && y >= s.y0 && y <= s.y1) return s.nome;
  return null;
}
const nomeH = (j) => j.hospede != null ? DADOS.hospedes[j.hospede].nome : null;
const quem = (j) => j.hospede != null ? `${j.apelido} (${nomeH(j)})` : j.apelido;

export function novoJogo(codigo, opcoes = {}) {
  return {
    v: 1, codigo, fase: 'lobby', criadoEm: Date.now(), hostId: null, moderador: !!opcoes.moderador,
    jogadores: {}, ordem: [],
    baralhos: {}, descartes: {},
    fichas: {}, palhaco: { x: M.palhacoInicio[0], y: M.palhacoInicio[1] },
    relogio: 1, noite: { ativa: false, seq: 0, inicio: 0 },
    destaque: null, dado: null, seq: 0, discosAbertos: false,
    log: [],
  };
}

function registrar(e, texto, para = null) {
  e.log.push({ n: ++e.seq, t: Date.now(), texto, para });
  if (e.log.length > LOG_MAX) e.log.splice(0, e.log.length - LOG_MAX);
}

export function entrar(e, { apelido, token, ehHost }) {
  apelido = String(apelido || '').trim().slice(0, 20) || 'Voz';
  const existente = Object.values(e.jogadores).find(j => token && j.token === token);
  if (existente) { existente.conectado = true; if (apelido) existente.apelido = apelido; registrar(e, `${existente.apelido} voltou à mesa.`); return { ok: true, id: existente.id }; }
  if (Object.keys(e.jogadores).length >= MAX_CONEXOES) return { ok: false, erro: 'A sala está cheia.' };
  let nome = apelido, k = 2;
  while (Object.values(e.jogadores).some(j => j.apelido.toLowerCase() === nome.toLowerCase())) nome = `${apelido} ${k++}`;
  const id = novoId();
  e.jogadores[id] = {
    id, token: token || novoId(16), apelido: nome, conectado: true, ehHost: !!ehHost,
    hospede: null, pos: null, corrente: false, habilidadeUsada: false,
    sanidade: 80, tomado: false, mao: [], dicasRecebidas: [], dicasDadas: [], frente: [], fichasPegas: [],
    fichasConhecidas: {}, ultimoNivel: null, dadoPrivado: null, logPriv: 0,
  };
  e.ordem.push(id);
  if (ehHost) e.hostId = id;
  registrar(e, `${nome} entrou na mesa.`);
  return { ok: true, id, token: e.jogadores[id].token };
}

export function desconectar(e, id) {
  const j = e.jogadores[id]; if (!j) return;
  j.conectado = false; registrar(e, `${j.apelido} caiu da mesa (pode voltar com o mesmo link).`);
}

function comprarDe(e, b) {
  if (!e.baralhos[b].length && e.descartes[b].length) {
    e.baralhos[b] = embaralhar(e.descartes[b]); e.descartes[b] = [];
    registrar(e, `O descarte de ${DADOS.baralhos[b].rotulo} foi reembaralhado.`);
  }
  return e.baralhos[b].pop() || null;
}
const baralhoDa = (cid) => cid.split('/')[0];

function prepararPartida(e) {
  for (const b of BARALHOS_COMPRA) { e.baralhos[b] = embaralhar([...DADOS.baralhos[b].cartas]); e.descartes[b] = []; }
  const fichas = embaralhar(Object.keys(DADOS.fichas));
  e.fichas = {};
  M.salas.filter(s => s.ficha).forEach((s, i) => { e.fichas[s.nome] = { ficha: fichas[i], estado: 'oculta', dono: null }; });
  e.palhaco = { x: M.palhacoInicio[0], y: M.palhacoInicio[1] };
  e.relogio = 1; e.destaque = null; e.dado = null; e.discosAbertos = false; e.noite = { ativa: false, seq: e.noite.seq, inicio: 0 };
  for (const j of Object.values(e.jogadores)) {
    Object.assign(j, { sanidade: 80, tomado: false, mao: [], dicasRecebidas: [], dicasDadas: [], frente: [], fichasPegas: [], fichasConhecidas: {}, ultimoNivel: null, dadoPrivado: null, corrente: false, habilidadeUsada: false });
    if (j.hospede != null) { j.pos = posInicial(e, j); darDicasIniciais(e, j); }
  }
}
function posInicial(e, j) {
  const k = j.hospede; const [x, y] = M.inicio;
  return { x: x - 150 + (k % 4) * 100, y: y - 260 - Math.floor(k / 4) * 110 };
}
function darDicasIniciais(e, j) { for (let i = 0; i < 3; i++) { const c = comprarDe(e, 'dica'); if (c) j.mao.push(c); } }

const ERR = (erro) => ({ ok: false, erro });

// Aplica uma ação pedida pelo jogador `id`. Muta o estado. Devolve {ok, erro?, dado?}.
export function acao(e, id, a) {
  const j = e.jogadores[id];
  if (!j || !a || typeof a.t !== 'string') return ERR('Ação inválida.');
  const naPartida = e.fase === 'jogo';
  const temH = j.hospede != null;
  const precisa = (cond, msg) => { if (!cond) throw new Error(msg); };
  try {
    switch (a.t) {
      case 'hospede': {
        const h = a.h === null ? null : Number(a.h);
        if (h !== null) {
          precisa(Number.isInteger(h) && h >= 0 && h < DADOS.hospedes.length, 'Hóspede inválido.');
          precisa(!Object.values(e.jogadores).some(o => o.id !== id && o.hospede === h), 'Esse Hóspede já tem dono.');
          precisa(!(e.moderador && id === e.hostId), 'O moderador não joga.');
          if (j.hospede == null) precisa(Object.values(e.jogadores).filter(o => o.hospede != null).length < MAX_JOGADORES, 'Já há 6 Hóspedes na mesa.');
        }
        if (naPartida && j.hospede != null && h !== j.hospede) precisa(false, 'Com a partida em andamento não dá para trocar de Hóspede.');
        const primeira = j.hospede == null && h != null;
        j.hospede = h;
        if (h == null) { j.pos = null; registrar(e, `${j.apelido} agora só assiste.`); break; }
        j.pos = posInicial(e, j);
        registrar(e, `${j.apelido} escolheu ${nomeH(j)}.`);
        if (naPartida && primeira) darDicasIniciais(e, j);
        break;
      }
      case 'iniciar': {
        precisa(id === e.hostId, 'Só quem criou a sala inicia a partida.');
        const n = Object.values(e.jogadores).filter(o => o.hospede != null).length;
        precisa(n >= 1, 'Ninguém escolheu Hóspede ainda.');
        prepararPartida(e); e.fase = 'jogo';
        registrar(e, `A partida começou com ${n} Hóspede${n > 1 ? 's' : ''}. Fichas de Sala e baralhos embaralhados; cada um recebeu 3 Dicas. Relógio no 1.`);
        if (n < 3) registrar(e, 'Aviso: a regra pede de 3 a 6 jogadores.');
        break;
      }
      case 'mover': {
        precisa(naPartida, 'A partida ainda não começou.');
        const x = Math.max(0, Math.min(M.largura, Number(a.x))), y = Math.max(0, Math.min(M.altura, Number(a.y)));
        precisa(Number.isFinite(x) && Number.isFinite(y), 'Posição inválida.');
        let alvo, rot;
        if (a.alvo === 'palhaco') { alvo = e.palhaco; rot = 'o Palhaço'; }
        else { precisa(temH && (a.alvo == null || a.alvo === id), 'Você só move o seu peão.'); alvo = j.pos; rot = null; }
        const antes = salaEm(alvo.x, alvo.y);
        alvo.x = x; alvo.y = y;
        if (a.final) {
          const depois = salaEm(x, y);
          if (depois !== antes && !(a.alvo === 'palhaco' && e.noite.ativa))
            registrar(e, rot ? `${j.apelido} moveu o Palhaço para ${depois || 'fora da planta'}.` : `${quem(j)} foi para ${depois || 'fora da planta'}.`);
          if (a.alvo === 'palhaco' && e.noite.ativa) e.palhacoMovidoNaNoite = true;
        }
        return { ok: true, leve: !a.final };
      }
      case 'comprar': {
        precisa(naPartida && temH, 'Escolha um Hóspede e espere a partida começar.');
        const b = a.baralho; precisa(BARALHOS_COMPRA.includes(b), 'Baralho inválido.');
        const c = comprarDe(e, b); precisa(c, `O baralho de ${DADOS.baralhos[b].rotulo} acabou.`);
        j.mao.push(c);
        if (b === 'pacto') {
          // Pacto é em segredo: nada no log público. O próprio jogador é marcado Tomado.
          j.tomado = true;
          registrar(e, `Você comprou um Pacto em segredo e agora está marcado como TOMADO. Ninguém mais sabe.`, id);
        } else if (b === 'sanidade_10') {
          registrar(e, `Você comprou 1 carta de Sanidade 10% em segredo.`, id);
        } else if (b.startsWith('sanidade_')) {
          j.ultimoNivel = Number(b.split('_')[1]);
          registrar(e, `${quem(j)} comprou 1 carta de Sanidade do nível ${j.ultimoNivel}%.`);
        } else registrar(e, `${quem(j)} comprou 1 carta de ${DADOS.baralhos[b].rotulo}.`);
        return { ok: true, carta: c };
      }
      case 'comprarNivel': {
        precisa(naPartida && temH, 'A partida ainda não começou.');
        const nv = j.tomado ? 25 : nivelDe(j.sanidade);
        if (nv === 10 && !j.tomado) registrar(e, 'Sua sanidade está em 10% ou menos: pela regra, compre um Pacto em segredo (botão Pacto). Esta compra foi do nível 25%, como manda a regra para quem é Tomado.', id);
        return acao(e, id, { t: 'comprar', baralho: `sanidade_${nv === 10 ? 25 : nv}` });
      }
      case 'revelar': {
        const i = j.mao.indexOf(a.carta); precisa(i >= 0, 'Essa carta não está na sua mão.');
        j.mao.splice(i, 1); j.frente.push(a.carta);
        e.destaque = { carta: a.carta, por: id, seq: ++e.seq, motivo: 'revelou' };
        registrar(e, `${quem(j)} revelou: ${DADOS.cartas[a.carta].nome} (${DADOS.baralhos[baralhoDa(a.carta)].rotulo}).`);
        break;
      }
      case 'descartar': {
        const deFrente = a.origem === 'frente';
        const lista = deFrente ? j.frente : j.mao;
        const i = lista.indexOf(a.carta); precisa(i >= 0, 'Essa carta não está com você.');
        lista.splice(i, 1); e.descartes[baralhoDa(a.carta)].push(a.carta);
        if (deFrente) registrar(e, `${quem(j)} descartou ${DADOS.cartas[a.carta].nome} da mesa.`);
        else if (BARALHOS_SECRETOS.includes(baralhoDa(a.carta))) registrar(e, `Você descartou ${DADOS.cartas[a.carta].nome} em segredo.`, id);
        else registrar(e, `${quem(j)} descartou 1 carta de ${DADOS.baralhos[baralhoDa(a.carta)].rotulo} sem mostrar.`);
        break;
      }
      case 'darDica': {
        const i = j.mao.indexOf(a.carta); precisa(i >= 0 && baralhoDa(a.carta) === 'dica', 'Escolha uma Dica da sua mão.');
        const alvo = e.jogadores[a.para]; precisa(alvo && alvo.id !== id && alvo.hospede != null, 'Escolha outro Hóspede.');
        j.mao.splice(i, 1);
        const ref = novoId(6);
        alvo.dicasRecebidas.push({ ref, carta: a.carta, de: id });
        j.dicasDadas.push({ ref, carta: a.carta, para: alvo.id, destino: 'pendente' });
        registrar(e, `${quem(j)} deu 1 Dica virada para baixo a ${quem(alvo)}.`);
        break;
      }
      case 'seguirDica': case 'ignorarDica': {
        const i = j.dicasRecebidas.findIndex(d => d.ref === a.ref); precisa(i >= 0, 'Dica não encontrada.');
        const d = j.dicasRecebidas.splice(i, 1)[0];
        const de = e.jogadores[d.de];
        const dd = de && de.dicasDadas.find(x => x.ref === d.ref);
        e.descartes.dica.push(d.carta);
        if (a.t === 'seguirDica') {
          e.destaque = { carta: d.carta, por: id, seq: ++e.seq, motivo: 'seguiu' };
          if (dd) dd.destino = 'seguida';
          registrar(e, `${quem(j)} SEGUIU a Dica de ${de ? quem(de) : '?'}: "${DADOS.cartas[d.carta].nome}", selo ${DADOS.cartas[d.carta].selo === 'branco' ? 'BRANCO (verdadeira)' : 'PRETO (falsa)'}.`);
        } else {
          if (dd) dd.destino = 'ignorada';
          registrar(e, `${quem(j)} ignorou a Dica de ${de ? quem(de) : '?'} e a descartou sem revelar.`);
        }
        break;
      }
      case 'olharFicha': {
        precisa(naPartida && temH, 'A partida ainda não começou.');
        const f = e.fichas[a.sala]; precisa(f, 'Esse cômodo não tem Ficha.');
        precisa(f.estado === 'oculta', 'Essa Ficha já está virada para cima.');
        const aqui = salaEm(j.pos.x, j.pos.y) === a.sala;
        const medium = DADOS.hospedes[j.hospede].id === 'a_medium' && a.medium;
        precisa(aqui || medium, `Seu peão precisa estar em ${a.sala} para olhar a Ficha.`);
        j.fichasConhecidas[a.sala] = f.ficha;
        registrar(e, medium && !aqui ? `${quem(j)} usou a habilidade da Médium e olhou em segredo a Ficha de ${a.sala}.` : `${quem(j)} olhou em segredo a Ficha de ${a.sala}.`);
        registrar(e, `Ficha de ${a.sala}: ${DADOS.fichas[f.ficha].tipo.toUpperCase()}. Você decide se conta a verdade.`, id);
        return { ok: true, ficha: f.ficha };
      }
      case 'revelarFicha': case 'pegarFicha': {
        const f = e.fichas[a.sala]; precisa(f && f.estado === 'oculta', 'Essa Ficha não está virada para baixo.');
        const aqui = temH && salaEm(j.pos.x, j.pos.y) === a.sala;
        precisa(aqui, `Seu peão precisa estar em ${a.sala}.`);
        const tipo = DADOS.fichas[f.ficha].tipo;
        if (a.t === 'pegarFicha') {
          precisa(tipo === 'Chave', 'Só a Chave vai para a frente do Hóspede. As outras ficam viradas para cima no cômodo.');
          f.estado = 'pega'; f.dono = id; j.fichasPegas.push(f.ficha);
          registrar(e, `${quem(j)} pegou a CHAVE de ${a.sala} e a deixou à vista.`);
        } else {
          f.estado = 'revelada';
          registrar(e, `${quem(j)} deixou a Ficha de ${a.sala} virada para cima: ${tipo.toUpperCase()}.`);
        }
        break;
      }
      case 'passarChave': {
        const k = j.fichasPegas.indexOf(a.ficha); precisa(k >= 0, 'Essa Chave não está com você.');
        const alvo = e.jogadores[a.para]; precisa(alvo && alvo.hospede != null && alvo.id !== id, 'Escolha outro Hóspede.');
        j.fichasPegas.splice(k, 1); alvo.fichasPegas.push(a.ficha);
        const f = Object.values(e.fichas).find(x => x.ficha === a.ficha); if (f) f.dono = alvo.id;
        registrar(e, `${quem(j)} passou uma Chave para ${quem(alvo)}.`);
        break;
      }
      case 'dado': {
        const face = aleat(6) + 1;
        if (a.escondido) {
          j.dadoPrivado = { face, seq: ++e.seq };
          registrar(e, `${quem(j)} rolou o Dado do Olho escondido.`);
          registrar(e, `Seu dado escondido: ${face <= 2 ? 'OLHO ABERTO' : 'olho fechado'} (face ${face}).`, id);
        } else {
          e.dado = { face, por: id, seq: ++e.seq };
          registrar(e, `${quem(j)} rolou o Dado do Olho: ${face <= 2 ? 'OLHO ABERTO' : 'olho fechado'} (face ${face}).`);
        }
        return { ok: true, face };
      }
      case 'sanidade': {
        precisa(temH, 'Escolha um Hóspede.');
        let v = Math.round(Number(a.valor) / 5) * 5; precisa(Number.isFinite(v), 'Valor inválido.');
        j.sanidade = Math.max(0, Math.min(100, v));
        break;   // sem log público
      }
      case 'tomado': {
        precisa(temH, 'Escolha um Hóspede.');
        j.tomado = !!a.valor;
        registrar(e, j.tomado ? 'Você se marcou como TOMADO (só você sabe).' : 'Você desmarcou Tomado. Pela regra, um Tomado nunca volta a ser Lúcido.', id);
        break;
      }
      case 'corrente': {
        const alvo = a.alvo ? e.jogadores[a.alvo] : j; precisa(alvo && alvo.hospede != null, 'Peão inválido.');
        alvo.corrente = !!a.valor;
        registrar(e, alvo.id === id ? `${quem(j)} ${alvo.corrente ? 'pôs a Corrente no peão (preso num Laço)' : 'tirou a Corrente do peão'}.` : `${quem(j)} ${alvo.corrente ? 'pôs a Corrente' : 'tirou a Corrente'} de ${quem(alvo)}.`);
        break;
      }
      case 'habilidade': {
        precisa(temH, 'Escolha um Hóspede.');
        j.habilidadeUsada = !!a.valor;
        registrar(e, j.habilidadeUsada ? `${quem(j)} usou a habilidade (ficha virada: USADA).` : `${quem(j)} desvirou a ficha (habilidade disponível de novo).`);
        break;
      }
      case 'relogio': {
        precisa(naPartida, 'A partida ainda não começou.');
        const nv = Math.max(1, Math.min(13, e.relogio + (Number(a.delta) || 0)));
        if (nv === e.relogio) break;
        e.relogio = nv;
        registrar(e, nv === 13 ? `${j.apelido} passou o Relógio da rodada 12: sem fuga, o Apresentador vence.` : `${j.apelido} ${a.delta > 0 ? 'avançou' : 'voltou'} o Relógio para a rodada ${nv}.`);
        break;
      }
      case 'noite': {
        precisa(naPartida, 'A partida ainda não começou.');
        precisa(!e.noite.ativa, 'Já é noite.');
        e.noite = { ativa: true, seq: e.noite.seq + 1, inicio: Date.now() };
        e.palhacoMovidoNaNoite = false;
        registrar(e, `${j.apelido} chamou a NOITE. Todos fecham os olhos. "Quem me ouve, abra os olhos."`);
        for (const o of Object.values(e.jogadores)) {
          if (o.hospede == null || !o.tomado) continue;
          const c = comprarDe(e, 'sanidade_10');
          if (c) { o.mao.push(c); registrar(e, 'Você ouviu o Apresentador. Recebeu em segredo 1 carta de Sanidade 10% (veja na sua mão). Você pode mover o Palhaço 1 cômodo agora.', o.id); }
          else registrar(e, 'Você ouviu o Apresentador, mas o baralho de Sanidade 10% acabou.', o.id);
        }
        break;
      }
      case 'amanhecer': {
        precisa(e.noite.ativa, 'Não é noite.');
        precisa(Date.now() - e.noite.inicio >= (a.forcar && id === e.hostId ? 0 : 7000), 'Espere um pouco: a noite dura pelo menos 7 segundos.');
        e.noite.ativa = false;
        registrar(e, e.palhacoMovidoNaNoite ? 'Amanheceu. O Palhaço não está onde estava...' : 'Amanheceu. Todos abrem os olhos.');
        break;
      }
      case 'abrirDiscos': {
        precisa(id === e.hostId, 'Só quem criou a sala abre os Discos.');
        e.discosAbertos = true; e.fase = 'fim';
        const res = Object.values(e.jogadores).filter(o => o.hospede != null).map(o => `${quem(o)}: ${o.sanidade}%${o.tomado ? ' · TOMADO' : ''}`).join(' | ');
        registrar(e, `DISCOS ABERTOS. ${res}`);
        break;
      }
      case 'voltarPartida': {
        precisa(id === e.hostId, 'Só o host.');
        precisa(e.fase === 'fim', 'A partida não terminou.');
        e.fase = 'jogo'; e.discosAbertos = false; registrar(e, 'O host fechou os Discos de novo e a partida continua.');
        break;
      }
      case 'novaPartida': {
        precisa(id === e.hostId, 'Só quem criou a sala começa outra partida.');
        e.fase = 'lobby'; e.discosAbertos = false; e.destaque = null; e.dado = null;
        for (const o of Object.values(e.jogadores)) Object.assign(o, { mao: [], dicasRecebidas: [], dicasDadas: [], frente: [], fichasPegas: [], fichasConhecidas: {}, sanidade: 80, tomado: false, ultimoNivel: null, corrente: false, habilidadeUsada: false });
        e.fichas = {}; e.baralhos = {}; e.descartes = {};
        registrar(e, 'Nova partida: escolham os Hóspedes. O host inicia quando todos estiverem prontos.');
        break;
      }
      case 'expulsar': {
        precisa(id === e.hostId && a.alvo !== id, 'Só o host.');
        const o = e.jogadores[a.alvo]; precisa(o, 'Jogador não encontrado.');
        // as cartas voltam para o descarte de cada baralho
        for (const c of [...o.mao, ...o.frente, ...o.dicasRecebidas.map(d => d.carta)]) e.descartes[baralhoDa(c)]?.push(c);
        delete e.jogadores[a.alvo]; e.ordem = e.ordem.filter(x => x !== a.alvo);
        registrar(e, `${o.apelido} foi retirado da mesa pelo host.`);
        return { ok: true, expulso: a.alvo };
      }
      default: return ERR('Ação desconhecida.');
    }
  } catch (err) { return ERR(err.message); }
  return { ok: true };
}

// Monta a visão de UM jogador. Só copia valores (nunca objetos internos) e nunca inclui:
// cartas da mão/dicas recebidas dos outros, Dicas viradas para baixo (nem para quem recebeu),
// sanidade/Tomado dos outros (até Abrir Discos), Fichas de Sala não reveladas (salvo as que ESTE jogador olhou),
// nem o tamanho dos baralhos de Pacto e Sanidade 10%.
export function visao(e, id) {
  const eu = e.jogadores[id];
  const pub = (o) => {
    const v = {
      id: o.id, apelido: o.apelido, conectado: o.conectado, ehHost: o.ehHost, hospede: o.hospede,
      pos: o.pos ? { x: o.pos.x, y: o.pos.y } : null, corrente: o.corrente, habilidadeUsada: o.habilidadeUsada,
      ultimoNivel: o.ultimoNivel, nDicasMao: o.mao.filter(c => c.startsWith('dica/')).length,
      dicasRecebidas: o.dicasRecebidas.map(d => ({ de: d.de })),
      frente: [...o.frente], chaves: o.fichasPegas.length,
    };
    if (e.discosAbertos) v.disco = { sanidade: o.sanidade, tomado: o.tomado };
    return v;
  };
  const fichas = {};
  for (const [sala, f] of Object.entries(e.fichas)) fichas[sala] = f.estado === 'oculta' ? { estado: 'oculta' } : { estado: f.estado, ficha: f.ficha, dono: f.dono };
  const baralhos = {};
  for (const b of Object.keys(e.baralhos)) baralhos[b] = { n: BARALHOS_SECRETOS.includes(b) ? null : e.baralhos[b].length, descarte: BARALHOS_SECRETOS.includes(b) ? null : e.descartes[b].length };
  return {
    codigo: e.codigo, fase: e.fase, moderador: e.moderador, hostId: e.hostId, relogio: e.relogio,
    noite: { ativa: e.noite.ativa, seq: e.noite.seq, desde: e.noite.ativa ? Date.now() - e.noite.inicio : 0, ouvinte: !!(e.noite.ativa && eu && eu.tomado && eu.hospede != null) },
    palhaco: { x: e.palhaco.x, y: e.palhaco.y }, fichas, baralhos,
    destaque: e.destaque ? { ...e.destaque } : null, dado: e.dado ? { ...e.dado } : null, discosAbertos: e.discosAbertos,
    jogadores: e.ordem.filter(k => e.jogadores[k]).map(k => pub(e.jogadores[k])),
    log: e.log.filter(l => l.para === null || l.para === id).slice(-120).map(l => ({ n: l.n, t: l.t, texto: l.texto, privado: l.para !== null })),
    eu: eu ? {
      id: eu.id, apelido: eu.apelido, hospede: eu.hospede, sanidade: eu.sanidade, tomado: eu.tomado, nivel: nivelDe(eu.sanidade),
      mao: [...eu.mao], dicasRecebidas: eu.dicasRecebidas.map(d => ({ ref: d.ref, de: d.de })),
      dicasDadas: eu.dicasDadas.map(d => ({ carta: d.carta, para: d.para, destino: d.destino })),
      fichasConhecidas: { ...eu.fichasConhecidas }, fichasPegas: [...eu.fichasPegas],
      dadoPrivado: eu.dadoPrivado ? { ...eu.dadoPrivado } : null, ehHost: eu.id === e.hostId,
    } : null,
  };
}
