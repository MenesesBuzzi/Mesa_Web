// SUSSURROS · "Palhaço com IA" (módulo opcional da mesa online).
// Não é LLM nem API: é um bot heurístico com personalidade que roda SÓ no navegador do host, dentro do motor.
// Aqui ficam: o grafo de cômodos e portas da planta fixa, as falas, as propostas e as escolhas do bot.
// Não depende de DOM nem de rede (testável no Node).
import { DADOS } from './dados.js';

const M = DADOS.mansao;
const S = Object.fromEntries(M.salas.map(s => [s.nome, s]));

// ---------- Grafo (mesma geometria de mapa/tabuleiro.py: portas em unidades de casa de cada andar) ----------
// Térreo e Andar Superior: grade 14x9 com origem no canto do andar; Porão e Sótão: grade 5x4.
const U = (S['Galeria de Espelhos'].x1 - S['Galeria de Espelhos'].x0) / 14;
const ORIG = {
  T: [S['Cozinha'].x0, S['Cozinha'].y0],
  S: [S['Corredor Superior'].x0, S['Corredor Superior'].y0 - 3 * U],
  P: [S['Porão'].x0, S['Porão'].y0],
  O: [S['Sótão'].x0, S['Sótão'].y0],
};
const pt = (a, x, y) => [Math.round(ORIG[a][0] + x * U), Math.round(ORIG[a][1] + y * U)];
// [salaA, salaB, pontos de passagem (porta ou as duas pontas de uma escada)]
const LIGACOES = [
  ['Cozinha', 'Galeria de Espelhos', [pt('T', 1.5, 3)]],
  ['Camarim', 'Galeria de Espelhos', [pt('T', 4, 3)]],
  ['Capela', 'Galeria de Espelhos', [pt('T', 12, 3)]],
  ['Camarim', 'Palco', [pt('T', 5, 1.5)]],
  ['Galeria de Espelhos', 'Salão de Baile', [pt('T', 2.5, 4.5)]],
  ['Galeria de Espelhos', 'Saguão', [pt('T', 7, 4.5)]],
  ['Galeria de Espelhos', 'Biblioteca', [pt('T', 11.5, 4.5)]],
  ['Salão de Baile', 'Saguão', [pt('T', 5, 7.5)]],
  ['Saguão', 'Biblioteca', [pt('T', 9, 7.5)]],
  ['Torre', 'Corredor Superior', [pt('S', 12, 3)]],
  ['Corredor Superior', 'Quarto da Criança', [pt('S', 2.5, 4.5)]],
  ['Corredor Superior', 'Mezanino', [pt('S', 7, 4.5)]],
  ['Corredor Superior', 'Enfermaria', [pt('S', 11.5, 4.5)]],
  // escadas (contam como 1 cômodo de movimento)
  ['Cozinha', 'Porão', [pt('T', 0.65, 2.05), pt('P', 0.7, 2.6)]],
  ['Saguão', 'Mezanino', [pt('T', 7, 6.7), pt('S', 7, 6.7)]],
  ['Corredor Superior', 'Sótão', [pt('S', 0.97, 3.7), pt('O', 1.05, 2.95)]],
];
export const VIZINHOS = {};
for (const s of M.salas) VIZINHOS[s.nome] = [];
for (const [a, b, p] of LIGACOES) { VIZINHOS[a].push({ sala: b, via: p }); VIZINHOS[b].push({ sala: a, via: [...p].reverse() }); }
export const SALAS = M.salas.map(s => s.nome);
const CORREDORES = new Set(['Galeria de Espelhos', 'Corredor Superior']);

export function salaEm(x, y) { for (const s of M.salas) if (x >= s.x0 && x <= s.x1 && y >= s.y0 && y <= s.y1) return s.nome; return null; }
// distâncias (BFS) a partir de uma sala
export function distancias(de) {
  const d = { [de]: 0 }, fila = [de];
  while (fila.length) { const a = fila.shift(); for (const v of VIZINHOS[a]) if (!(v.sala in d)) { d[v.sala] = d[a] + 1; fila.push(v.sala); } }
  return d;
}
// caminho mais curto (lista de salas, sem a de origem); empate decidido por rnd
export function caminho(de, para, rnd = Math.random) {
  if (de === para) return [];
  const dist = distancias(para); if (!(de in dist)) return [];
  const out = []; let a = de;
  while (a !== para) {
    const op = VIZINHOS[a].filter(v => dist[v.sala] === dist[a] - 1);
    a = op[Math.floor(rnd() * op.length)].sala; out.push(a);
  }
  return out;
}
// ponto onde o peão do Palhaço para dentro de uma sala (perto da porta, se for corredor)
export function pontoParada(sala, entrada, rnd = Math.random) {
  const s = S[sala]; const cx = (s.x0 + s.x1) / 2, cy = (s.y0 + s.y1) / 2;
  if (CORREDORES.has(sala) && entrada) return [Math.round(Math.max(s.x0 + 90, Math.min(s.x1 - 90, entrada[0]))), Math.round(cy)];
  const jx = (s.x1 - s.x0) * 0.18, jy = (s.y1 - s.y0) * 0.15;
  let x = cx + (rnd() - 0.5) * jx, y = cy + (rnd() - 0.5) * jy;
  if (s.ficha) { const dx = x - s.ficha[0], dy = y - s.ficha[1]; if (Math.hypot(dx, dy) < 170) { x = cx + (cx >= s.ficha[0] ? 120 : -120); y = cy + 60; } }
  return [Math.round(x), Math.round(y)];
}
// pontos para a animação: posição atual -> portas/escadas -> ponto final
export function trajeto(origemXY, salas, de, rnd = Math.random) {
  const pts = [[Math.round(origemXY.x), Math.round(origemXY.y)]]; let a = de, ultima = null;
  for (const b of salas) {
    const v = VIZINHOS[a].find(x => x.sala === b); if (!v) break;
    for (const p of v.via) pts.push(p); ultima = v.via[v.via.length - 1]; a = b;
  }
  if (salas.length) pts.push(pontoParada(a, ultima, rnd));
  return pts;
}
// ponto livre para mandar um Hóspede depois do pedágio
export function pontoSorteado(sala, k = 0, rnd = Math.random) {
  const s = S[sala]; const cx = (s.x0 + s.x1) / 2, cy = (s.y0 + s.y1) / 2;
  const x = cx - 120 + ((k % 3) * 120) + (rnd() - 0.5) * 30, y = cy + 40 + Math.floor(k / 3) * 110;
  return [Math.round(Math.max(s.x0 + 60, Math.min(s.x1 - 60, x))), Math.round(Math.max(s.y0 + 60, Math.min(s.y1 - 60, y)))];
}

// ---------- Falas (aparecem num balão para todos, com o sino) ----------
// {nome} = apelido do Hóspede citado; {sala} = cômodo.
export const FALAS = {
  inicio: [
    'Respeitável público! As portas fecharam. Que comece a diversão.',
    'Cinco moedinhas para cada um. Gastem com sabedoria... ou comigo.',
    'Eu conto até doze. Vocês correm. Combinado?',
    'Que plateia linda! Pena que ninguém sai cedo.',
    'Sorriam. Eu estou contando quantos de vocês ainda sorriem.',
    'Bem-vindos à minha casa. Os sapatos ficam. Os nomes também.',
  ],
  perseguir: [
    'Tum... tum... tum. Ouviu meus sapatos?',
    'Lá vou eu! Escondam as moedinhas.',
    'Eu sei o caminho de cor. Cada porta.',
    'Que cheirinho de medo vem de {sala}...',
    'Um passinho para cá, dois para lá. Adivinha para onde.',
    'Não corre não. Eu adoro quando correm.',
    'Toc, toc. Não precisa abrir. Eu tenho a chave de tudo.',
    'Estou indo te dar um abraço. Um bem apertado.',
    'Quem fica sozinho vira meu favorito.',
    'Plim! Mudei de cômodo. Sentiram falta?',
  ],
  pegar: [
    'Achei você, {nome}! Pedágio, por favor.',
    'Uma moedinha para o Palhaço, {nome}. É a regra da casa.',
    'Peguei! Agora é sua vez de sumir, {nome}.',
    'Que surpresa boa, {nome}! Para mim, claro.',
    '{nome}, você brilha tanto no escuro... fica fácil.',
    'Plim-plim! {nome} paga, {nome} viaja.',
    'Obrigado pela visita, {nome}. Volte sempre. Volte inteiro, se der.',
    'Ah, {nome}... você tropeçou bem no meu palco.',
    'Shhh, {nome}. Não grita. Só paga.',
    'Tchau, {nome}! Te mandei para um lugar especial.',
  ],
  semMoeda: [
    'Sem moedinhas, {nome}? Eu aceito outra coisa. Um pedacinho de você.',
    'Bolso vazio, cabeça cheia de mim, {nome}.',
  ],
  errar: [
    'Ora, ora. Ninguém aqui. Eu juro que ouvi risadas.',
    'Errei de propósito. Só para vocês relaxarem.',
    'Vazio. Que pena. Eu tinha preparado um número.',
    'Fiquei com saudade. Volto já.',
    'Ninguém? Tudo bem. Eu espero. Eu sou muito paciente.',
    'Cheguei atrasado na minha própria festa.',
    'Hmm. O cômodo ainda está quentinho.',
    'Vocês escondem bem. Eu procuro melhor.',
  ],
  despiste: [
    'Vou por aqui. Ou não. Nem eu sei mais.',
    'Um pulinho para o lado, só para confundir.',
    'Não estou atrás de ninguém. Palavra de palhaço.',
    'Hoje eu passeio. Amanhã eu escolho.',
    'Para onde eu vou? Para onde você menos quer.',
  ],
  evento: [
    'Hora do espetáculo! Tirei uma carta para vocês.',
    'Rufem os tambores... o Apresentador mandou isto.',
    'Um presentinho embrulhado em papel de pesadelo.',
    'Atenção, plateia! Mudança no programa.',
    'Leiam com carinho. Eu escolhi pensando em vocês.',
    'Abracadabra. Agora é com vocês.',
  ],
  proposta: [
    'Psiu... tenho um segredinho para alguém.',
    'Uma oferta especial, só para um de vocês.',
    'Cheguei mais perto. Ouvido aqui, por favor.',
    'Negócio bom é negócio escondido.',
  ],
  aceitou: ['Fechado. Aperto de mão sem luva.', 'Que bom fazer negócios com você.', 'Eu sabia que a gente ia se entender.'],
  recusou: ['Não? Tudo bem. Eu guardo a oferta. E o rosto.', 'Recusou o Palhaço. Ousado.', 'Que pena. Eu tinha embrulhado com laço e tudo.'],
  fim: [
    'Fim do espetáculo. Aplausos para quem ainda tem mãos.',
    'As cortinas fecham. Mas eu fico.',
    'Doze badaladas. Ninguém saiu. Que plateia fiel!',
    'Obrigado, obrigado! Voltem amanhã. Vocês não têm escolha.',
    'Abram os Discos. Vamos ver quem riu por último.',
  ],
};
// 62 falas no total (conferido em testes/palhaco.test.mjs)

// ---------- Clipes (assets/palhaco/clipes/<nome>.webm|mp4) ----------
export const CLIPES = ['acenando', 'malabarismo', 'rindo', 'chapeu', 'sumindo', 'psiu', 'voce'];

// ---------- Propostas privadas ----------
// eleg(ctx, j) diz se dá para oferecer; aplicar(ctx, j) aplica o efeito (só no host) e devolve o texto privado.
// ctx = { e, comprarDe, descartar(carta), registrar, salaEm, rnd, nivel }
const temDe = (j, b) => j.mao.filter(c => c.startsWith(b + '/'));
const sorteia = (ctx, a) => a[Math.floor(ctx.rnd() * a.length)];
const san = (j, d) => { j.sanidade = Math.max(0, Math.min(100, j.sanidade + d)); };
export const PROPOSTAS = [
  { id: 'tira_distorcao', texto: 'Me dê 2 moedas e eu tiro uma Distorção da sua mão.',
    eleg: (c, j) => j.moedas >= 2 && temDe(j, 'distorcao').length > 0,
    aplicar: (c, j) => { j.moedas -= 2; const d = sorteia(c, temDe(j, 'distorcao')); c.descartar(j, d); return `Você pagou 2 moedas. O Palhaço levou sua Distorção "${DADOS.cartas[d].nome}".`; } },
  { id: 'sanidade_laco', texto: 'Ganhe 15% de sanidade, mas carregue um Laço.',
    eleg: (c, j) => j.sanidade <= 85 && !j.corrente,
    aplicar: (c, j) => { san(j, 15); const l = c.comprarDe('laco'); if (l) j.mao.push(l); j.corrente = true; return `+15% no Disco (agora ${j.sanidade}%). Você recebeu o Laço "${l ? DADOS.cartas[l].nome : '?'}" e a Corrente.`; } },
  { id: 'troca_dica', texto: 'Troco uma Dica sua pela de outro jogador, às escuras.',
    eleg: (c, j) => temDe(j, 'dica').length > 0 && Object.values(c.e.jogadores).some(o => o.id !== j.id && o.hospede != null && temDe(o, 'dica').length),
    aplicar: (c, j) => {
      const o = sorteia(c, Object.values(c.e.jogadores).filter(o => o.id !== j.id && o.hospede != null && temDe(o, 'dica').length));
      const a = sorteia(c, temDe(j, 'dica')), b = sorteia(c, temDe(o, 'dica'));
      j.mao[j.mao.indexOf(a)] = b; o.mao[o.mao.indexOf(b)] = a;
      c.registrar('O Palhaço trocou, às escuras, uma Dica da sua mão por outra. Confira sua mão.', o.id);
      return `Sua Dica "${DADOS.cartas[a].nome}" foi embora. Chegou "${DADOS.cartas[b].nome}", de outra mão.`; } },
  { id: 'tregua', texto: 'Eu não te persigo por 2 rodadas, por 1 moeda.',
    eleg: (c, j) => j.moedas >= 1 && !(j.imuneAte > c.e.relogio),
    aplicar: (c, j) => { j.moedas -= 1; j.imuneAte = c.e.relogio + 2; return `Você pagou 1 moeda. Até a rodada ${j.imuneAte} o Palhaço não vem atrás de você nem cobra pedágio.`; } },
  { id: 'espia_ficha', texto: 'Espie a Ficha de uma sala, em troca de -10% de sanidade.',
    eleg: (c, j) => j.sanidade >= 15 && Object.entries(c.e.fichas).some(([s, f]) => f.estado === 'oculta' && !j.fichasConhecidas[s]),
    aplicar: (c, j) => {
      const [sala, f] = sorteia(c, Object.entries(c.e.fichas).filter(([s, f]) => f.estado === 'oculta' && !j.fichasConhecidas[s]));
      san(j, -10); j.fichasConhecidas[sala] = f.ficha;
      return `-10% no Disco (agora ${j.sanidade}%). Ficha de ${sala}: ${DADOS.fichas[f.ficha].tipo.toUpperCase()}.`; } },
  { id: 'onde_chave', texto: 'Uma moeda e eu sussurro onde dorme uma Chave.',
    eleg: (c, j) => j.moedas >= 1 && Object.entries(c.e.fichas).some(([s, f]) => f.estado === 'oculta' && DADOS.fichas[f.ficha].tipo === 'Chave' && !j.fichasConhecidas[s]),
    aplicar: (c, j) => {
      const [sala, f] = sorteia(c, Object.entries(c.e.fichas).filter(([s, f]) => f.estado === 'oculta' && DADOS.fichas[f.ficha].tipo === 'Chave' && !j.fichasConhecidas[s]));
      j.moedas -= 1; j.fichasConhecidas[sala] = f.ficha;
      return `Você pagou 1 moeda. Há uma CHAVE em ${sala}. (Desta vez ele não mentiu.)`; } },
  { id: 'moedas_por_sanidade', texto: 'Duas moedas agora. Só custa 10% de você.',
    eleg: (c, j) => j.sanidade >= 15,
    aplicar: (c, j) => { j.moedas += 2; san(j, -10); return `+2 moedas. -10% no Disco (agora ${j.sanidade}%).`; } },
  { id: 'atalho_camarim', texto: 'Uma moeda e eu te levo até o Camarim, pertinho do Palco.',
    eleg: (c, j) => j.moedas >= 1 && j.pos && c.salaEm(j.pos.x, j.pos.y) !== 'Camarim' && c.salaEm(j.pos.x, j.pos.y) !== 'Palco' && !j.corrente,
    aplicar: (c, j) => { j.moedas -= 1; const [x, y] = pontoSorteado('Camarim', 1, c.rnd); j.pos = { x, y }; c.registrar(`${c.quem(j)} apareceu no Camarim.`); return 'Você pagou 1 moeda e acordou no Camarim.'; } },
  { id: 'solta_laco', texto: 'Eu tiro a sua Corrente, se você me der 15% de sanidade.',
    eleg: (c, j) => j.corrente && j.sanidade >= 20,
    aplicar: (c, j) => { san(j, -15); const l = temDe(j, 'laco'); if (l.length) c.descartar(j, l[0]); j.corrente = false; return `-15% no Disco (agora ${j.sanidade}%). A Corrente caiu${l.length ? ' e o Laço foi para o descarte' : ''}.`; } },
  { id: 'fiado', texto: 'Ganhe 10% agora. Da próxima vez que eu te pegar, o pedágio é dobrado.',
    eleg: (c, j) => j.sanidade <= 90 && !j.fiado,
    aplicar: (c, j) => { san(j, 10); j.fiado = true; return `+10% no Disco (agora ${j.sanidade}%). O próximo pedágio será em dobro.`; } },
  { id: 'dica_por_moeda', texto: 'Me dê uma Dica da sua mão e eu te dou uma moeda.',
    eleg: (c, j) => temDe(j, 'dica').length > 0,
    aplicar: (c, j) => { const d = sorteia(c, temDe(j, 'dica')); c.descartar(j, d); j.moedas += 1; return `O Palhaço levou a Dica "${DADOS.cartas[d].nome}". +1 moeda.`; } },
  { id: 'dado_dobro', texto: 'Role o Dado comigo: olho fechado, +20%. Olho aberto, -20%.',
    eleg: (c, j) => j.sanidade >= 25,
    aplicar: (c, j) => { const face = Math.floor(c.rnd() * 6) + 1; const ab = face <= 2; san(j, ab ? -20 : 20); return `Dado: ${ab ? 'OLHO ABERTO, -20%' : 'olho fechado, +20%'} (agora ${j.sanidade}%).`; } },
];
// 12 propostas.

// ---------- Escolhas do bot ----------
// Decide o alvo da rodada. Devolve { modo, alvo (id|null), sala destino }.
export function escolherAlvo(e, deSala, rnd) {
  const vivos = Object.values(e.jogadores).filter(j => j.hospede != null && j.pos && salaEm(j.pos.x, j.pos.y) && !(j.imuneAte > e.relogio));
  const dist = distancias(deSala);
  const salaDe = (j) => salaEm(j.pos.x, j.pos.y);
  const proximo = (lista) => { let m = Infinity, op = []; for (const j of lista) { const d = dist[salaDe(j)] ?? 99; if (d < m) { m = d; op = [j]; } else if (d === m) op.push(j); } return op.length ? op[Math.floor(rnd() * op.length)] : null; };
  const r = rnd();
  if (!vivos.length || r < 0.12) {
    const viz = VIZINHOS[deSala]; return { modo: 'despiste', alvo: null, sala: viz[Math.floor(rnd() * viz.length)].sala };
  }
  let modo = 'proximo', alvo;
  if (r < 0.30) {
    const max = Math.max(...vivos.map(j => j.moedas)); const ricos = vivos.filter(j => j.moedas === max && max > 0);
    if (ricos.length) { modo = 'rico'; alvo = proximo(ricos); }
  } else if (r < 0.46) {
    const cont = {}; for (const j of vivos) cont[salaDe(j)] = (cont[salaDe(j)] || 0) + 1;
    const sos = vivos.filter(j => cont[salaDe(j)] === 1);
    if (sos.length) { modo = 'sozinho'; alvo = proximo(sos); }
  }
  if (!alvo) alvo = proximo(vivos);
  return { modo, alvo: alvo.id, sala: salaDe(alvo) };
}

export function fala(cat, rnd, vars = {}) {
  const l = FALAS[cat]; let t = l[Math.floor(rnd() * l.length)];
  for (const [k, v] of Object.entries(vars)) t = t.split('{' + k + '}').join(v);
  return t.replace(/\{sala\}/g, 'algum lugar').replace(/\{nome\}/g, 'você');
}
