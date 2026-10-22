// SUSSURROS · motor da mesa (roda SÓ no navegador do host).
// Guarda o estado oficial e monta, para cada jogador, uma "visão" com só o que ele pode ver.
// Não depende de DOM nem de rede: dá para testar no Node (testes/protocolo.test.mjs).
import { DADOS } from './dados.js';
import * as PAL from './palhaco.js';

export const NIVEIS = [100, 75, 50, 25, 10];
export const BARALHOS_COMPRA = ['evento', 'distorcao', 'laco', 'pacto', 'dica', 'sanidade_100', 'sanidade_75', 'sanidade_50', 'sanidade_25', 'sanidade_10'];
// Baralhos cujo tamanho NÃO é mostrado (revelaria quem comprou Pacto ou quem recebeu carta na Noite).
const BARALHOS_SECRETOS = ['pacto', 'sanidade_10'];
const MAX_JOGADORES = 6;          // jogadores com Hóspede
const MAX_CONEXOES = 10;          // jogadores + espectadores
const LOG_MAX = 300;
export const MOEDAS_INICIAIS = 5;

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
    // módulo opcional "Palhaço com IA": movimento automático, moedas/pedágio, falas, clipes, Eventos e propostas
    palhacoAuto: true, pedagio: true, shows: [], showSeq: 0, palhacoProxVideo: 3,
    // turnos: ordem dos jogadores, quem está na vez e o que já fez (só passos públicos)
    turno: null, turnoAleatorio: false,
  };
}

// Completa um estado salvo por uma versão anterior da mesa (antes do Palhaço com IA).
export function normalizar(e) {
  if (e.palhacoAuto === undefined) e.palhacoAuto = true;
  if (e.pedagio === undefined) e.pedagio = true;
  e.shows = e.shows || []; e.showSeq = e.showSeq || 0; e.palhacoProxVideo = e.palhacoProxVideo || (e.relogio + 2);
  for (const j of Object.values(e.jogadores)) { if (j.moedas === undefined) j.moedas = MOEDAS_INICIAIS; j.imuneAte = j.imuneAte || 0; j.fiado = !!j.fiado; j.proposta = j.proposta || null; j.gastos = j.gastos || []; }
  if (e.turnoAleatorio === undefined) e.turnoAleatorio = false;
  if (e.fase !== 'lobby' && !e.turno) iniciarTurnos(e);
  return e;
}

// ===================== TURNOS =====================
// Regra (regras.md, seção 6): na sua vez, Sussurro (opcional, 1 Dica) → Movimento (até 2 Salas, ou descansar +5%)
// → Explorar (Ficha) → Evento (1) → Nível (1 Sanidade) → Reabastecer (Dicas até 3). Quando todos jogarem, o Relógio avança.
// Comprar carta não custa sanidade nem moedas: cada compra é um passo da vez.
export const feitoVazio = () => ({ dica: 0, salas: 0, descanso: false, ficha: 0, evento: 0, nivel: 0, dicas: 0, distorcao: 0, laco: 0 });
export function daVez(e) { const t = e.turno; return t && t.ordem.length ? t.ordem[t.vez] : null; }
function iniciarTurnos(e) {
  const ordem = e.ordem.filter(k => e.jogadores[k] && e.jogadores[k].hospede != null);
  if (e.turnoAleatorio) embaralhar(ordem);
  e.turno = { ordem, vez: 0, rodada: e.relogio, seq: (e.turno?.seq || 0) + 1, feito: feitoVazio() };
}
function tirarDaOrdem(e, id) {
  const t = e.turno; if (!t) return; const i = t.ordem.indexOf(id); if (i < 0) return;
  t.ordem.splice(i, 1);
  if (i < t.vez) t.vez--;
  else if (i === t.vez) { t.feito = feitoVazio(); t.seq++; }
  if (t.vez >= t.ordem.length) t.vez = 0;
}
function resumoFeito(f) {
  const p = [];
  if (f.dica) p.push(`deu ${f.dica} Dica${f.dica > 1 ? 's' : ''}`);
  if (f.descanso) p.push('descansou');
  if (f.salas) p.push(`andou ${f.salas} Sala${f.salas > 1 ? 's' : ''}`);
  if (f.ficha) p.push('olhou Ficha');
  if (f.evento) p.push(`${f.evento} Evento${f.evento > 1 ? 's' : ''}`);
  if (f.nivel) p.push(`${f.nivel} Sanidade`);
  if (f.dicas) p.push(`comprou ${f.dicas} Dica${f.dicas > 1 ? 's' : ''}`);
  if (f.distorcao) p.push(`${f.distorcao} Distorção`);
  if (f.laco) p.push(`${f.laco} Laço`);
  return p.length ? p.join(', ') : 'nada registrado pela mesa';
}
function avancarVez(e) {
  const t = e.turno; t.vez++; t.feito = feitoVazio(); t.seq++;
  if (t.vez >= t.ordem.length) {
    t.vez = 0;
    registrar(e, 'Todos passaram a vez: a rodada acabou e o Relógio avança sozinho.');
    avancarRelogio(e, 'A mesa', 1);
  } else registrar(e, `Vez de ${quem(e.jogadores[daVez(e)])}.`);
}
function avancarRelogio(e, autor, delta) {
  const nv = Math.max(1, Math.min(13, e.relogio + (Number(delta) || 0)));
  if (nv === e.relogio) return;
  e.relogio = nv;
  registrar(e, nv === 13 ? `${autor} passou o Relógio da rodada 12: sem fuga, o Apresentador vence.` : `${autor} ${delta > 0 ? 'avançou' : 'voltou'} o Relógio para a rodada ${nv}.`);
  if (delta > 0) {
    if (nv === 13) { if (e.palhacoAuto) show(e, [{ t: 'fala', cat: 'fim', texto: PAL.fala('fim', _rng) }, { t: 'video', clipe: 'chapeu' }]); }
    else {
      palhacoRodada(e);
      if (e.turno && e.turno.ordem.length) {
        e.turno.vez = 0; e.turno.rodada = nv; e.turno.feito = feitoVazio(); e.turno.seq++;
        registrar(e, `Rodada ${nv}: vez de ${quem(e.jogadores[daVez(e)])}. (Pela regra, agora é a Noite: alguém toque em Noite.)`);
      }
    }
  }
}
// Histórico privado "Seus últimos gastos" (só o dono recebe; nunca entra na visão dos outros).
function gasto(j, txt) { (j.gastos ||= []).push({ t: Date.now(), txt }); if (j.gastos.length > 15) j.gastos.splice(0, j.gastos.length - 15); }
function difTxt(mo, sa) {
  const p = [];
  if (mo) p.push(`${mo > 0 ? '+' : '−'}${Math.abs(mo)} moeda${Math.abs(mo) > 1 ? 's' : ''}`);
  if (sa) p.push(`${sa > 0 ? '+' : '−'}${Math.abs(sa)}% sanidade`);
  return p.join(' · ');
}
// O que a compra "custou" pela regra. Vai só para quem comprou (resposta privada).
function custoCompra(e, j, b, naVez, foraDeQuem) {
  const f = e.turno?.feito || feitoVazio();
  const rot = DADOS.baralhos[b].rotulo;
  const linhas = []; let titulo = 'Grátis pela regra'; let acima = false;
  if (foraDeQuem) { titulo = 'Fora da sua vez'; linhas.push(`É a vez de ${foraDeQuem}. A mesa deixou comprar, mas combinem.`); }
  if (b === 'evento') {
    if (naVez) { if (f.evento === 1) { titulo = 'Grátis nesta vez'; linhas.push('Passo 4 (Evento): 1/1 usado'); } else { acima = true; titulo = 'Acima da regra'; linhas.push(`${f.evento}º Evento nesta vez (a regra pede 1 por turno)`); } }
    linhas.push('Leia em voz alta e descarte.');
  } else if (b.startsWith('sanidade_') && b !== 'sanidade_10') {
    if (naVez) { if (f.nivel === 1) { titulo = '1ª compra da vez'; linhas.push('Passo 5 (Nível): 1/1 usado'); } else { acima = true; titulo = 'Acima da regra'; linhas.push(`${f.nivel}ª Sanidade nesta vez (a regra pede 1)`); } }
    const meu = j.tomado ? 25 : Math.max(25, nivelDe(j.sanidade));
    if (Number(b.split('_')[1]) !== meu) linhas.push(`Atenção: pelo seu Disco, o baralho certo é o de ${meu}%.`);
    linhas.push('Comprar não muda o Disco: role o Dado e aplique a alternativa.');
  } else if (b === 'dica') {
    const k = j.mao.filter(c => c.startsWith('dica/')).length;
    if (naVez) titulo = k <= 3 ? 'Grátis nesta vez' : 'Acima da regra';
    if (k > 3) acima = true;
    linhas.push(`Reabastecer (passo 6): ${k}/3 Dicas na mão${k > 3 ? ' · acima de 3' : ''}`);
  } else if (b === 'distorcao') {
    const nv = nivelDe(j.sanidade); const k = j.mao.filter(c => c.startsWith('distorcao/')).length;
    const max = nv === 75 ? 1 : nv === 50 || nv === 25 ? 2 : 0;
    if (max) linhas.push(`Nível ${nv}%: no fim do turno, 1 Distorção (máx. ${max} na mão) · você tem ${k}`); else linhas.push('Distorção vem do nível 75%/50% (fim do turno), do Dado do pedágio ou de cartas.');
    if (max && k > max) { acima = true; titulo = 'Acima do máximo'; }
  } else if (b === 'laco') linhas.push('Laço vem da Armadilha (passo 3), do pedágio ou de cartas. Ponha a Corrente no peão.');
  else if (b === 'pacto') linhas.push('Pacto: só ao chegar a 10% ou menos. Agora você está Tomado (segredo).');
  else if (b === 'sanidade_10') linhas.push('Sanidade 10%: só para Tomados (a Noite dá 1).');
  linhas.push('Sem custo em sanidade, moedas ou ação.');
  const secreto = BARALHOS_SECRETOS.includes(b);
  return { titulo, linhas, acima, baralho: rot, restante: secreto ? null : e.baralhos[b].length, foraDaVez: !!foraDeQuem };
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
    moedas: MOEDAS_INICIAIS, imuneAte: 0, fiado: false, proposta: null, gastos: [],
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
  e.shows = []; e.palhacoProxVideo = 3 + aleat(2);
  e.relogio = 1; e.destaque = null; e.dado = null; e.discosAbertos = false; e.noite = { ativa: false, seq: e.noite.seq, inicio: 0 };
  for (const j of Object.values(e.jogadores)) {
    Object.assign(j, { sanidade: 80, tomado: false, mao: [], dicasRecebidas: [], dicasDadas: [], frente: [], fichasPegas: [], fichasConhecidas: {}, ultimoNivel: null, dadoPrivado: null, corrente: false, habilidadeUsada: false, moedas: MOEDAS_INICIAIS, imuneAte: 0, fiado: false, proposta: null, gastos: [] });
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
        if (h == null) { j.pos = null; tirarDaOrdem(e, id); registrar(e, `${j.apelido} agora só assiste.`); break; }
        j.pos = posInicial(e, j);
        registrar(e, `${j.apelido} escolheu ${nomeH(j)}.`);
        if (naPartida && primeira) { darDicasIniciais(e, j); j.moedas = MOEDAS_INICIAIS; if (e.turno && !e.turno.ordem.includes(id)) { e.turno.ordem.push(id); registrar(e, `${j.apelido} entrou no fim da ordem dos turnos.`); } }
        break;
      }
      case 'iniciar': {
        precisa(id === e.hostId, 'Só quem criou a sala inicia a partida.');
        const n = Object.values(e.jogadores).filter(o => o.hospede != null).length;
        precisa(n >= 1, 'Ninguém escolheu Hóspede ainda.');
        prepararPartida(e); e.fase = 'jogo'; iniciarTurnos(e);
        registrar(e, `A partida começou com ${n} Hóspede${n > 1 ? 's' : ''}. Fichas de Sala e baralhos embaralhados; cada um recebeu 3 Dicas. Relógio no 1.`);
        if (n < 3) registrar(e, 'Aviso: a regra pede de 3 a 6 jogadores.');
        if (e.pedagio) registrar(e, `Moedas: cada Hóspede começa com ${MOEDAS_INICIAIS} (à vista). Quem cruzar com o Palhaço paga pedágio.`);
        registrar(e, `Ordem dos turnos${e.turnoAleatorio ? ' (sorteada)' : ' (pela entrada)'}: ${e.turno.ordem.map(k => e.jogadores[k].apelido).join(' → ')}. Vez de ${quem(e.jogadores[daVez(e)])}.`);
        if (e.palhacoAuto) show(e, [{ t: 'fala', cat: 'inicio', texto: PAL.fala('inicio', _rng) }, { t: 'video', clipe: 'acenando' }]);
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
        let fora = null;
        if (a.final) {
          const depois = salaEm(x, y);
          const vez = daVez(e);
          if (!rot && depois !== antes && vez) {
            if (vez === id) { const d = antes && depois ? PAL.distancias(antes)[depois] : 1; e.turno.feito.salas += Number.isFinite(d) ? d : 1; }
            else fora = `É a vez de ${quem(e.jogadores[vez])}. A mesa deixou mover, mas combinem.`;
          }
          if (depois !== antes && !(a.alvo === 'palhaco' && e.noite.ativa))
            registrar(e, rot ? `${j.apelido} moveu o Palhaço para ${depois || 'fora da planta'}.` : `${quem(j)} foi para ${depois || 'fora da planta'}${fora ? ' (fora da vez)' : ''}.`);
          if (a.alvo === 'palhaco' && e.noite.ativa) e.palhacoMovidoNaNoite = true;
          if (e.pedagio && !e.noite.ativa && depois && depois !== antes) {
            if (a.alvo === 'palhaco') cobrarSala(e, depois, []);
            else if (depois === salaEm(e.palhaco.x, e.palhaco.y)) cobrarSala(e, depois, [], [id]);
          }
        }
        return fora ? { ok: true, leve: !a.final, aviso: fora } : { ok: true, leve: !a.final };
      }
      case 'comprar': {
        precisa(naPartida && temH, 'Escolha um Hóspede e espere a partida começar.');
        const b = a.baralho; precisa(BARALHOS_COMPRA.includes(b), 'Baralho inválido.');
        const c = comprarDe(e, b); precisa(c, `O baralho de ${DADOS.baralhos[b].rotulo} acabou.`);
        j.mao.push(c);
        const secreta = BARALHOS_SECRETOS.includes(b);
        const vez = daVez(e); const naVez = vez === id; const foraDe = vez && !naVez && !secreta && !e.noite.ativa ? quem(e.jogadores[vez]) : null;
        if (naVez && !secreta) {
          const f = e.turno.feito;
          if (b === 'evento') f.evento++; else if (b === 'dica') f.dicas++; else if (b === 'distorcao') f.distorcao++; else if (b === 'laco') f.laco++; else if (b.startsWith('sanidade_')) f.nivel++;
        }
        const custo = custoCompra(e, j, b, naVez && !secreta, foraDe);
        gasto(j, `Comprou ${DADOS.cartas[c].nome} (${DADOS.baralhos[b].rotulo}) · ${custo.titulo.toLowerCase()}${custo.acima ? '' : ''}`);
        const sufixo = foraDe ? ' (fora da vez)' : '';
        if (b === 'pacto') {
          // Pacto é em segredo: nada no log público. O próprio jogador é marcado Tomado.
          j.tomado = true;
          registrar(e, `Você comprou um Pacto em segredo e agora está marcado como TOMADO. Ninguém mais sabe.`, id);
        } else if (b === 'sanidade_10') {
          registrar(e, `Você comprou 1 carta de Sanidade 10% em segredo.`, id);
        } else if (b.startsWith('sanidade_')) {
          j.ultimoNivel = Number(b.split('_')[1]);
          registrar(e, `${quem(j)} comprou 1 carta de Sanidade do nível ${j.ultimoNivel}%${sufixo}.`);
        } else registrar(e, `${quem(j)} comprou 1 carta de ${DADOS.baralhos[b].rotulo}${sufixo}.`);
        return { ok: true, carta: c, custo };
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
        if (daVez(e) === id) e.turno.feito.dica++;
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
        if (daVez(e) === id && aqui) e.turno.feito.ficha++;
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
        const antesS = j.sanidade;
        j.sanidade = Math.max(0, Math.min(100, v));
        if (j.sanidade !== antesS) gasto(j, `Você ajustou o Disco: ${difTxt(0, j.sanidade - antesS)} (agora ${j.sanidade}%)`);
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
        precisa(id === e.hostId, 'Só o host mexe no Relógio à mão. Os outros usam "Passar a vez": quando todos passam, a rodada avança sozinha.');
        avancarRelogio(e, j.apelido, Number(a.delta) || 0);
        break;
      }
      case 'passarVez': {
        precisa(naPartida && e.turno && e.turno.ordem.length, 'Não há turnos em andamento.');
        precisa(!e.noite.ativa, 'Espere amanhecer para passar a vez.');
        const atual = daVez(e);
        precisa(id === atual || id === e.hostId, 'Só quem está na vez (ou o host) passa a vez.');
        if (a.seq != null) precisa(Number(a.seq) === e.turno.seq, 'A vez já mudou.');
        const ja = e.jogadores[atual];
        registrar(e, `${quem(ja)} passou a vez${id !== atual ? ` (o host ${j.apelido} passou por ${ja.apelido})` : ''}. Fez: ${resumoFeito(e.turno.feito)}.`);
        avancarVez(e);
        break;
      }
      case 'descansar': {
        precisa(naPartida && temH, 'A partida ainda não começou.');
        precisa(daVez(e) === id, 'Descansar é na sua vez, no lugar do Movimento.');
        const f = e.turno.feito; precisa(!f.descanso, 'Você já descansou nesta vez.');
        precisa(!f.salas, 'Você já se moveu nesta vez: descansar é no lugar do Movimento.');
        f.descanso = true; const antesS = j.sanidade; j.sanidade = Math.min(100, j.sanidade + 5);
        gasto(j, `Descansou: ${difTxt(0, j.sanidade - antesS) || 'sanidade já no máximo'}`);
        registrar(e, `${quem(j)} descansou em vez de se mover (+5% no Disco, pela regra).`);
        break;
      }
      case 'ordemTurnos': {
        precisa(id === e.hostId, 'Só o host muda a ordem dos turnos.');
        if (e.fase === 'lobby') { e.turnoAleatorio = !!a.embaralhar; registrar(e, e.turnoAleatorio ? 'A ordem dos turnos será sorteada ao iniciar.' : 'A ordem dos turnos será a da entrada na sala.'); break; }
        precisa(e.turno && e.turno.vez === 0 && !Object.values(e.turno.feito).some(Boolean), 'Só dá para mudar a ordem no começo da rodada (antes do primeiro jogador agir).');
        const nova = e.ordem.filter(k => e.jogadores[k] && e.jogadores[k].hospede != null);
        if (a.embaralhar) embaralhar(nova);
        e.turnoAleatorio = !!a.embaralhar; e.turno.ordem = nova; e.turno.seq++;
        registrar(e, `${a.embaralhar ? 'O host sorteou' : 'O host voltou'} a ordem dos turnos: ${nova.map(k => e.jogadores[k].apelido).join(' → ')}. Vez de ${quem(e.jogadores[daVez(e)])}.`);
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
          if (c) { o.mao.push(c); gasto(o, 'Noite: recebeu 1 carta de Sanidade 10% (segredo)'); registrar(e, 'Você ouviu o Apresentador. Recebeu em segredo 1 carta de Sanidade 10% (veja na sua mão). Você pode mover o Palhaço 1 cômodo agora.', o.id); }
          else registrar(e, 'Você ouviu o Apresentador, mas o baralho de Sanidade 10% acabou.', o.id);
        }
        break;
      }
      case 'amanhecer': {
        precisa(e.noite.ativa, 'Não é noite.');
        precisa(Date.now() - e.noite.inicio >= (a.forcar && id === e.hostId ? 0 : 7000), 'Espere um pouco: a noite dura pelo menos 7 segundos.');
        e.noite.ativa = false;
        registrar(e, e.palhacoMovidoNaNoite ? 'Amanheceu. O Palhaço não está onde estava...' : 'Amanheceu. Todos abrem os olhos.');
        if (e.palhacoMovidoNaNoite && e.pedagio) { const sp = salaEm(e.palhaco.x, e.palhaco.y); if (sp) cobrarSala(e, sp, []); }
        break;
      }
      case 'abrirDiscos': {
        precisa(id === e.hostId, 'Só quem criou a sala abre os Discos.');
        e.discosAbertos = true; e.fase = 'fim';
        const res = Object.values(e.jogadores).filter(o => o.hospede != null).map(o => `${quem(o)}: ${o.sanidade}%${o.tomado ? ' · TOMADO' : ''}`).join(' | ');
        registrar(e, `DISCOS ABERTOS. ${res}`);
        if (e.palhacoAuto) show(e, [{ t: 'fala', cat: 'fim', texto: PAL.fala('fim', _rng) }]);
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
        for (const o of Object.values(e.jogadores)) Object.assign(o, { mao: [], dicasRecebidas: [], dicasDadas: [], frente: [], fichasPegas: [], fichasConhecidas: {}, sanidade: 80, tomado: false, ultimoNivel: null, corrente: false, habilidadeUsada: false, moedas: MOEDAS_INICIAIS, imuneAte: 0, fiado: false, proposta: null });
        e.shows = []; e.turno = null;
        for (const o of Object.values(e.jogadores)) o.gastos = [];
        e.fichas = {}; e.baralhos = {}; e.descartes = {};
        registrar(e, 'Nova partida: escolham os Hóspedes. O host inicia quando todos estiverem prontos.');
        break;
      }
      case 'expulsar': {
        precisa(id === e.hostId && a.alvo !== id, 'Só o host.');
        const o = e.jogadores[a.alvo]; precisa(o, 'Jogador não encontrado.');
        // as cartas voltam para o descarte de cada baralho
        for (const c of [...o.mao, ...o.frente, ...o.dicasRecebidas.map(d => d.carta)]) e.descartes[baralhoDa(c)]?.push(c);
        tirarDaOrdem(e, a.alvo);
        delete e.jogadores[a.alvo]; e.ordem = e.ordem.filter(x => x !== a.alvo);
        registrar(e, `${o.apelido} foi retirado da mesa pelo host.`);
        return { ok: true, expulso: a.alvo };
      }
      case 'palhacoConfig': {
        precisa(id === e.hostId, 'Só o host liga e desliga o Palhaço automático.');
        if ('auto' in a && !!a.auto !== e.palhacoAuto) { e.palhacoAuto = !!a.auto; registrar(e, e.palhacoAuto ? 'O host ligou o Palhaço automático: ele anda sozinho no fim de cada rodada.' : 'O host desligou o Palhaço automático: o Palhaço volta a ser movido à mão.'); }
        if ('pedagio' in a && !!a.pedagio !== e.pedagio) { e.pedagio = !!a.pedagio; registrar(e, e.pedagio ? 'Pedágio do Palhaço ligado.' : 'Pedágio do Palhaço desligado.'); }
        break;
      }
      case 'respostaProposta': {
        const pr = j.proposta; precisa(pr && pr.ref === a.ref, 'Essa proposta não existe mais.');
        j.proposta = null;
        const def = PAL.PROPOSTAS.find(p => p.id === pr.id);
        let aceitou = !!a.aceitar, msg = null;
        if (aceitou && !def.eleg(ctxPal(e), j)) { aceitou = false; msg = 'A oferta não vale mais (algo mudou). Conta como recusa.'; registrar(e, msg, id); }
        if (aceitou) { const m0 = j.moedas, s0 = j.sanidade; msg = def.aplicar(ctxPal(e), j); const dt = difTxt(j.moedas - m0, j.sanidade - s0); gasto(j, `Sussurro do Palhaço aceito${dt ? ': ' + dt : ''}`); registrar(e, `Sussurro do Palhaço: "${def.texto}" Você aceitou. ${msg}`, id); avisoNivel(e, j); }
        else if (!msg) registrar(e, `Sussurro do Palhaço: "${def.texto}" Você recusou.`, id);
        registrar(e, `${quem(j)} ${aceitou ? 'ACEITOU' : 'recusou'} o sussurro do Palhaço.`);
        show(e, [{ t: 'fala', cat: aceitou ? 'aceitou' : 'recusou', texto: PAL.fala(aceitou ? 'aceitou' : 'recusou', _rng) }]);
        return { ok: true, msg: msg || 'Você recusou.' };
      }
      default: return ERR('Ação desconhecida.');
    }
  } catch (err) { return ERR(err.message); }
  return { ok: true };
}


// ===================== PALHAÇO COM IA (módulo opcional) =====================
// Um "show" é uma lista de passos que TODOS os navegadores tocam em ordem: fala (balão + sino), mov (peão deslizando
// pelas portas), dado, video (clipe curto) e evento (carta revelada). Só leva informação pública.
const SHOWS_MAX = 6;
function show(e, passos) {
  if (!passos.length) return;
  e.shows.push({ seq: ++e.showSeq, passos });
  if (e.shows.length > SHOWS_MAX) e.shows.splice(0, e.shows.length - SHOWS_MAX);
}
function ctxPal(e) {
  return {
    e, rnd: _rng, salaEm, quem, comprarDe: (b) => comprarDe(e, b),
    descartar: (j, c) => { const i = j.mao.indexOf(c); if (i >= 0) { j.mao.splice(i, 1); e.descartes[baralhoDa(c)].push(c); } },
    registrar: (t, para = null) => registrar(e, t, para),
  };
}
function avisoNivel(e, j) {
  if (j.sanidade <= 10 && !j.tomado) registrar(e, `Seu Disco está em ${j.sanidade}%: pela regra, compre um Pacto em segredo (botão Pacto).`, j.id);
}
// Cobra o pedágio de cada Hóspede (não imune) que está na sala do Palhaço. `so` limita a alguns ids.
function cobrarSala(e, sala, passos, so = null) {
  const vitimas = Object.values(e.jogadores).filter(o => o.hospede != null && o.pos && salaEm(o.pos.x, o.pos.y) === sala && (!so || so.includes(o.id)));
  const pegos = [];
  for (const o of vitimas) {
    if (o.imuneAte > e.relogio) { registrar(e, `O Palhaço passou por ${quem(o)} em ${sala} e fingiu não ver.`); continue; }
    pedagio(e, o, sala, passos, pegos.length); pegos.push(o.id);
  }
  if (pegos.length) {
    passos.push({ t: 'video', clipe: PAL.CLIPES[1 + aleat(PAL.CLIPES.length - 1)] });
    e.palhacoProxVideo = Math.max(e.palhacoProxVideo, e.relogio + 2);
    if (!passos.some(p => p.t === 'mov')) show(e, passos.splice(0));   // pedágio fora da rodada automática
  }
  return pegos;
}
function pedagio(e, j, sala, passos, k) {
  const m0 = j.moedas, s0 = j.sanidade;
  const preco = j.fiado ? 2 : 1; j.fiado = false;
  let pagou;
  if (j.moedas > 0) { const v = Math.min(preco, j.moedas); j.moedas -= v; pagou = `pagou ${v} moeda${v > 1 ? 's' : ''}${preco > 1 ? ' (pedágio em dobro)' : ''} e ficou com ${j.moedas}`; }
  else { j.sanidade = Math.max(0, j.sanidade - 15); pagou = 'estava sem moedas e pagou com 15% de sanidade (Disco ajustado em segredo)'; }
  // manda para um cômodo sorteado diferente (nem o atual, nem o Palco)
  const op = PAL.SALAS.filter(s => s !== sala && s !== 'Palco');
  const destino = op[aleat(op.length)];
  const [x, y] = PAL.pontoSorteado(destino, k, _rng); j.pos = { x, y };
  // penalidade do Dado do Olho
  const face = aleat(6) + 1; let pen, priv;
  if (face > 2) { j.sanidade = Math.max(0, j.sanidade - 10); pen = 'perde 10% de sanidade (Disco ajustado em segredo)'; priv = ''; }
  else if (aleat(2) === 0) { const c = comprarDe(e, 'distorcao'); if (c) j.mao.push(c); pen = 'compra 1 Distorção'; priv = c ? ` Distorção: "${DADOS.cartas[c].nome}".` : ' (o baralho de Distorção acabou)'; }
  else { const c = comprarDe(e, 'laco'); if (c) j.mao.push(c); j.corrente = true; pen = 'recebe um Laço e a Corrente'; priv = c ? ` Laço: "${DADOS.cartas[c].nome}".` : ''; }
  registrar(e, `O Palhaço pegou ${quem(j)} em ${sala}! Pedágio: ${pagou}. Foi mandado para ${destino}. Dado do Olho: ${face <= 2 ? 'OLHO ABERTO' : 'olho fechado'} (face ${face}), ${pen}.`);
  registrar(e, `Pedágio do Palhaço: seu Disco agora está em ${j.sanidade}%.${priv}`, j.id);
  gasto(j, `Pedágio do Palhaço em ${sala}: ${difTxt(j.moedas - m0, j.sanidade - s0) || 'sem perda'}${face <= 2 ? ' · ' + pen : ''}`);
  avisoNivel(e, j);
  passos.push({ t: 'fala', cat: 'pegar', texto: PAL.fala(j.moedas === 0 && pagou.startsWith('estava') ? 'semMoeda' : 'pegar', _rng, { nome: j.apelido }), alvo: j.id });
  passos.push({ t: 'dado', face, txt: `Pedágio de ${j.apelido}` });
}

// Fim da rodada com o Palhaço automático: anda 1 ou 2 cômodos, cobra, às vezes Evento, clipe e proposta.
export function palhacoRodada(e) {
  if (e.fase !== 'jogo' || !e.palhacoAuto || e.relogio > 12) return null;
  const passos = [];
  // propostas não respondidas expiram
  for (const o of Object.values(e.jogadores)) if (o.proposta && o.proposta.rodada < e.relogio) { o.proposta = null; registrar(e, `O sussurro para ${quem(o)} se perdeu no escuro.`); }
  let de = salaEm(e.palhaco.x, e.palhaco.y);
  if (!de) { de = 'Porão'; const [x, y] = PAL.pontoParada('Porão', null, _rng); e.palhaco = { x, y }; }
  const esc = PAL.escolherAlvo(e, de, _rng);
  const passosMax = 1 + aleat(2);
  let rota = esc.modo === 'despiste' ? [esc.sala] : PAL.caminho(de, esc.sala, _rng);
  if (esc.modo === 'despiste' && passosMax === 2) { const v = PAL.VIZINHOS[esc.sala].filter(x => x.sala !== de); if (v.length) rota.push(v[aleat(v.length)].sala); }
  const ocupada = (s) => Object.values(e.jogadores).some(o => o.hospede != null && o.pos && salaEm(o.pos.x, o.pos.y) === s && !(o.imuneAte > e.relogio));
  const andou = [];
  for (const s of rota.slice(0, passosMax)) { andou.push(s); if (e.pedagio && ocupada(s)) break; }
  const alvo = esc.alvo ? e.jogadores[esc.alvo] : null;
  const salaAlvo = esc.sala;
  passos.push({ t: 'fala', cat: esc.modo === 'despiste' ? 'despiste' : 'perseguir', texto: PAL.fala(esc.modo === 'despiste' ? 'despiste' : 'perseguir', _rng, { sala: salaAlvo, nome: alvo?.apelido || 'você' }) });
  const motivo = { proximo: 'o Hóspede mais próximo', rico: 'quem tem mais moedas', sozinho: 'quem está sozinho', despiste: 'ninguém (despiste)' }[esc.modo];
  if (andou.length) {
    const pts = PAL.trajeto(e.palhaco, andou, de, _rng);
    const fim = pts[pts.length - 1]; e.palhaco = { x: fim[0], y: fim[1] };
    const mov = { t: 'mov', caminho: pts, pegos: [] }; passos.push(mov);
    const ond = andou[andou.length - 1];
    registrar(e, `O Palhaço andou ${andou.length} cômodo${andou.length > 1 ? 's' : ''}: ${andou.join(' → ')}. Ele seguia ${motivo}.`);
    const pegos = e.pedagio ? cobrarSala(e, ond, passos) : [];
    mov.pegos = pegos;
    if (!pegos.length && (esc.modo === 'despiste' ? _rng() < 0.3 : _rng() < 0.45)) passos.push({ t: 'fala', cat: 'errar', texto: PAL.fala('errar', _rng) });
  }
  else if (e.pedagio && ocupada(de)) cobrarSala(e, de, passos);
  // Evento sorteado (cerca de 1 rodada em cada 3)
  if (_rng() < 1 / 3) {
    const c = comprarDe(e, 'evento');
    if (c) {
      e.descartes.evento.push(c);
      e.destaque = { carta: c, por: 'palhaco', seq: ++e.seq, motivo: 'palhaco' };
      registrar(e, `O Palhaço tirou uma carta de Evento e revelou a todos: ${DADOS.cartas[c].nome}. Leiam em voz alta e apliquem.`);
      passos.push({ t: 'fala', cat: 'evento', texto: PAL.fala('evento', _rng) }, { t: 'evento', carta: c });
    }
  }
  // clipe aleatório a cada 2 ou 3 rodadas
  if (!passos.some(p => p.t === 'video') && e.relogio >= e.palhacoProxVideo) {
    passos.push({ t: 'video', clipe: PAL.CLIPES[aleat(PAL.CLIPES.length)] });
    e.palhacoProxVideo = e.relogio + 2 + aleat(2);
  }
  // proposta privada (às vezes)
  if (_rng() < 0.35) palhacoPropor(e, null, passos);
  show(e, passos);
  return passos;
}

// Faz uma proposta privada. alvoId opcional (testes); senão escolhe quem tem menos sanidade, mais moedas ou alguém ao acaso.
export function palhacoPropor(e, alvoId = null, passos = null, propostaId = null) {
  const cands = Object.values(e.jogadores).filter(o => o.hospede != null && !o.proposta);
  if (!cands.length) return null;
  const ctx = ctxPal(e);
  const elegiveis = (o) => PAL.PROPOSTAS.filter(p => (!propostaId || p.id === propostaId) && p.eleg(ctx, o));
  let ordem;
  if (alvoId) ordem = cands.filter(o => o.id === alvoId);
  else {
    const r = _rng(); const emb = embaralhar([...cands]);
    if (r < 0.4) ordem = emb.sort((a, b) => a.sanidade - b.sanidade);
    else if (r < 0.7) ordem = emb.sort((a, b) => b.moedas - a.moedas);
    else ordem = emb;
  }
  for (const o of ordem) {
    const ps = elegiveis(o); if (!ps.length) continue;
    const p = ps[aleat(ps.length)];
    o.proposta = { ref: novoId(6), id: p.id, texto: p.texto, rodada: e.relogio };
    registrar(e, `O Palhaço sussurrou algo para ${quem(o)}.`);
    registrar(e, `O Palhaço sussurrou no seu ouvido: "${p.texto}" (Aceitar ou Recusar até o fim da rodada.)`, o.id);
    const passo = { t: 'fala', cat: 'proposta', texto: PAL.fala('proposta', _rng) };
    if (passos) passos.push(passo); else show(e, [passo]);
    return o.id;
  }
  return null;
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
      moedas: o.moedas ?? 0,
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
    turno: e.turno && e.fase !== 'lobby' ? { ordem: [...e.turno.ordem], vez: e.turno.vez, daVez: daVez(e), rodada: e.turno.rodada, seq: e.turno.seq, feito: { ...e.turno.feito } } : null,
    turnoAleatorio: !!e.turnoAleatorio,
    palhacoAuto: !!e.palhacoAuto, pedagio: !!e.pedagio, shows: (e.shows || []).map(sh => JSON.parse(JSON.stringify(sh))),
    jogadores: e.ordem.filter(k => e.jogadores[k]).map(k => pub(e.jogadores[k])),
    log: e.log.filter(l => l.para === null || l.para === id).slice(-120).map(l => ({ n: l.n, t: l.t, texto: l.texto, privado: l.para !== null })),
    eu: eu ? {
      id: eu.id, apelido: eu.apelido, hospede: eu.hospede, sanidade: eu.sanidade, tomado: eu.tomado, nivel: nivelDe(eu.sanidade),
      mao: [...eu.mao], dicasRecebidas: eu.dicasRecebidas.map(d => ({ ref: d.ref, de: d.de })),
      dicasDadas: eu.dicasDadas.map(d => ({ carta: d.carta, para: d.para, destino: d.destino })),
      fichasConhecidas: { ...eu.fichasConhecidas }, fichasPegas: [...eu.fichasPegas],
      dadoPrivado: eu.dadoPrivado ? { ...eu.dadoPrivado } : null, ehHost: eu.id === e.hostId,
      proposta: eu.proposta ? { ref: eu.proposta.ref, texto: eu.proposta.texto } : null, imuneAte: eu.imuneAte || 0, fiado: !!eu.fiado,
      gastos: (eu.gastos || []).slice(-8).map(g => ({ t: g.t, txt: g.txt })),
    } : null,
  };
}
