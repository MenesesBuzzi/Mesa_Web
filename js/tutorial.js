// SUSSURROS · ajuda: painel "Como jogar", tour guiado, nível de experiência e dicas contextuais.
// Tudo aqui é LOCAL (cada navegador): nada vai pela rede, o tour de um não aparece na tela do outro.
import { $, esc } from './util.js';

// ===================== NÍVEL DE EXPERIÊNCIA =====================
export const NIVEIS_EXP = {
  iniciante: { nome: 'Iniciante', desc: 'Tour completo quando a partida começa e dicas na hora certa durante o jogo.' },
  intermediario: { nome: 'Intermediário', desc: 'Só uma pincelada: 4 balões curtos no início (vez, comprar, passar a vez, Palhaço).' },
  veterano: { nome: 'Veterano', desc: 'Nada abre sozinho. O botão "?" continua lá se precisar.' },
};
const K_NIVEL = 'sussurros-nivel', K_DICAS = 'sussurros-dicas-vistas';
export function nivelExp() { try { const n = localStorage.getItem(K_NIVEL); return NIVEIS_EXP[n] ? n : null; } catch (_) { return null; } }
export function definirNivelExp(n) { try { localStorage.setItem(K_NIVEL, n); if (n === 'iniciante') localStorage.removeItem(K_DICAS); } catch (_) {} }
export function htmlEscolhaNivel(atual) {
  return `<div class="niveis-exp" role="radiogroup" aria-label="Nível de experiência">${Object.entries(NIVEIS_EXP).map(([k, n]) =>
    `<button class="nivel-exp ${atual === k ? 'sel' : ''}" role="radio" aria-checked="${atual === k}" data-nivel="${k}"><b>${n.nome}</b><small>${esc(n.desc)}</small></button>`).join('')}</div>`;
}

// ===================== PAINEL "COMO JOGAR" =====================
const REGRAS = `
<details open><summary>Objetivo</summary>
<p>Vocês são as <b>Vozes</b> na cabeça de Hóspedes presos numa mansão-game show. Juntem as <b>3 Chaves</b> com Hóspedes no <b>Palco</b> (só se chega pelo Camarim) antes da <b>rodada 12</b>. Cuidado: quem enlouquece passa a jogar, em segredo, para o Apresentador.</p></details>
<details open><summary>A sua vez, nesta ordem</summary>
<ol>
<li><b>Sussurro</b> (opcional): dê 1 Dica virada para baixo a outro Hóspede e diga o que ela "diz". Pode mentir; o selo é o que vale (☆ branca = verdadeira, ★ preta = falsa).</li>
<li><b>Mover</b> até 2 Salas pelas portas, ou <b>descansar</b> (+5%).</li>
<li><b>Explorar</b>: entrou num cômodo com Ficha? Olhe em segredo. Chave: pegue. Armadilha: compre 1 Laço.</li>
<li><b>Evento</b>: compre 1 e leia em voz alta.</li>
<li><b>Nível</b>: compre 1 carta de Sanidade do seu nível, role o Dado e aplique.</li>
<li><b>Reabastecer</b>: compre Dicas até ter 3. Depois, <b>Passar a vez</b>.</li>
</ol>
<p class="nota">Comprar carta <b>não custa</b> sanidade nem moedas: cada compra é um passo da vez. O que muda a sanidade é o que a carta manda.</p></details>
<details><summary>Sanidade e níveis</summary>
<p>Secreta, no seu Disco. Todos começam com 80%. Níveis: <b>100%</b> (76–100) normal · <b>75%</b> (51–75) 1 Distorção no fim da vez (máx. 1) · <b>50%</b> (26–50) idem (máx. 2) · <b>25%</b> (11–25) Delírio: suas Dicas e Eventos passam pelo Dado · <b>10%</b> (0–10) Tomado. Todos veem só de qual nível você comprou.</p>
<p>Recupera: seguir Dica verdadeira (+10% para os dois), descansar (+5%), Capela (+15%, 1 vez).</p></details>
<details><summary>Tomados e Pactos</summary>
<p>Chegou a 10% ou menos: compre um <b>Pacto</b> em segredo. Você vence com o Apresentador, sua Dica falsa seguida tira 15% e o Pacto traz um objetivo secreto. Nunca revele; no passo Nível, compre do baralho de 25%. Tomado nunca volta.</p></details>
<details><summary>Palhaço e moedas</summary>
<p>Ele anda sozinho 1 ou 2 cômodos no fim de cada rodada. Se ele entrar no seu cômodo (ou você no dele), você paga <b>1 moeda</b> de pedágio, vai para um cômodo sorteado e rola o Dado: olho fechado = −10%; aberto = Distorção ou Laço. Sem moedas: −15%. Todos começam com 5 moedas, à vista. Às vezes ele sussurra uma proposta só para você: Aceitar ou Recusar.</p></details>
<details><summary>Noite</summary>
<p>Depois de cada rodada, toque em <b>Noite</b>: todos "fecham os olhos". Os Tomados recebem em segredo 1 carta de Sanidade 10% e podem mover o Palhaço 1 cômodo. Amanhecer libera em 7 s.</p></details>
<details><summary>Vitória</summary>
<p>Fuga com pelo menos metade dos Hóspedes e Tomados em menos da metade dos fugitivos: <b>as Vozes vencem</b>. Senão, ou se o Relógio passar da 12: <b>o Apresentador vence</b> (com os Tomados). Tomado que cumpriu o Pacto também vence. Quem mentiu sobre um Laço de sanidade perde sozinho.</p></details>`;

const MESA = `
<dl class="ajuda-mesa">
<dt>Faixa da vez</dt><dd>Mostra quem joga agora e o que já fez. Na sua vez: <b>Passar a vez</b> e <b>Descansar</b>. Quando todos passam, a rodada avança sozinha.</dd>
<dt>Mão</dt><dd>Sua ficha (habilidade 1x, Corrente), os baralhos para comprar, sua mão (revelar, descartar, dar Dica), Dicas recebidas (Seguir revela a todos; Ignorar descarta) e "Seus últimos gastos".</dd>
<dt>Disco</dt><dd>Sua sanidade secreta (só você vê), nível, "Estou Tomado", Fichas que olhou e Dicas que deu.</dd>
<dt>Mesa</dt><dd>Última carta revelada, todos os jogadores (nível, moedas, Dicas, Chaves), <b>Dar Dica</b>, ordem dos turnos, Palhaço e baralhos.</dd>
<dt>Log</dt><dd>Tudo o que aconteceu. Linhas "só você" são privadas.</dd>
<dt>+ Rodada / −</dt><dd>Só o host: avança ou volta o Relógio à mão (o Palhaço anda). Normalmente não precisa: a rodada anda sozinha.</dd>
<dt>Dado</dt><dd>Dado do Olho à vista de todos. 1–2 = olho aberto.</dd>
<dt>Dado escondido</dt><dd>Só você vê o resultado (Delírio, cartas de Sanidade 10%).</dd>
<dt>Noite</dt><dd>Escurece a tela de todos; os Tomados agem em segredo.</dd>
<dt>Corrente</dt><dd>"Pôr Corrente" marca o peão preso num Laço; "Tirar" quando cumprir a condição.</dd>
<dt>Planta</dt><dd>Arraste para mover a vista, pinça ou roda para zoom. Arraste o seu peão (anel dourado). Toque numa Ficha para olhá-la.</dd>
</dl>`;

export function htmlComoJogar(nivelAtual) {
  return `<h2 class="titulo-modal">Como jogar</h2>
  <div class="ajuda-abas" role="tablist"><button class="ativa" data-ajuda="regras">Regras em 1 minuto</button><button data-ajuda="mesa">Como usar a mesa</button></div>
  <div class="ajuda-pg" data-pg="regras">${REGRAS}</div>
  <div class="ajuda-pg" data-pg="mesa" hidden>${MESA}</div>
  <div class="linha-bt ajuda-rodape"><button class="bt bt-turquesa" id="aj-tour">Ver o tour guiado</button><button class="bt bt-claro" id="aj-nivel">Meu nível: ${esc(NIVEIS_EXP[nivelAtual || 'iniciante'].nome)}</button></div>`;
}
export function ligarComoJogar(raiz, { aoTour, aoNivel }) {
  raiz.querySelectorAll('[data-ajuda]').forEach(b => b.onclick = () => {
    raiz.querySelectorAll('[data-ajuda]').forEach(x => x.classList.toggle('ativa', x === b));
    raiz.querySelectorAll('.ajuda-pg').forEach(p => p.hidden = p.dataset.pg !== b.dataset.ajuda);
  });
  raiz.querySelector('#aj-tour').onclick = aoTour;
  raiz.querySelector('#aj-nivel').onclick = aoNivel;
}

// ===================== TOUR GUIADO =====================
export const TOUR_COMPLETO = [
  { alvo: '#faixa-vez', titulo: 'De quem é a vez', texto: 'Esta faixa mostra quem joga agora e o que já fez. Quando for a sua, ela fica dourada e aparece o botão <b>Passar a vez</b>.' },
  { alvo: '#mapa', titulo: 'A mansão', texto: 'Arraste o <b>seu peão</b> (anel dourado) até 2 Salas pelas portas turquesa. Toque na Ficha (círculo) do seu cômodo para olhar em segredo.' },
  { alvo: '#relogio', titulo: 'Relógio', texto: '12 rodadas. Quando todos passam a vez, ele anda sozinho e o <b>Palhaço</b> se move atrás de alguém.' },
  { alvo: '.acoes-topo', titulo: 'Dado e Noite', texto: '<b>Dado</b>: todos veem (1–2 = olho aberto). <b>Dado escondido</b>: só você. <b>Noite</b>: depois de cada rodada; os Tomados agem em segredo.' },
  { alvo: '.abas [data-aba="mao"]', aba: 'mao', titulo: 'Mão', texto: 'Sua ficha, os <b>baralhos para comprar</b> e suas cartas. Comprar não custa sanidade: cada compra é um passo da vez.' },
  { alvo: '.abas [data-aba="disco"]', aba: 'disco', titulo: 'Disco', texto: 'Sua <b>sanidade secreta</b>. Só você vê. Cuidado ao compartilhar a tela.' },
  { alvo: '.abas [data-aba="mesa"]', aba: 'mesa', titulo: 'Mesa e Log', texto: '<b>Mesa</b>: jogadores, moedas, <b>Dar Dica</b> e ordem dos turnos. <b>Log</b>: tudo o que aconteceu.' },
  { alvo: '#bt-ajuda', titulo: 'Dúvida?', texto: 'O <b>?</b> abre o Como jogar e repete este tour quando quiser. Boa sorte, Voz.' },
];
export const TOUR_CURTO = [
  { alvo: '#faixa-vez', titulo: 'A vez', texto: 'Aqui aparece de quem é a vez. Na sua, a faixa fica dourada.' },
  { alvo: '.abas [data-aba="mao"]', aba: 'mao', titulo: 'Comprar', texto: 'Os baralhos ficam na aba <b>Mão</b>. Comprar não custa nada: é um passo da vez.' },
  { alvo: '#faixa-vez .faixa-acoes', titulo: 'Passar a vez', texto: 'Terminou? <b>Passar a vez</b>. Quando todos passam, a rodada anda sozinha.' },
  { alvo: '.peao[data-alvo="palhaco"]', titulo: 'O Palhaço', texto: 'Anda sozinho no fim da rodada. Cruzou com ele: <b>1 moeda</b> de pedágio e Dado do Olho.' },
];

let tourAtivo = null;
export const tourAberto = () => !!tourAtivo;
function visivel(el) { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; }
// Abre um tour (lista de balões). opts: { aoAba(aba), aoFim(pulado) }
export function abrirTour(passos, opts = {}) {
  fecharTour(true);
  const el = document.createElement('div'); el.id = 'tour'; el.className = 'tour';
  el.innerHTML = `<div class="tour-furo"></div><div class="tour-balao" role="dialog" aria-live="polite"><p class="tour-n"></p><h3></h3><p class="tour-txt"></p>
    <div class="tour-bt"><button class="bt bt-mini bt-claro" data-t="pular">Pular</button><span></span><button class="bt bt-mini bt-claro" data-t="voltar">Voltar</button><button class="bt bt-mini bt-vermelho" data-t="prox">Próximo</button></div></div>`;
  document.body.appendChild(el);
  tourAtivo = { el, passos, i: 0, opts };
  el.querySelector('[data-t="pular"]').onclick = () => fecharTour(false, true);
  el.querySelector('[data-t="voltar"]').onclick = () => irPasso(tourAtivo.i - 1);
  el.querySelector('[data-t="prox"]').onclick = () => irPasso(tourAtivo.i + 1);
  el.addEventListener('click', (e) => { if (e.target === el) e.stopPropagation(); });
  window.addEventListener('resize', reposicionar);
  irPasso(0);
}
function irPasso(i) {
  const t = tourAtivo; if (!t) return;
  if (i >= t.passos.length) return fecharTour(false, false);
  t.i = Math.max(0, i);
  const p = t.passos[t.i];
  if (p.aba) t.opts.aoAba?.(p.aba);
  const b = t.el.querySelector('.tour-balao');
  b.querySelector('.tour-n').textContent = `${t.i + 1} de ${t.passos.length}`;
  b.querySelector('h3').textContent = p.titulo; b.querySelector('.tour-txt').innerHTML = p.texto;
  b.querySelector('[data-t="voltar"]').hidden = t.i === 0;
  b.querySelector('[data-t="prox"]').textContent = t.i === t.passos.length - 1 ? 'Começar' : 'Próximo';
  t.el.dataset.passo = t.i;
  requestAnimationFrame(reposicionar);
}
function reposicionar() {
  const t = tourAtivo; if (!t) return;
  const p = t.passos[t.i]; const alvo = document.querySelector(p.alvo);
  const furo = t.el.querySelector('.tour-furo'), b = t.el.querySelector('.tour-balao');
  const W = innerWidth, H = innerHeight;
  b.style.left = b.style.top = ''; b.classList.remove('cima', 'baixo', 'centro');
  if (!visivel(alvo)) { furo.style.cssText = 'left:50%;top:50%;width:0;height:0'; b.classList.add('centro'); return; }
  alvo.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  const r = alvo.getBoundingClientRect(); const m = 6;
  const x0 = Math.max(2, r.left - m), y0 = Math.max(2, r.top - m), x1 = Math.min(W - 2, r.right + m), y1 = Math.min(H - 2, r.bottom + m);
  furo.style.cssText = `left:${x0}px;top:${y0}px;width:${x1 - x0}px;height:${y1 - y0}px`;
  const bw = b.offsetWidth, bh = b.offsetHeight;
  let top, cls;
  if (y1 + 14 + bh < H) { top = y1 + 14; cls = 'baixo'; }
  else if (y0 - 14 - bh > 0) { top = y0 - 14 - bh; cls = 'cima'; }
  else { top = Math.max(8, Math.min(H - bh - 8, (y0 + y1) / 2 - bh / 2)); cls = 'centro-alvo'; }
  const left = Math.max(8, Math.min(W - bw - 8, (x0 + x1) / 2 - bw / 2));
  b.style.left = left + 'px'; b.style.top = top + 'px'; b.classList.add(cls);
  b.style.setProperty('--seta', Math.max(16, Math.min(bw - 16, (x0 + x1) / 2 - left)) + 'px');
}
export function fecharTour(silencioso = false, pulado = false) {
  const t = tourAtivo; if (!t) return;
  t.el.remove(); tourAtivo = null; window.removeEventListener('resize', reposicionar);
  if (!silencioso) t.opts.aoFim?.(pulado);
}

// ===================== DICAS CONTEXTUAIS (só Iniciante) =====================
// Cada dica aparece uma vez por navegador (localStorage). Um balão por vez, sem bloquear a mesa.
function vistas() { try { return JSON.parse(localStorage.getItem(K_DICAS) || '{}'); } catch (_) { return {}; } }
export function dicaVista(chave) { return !!vistas()[chave]; }
function marcar(chave) { try { const v = vistas(); v[chave] = Date.now(); localStorage.setItem(K_DICAS, JSON.stringify(v)); } catch (_) {} }
let dicaAtual = null;
export const dicaAberta = () => dicaAtual?.chave || null;
export function mostrarDica(chave, alvoSel, titulo, texto) {
  if (nivelExp() !== 'iniciante' && nivelExp() !== null) return false;
  if (dicaVista(chave) || tourAtivo || (dicaAtual && dicaAtual.chave === chave)) return false;
  fecharDica();
  marcar(chave);
  const el = document.createElement('div'); el.className = 'dica-ctx'; el.dataset.chave = chave; el.setAttribute('role', 'status');
  el.innerHTML = `<b>${esc(titulo)}</b><p>${texto}</p><button class="bt bt-mini bt-claro">Entendi</button>`;
  document.body.appendChild(el);
  el.querySelector('button').onclick = fecharDica;
  const alvo = alvoSel ? document.querySelector(alvoSel) : null;
  const pos = () => {
    if (!el.isConnected) return;
    const W = innerWidth, H = innerHeight, bw = el.offsetWidth, bh = el.offsetHeight;
    if (alvo && visivel(alvo)) {
      const r = alvo.getBoundingClientRect();
      let top = r.bottom + 12 + bh < H ? r.bottom + 12 : Math.max(8, r.top - 12 - bh);
      el.style.top = top + 'px'; el.style.left = Math.max(8, Math.min(W - bw - 8, r.left + r.width / 2 - bw / 2)) + 'px';
      alvo.classList.add('alvo-dica'); dicaAtual.alvo = alvo;
    } else { el.style.top = Math.round(H * 0.3) + 'px'; el.style.left = Math.max(8, W / 2 - bw / 2) + 'px'; }
  };
  dicaAtual = { chave, el, alvo: null, t: setTimeout(fecharDica, 16000) };
  requestAnimationFrame(pos);
  return true;
}
export function fecharDica() {
  if (!dicaAtual) return; clearTimeout(dicaAtual.t); dicaAtual.el.remove(); dicaAtual.alvo?.classList.remove('alvo-dica'); dicaAtual = null;
}
