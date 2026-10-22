// SUSSURROS · interface da mesa (tela inicial, painéis, modais, noite, dado).
import { DADOS } from './dados.js';
import { nivelDe } from './motor.js';
import { SessaoHost, SessaoCliente, salaSalva } from './sessao.js';
import { normalizarCodigo } from './rede.js';
import { Mapa } from './mapa.js';
import { $, $$, esc, aviso, copiar, hora } from './util.js';
import * as TUT from './tutorial.js';

let S = null;          // sessão (host ou convidado)
let V = null;          // última visão recebida
let mapa = null;
const visto = { dado: 0, dadoPriv: 0, destaque: 0, log: 0, noite: 0, discos: false, primeira: true, show: 0, eraMinha: false, tour: false, pedagio: null };
let gastosAberto = true;
let abaAtual = 'mao';

const carta = (cid) => DADOS.cartas[cid];
const nomeHosp = (h) => h == null ? null : DADOS.hospedes[h].nome;
const PALHACO = { id: 'palhaco', apelido: 'o Palhaço', hospede: null };
const jogador = (id) => id === 'palhaco' ? PALHACO : V?.jogadores.find(j => j.id === id);
const rotulo = (j) => j === PALHACO ? '<b>o Palhaço</b>' : j ? (j.hospede != null ? `${esc(j.apelido)} <small>(${esc(nomeHosp(j.hospede))})</small>` : esc(j.apelido)) : '?';
const rotuloTxt = (j) => j === PALHACO ? 'o Palhaço' : j ? (j.hospede != null ? `${j.apelido} (${nomeHosp(j.hospede)})` : j.apelido) : '?';
const salaDe = (p) => { if (!p) return null; for (const s of DADOS.mansao.salas) if (p.x >= s.x0 && p.x <= s.x1 && p.y >= s.y0 && p.y <= s.y1) return s.nome; return null; };

async function enviar(a, ok) {
  if (!S) return;
  const r = await S.enviar(a);
  if (!r.ok) aviso(r.erro || 'Não deu.', 'erro'); else if (r.aviso) avisoForaDaVez(r.aviso); else if (ok) aviso(ok);
  return r;
}

// ===================== TELA INICIAL =====================
function initInicio() {
  const ap = localStorage.getItem('sussurros-apelido'); if (ap) $('#in-apelido').value = ap;
  const hash = normalizarCodigo(location.hash.slice(1));
  if (hash) { $('#in-codigo').value = hash; $('#bt-entrar').classList.add('pulsa'); }
  const salvo = salaSalva(); if (salvo) { $('#bt-retomar').hidden = false; $('#bt-retomar').textContent = `Retomar sala ${salvo.codigo}`; }
  $('#in-codigo').addEventListener('input', (e) => { e.target.value = normalizarCodigo(e.target.value); });
  $('#bt-criar').onclick = () => comecar('host');
  $('#bt-retomar').onclick = () => comecar('retomar');
  $('#bt-entrar').onclick = () => comecar('cliente');
  $('#bt-ajuda-inicio').onclick = () => abrirComoJogar();
  $('#in-codigo').addEventListener('keydown', (e) => { if (e.key === 'Enter') comecar('cliente'); });
}

async function comecar(modo) {
  const apelido = $('#in-apelido').value.trim();
  if (!apelido) { $('#msg-inicio').textContent = 'Escolha um apelido primeiro.'; $('#in-apelido').focus(); return; }
  localStorage.setItem('sussurros-apelido', apelido);
  const msg = $('#msg-inicio'); $$('#tela-inicio button').forEach(b => b.disabled = true);
  const cb = { aoVisao: receberVisao, aoPos: (m) => mapa?.moverRemoto(m.alvo, m.x, m.y), aoAviso: aviso };
  try {
    if (modo === 'cliente') {
      const codigo = normalizarCodigo($('#in-codigo').value);
      if (codigo.length !== 5) throw new Error('O código tem 5 letras/números.');
      msg.textContent = 'Procurando a sala...';
      S = new SessaoCliente({ codigo, apelido, ...cb,
        aoConexao: (s) => { if (s === 'caiu') aviso('Conexão com o host caiu. Tentando voltar...', 'erro'); if (s === 'voltou') aviso('Conectado de novo.'); if (s === 'perdido') aviso('Não consegui voltar. Recarregue a página.', 'erro'); },
        aoExpulso: () => { alert('O host tirou você da mesa.'); location.href = location.pathname; } });
    } else {
      msg.textContent = 'Abrindo a sala no servidor de sinalização...';
      S = new SessaoHost({ apelido, moderador: $('#in-moderador').checked, salvo: modo === 'retomar' ? salaSalva() : null, ...cb });
    }
    $('#tela-mesa').hidden = false; // o mapa precisa de tamanho para se ajustar
    if (!mapa) mapa = new Mapa($('#mapa'), $('#mundo'), { aoSoltarPeao, aoTocarPeao, aoTocarFicha });
    await S.iniciar();
    $('#tela-inicio').hidden = true;
    history.replaceState(null, '', '#' + S.codigo);
    $('#txt-codigo').textContent = S.codigo; $('#lb-codigo').textContent = S.codigo;
    document.body.classList.toggle('sou-host', S.ehHost);
    mapa.ajustar();
    if (S.ehHost) aviso('Sala criada! Copie o link de convite e mande no Discord.');
  } catch (err) {
    console.error(err); S = null; $('#tela-mesa').hidden = true;
    msg.textContent = err.message || String(err);
    $$('#tela-inicio button').forEach(b => b.disabled = false);
  }
}

// ===================== MESA =====================
function initMesa() {
  $$('.abas button').forEach(b => b.onclick = () => trocarAba(b.dataset.aba));
  const convidar = async () => { if (await copiar(S.linkConvite())) aviso('Link de convite copiado: ' + S.linkConvite()); else prompt('Copie o link:', S.linkConvite()); };
  $('#bt-sala').onclick = convidar; $('#lb-copiar').onclick = convidar; $('#mn-convite').onclick = () => { fecharMenu(); convidar(); };
  $('#bt-rel-mais').onclick = () => enviar({ t: 'relogio', delta: 1 });
  $('#bt-rel-menos').onclick = () => enviar({ t: 'relogio', delta: -1 });
  $('#bt-dado').onclick = () => enviar({ t: 'dado', escondido: false });
  $('#bt-dado-esc').onclick = () => enviar({ t: 'dado', escondido: true });
  $('#bt-noite').onclick = () => { if (confirm('Chamar a Noite para todos? (os Tomados recebem em segredo 1 carta de Sanidade 10%)')) enviar({ t: 'noite' }); };
  $('#bt-amanhecer').onclick = () => enviar({ t: 'amanhecer' });
  $('#bt-menu').onclick = (e) => { e.stopPropagation(); $('#menu').hidden = !$('#menu').hidden; };
  document.addEventListener('click', (e) => { if (!e.target.closest('#menu')) fecharMenu(); });
  $('#mn-iniciar').onclick = () => { fecharMenu(); enviar({ t: 'iniciar' }); };
  $('#lb-iniciar').onclick = () => enviar({ t: 'iniciar' });
  $('#lb-assistir').onclick = () => enviar({ t: 'hospede', h: null });
  $('#mn-abrir').onclick = () => { fecharMenu(); if (confirm('Abrir os Discos de TODOS? Isso revela a sanidade e quem estava Tomado. É o fim da partida.')) enviar({ t: 'abrirDiscos' }); };
  $('#mn-voltar').onclick = () => { fecharMenu(); enviar({ t: 'voltarPartida' }); };
  $('#mn-nova').onclick = () => { fecharMenu(); if (confirm('Começar uma partida nova? Tudo volta ao começo.')) enviar({ t: 'novaPartida' }); };
  $('#mn-amanhecer').onclick = () => { fecharMenu(); enviar({ t: 'amanhecer', forcar: true }); };
  $('#mn-regras').onclick = () => { fecharMenu(); abrirComoJogar(); };
  $('#bt-ajuda').onclick = () => abrirComoJogar();
  $('#mn-tour').onclick = () => { fecharMenu(); iniciarTour(TUT.TOUR_COMPLETO); };
  $('#mn-nivel').onclick = () => { fecharMenu(); modalNivel(); };
  $('#lb-ordem').onchange = (e) => enviar({ t: 'ordemTurnos', embaralhar: e.target.checked });
  atualizarNivelMenu();
  $('#mn-sair').onclick = () => { fecharMenu(); if (confirm(S.ehHost ? 'Se o host sai, a sala fecha para todos (o estado fica salvo neste navegador para retomar). Sair?' : 'Sair da mesa?')) { S.sair(); location.href = location.pathname; } };
  $('#zm-mais').onclick = () => mapa.zoom(1.3); $('#zm-menos').onclick = () => mapa.zoom(1 / 1.3); $('#zm-ajustar').onclick = () => mapa.ajustar();
  $('#modal-fechar').onclick = fecharModal;
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') fecharModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharModal(); });
}
function fecharMenu() { $('#menu').hidden = true; }
function trocarAba(a) {
  abaAtual = a;
  $$('.abas button').forEach(b => b.classList.toggle('ativa', b.dataset.aba === a));
  $$('.pagina').forEach(p => p.classList.toggle('ativa', p.dataset.pagina === a));
  if (a === 'log' && V) { visto.log = V.log.at(-1)?.n || 0; $('#n-log').textContent = ''; }
}

function aoSoltarPeao(alvo, x, y, final) { if (!S) return; S.enviar({ t: 'mover', alvo: alvo === 'palhaco' ? 'palhaco' : undefined, x: Math.round(x), y: Math.round(y), final }).then(r => { if (!r.ok && final) aviso(r.erro, 'erro'); else if (r.aviso) avisoForaDaVez(r.aviso); }); }
function avisoForaDaVez(txt) {
  aviso('Fora da vez · ' + txt, 'leve');
  piscar('#faixa-vez');
  if (TUT.mostrarDica('fora-vez', '#faixa-vez', 'Calma, ainda não é a sua vez', 'Fora da vez você pode sussurrar Dicas e conversar à vontade. Comprar e mover é na sua vez: a mesa deixa, mas marca "fora da vez" no log para todos.')) {}
}

// ===================== RECEBER VISÃO =====================
function receberVisao(v) {
  const ant = V; V = v;
  receberShows(v);
  document.body.classList.toggle('fase-lobby', v.fase === 'lobby');
  document.body.classList.toggle('sou-host', !!v.eu?.ehHost);
  mapa?.atualizar(v);
  renderRelogio(v); renderLobby(v); renderMao(v); renderDisco(v); renderMesa(v); renderLog(v); renderNoite(v); renderProposta(v); renderFaixa(v);
  $$('.peao').forEach(el => el.classList.toggle('vez', v.fase === 'jogo' && el.dataset.alvo === v.turno?.daVez));
  $('#bt-noite').disabled = v.fase !== 'jogo'; $('#bt-rel-mais').disabled = $('#bt-rel-menos').disabled = v.fase !== 'jogo';
  $('#bt-rel-mais').hidden = $('#bt-rel-menos').hidden = !v.eu?.ehHost;
  if (!visto.primeira && ant) mudancas(ant, v);
  tutorial(v);
  $('#mn-iniciar').hidden = v.fase !== 'lobby'; $('#mn-abrir').hidden = v.fase !== 'jogo'; $('#mn-voltar').hidden = v.fase !== 'fim';
  $('#mn-amanhecer').hidden = !v.noite.ativa;
  const minha = v.eu?.hospede != null ? jogador(v.eu.id)?.pos : null;
  $('#sala-atual').textContent = minha ? `Você está em: ${salaDe(minha) || 'fora da planta'}` : (v.fase === 'lobby' ? '' : 'Você está assistindo');
  // eventos que pedem destaque
  if (!visto.primeira) {
    if (v.dado && v.dado.seq > visto.dado) mostrarDado(v.dado.face, `${rotuloTxt(jogador(v.dado.por))} rolou o Dado do Olho`, false);
    if (v.eu?.dadoPrivado && v.eu.dadoPrivado.seq > visto.dadoPriv) mostrarDado(v.eu.dadoPrivado.face, 'Dado escondido: só você vê', true);
    if (v.destaque && v.destaque.seq > visto.destaque && v.destaque.por !== v.eu?.id && v.destaque.por !== 'palhaco') mostrarDestaque(v.destaque);
    if (v.discosAbertos && !visto.discos) modalDiscos();
  }
  visto.dado = v.dado?.seq || 0; visto.dadoPriv = v.eu?.dadoPrivado?.seq || 0; visto.destaque = v.destaque?.seq || 0; visto.discos = v.discosAbertos;
  // log não lido
  const ult = v.log.at(-1)?.n || 0;
  if (abaAtual === 'log' || visto.primeira) visto.log = ult;
  const novos = v.log.filter(l => l.n > visto.log).length; $('#n-log').textContent = novos ? novos : '';
  visto.primeira = false;
  if (modalAberto?.atualizar) modalAberto.atualizar();
}

// ===================== RELÓGIO =====================
function renderRelogio(v) {
  let h = '';
  for (let i = 1; i <= 12; i++) h += `<span class="casa ${i === v.relogio ? 'atual' : ''} ${i === 12 ? 'ultima' : ''}">${i === v.relogio ? `<img src="${DADOS.relogioMarcador}" alt="">` : ''}<b>${i}</b></span>`;
  if (v.relogio > 12) h += `<span class="casa fim atual">FIM</span>`;
  $('#relogio').innerHTML = h; $('#relogio').title = `Rodada ${v.relogio > 12 ? 'além da 12: o Apresentador vence' : v.relogio}`;
}

// ===================== LOBBY =====================
function gradeHospedes(v, comBotoes = true) {
  return DADOS.hospedes.map((h, i) => {
    const dono = v.jogadores.find(j => j.hospede === i); const meu = v.eu?.hospede === i;
    return `<button class="hosp ${meu ? 'meu' : ''} ${dono && !meu ? 'ocupado' : ''}" data-h="${i}" ${dono && !meu || !comBotoes ? 'disabled' : ''}>
      <img src="${h.frente}" alt="${esc(h.nome)}" loading="lazy">
      <span class="hosp-nome">${esc(h.nome)}</span>
      <span class="hosp-dono">${dono ? (meu ? 'você' : esc(dono.apelido)) : 'livre'}</span></button>`;
  }).join('');
}
function renderLobby(v) {
  const lb = $('#lobby'); lb.hidden = v.fase !== 'lobby'; if (lb.hidden) return;
  const souMod = v.moderador && v.eu?.ehHost;
  $('#lb-hospedes').innerHTML = souMod ? '<p class="nota">Você é o moderador: não escolhe Hóspede. Espere todos escolherem e inicie.</p>' : gradeHospedes(v);
  $$('#lb-hospedes .hosp').forEach(b => b.onclick = () => enviar({ t: 'hospede', h: Number(b.dataset.h) }));
  $('#lb-jogadores').innerHTML = v.jogadores.map(j => `<span class="chip ${j.conectado ? '' : 'off'}">${j.ehHost ? '★ ' : ''}${esc(j.apelido)}${j.hospede != null ? ' · ' + esc(nomeHosp(j.hospede)) : (j.ehHost && v.moderador ? ' · moderador' : ' · escolhendo')}</span>`).join('');
  const n = v.jogadores.filter(j => j.hospede != null).length;
  $('#lb-iniciar').hidden = !v.eu?.ehHost; $('#lb-assistir').hidden = souMod;
  $('#lb-iniciar').textContent = `Iniciar partida (${n} Hóspede${n === 1 ? '' : 's'})`;
  $('#lb-espera').textContent = v.eu?.ehHost ? (n < 3 ? 'A regra pede 3 a 6 jogadores (dá para testar com menos).' : '') : 'Esperando o host iniciar a partida...';
  $('#lb-ordem-rot').hidden = !v.eu?.ehHost; $('#lb-ordem').checked = !!v.turnoAleatorio;
  renderNivelLobby();
}
function renderNivelLobby() {
  const atual = TUT.nivelExp();
  $('#lb-nivel').innerHTML = TUT.htmlEscolhaNivel(atual) + (atual ? '' : '<p class="nota">Escolha um. Se não escolher, a mesa trata você como Iniciante.</p>');
  $$('#lb-nivel [data-nivel]').forEach(b => b.onclick = () => { TUT.definirNivelExp(b.dataset.nivel); renderNivelLobby(); atualizarNivelMenu(); });
}
function atualizarNivelMenu() { $('#mn-nivel-txt').textContent = TUT.NIVEIS_EXP[TUT.nivelExp() || 'iniciante'].nome; }

// ===================== MÃO =====================
function imgCarta(cid, extra = '') { const c = carta(cid); return `<img class="carta ${extra}" src="${c.img}" alt="${esc(c.nome)}" loading="lazy">`; }
function renderMao(v) {
  const pg = $('#pg-mao'); const eu = v.eu;
  $('#n-mao').textContent = eu?.mao?.length || '';
  if (!eu || eu.hospede == null) {
    pg.innerHTML = `<div class="vazio"><p>Você está <b>assistindo</b>.</p>${v.fase === 'jogo' && !(v.moderador && eu?.ehHost) ? `<p>Para jogar, escolha um Hóspede livre:</p><div class="grade-hospedes mini">${gradeHospedes(v)}</div>` : ''}</div>`;
    $$('#pg-mao .hosp').forEach(b => b.onclick = () => enviar({ t: 'hospede', h: Number(b.dataset.h) }));
    return;
  }
  const h = DADOS.hospedes[eu.hospede]; const pub = jogador(eu.id) || {};
  const jogo = v.fase !== 'lobby';
  const compra = (b, rot) => { const bb = v.baralhos[b]; const n = bb ? bb.n : null; return `<button class="compra" data-b="${b}" ${jogo ? '' : 'disabled'}><img src="${DADOS.baralhos[b].verso}" alt=""><span>${rot}</span><small>${n == null ? (jogo ? '?' : '') : n}</small></button>`; };
  pg.innerHTML = `
    <div class="minha-ficha">
      <img class="ficha-img" src="${pub.habilidadeUsada ? h.verso : h.frente}" alt="${esc(h.nome)}" data-zoom="${pub.habilidadeUsada ? h.verso : h.frente}">
      <div>
        <h3>${esc(h.nome)}</h3>
        <p><b>Fobia:</b> ${esc(h.fobia)}</p>
        <p class="hab"><b>Habilidade (1x):</b> ${esc(h.habilidade)}</p>
        <div class="linha-bt">
          <button class="bt bt-mini ${pub.habilidadeUsada ? 'bt-claro' : 'bt-mostarda'}" id="m-hab" ${jogo ? '' : 'disabled'}>${pub.habilidadeUsada ? 'Desvirar ficha' : 'Usei a habilidade'}</button>
          <button class="bt bt-mini ${pub.corrente ? 'bt-vermelho' : 'bt-claro'}" id="m-corr" ${jogo ? '' : 'disabled'}>${pub.corrente ? 'Tirar Corrente' : 'Pôr Corrente (Laço)'}</button>
          <button class="bt bt-mini bt-claro" id="m-achar">Achar meu peão</button>
        </div>
      </div>
    </div>
    ${jogo ? `<h3 class="sec">Comprar</h3>
    <button class="bt bt-vermelho largo" id="m-nivel">Comprar Sanidade do meu nível (${eu.tomado ? '25%' : nivelDe(eu.sanidade) === 10 ? '25% · e compre um Pacto!' : nivelDe(eu.sanidade) + '%'})</button>
    <div class="compras">
      ${compra('evento', 'Evento')}${compra('dica', 'Dica')}${compra('distorcao', 'Distorção')}${compra('laco', 'Laço')}${compra('pacto', 'Pacto')}
    </div>
    <details class="niveis"><summary>Comprar de outro nível de Sanidade</summary>
      <div class="compras">${[100, 75, 50, 25, 10].map(n => compra('sanidade_' + n, n + '%')).join('')}</div>
    </details>` : '<p class="nota">As cartas aparecem quando o host iniciar a partida.</p>'}
    ${jogo ? `<details class="gastos" ${gastosAberto ? 'open' : ''}><summary>Seus últimos gastos <small>(só você vê)</small></summary>
      ${eu.gastos?.length ? `<ul>${eu.gastos.slice().reverse().slice(0, 6).map(g => `<li><time>${hora(g.t)}</time> ${esc(g.txt)}</li>`).join('')}</ul>` : '<p class="nota">Nada ainda. Comprar carta não custa sanidade nem moedas.</p>'}</details>` : ''}
    <h3 class="sec">Sua mão <small>(só você vê)</small></h3>
    <div class="cartas" id="m-mao">${eu.mao.length ? eu.mao.map(c => `<button class="carta-bt" data-c="${c}">${imgCarta(c)}${carta(c).baralho === 'dica' ? `<span class="selo ${carta(c).selo}">${carta(c).selo === 'branco' ? '☆ verdadeira' : '★ falsa'}</span>` : ''}</button>`).join('') : '<p class="nota">Mão vazia.</p>'}</div>
    ${eu.dicasRecebidas.length ? `<h3 class="sec">Dicas que você recebeu <small>(viradas para baixo)</small></h3>
    <div class="cartas">${eu.dicasRecebidas.map(d => `<div class="dica-rec"><img class="carta" src="${DADOS.baralhos.dica.verso}" alt="Dica virada"><small>de ${rotulo(jogador(d.de))}</small>
      <div class="linha-bt"><button class="bt bt-mini bt-turquesa" data-seguir="${d.ref}">Seguir</button><button class="bt bt-mini bt-claro" data-ignorar="${d.ref}">Ignorar</button></div></div>`).join('')}</div>` : ''}
    ${eu.fichasPegas.length || pub.frente?.length ? `<h3 class="sec">Na sua frente <small>(todos veem)</small></h3>
    <div class="cartas">${eu.fichasPegas.map(f => `<button class="ficha-pega" data-chave="${f}"><img src="${DADOS.fichas[f].img}" alt="Chave"></button>`).join('')}
      ${(pub.frente || []).map(c => `<button class="carta-bt" data-frente="${c}">${imgCarta(c)}</button>`).join('')}</div>` : ''}`;
  $$('#pg-mao .compra').forEach(b => b.onclick = async () => {
    const bar = b.dataset.b;
    if (bar === 'pacto' && !confirm('Comprar um Pacto em SEGREDO? Pela regra, só quem chegou a 10% ou menos. Você fica marcado como Tomado (só você sabe).')) return;
    comprarComFeedback({ t: 'comprar', baralho: bar }, b);
  });
  $('#m-nivel') && ($('#m-nivel').onclick = (ev) => comprarComFeedback({ t: 'comprarNivel' }, ev.currentTarget));
  const gd = $('#pg-mao details.gastos'); if (gd) gd.ontoggle = () => { gastosAberto = gd.open; };
  $('#m-hab').onclick = () => enviar({ t: 'habilidade', valor: !pub.habilidadeUsada });
  $('#m-corr').onclick = () => enviar({ t: 'corrente', valor: !pub.corrente });
  $('#m-achar').onclick = () => { if (pub.pos) mapa.focar(pub.pos.x, pub.pos.y, 0.5); };
  $$('#m-mao .carta-bt').forEach(b => b.onclick = () => modalCarta(b.dataset.c, 'mao'));
  $$('#pg-mao [data-frente]').forEach(b => b.onclick = () => modalCarta(b.dataset.frente, 'frente'));
  $$('#pg-mao [data-chave]').forEach(b => b.onclick = () => modalChave(b.dataset.chave));
  $$('#pg-mao [data-seguir]').forEach(b => b.onclick = () => { if (confirm('Seguir a Dica? Ela será revelada a todos (o selo diz se era verdadeira).')) enviar({ t: 'seguirDica', ref: b.dataset.seguir }); });
  $$('#pg-mao [data-ignorar]').forEach(b => b.onclick = () => enviar({ t: 'ignorarDica', ref: b.dataset.ignorar }, 'Dica descartada sem revelar.'));
  $$('#pg-mao [data-zoom]').forEach(i => i.onclick = () => modalImagem(i.dataset.zoom));
}

// ===================== DISCO =====================
function renderDisco(v) {
  const pg = $('#pg-disco'); const eu = v.eu;
  if (!eu || eu.hospede == null) { pg.innerHTML = '<div class="vazio"><p>Só quem joga com um Hóspede tem Disco de Sanidade.</p></div>'; return; }
  if (pg.querySelector('#d-faixa') && document.activeElement === pg.querySelector('#d-faixa')) return; // não atrapalha quem está arrastando
  const s = eu.sanidade, nv = nivelDe(s);
  const desc = { 100: 'jogo normal', 75: 'no fim do turno, compre 1 Distorção (máx. 1 na mão)', 50: 'no fim do turno, compre 1 Distorção (máx. 2 na mão)', 25: 'DELÍRIO: Dicas que você dá e Eventos que você lê passam pelo Dado (use o Dado escondido)', 10: 'TOMADO: compre um Pacto em segredo e jogue pelo Apresentador' }[nv];
  pg.innerHTML = `
    <p class="alerta">Só você vê esta aba. Cuidado ao compartilhar a tela no Discord.</p>
    <div class="disco">
      <img src="${DADOS.disco[s]}" alt="Disco ${s}%" class="disco-img">
      <div class="disco-ctrl">
        <div class="disco-valor">${s}<small>%</small></div>
        <div class="linha-bt">
          <button class="bt bt-mini bt-claro" data-d="-10">−10</button><button class="bt bt-mini bt-claro" data-d="-5">−5</button>
          <button class="bt bt-mini bt-claro" data-d="5">+5</button><button class="bt bt-mini bt-claro" data-d="10">+10</button><button class="bt bt-mini bt-claro" data-d="15">+15</button>
        </div>
        <input type="range" min="0" max="100" step="5" value="${s}" id="d-faixa" aria-label="Sanidade">
        <p class="nivel">Nível <b>${nv}%</b>${eu.tomado ? ' · <b class="tomado">TOMADO</b>' : ''}<br><small>${desc}</small></p>
        <label class="check"><input type="checkbox" id="d-tomado" ${eu.tomado ? 'checked' : ''}> Estou Tomado (marcado automaticamente ao comprar um Pacto)</label>
      </div>
    </div>
    <h3 class="sec">Fichas de Sala que você olhou</h3>
    ${Object.keys(eu.fichasConhecidas).length ? `<ul class="lista">${Object.entries(eu.fichasConhecidas).map(([sala, f]) => `<li><img src="${DADOS.fichas[f].img}" alt=""> ${esc(sala)}: <b>${DADOS.fichas[f].tipo}</b>${v.fichas[sala]?.estado !== 'oculta' ? ' <small>(já à vista)</small>' : ''}</li>`).join('')}</ul>` : '<p class="nota">Nenhuma ainda.</p>'}
    <h3 class="sec">Dicas que você deu</h3>
    ${eu.dicasDadas.length ? `<ul class="lista">${eu.dicasDadas.slice().reverse().map(d => `<li><img src="${carta(d.carta).img}" alt="" class="mini-carta"> "${esc(carta(d.carta).nome)}" <span class="selo ${carta(d.carta).selo}">${carta(d.carta).selo === 'branco' ? '☆ verdadeira' : '★ falsa'}</span> → ${rotulo(jogador(d.para))} <small>(${d.destino})</small></li>`).join('')}</ul>` : '<p class="nota">Nenhuma ainda.</p>'}`;
  const muda = (val) => enviar({ t: 'sanidade', valor: val });
  $$('#pg-disco [data-d]').forEach(b => b.onclick = () => muda(s + Number(b.dataset.d)));
  const f = $('#d-faixa');
  f.oninput = () => { pg.querySelector('.disco-valor').innerHTML = `${f.value}<small>%</small>`; pg.querySelector('.disco-img').src = DADOS.disco[f.value]; };
  f.onchange = () => { muda(Number(f.value)); f.blur(); };
  $('#d-tomado').onchange = (e) => { if (!e.target.checked && !confirm('Pela regra, um Tomado nunca volta a ser Lúcido. Desmarcar mesmo assim?')) { e.target.checked = true; return; } enviar({ t: 'tomado', valor: e.target.checked }); };
}

// ===================== MESA (jogadores, destaque, baralhos) =====================
function renderMesa(v) {
  const pg = $('#pg-mesa'); const d = v.destaque;
  const nivelBadge = (n) => n ? `<span class="nivel-badge n${n}" title="Última carta de Sanidade comprada">${n}%</span>` : '<span class="nivel-badge" title="Ainda não comprou Sanidade">—</span>';
  pg.innerHTML = `
    ${d ? `<div class="destaque"><button class="carta-bt" data-zoomc="${d.carta}">${imgCarta(d.carta)}</button><p>${d.motivo === 'seguiu' ? 'Dica seguida' : d.motivo === 'palhaco' ? 'Evento tirado pelo Palhaço' : 'Última carta revelada'}<br><b>${rotulo(jogador(d.por))}</b></p></div>` : ''}
    ${v.dado ? `<p class="ultimo-dado"><img src="${DADOS.dado[v.dado.face]}" alt=""><span>Último dado à vista: <b>${v.dado.face <= 2 ? 'olho ABERTO' : 'olho fechado'}</b> · ${rotulo(jogador(v.dado.por))}</span></p>` : ''}
    <h3 class="sec">Na mesa</h3>
    <div class="jogadores">${v.jogadores.map(j => {
      const h = j.hospede != null ? DADOS.hospedes[j.hospede] : null;
      return `<div class="jog ${j.conectado ? '' : 'off'} ${j.id === v.eu?.id ? 'eu' : ''}">
        <div class="jog-topo">${h ? `<img class="jog-peao" src="${h.peao}" alt="">` : '<span class="jog-peao vazio-peao">?</span>'}
          <div class="jog-nome"><b>${esc(j.apelido)}</b>${j.ehHost ? ' <small class="tag">host</small>' : ''}${j.id === v.eu?.id ? ' <small class="tag">você</small>' : ''}<br><small>${h ? esc(h.nome) + ' · ' + esc(salaDe(j.pos) || '?') : (j.ehHost && v.moderador ? 'moderador' : 'assistindo')}${j.conectado ? '' : ' · desconectado'}</small></div>
          ${h ? nivelBadge(j.ultimoNivel) : ''}</div>
        ${h ? `<div class="jog-info">
          ${v.pedagio ? `<span class="moedas" data-j="${j.id}" title="Moedas (à vista)">${j.moedas} moeda${j.moedas === 1 ? '' : 's'}</span>` : ''}
          <span title="Dicas na mão">${j.nDicasMao} Dica${j.nDicasMao === 1 ? '' : 's'} na mão</span>
          ${j.dicasRecebidas.length ? `<span title="Dicas recebidas, viradas para baixo">${j.dicasRecebidas.length} recebida${j.dicasRecebidas.length > 1 ? 's' : ''} (de ${j.dicasRecebidas.map(x => esc(jogador(x.de)?.apelido || '?')).join(', ')})</span>` : ''}
          ${j.chaves ? `<span class="chave">${j.chaves} Chave${j.chaves > 1 ? 's' : ''}</span>` : ''}
          ${j.corrente ? '<span class="preso">preso num Laço (Corrente)</span>' : ''}
          ${j.habilidadeUsada ? '<span>habilidade USADA</span>' : ''}
          ${j.disco ? `<span class="disco-aberto">Disco: <b>${j.disco.sanidade}%</b>${j.disco.tomado ? ' · TOMADO' : ''}</span>` : ''}
        </div>
        ${j.frente.length ? `<div class="jog-frente">${j.frente.map(c => `<button class="carta-bt" data-zoomc="${c}">${imgCarta(c, 'mini')}</button>`).join('')}</div>` : ''}
        <div class="linha-bt">
          ${j.id !== v.eu?.id && v.fase === 'jogo' && v.eu?.hospede != null && v.eu.mao.some(c => c.startsWith('dica/')) ? `<button class="bt bt-mini bt-turquesa" data-dar="${j.id}">Dar Dica</button>` : ''}
          ${j.id !== v.eu?.id && v.fase === 'jogo' ? `<button class="bt bt-mini bt-claro" data-corr="${j.id}" data-val="${!j.corrente}">${j.corrente ? 'Soltar do Laço' : 'Pôr Corrente'}</button>` : ''}
          ${j.pos ? `<button class="bt bt-mini bt-claro" data-achar="${j.id}">Ver no mapa</button>` : ''}
          ${v.eu?.ehHost && j.id !== v.eu.id ? `<button class="bt bt-mini bt-claro" data-expulsar="${j.id}">Tirar</button>` : ''}
        </div>` : (v.eu?.ehHost && j.id !== v.eu.id ? `<div class="linha-bt"><button class="bt bt-mini bt-claro" data-expulsar="${j.id}">Tirar</button></div>` : '')}
      </div>`;
    }).join('')}</div>
    ${v.turno ? `<h3 class="sec">Ordem dos turnos <small>(rodada ${v.relogio})</small></h3>
    <ol class="ordem-turnos">${v.turno.ordem.map((id, i) => { const j = jogador(id); return `<li class="${i === v.turno.vez ? 'vez' : i < v.turno.vez ? 'jogou' : ''}">${rotulo(j)}${i === v.turno.vez ? ' <small class="tag">na vez</small>' : i < v.turno.vez ? ' <small>já jogou</small>' : ''}</li>`; }).join('')}</ol>
    ${v.eu?.ehHost ? `<div class="linha-bt"><button class="bt bt-mini bt-claro" id="ot-sortear" ${v.turno.vez === 0 && !Object.values(v.turno.feito).some(Boolean) ? '' : 'disabled title="Só no começo da rodada"'}>Sortear ordem</button><button class="bt bt-mini bt-claro" id="ot-entrada" ${v.turno.vez === 0 && !Object.values(v.turno.feito).some(Boolean) ? '' : 'disabled'}>Ordem de entrada</button></div>` : ''}` : ''}
    <h3 class="sec">O Palhaço</h3>
    <div class="palhaco-ctrl">
      ${v.eu?.ehHost ? `<label class="check"><input type="checkbox" id="pc-auto" ${v.palhacoAuto ? 'checked' : ''}> <b>Palhaço automático</b> (anda sozinho no "+ Rodada", fala, tira Eventos, faz propostas)</label>
      <label class="check"><input type="checkbox" id="pc-pedagio" ${v.pedagio ? 'checked' : ''}> <b>Pedágio e moedas</b> (quem cruza com ele paga 1 moeda e é mandado para outro cômodo)</label>`
      : `<p>Palhaço automático: <b>${v.palhacoAuto ? 'ligado' : 'desligado'}</b> · Pedágio: <b>${v.pedagio ? 'ligado' : 'desligado'}</b> <small>(o host muda)</small></p>`}
    </div>
    <p class="nota">O <b>Palhaço</b> é o peão de anel branco. ${v.palhacoAuto ? 'No fim de cada rodada ele anda 1 ou 2 cômodos pelas portas, atrás de alguém.' : 'Modo manual: role o Dado e arraste.'} Qualquer um pode arrastá-lo; na Noite, os Tomados podem movê-lo 1 cômodo.</p>
    ${v.fase !== 'lobby' && Object.keys(v.baralhos).length ? `<h3 class="sec">Baralhos</h3><table class="baralhos"><tr><th>Baralho</th><th>Compra</th><th>Descarte</th></tr>
      ${Object.entries(v.baralhos).map(([b, x]) => `<tr><td>${DADOS.baralhos[b].rotulo}</td><td>${x.n ?? '?'}</td><td>${x.descarte ?? '?'}</td></tr>`).join('')}</table>
      <p class="nota">"?" = escondido de propósito (contar o Pacto e a Sanidade 10% revelaria os Tomados). Baralho vazio reembaralha o descarte sozinho.</p>` : ''}`;
  $$('#pg-mesa [data-zoomc]').forEach(b => b.onclick = () => modalCarta(b.dataset.zoomc, 'ver'));
  $('#ot-sortear') && ($('#ot-sortear').onclick = () => enviar({ t: 'ordemTurnos', embaralhar: true }));
  $('#ot-entrada') && ($('#ot-entrada').onclick = () => enviar({ t: 'ordemTurnos', embaralhar: false }));
  $('#pc-auto') && ($('#pc-auto').onchange = (e) => enviar({ t: 'palhacoConfig', auto: e.target.checked }));
  $('#pc-pedagio') && ($('#pc-pedagio').onchange = (e) => enviar({ t: 'palhacoConfig', pedagio: e.target.checked }));
  $$('#pg-mesa [data-dar]').forEach(b => b.onclick = () => modalDarDica(b.dataset.dar));
  $$('#pg-mesa [data-corr]').forEach(b => b.onclick = () => enviar({ t: 'corrente', alvo: b.dataset.corr, valor: b.dataset.val === 'true' }));
  $$('#pg-mesa [data-achar]').forEach(b => b.onclick = () => { const j = jogador(b.dataset.achar); if (j?.pos) mapa.focar(j.pos.x, j.pos.y, 0.5); });
  $$('#pg-mesa [data-expulsar]').forEach(b => b.onclick = () => { if (confirm('Tirar este jogador da mesa? As cartas dele vão para o descarte.')) enviar({ t: 'expulsar', alvo: b.dataset.expulsar }); });
}

// ===================== LOG =====================
function renderLog(v) {
  $('#pg-log').innerHTML = `<ol class="log">${v.log.slice().reverse().map(l => `<li class="${l.privado ? 'privado' : ''}"><time>${hora(l.t)}</time> ${l.privado ? '<span class="tag">só você</span> ' : ''}${esc(l.texto)}</li>`).join('')}</ol>`;
}

// ===================== NOITE =====================
function renderNoite(v) {
  const el = $('#noite'); const n = v.noite;
  el.hidden = !n.ativa; el.classList.toggle('ouvinte', n.ouvinte);
  if (!n.ativa) { clearInterval(renderNoite._t); return; }
  $('#noite-texto').innerHTML = n.ouvinte
    ? '<b>"Quem me ouve, abra os olhos."</b><br>Você ouve. Recebeu em segredo 1 carta de <b>Sanidade 10%</b> (está na sua mão). Se quiser, arraste o <b>Palhaço</b> 1 cômodo agora.'
    : 'Todos fecham os olhos.<br><i>"Quem me ouve, abra os olhos."</i>';
  const fim = Date.now() + Math.max(0, 7000 - n.desde);
  const bt = $('#bt-amanhecer');
  clearInterval(renderNoite._t);
  const tic = () => { const r = Math.ceil((fim - Date.now()) / 1000); bt.disabled = r > 0; bt.textContent = r > 0 ? `Amanhecer (${r})` : 'Amanhecer'; if (r <= 0) clearInterval(renderNoite._t); };
  tic(); renderNoite._t = setInterval(tic, 500);
}


// ===================== PALHAÇO COM IA: shows (fala + sino, peão deslizando, dado, clipe, Evento) =====================
const filaShow = []; let tocandoShow = false;
const espera = (ms) => new Promise(r => setTimeout(r, ms));
function receberShows(v) {
  const shows = v.shows || [];
  if (visto.primeira) { visto.show = shows.at(-1)?.seq || 0; return; }   // quem acabou de entrar não revê o passado
  for (const sh of shows) {
    if (sh.seq <= visto.show) continue;
    visto.show = sh.seq;
    for (const p of sh.passos) { filaShow.push(p); if (p.t === 'mov') mapa?.reservar('palhaco', p.pegos || []); }
  }
  if (!tocandoShow && filaShow.length) tocarFila();
}
async function tocarFila() {
  tocandoShow = true;
  while (filaShow.length) {
    const p = filaShow.shift();
    try {
      if (p.t === 'fala') { mostrarFala(p.texto); tocarSino(); await espera(2200 + p.texto.length * 30); }
      else if (p.t === 'mov') { await mapa.animar('palhaco', p.caminho, p.pegos || []); }
      else if (p.t === 'dado') { mostrarDado(p.face, p.txt, false); await espera(1900); }
      else if (p.t === 'video') { await tocarClipe(p.clipe); }
      else if (p.t === 'evento') { mostrarEventoPalhaco(p.carta); await espera(900); }
    } catch (err) { console.warn('[palhaço] passo falhou', err); }
  }
  esconderFala();
  tocandoShow = false;
}
function mostrarFala(txt) {
  const el = $('#palhaco-fala'); $('#palhaco-fala-txt').textContent = txt;
  el.hidden = false; el.classList.remove('entra'); void el.offsetWidth; el.classList.add('entra');
  clearTimeout(mostrarFala._t); mostrarFala._t = setTimeout(esconderFala, 2400 + txt.length * 30);
}
function esconderFala() { $('#palhaco-fala').hidden = true; }

// Sino sintetizado (WebAudio): mesmo timbre do vídeo explicativo (parciais 1, 2, 2.76, 5.4, 8.93).
let audio = null;
function ctxAudio() {
  if (!audio) { try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { return null; } }
  if (audio.state === 'suspended') audio.resume().catch(() => {});
  return audio;
}
['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, () => ctxAudio(), { once: false, passive: true }));
function tocarSino(vezes = 2) {
  const a = ctxAudio(); if (!a || a.state !== 'running') return;
  const mestre = a.createGain(); mestre.gain.value = 0.18; mestre.connect(a.destination);
  for (let k = 0; k < vezes; k++) {
    const t0 = a.currentTime + k * 0.32, f = k % 2 ? 1180 : 1320;
    for (const [h, amp, dk] of [[1, 1, 3], [2, 0.5, 4], [2.76, 0.45, 5], [5.4, 0.25, 8], [8.93, 0.12, 12]]) {
      const o = a.createOscillator(), g = a.createGain();
      o.type = 'sine'; o.frequency.value = f * h;
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(amp, t0 + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 4 / dk);
      o.connect(g); g.connect(mestre); o.start(t0); o.stop(t0 + 4 / dk + 0.05);
    }
  }
}

// Clipe curto do Palhaço em sobreposição (cada um pode pular o seu).
function tocarClipe(nome) {
  return new Promise((fim) => {
    const el = $('#clipe'); const vd = $('#clipe-video');
    let feito = false;
    const acaba = () => { if (feito) return; feito = true; clearTimeout(t); vd.pause(); el.hidden = true; vd.removeAttribute('src'); vd.innerHTML = ''; vd.load(); fim(); };
    vd.innerHTML = `<source src="assets/palhaco/clipes/${nome}.webm" type="video/webm"><source src="assets/palhaco/clipes/${nome}.mp4" type="video/mp4">`;
    vd.muted = true; vd.playsInline = true; el.hidden = false; el.dataset.clipe = nome;
    vd.onended = acaba; vd.onerror = acaba;
    $('#clipe-pular').onclick = acaba;
    const t = setTimeout(acaba, 8000);
    vd.load(); const pr = vd.play(); if (pr) pr.catch(() => {});
    tocarSino(1);
  });
}
function mostrarEventoPalhaco(cid) {
  if (modalAberto && !modalAberto.auto) { aviso('O Palhaço revelou um Evento: ' + carta(cid).nome + ' (aba Mesa).'); return; }
  const c = carta(cid);
  abrirModal(`<p class="modal-sobre"><b>O Palhaço</b> tirou um Evento e revelou a todos:</p>
    <img class="carta grande" src="${c.img}" alt="${esc(c.nome)}">
    <p class="modal-nome">${esc(c.nome)} <small>· Evento</small></p><p class="nota">Leiam em voz alta e apliquem.</p>`, null, { auto: true });
}

// Proposta privada: só o jogador escolhido recebe (v.eu.proposta) e vê Aceitar / Recusar.
function renderProposta(v) {
  const el = $('#proposta'); const p = v.eu?.proposta;
  if (!p) { el.hidden = true; el.dataset.ref = ''; return; }
  if (el.dataset.ref === p.ref && !el.hidden) return;
  el.dataset.ref = p.ref; $('#proposta-txt').textContent = `"${p.texto}"`; el.hidden = false;
  if (!visto.primeira) tocarSino(1);
  const responder = async (aceitar) => {
    $('#proposta-sim').disabled = $('#proposta-nao').disabled = true;
    const r = await S.enviar({ t: 'respostaProposta', ref: p.ref, aceitar });
    $('#proposta-sim').disabled = $('#proposta-nao').disabled = false;
    if (!r.ok) aviso(r.erro || 'Não deu.', 'erro'); else { el.hidden = true; aviso(r.msg || (aceitar ? 'Aceito.' : 'Recusado.')); }
  };
  $('#proposta-sim').onclick = () => responder(true);
  $('#proposta-nao').onclick = () => responder(false);
}

// ===================== DADO / DESTAQUE =====================
function mostrarDado(face, txt, privado) {
  const el = $('#dado-pop'); el.hidden = false; el.classList.toggle('privado', privado); el.classList.remove('rola'); void el.offsetWidth; el.classList.add('rola');
  let k = 0; const im = $('#dado-img');
  const t = setInterval(() => { im.src = DADOS.dado[(k++ % 6) + 1]; }, 70);
  $('#dado-txt').textContent = txt;
  setTimeout(() => { clearInterval(t); im.src = DADOS.dado[face]; $('#dado-txt').innerHTML = `${esc(txt)}<br><b>${face <= 2 ? 'OLHO ABERTO' : 'olho fechado'}</b>`; }, 700);
  clearTimeout(mostrarDado._h); mostrarDado._h = setTimeout(() => { el.hidden = true; }, 3600);
}
function mostrarDestaque(d) {
  if (modalAberto && !modalAberto.auto) return;
  const c = carta(d.carta);
  abrirModal(`<p class="modal-sobre">${d.motivo === 'seguiu' ? 'Dica seguida e revelada por' : 'Carta revelada por'} <b>${rotulo(jogador(d.por))}</b></p>
    <img class="carta grande" src="${c.img}" alt="${esc(c.nome)}">
    <p class="modal-nome">${esc(c.nome)} <small>· ${DADOS.baralhos[c.baralho].rotulo}</small>${c.selo ? ` <span class="selo ${c.selo}">${c.selo === 'branco' ? '☆ verdadeira' : '★ falsa'}</span>` : ''}</p>`, null, { auto: true });
}

// ===================== MODAIS =====================
let modalAberto = null;
function abrirModal(html, ligar, opts = {}) {
  $('#modal-corpo').innerHTML = html; $('#modal').hidden = false; $('#modal').classList.remove('largo'); modalAberto = { ...opts };
  if (ligar) ligar($('#modal-corpo'));
}
function fecharModal() { $('#modal').hidden = true; $('#modal').classList.remove('largo'); modalAberto = null; }
function modalImagem(src) { abrirModal(`<img class="carta grande" src="${src}" alt="">`); }

function modalCarta(cid, origem, recem = false) {
  const c = carta(cid); const ehDica = c.baralho === 'dica';
  const outros = V.jogadores.filter(j => j.hospede != null && j.id !== V.eu?.id);
  const secreta = ['pacto', 'sanidade_10'].includes(c.baralho);
  let acoes = '';
  if (origem === 'mao') {
    acoes = `<div class="linha-bt col">
      ${ehDica ? `<label class="campo">Dar esta Dica (virada para baixo) a:<select id="mc-para">${outros.map(j => `<option value="${j.id}">${esc(rotuloTxt(j))}</option>`).join('')}</select></label>
        <button class="bt bt-turquesa" id="mc-dar" ${outros.length ? '' : 'disabled'}>Dar Dica</button>` : ''}
      <button class="bt bt-vermelho" id="mc-revelar">Revelar / jogar para todos</button>
      <button class="bt bt-claro" id="mc-descartar">Descartar sem mostrar</button>
      <button class="bt bt-claro" id="mc-guardar">Guardar na mão</button></div>
      ${secreta ? '<p class="nota">Esta carta é secreta: revelar mostra a todos.</p>' : ''}
      ${c.baralho.startsWith('sanidade') ? '<p class="nota">Carta de Sanidade: role o Dado (olho fechado = alternativa de cima; aberto = de baixo), leia, aplique e descarte.</p>' : ''}
      ${c.baralho === 'evento' ? '<p class="nota">Evento: leia em voz alta e descarte. Em Delírio, role o Dado escondido: olho aberto = texto invertido. Ninguém vê qual versão você leu.</p>' : ''}`;
  } else if (origem === 'frente') acoes = `<div class="linha-bt"><button class="bt bt-claro" id="mc-desc-frente">Descartar da mesa</button></div>`;
  abrirModal(`${recem ? `<p class="modal-sobre">Você comprou (só você vê):</p>` : ''}
    <img class="carta grande" src="${c.img}" alt="${esc(c.nome)}">
    <p class="modal-nome">${esc(c.nome)} <small>· ${DADOS.baralhos[c.baralho].rotulo}</small>${ehDica && origem !== 'ver' ? ` <span class="selo ${c.selo}">${c.selo === 'branco' ? '☆ selo branco: verdadeira' : '★ selo preto: falsa'}</span>` : ''}${ehDica && origem === 'ver' ? ` <span class="selo ${c.selo}">${c.selo === 'branco' ? '☆ verdadeira' : '★ falsa'}</span>` : ''}</p>${acoes}`, (m) => {
    const q = (s) => m.querySelector(s);
    q('#mc-dar') && (q('#mc-dar').onclick = async () => { const r = await enviar({ t: 'darDica', carta: cid, para: q('#mc-para').value }, 'Dica entregue virada para baixo. Agora diga o que ela "diz".'); if (r?.ok) fecharModal(); });
    q('#mc-revelar') && (q('#mc-revelar').onclick = async () => { if (secreta && !confirm('Revelar uma carta secreta a todos?')) return; const r = await enviar({ t: 'revelar', carta: cid }); if (r?.ok) fecharModal(); });
    q('#mc-descartar') && (q('#mc-descartar').onclick = async () => { const r = await enviar({ t: 'descartar', carta: cid, origem: 'mao' }); if (r?.ok) fecharModal(); });
    q('#mc-guardar') && (q('#mc-guardar').onclick = fecharModal);
    q('#mc-desc-frente') && (q('#mc-desc-frente').onclick = async () => { const r = await enviar({ t: 'descartar', carta: cid, origem: 'frente' }); if (r?.ok) fecharModal(); });
  });
}

function modalDarDica(para) {
  const dicas = V.eu.mao.filter(c => c.startsWith('dica/'));
  abrirModal(`<p class="modal-sobre">Dar uma Dica virada para baixo a <b>${rotulo(jogador(para))}</b>. Escolha qual:</p>
    <div class="cartas">${dicas.map(c => `<button class="carta-bt" data-c="${c}">${imgCarta(c)}<span class="selo ${carta(c).selo}">${carta(c).selo === 'branco' ? '☆ verdadeira' : '★ falsa'}</span></button>`).join('')}</div>
    <p class="nota">Depois, diga em voz alta (ou sussurre no Discord) o que ela "diz". Você pode mentir; o selo é o que vale.</p>`, (m) => {
    m.querySelectorAll('[data-c]').forEach(b => b.onclick = async () => { const r = await enviar({ t: 'darDica', carta: b.dataset.c, para }, 'Dica entregue.'); if (r?.ok) fecharModal(); });
  });
}

function modalChave(ficha) {
  const outros = V.jogadores.filter(j => j.hospede != null && j.id !== V.eu?.id);
  abrirModal(`<img class="ficha-grande" src="${DADOS.fichas[ficha].img}" alt="Chave"><p class="modal-nome">Chave (à vista na sua frente)</p>
    <label class="campo">Passar para:<select id="ch-para">${outros.map(j => `<option value="${j.id}">${esc(rotuloTxt(j))}</option>`).join('')}</select></label>
    <button class="bt bt-mostarda" id="ch-passar" ${outros.length ? '' : 'disabled'}>Passar a Chave</button>`, (m) => {
    m.querySelector('#ch-passar').onclick = async () => { const r = await enviar({ t: 'passarChave', ficha, para: m.querySelector('#ch-para').value }); if (r?.ok) fecharModal(); };
  });
}

function aoTocarFicha(sala) {
  if (!V || V.fase === 'lobby') return;
  const desenha = () => {
    const f = V.fichas[sala]; if (!f) return fecharModal();
    const eu = V.eu; const meu = eu?.hospede != null ? jogador(eu.id) : null;
    const aqui = meu && salaDe(meu.pos) === sala;
    const conhecida = eu?.fichasConhecidas?.[sala];
    const ehMedium = eu?.hospede != null && DADOS.hospedes[eu.hospede].id === 'a_medium';
    let img = DADOS.versoFicha, txt = 'Virada para baixo.';
    if (f.estado === 'revelada') { img = DADOS.fichas[f.ficha].img; txt = `À vista: <b>${DADOS.fichas[f.ficha].tipo}</b>.`; }
    else if (conhecida) { img = DADOS.fichas[conhecida].img; txt = `Você olhou em segredo: <b>${DADOS.fichas[conhecida].tipo}</b>. Ninguém mais vê esta imagem.`; }
    const oculta = f.estado === 'oculta';
    $('#modal-corpo').innerHTML = `<p class="modal-sobre">Ficha de Sala · <b>${esc(sala)}</b></p>
      <img class="ficha-grande" src="${img}" alt=""><p>${txt}</p>
      <div class="linha-bt col">
      ${oculta && !conhecida && aqui ? '<button class="bt bt-vermelho" id="fx-olhar">Olhar em segredo</button>' : ''}
      ${oculta && !conhecida && !aqui && ehMedium ? '<button class="bt bt-mostarda" id="fx-medium">Olhar com a habilidade da Médium</button>' : ''}
      ${oculta && !aqui && !(ehMedium && !conhecida) && !conhecida ? `<p class="nota">Leve seu peão até ${esc(sala)} para olhar esta Ficha.</p>` : ''}
      ${oculta && aqui && conhecida ? `<button class="bt bt-claro" id="fx-revelar">Deixar virada para cima no cômodo</button>${DADOS.fichas[conhecida].tipo === 'Chave' ? '<button class="bt bt-mostarda" id="fx-pegar">Pegar a Chave (fica à vista na sua frente)</button>' : ''}` : ''}
      ${DADOS.fichas[conhecida]?.tipo === 'Armadilha' && oculta ? '<p class="nota">Armadilha: compre 1 carta de Laço e ponha a Corrente no peão.</p>' : ''}
      </div>`;
    const q = (s) => $('#modal-corpo').querySelector(s);
    q('#fx-olhar') && (q('#fx-olhar').onclick = () => enviar({ t: 'olharFicha', sala }));
    q('#fx-medium') && (q('#fx-medium').onclick = () => { if (confirm('Usar a habilidade da Médium (uma vez por partida) para olhar esta Ficha?')) enviar({ t: 'olharFicha', sala, medium: true }); });
    q('#fx-revelar') && (q('#fx-revelar').onclick = () => enviar({ t: 'revelarFicha', sala }));
    q('#fx-pegar') && (q('#fx-pegar').onclick = async () => { const r = await enviar({ t: 'pegarFicha', sala }); if (r?.ok) fecharModal(); });
  };
  abrirModal('', null, { atualizar: desenha }); desenha();
}

function aoTocarPeao(alvo) {
  if (!V) return;
  if (alvo === 'palhaco') return abrirModal(`<img class="ficha-img grande-ficha" src="${DADOS.palhaco.frente}" alt="O Palhaço"><p class="nota">${V.palhacoAuto ? 'Palhaço automático: no fim de cada rodada ele anda 1 ou 2 cômodos pelas portas atrás de alguém.' : 'Arraste o peão dele para movê-lo.'} ${V.pedagio ? 'Pedágio: quem cruza com ele paga 1 moeda (sem moedas, 15% de sanidade), é mandado para um cômodo sorteado e rola o Dado do Olho (fechado: -10%; aberto: Distorção ou Laço).' : 'Susto: quem divide o cômodo com ele perde 5% e rola o Dado.'}</p>`);
  const j = jogador(alvo); if (!j || j.hospede == null) return;
  const h = DADOS.hospedes[j.hospede];
  abrirModal(`<div class="minha-ficha"><img class="ficha-img" src="${j.habilidadeUsada ? h.verso : h.frente}" alt=""><div>
    <h3>${esc(j.apelido)}</h3><p>${esc(h.nome)} · em ${esc(salaDe(j.pos) || '?')}</p><p><b>Fobia:</b> ${esc(h.fobia)}</p><p class="hab">${esc(h.habilidade)}</p>
    <p>Última Sanidade comprada: <b>${j.ultimoNivel ? j.ultimoNivel + '%' : '—'}</b></p>
    <button class="bt bt-mini bt-claro" id="pp-corr">${j.corrente ? 'Tirar Corrente' : 'Pôr Corrente'}</button></div></div>`, (m) => {
    m.querySelector('#pp-corr').onclick = async () => { await enviar({ t: 'corrente', alvo: j.id === V.eu?.id ? undefined : j.id, valor: !j.corrente }); fecharModal(); };
  });
}

function modalDiscos() {
  const js = V.jogadores.filter(j => j.disco);
  abrirModal(`<h2 class="titulo-modal">Discos abertos</h2>
    <div class="discos">${js.map(j => `<div class="disco-fim ${j.disco.tomado ? 'tomado' : ''}"><img src="${DADOS.disco[j.disco.sanidade]}" alt=""><b>${esc(j.apelido)}</b><small>${esc(nomeHosp(j.hospede))}</small><span>${j.disco.sanidade}%${j.disco.tomado ? ' · TOMADO' : ' · lúcido'}</span></div>`).join('')}</div>
    <p class="nota">Confiram os Laços que dependiam de sanidade: quem mentiu perde sozinho. Tomados que cumpriram o Pacto: revelem a carta.</p>`);
}

// ===================== COMO JOGAR / TOUR / NÍVEL =====================
function abrirComoJogar() {
  abrirModal(TUT.htmlComoJogar(TUT.nivelExp()), (m) => TUT.ligarComoJogar(m, {
    aoTour: () => { fecharModal(); iniciarTour(TUT.TOUR_COMPLETO); },
    aoNivel: () => modalNivel(),
  }), { ajuda: true });
  $('#modal').classList.add('largo');
}
function iniciarTour(passos) {
  fecharModal(); TUT.fecharDica();
  if ($('#tela-mesa').hidden) { aviso('O tour mostra a mesa: entre numa sala primeiro.'); return; }
  TUT.abrirTour(passos, { aoAba: (a) => trocarAba(a), aoFim: () => { trocarAba('mao'); setTimeout(() => { if (V) tutorial(V); }, 400); } });
}
function modalNivel() {
  const desenha = () => {
    $('#modal-corpo').innerHTML = `<h2 class="titulo-modal">Nível de experiência</h2><p class="nota">Muda só a ajuda na sua tela. Fica salvo neste navegador.</p>${TUT.htmlEscolhaNivel(TUT.nivelExp())}`;
    $$('#modal-corpo [data-nivel]').forEach(b => b.onclick = () => { TUT.definirNivelExp(b.dataset.nivel); atualizarNivelMenu(); if (V?.fase === 'lobby') renderNivelLobby(); aviso(`Nível: ${TUT.NIVEIS_EXP[b.dataset.nivel].nome}.${b.dataset.nivel === 'iniciante' ? ' As dicas contextuais estão ligadas de novo.' : ''}`); desenha(); });
  };
  abrirModal('', null); desenha();
}
// Abre o tour sozinho quando a partida começa, conforme o nível (só nesta tela; nada vai pela rede).
function tutorial(v) {
  if (v.fase !== 'jogo' || !v.eu) return;
  const nivel = TUT.nivelExp() || 'iniciante';
  const chave = `sussurros-tour-${v.codigo}`;
  if (!visto.tour) {
    visto.tour = true;
    let feito = false; try { feito = !!localStorage.getItem(chave); } catch (_) {}
    if (!feito && nivel !== 'veterano') {
      try { localStorage.setItem(chave, nivel); } catch (_) {}
      const passos = nivel === 'iniciante' ? TUT.TOUR_COMPLETO : TUT.TOUR_CURTO;
      const t0 = Date.now();
      visto.tourPendente = true;
      const tenta = () => { if ((tocandoShow || filaShow.length || !$('#clipe').hidden || !$('#proposta').hidden) && Date.now() - t0 < 25000) return setTimeout(tenta, 400); visto.tourPendente = false; if (V?.fase === 'jogo') iniciarTour(passos); };
      setTimeout(tenta, 600);
    }
  }
  if (nivel !== 'iniciante' || TUT.tourAberto() || visto.tourPendente) return;
  dicasContextuais(v);
}
function dicasContextuais(v) {
  const eu = v.eu; if (eu.hospede == null) return;
  const t = v.turno; const minha = t && t.daVez === eu.id && !v.noite.ativa;
  // pedágio: primeira vez que alguém é pego
  const ped = v.log.filter(l => !l.privado && l.texto.startsWith('O Palhaço pegou')).at(-1)?.n || 0;
  if (visto.pedagio === null) visto.pedagio = ped;
  if (ped > visto.pedagio) { visto.pedagio = ped; if (TUT.mostrarDica('pedagio', '.peao[data-alvo="palhaco"]', 'O Palhaço cobrou pedágio', 'Quem cruza com ele paga <b>1 moeda</b> (sem moedas, 15% de sanidade), vai para um cômodo sorteado e rola o Dado: olho fechado = −10%; aberto = Distorção ou Laço. Ele anda sozinho no fim de cada rodada: fique de olho no caminho dele.')) return; }
  if (v.noite.ativa) { TUT.mostrarDica('noite', '#noite .noite-caixa', 'A Noite', 'Todos "fecham os olhos". Quem está Tomado recebe em segredo 1 carta de Sanidade 10% e pode mover o Palhaço 1 cômodo. Os outros só esperam: o Amanhecer libera em 7 segundos.'); return; }
  if (eu.dicasRecebidas.length && TUT.mostrarDica('dica-recebida', '.abas [data-aba="mao"]', 'Você recebeu uma Dica', 'Na sua vez, decida na aba Mão: <b>Seguir</b> (revela a todos; verdadeira dá +10% aos dois, falsa −10% a você) ou <b>Ignorar</b> (descarta sem ninguém saber).')) return;
  if (!minha) return;
  const f = t.feito;
  if (!f.salas && !f.descanso) { TUT.mostrarDica('mover', `.peao[data-alvo="${eu.id}"]`, 'Agora mova seu peão', 'Arraste o peão com anel dourado até <b>2 Salas</b>, passando pelas portas turquesa. Ou toque em <b>Descansar</b> (+5%) e fique onde está.'); return; }
  if (!f.evento && !f.nivel) { const alvo = abaAtual === 'mao' && $('#pg-mao .compras') ? '#pg-mao .compras' : '.abas [data-aba="mao"]'; TUT.mostrarDica('comprar', alvo, 'Toque no baralho para comprar', 'Entrou num cômodo com Ficha? Olhe-a antes. Depois compre 1 <b>Evento</b> (leia em voz alta) e a <b>Sanidade do seu nível</b>.'); return; }
  if (f.nivel) TUT.mostrarDica('passar', '#bt-passar', 'Terminou a sua vez?', 'Complete suas Dicas até 3 e toque em <b>Passar a vez</b>. Quando todos passarem, o Relógio anda sozinho.');
}

// ===================== FAIXA DA VEZ =====================
function renderFaixa(v) {
  const el = $('#faixa-vez'); const t = v.turno;
  if (v.fase !== 'jogo' || !t || !t.daVez) { el.hidden = true; document.body.classList.remove('minha-vez'); visto.eraMinha = false; return; }
  const jv = jogador(t.daVez); const minha = t.daVez === v.eu?.id; const host = !!v.eu?.ehHost;
  const h = jv?.hospede != null ? DADOS.hospedes[jv.hospede] : null;
  const f = t.feito; const nd = jv?.nDicasMao ?? 0;
  const est = (n, max) => n === 0 ? '' : n > max ? 'acima' : 'feito';
  const prox = t.ordem.length > 1 ? jogador(t.ordem[(t.vez + 1) % t.ordem.length]) : null;
  const passos = [
    `<span class="passo ${est(f.dica, 1)}" title="Sussurro (opcional): 1 Dica">Dica ${f.dica}/1</span>`,
    f.descanso ? '<span class="passo feito" title="Descansou em vez de mover (+5%)">Descansou</span>' : `<span class="passo ${est(f.salas, 2)}" title="Movimento: até 2 Salas">Mover ${f.salas}/2</span>`,
    `<span class="passo ${f.ficha ? 'feito' : ''}" title="Explorar: olhar a Ficha do cômodo">Ficha ${f.ficha ? '✓' : '–'}</span>`,
    `<span class="passo ${est(f.evento, 1)}" title="Evento: 1 por vez">Evento ${f.evento}/1</span>`,
    `<span class="passo ${est(f.nivel, 1)}" title="Nível: 1 carta de Sanidade">Sanidade ${f.nivel}/1</span>`,
    `<span class="passo ${nd >= 3 ? 'feito' : ''} ${nd > 3 ? 'acima' : ''}" title="Reabastecer: Dicas até 3 na mão">Dicas ${nd}/3</span>`,
  ].join('');
  el.hidden = false; el.classList.toggle('minha', minha);
  document.body.classList.toggle('minha-vez', minha);
  el.innerHTML = `<div class="faixa-quem">${h ? `<img src="${h.peao}" alt="">` : ''}<span>${minha ? '<b>É a sua vez!</b>' : `Vez de <b>${esc(rotuloTxt(jv))}</b>`}<small>Rodada ${v.relogio} · ${t.vez + 1}º de ${t.ordem.length}${prox && prox !== jv ? ` · depois: ${esc(prox.apelido)}` : ''}</small></span></div>
    <div class="faixa-passos" title="O que a mesa registrou nesta vez (regras.md, seção 6)">${passos}</div>
    <div class="faixa-acoes">${minha && !f.salas && !f.descanso ? '<button class="bt bt-mini bt-claro" id="bt-descansar" title="Em vez de se mover: +5% no Disco">Descansar</button>' : ''}${minha || host ? `<button id="bt-passar" class="bt bt-vermelho bt-passar">${minha ? 'Passar a vez' : `Passar a vez de ${esc(jv?.apelido || '?')}`}</button>` : '<small class="faixa-dica">Na sua vez, aparece aqui o botão Passar a vez.</small>'}</div>`;
  $('#bt-passar') && ($('#bt-passar').onclick = async (ev) => { ev.currentTarget.disabled = true; const r = await enviar({ t: 'passarVez', seq: t.seq }); if (!r?.ok && ev.currentTarget) ev.currentTarget.disabled = false; });
  $('#bt-descansar') && ($('#bt-descansar').onclick = () => enviar({ t: 'descansar' }, 'Você descansou: +5% no Disco.'));
  if (minha && !visto.eraMinha && !visto.primeira) suaVez(v);
  visto.eraMinha = minha;
}
function suaVez(v) {
  const el = $('#sua-vez'); el.querySelector('small').textContent = `Rodada ${v.relogio}: mover, explorar, Evento, Sanidade, Dicas. Depois, Passar a vez.`;
  el.hidden = false; el.classList.remove('entra'); void el.offsetWidth; el.classList.add('entra');
  clearTimeout(suaVez._t); suaVez._t = setTimeout(() => { el.hidden = true; }, 2600);
  el.onclick = () => { el.hidden = true; };
  tocarVez();
  if (navigator.vibrate) try { navigator.vibrate([80, 60, 80]); } catch (_) {}
}
function tocarVez() {
  const a = ctxAudio(); if (!a || a.state !== 'running') return;
  const g = a.createGain(); g.gain.value = 0.16; g.connect(a.destination);
  [[659, 0], [880, 0.14], [1319, 0.28]].forEach(([f, t]) => {
    const o = a.createOscillator(), e = a.createGain(); o.type = 'triangle'; o.frequency.value = f;
    const t0 = a.currentTime + t; e.gain.setValueAtTime(0, t0); e.gain.linearRampToValueAtTime(1, t0 + 0.01); e.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
    o.connect(e); e.connect(g); o.start(t0); o.stop(t0 + 0.55);
  });
}

// ===================== FEEDBACK DE CUSTO =====================
function piscar(sel) { $$(sel).forEach(el => { el.classList.remove('pisca'); void el.offsetWidth; el.classList.add('pisca'); setTimeout(() => el.classList.remove('pisca'), 1700); }); }
function flutuante({ titulo, linhas = [], rodape = '', classe = '' }) {
  const box = $('#custo-float'); box.hidden = false;
  const el = document.createElement('div'); el.className = 'flutua ' + classe;
  el.innerHTML = `${titulo ? `<b>${esc(titulo)}</b>` : ''}${linhas.map(l => `<span>${esc(l)}</span>`).join('')}${rodape ? `<small>${esc(rodape)}</small>` : ''}`;
  el.onclick = () => el.remove();
  box.appendChild(el);
  while (box.children.length > 3) box.firstElementChild.remove();
  setTimeout(() => { el.classList.add('sai'); setTimeout(() => { el.remove(); if (!box.children.length) box.hidden = true; }, 450); }, 6000);
  return el;
}
function animarCompra(r0, src) {
  return new Promise(res => {
    if (!r0 || !r0.width || matchMedia('(prefers-reduced-motion: reduce)').matches) return res();
    let dest = $('#m-mao'); let r1 = dest?.getBoundingClientRect();
    if (!r1 || r1.top > innerHeight - 40 || r1.bottom < 0) { dest = $('.abas [data-aba="mao"]'); r1 = dest.getBoundingClientRect(); }
    const voo = document.createElement('img'); voo.src = src; voo.className = 'carta-voo'; voo.alt = '';
    Object.assign(voo.style, { left: r0.left + 'px', top: r0.top + 'px', width: r0.width + 'px', height: r0.height + 'px' });
    document.body.appendChild(voo);
    const dx = (r1.left + Math.min(r1.width, 140) / 2) - (r0.left + r0.width / 2), dy = (r1.top + Math.min(r1.height, 120) / 2) - (r0.top + r0.height / 2);
    const an = voo.animate([
      { transform: 'translate(0,0) rotate(0) scale(1)', opacity: 1 },
      { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 70}px) rotate(-14deg) scale(1.5)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${dx}px, ${dy}px) rotate(6deg) scale(.75)`, opacity: 0.15 },
    ], { duration: 750, easing: 'cubic-bezier(.3,.7,.4,1)' });
    const fim = () => { voo.remove(); piscar('.abas [data-aba="mao"]'); res(); };
    an.onfinish = fim; setTimeout(() => { if (voo.isConnected) fim(); }, 1200);
  });
}
async function comprarComFeedback(a, botao) {
  const r0 = botao?.querySelector('img')?.getBoundingClientRect() || botao?.getBoundingClientRect();
  const bar = a.baralho || (V?.eu?.tomado ? 'sanidade_25' : `sanidade_${Math.max(25, nivelDe(V?.eu?.sanidade ?? 80))}`);
  botao?.classList.add('puxou');
  const r = await enviar(a);
  if (!r?.ok || !r.carta) return;
  const c = r.custo;
  const anim = animarCompra(r0, DADOS.baralhos[carta(r.carta).baralho]?.verso || DADOS.baralhos[bar]?.verso);
  if (c) {
    const el = flutuante({ titulo: c.titulo, linhas: c.linhas, rodape: c.restante != null ? `Baralho ${c.baralho}: ${c.restante} restante${c.restante === 1 ? '' : 's'}` : '', classe: c.foraDaVez ? 'fora' : c.acima ? 'acima' : 'gratis' });
    if (c.foraDaVez) avisoForaDaVez(c.linhas[0]);
  }
  await anim;
  modalCarta(r.carta, 'mao', true);
  setTimeout(() => TUT.mostrarDica('custo', '#custo-float', 'Quanto custou essa compra?', 'Pela regra, comprar <b>não custa</b> sanidade nem moedas: cada compra usa um passo da sua vez (1 Evento, 1 Sanidade, Dicas até 3). O aviso mostra o passo usado e quantas cartas sobram. Seus gastos ficam na aba Mão.'), 300);
}
// O que mudou entre duas visões: Disco (privado) e moedas piscam; ganhos/perdas próprios viram aviso flutuante.
function mudancas(ant, v) {
  const eu = v.eu, ea = ant.eu;
  if (eu && ea && eu.hospede != null && ea.hospede === eu.hospede && v.fase === 'jogo' && ant.fase === 'jogo') {
    const ds = eu.sanidade - ea.sanidade;
    if (ds) { piscar('.abas [data-aba="disco"]'); piscar('#pg-disco .disco-valor'); if (abaAtual !== 'disco') flutuante({ titulo: 'Seu Disco mudou', linhas: [`${ds > 0 ? '+' : '−'}${Math.abs(ds)}% sanidade`], rodape: 'Só você vê', classe: ds < 0 ? 'perda' : 'ganho' }); }
  }
  if (v.fase !== 'jogo' || ant.fase !== 'jogo') return;
  for (const j of v.jogadores) {
    const a = ant.jogadores.find(x => x.id === j.id); if (!a || a.moedas === j.moedas) continue;
    piscar(`.peao[data-alvo="${j.id}"] .peao-moedas`); piscar(`#pg-mesa .moedas[data-j="${j.id}"]`);
    if (j.id === eu?.id) { const d = j.moedas - a.moedas; flutuante({ titulo: 'Suas moedas', linhas: [`${d > 0 ? '+' : '−'}${Math.abs(d)} moeda${Math.abs(d) > 1 ? 's' : ''}`], rodape: `Agora: ${j.moedas}`, classe: d < 0 ? 'perda' : 'ganho' }); }
  }
}

// ===================== INÍCIO =====================
initInicio(); initMesa();
if (new URLSearchParams(location.search).has('teste')) window.__app = { get V() { return V; }, enviar: (a) => S.enviar(a), get S() { return S; }, get fila() { return { n: filaShow.length, tocando: tocandoShow }; } };
