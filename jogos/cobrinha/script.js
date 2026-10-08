//=============================
// CONFIGURAÇÕES
//=============================
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const T = 20;                    // tamanho do quadrado
const N = canvas.width / T;      // quadrados por lado
const PONTOS_POR_NIVEL = 8;
const JANELA_COMBO = 3000;       // ms para manter o combo
const DURACAO_ESPECIAL = 5000;   // ms que o pote dourado fica na tela

const DIFICULDADES = {
  facil:   { vel: 200, atravessa: true,  pedras: false },
  normal:  { vel: 150, atravessa: false, pedras: false },
  dificil: { vel: 120, atravessa: false, pedras: true  }
};
const VETOR  = { cima:[0,-1], baixo:[0,1], esquerda:[-1,0], direita:[1,0] };
const OPOSTO = { cima:'baixo', baixo:'cima', esquerda:'direita', direita:'esquerda' };

//=============================
// ESTADO
//=============================
let dificuldade = 'normal';
let cobra = [], direcao = 'direita', fila = [];
let comida = null, especial = null, pedras = [], popups = [];
let pontos = 0, nivel = 1, combo = 1, ultimaComida = 0, contadorComidas = 0, recorde = 0;
let estado = 'espera';           // espera | jogando | pausado | fim
let timer = null, somLigado = true, audioCtx = null, mensagemFim = '';

//=============================
// RECORDE (um por dificuldade)
//=============================
function carregarRecorde(){
  try { recorde = Number(localStorage.getItem('urso_recorde_' + dificuldade)) || 0; }
  catch(e){ recorde = 0; }
}
function salvarRecorde(){
  if(pontos > recorde){
    recorde = pontos;
    try { localStorage.setItem('urso_recorde_' + dificuldade, recorde); } catch(e){}
  }
}

//=============================
// SOM
//=============================
function som(freq, dur = 0.08, tipo = 'square'){
  if(!somLigado) return;
  try{
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = tipo; o.frequency.value = freq; g.gain.value = 0.05;
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + dur);
  }catch(e){}
}
function alternarSom(){
  somLigado = !somLigado;
  document.getElementById('btnSom').textContent = somLigado ? '🔊' : '🔇';
}

//=============================
// CONTROLE DO JOGO
//=============================
function resetar(){
  cobra = [{x:10,y:10},{x:9,y:10},{x:8,y:10}];
  direcao = 'direita'; fila = [];
  pontos = 0; nivel = 1; combo = 1; ultimaComida = 0; contadorComidas = 0;
  especial = null; pedras = []; popups = []; comida = null;
  carregarRecorde();
  gerarComida();
  atualizarPainel();
}

function mudarDificuldade(d){
  dificuldade = d;
  clearTimeout(timer);
  estado = 'espera';
  document.querySelectorAll('#dificuldade button').forEach(b =>
    b.classList.toggle('ativo', b.dataset.d === d));
  resetar();
}

function iniciarJogo(){
  clearTimeout(timer);
  resetar();
  estado = 'jogando';
  agendar();
}

function velocidade(){
  return Math.max(60, DIFICULDADES[dificuldade].vel - (nivel - 1) * 10);
}

// setTimeout encadeado: permite mudar a velocidade a cada nível
function agendar(){
  clearTimeout(timer);
  timer = setTimeout(() => {
    atualizarJogo();
    if(estado === 'jogando') agendar();
  }, velocidade());
}

function pausarJogo(){
  if(estado === 'jogando'){
    estado = 'pausado';
    clearTimeout(timer);
  } else if(estado === 'pausado'){
    estado = 'jogando';
    agendar();
  }
}

//=============================
// LÓGICA (um passo do jogo)
//=============================
function atualizarJogo(){
  if(fila.length) direcao = fila.shift();

  const cfg = DIFICULDADES[dificuldade];
  const cabeca = { x: cobra[0].x + VETOR[direcao][0], y: cobra[0].y + VETOR[direcao][1] };

  if(cfg.atravessa){
    cabeca.x = (cabeca.x + N) % N;
    cabeca.y = (cabeca.y + N) % N;
  } else if(cabeca.x < 0 || cabeca.x >= N || cabeca.y < 0 || cabeca.y >= N){
    return fimDeJogo();
  }

  const comeuMel = comida && cabeca.x === comida.x && cabeca.y === comida.y;
  const comeuEsp = especial && cabeca.x === especial.x && cabeca.y === especial.y;
  const crescendo = comeuMel || comeuEsp;

  // se não vai crescer, a ponta do rabo sai do lugar, então pode ser pisada
  const corpo = crescendo ? cobra : cobra.slice(0, -1);
  const bateu = corpo.some(p => p.x === cabeca.x && p.y === cabeca.y) ||
                pedras.some(p => p.x === cabeca.x && p.y === cabeca.y);
  if(bateu) return fimDeJogo();

  cobra.unshift(cabeca);

  if(crescendo){
    const agora = Date.now();
    combo = (agora - ultimaComida < JANELA_COMBO) ? Math.min(combo + 1, 5) : 1;
    ultimaComida = agora;

    const ganho = (comeuEsp ? 5 : 1) * combo;
    pontos += ganho;
    popups.push({ x: cabeca.x, y: cabeca.y, texto: '+' + ganho, nasc: agora, cor: comeuEsp ? '#C97B00' : '#3B5D3A' });
    som(comeuEsp ? 880 : 520 + combo * 60);

    if(comeuEsp) especial = null;
    if(comeuMel){
      contadorComidas++;
      gerarComida();
      if(contadorComidas % 5 === 0) gerarEspecial();
    }

    const novoNivel = 1 + Math.floor(pontos / PONTOS_POR_NIVEL);
    if(novoNivel > nivel){
      nivel = novoNivel;
      popups.push({ x: 7, y: 9, texto: 'Nível ' + nivel + '!', nasc: Date.now(), cor: '#8B5A2B', grande: true });
      som(700, 0.25, 'triangle');
      if(cfg.pedras) gerarPedra();
    }
    salvarRecorde();
  } else {
    cobra.pop();
  }

  if(especial && Date.now() > especial.expira) especial = null;
  atualizarPainel();
}

function fimDeJogo(venceu = false){
  estado = 'fim';
  clearTimeout(timer);
  mensagemFim = venceu ? 'VOCÊ VENCEU!' : 'FIM DE JOGO';
  salvarRecorde();
  atualizarPainel();
  som(venceu ? 880 : 140, 0.4, venceu ? 'triangle' : 'sawtooth');
}

//=============================
// POSIÇÕES LIVRES
//=============================
function celulasLivres(){
  const ocupadas = new Set();
  [...cobra, ...pedras, comida, especial].forEach(p => { if(p) ocupadas.add(p.x + ',' + p.y); });
  const livres = [];
  for(let x = 0; x < N; x++)
    for(let y = 0; y < N; y++)
      if(!ocupadas.has(x + ',' + y)) livres.push({x, y});
  return livres;
}
function sortear(lista){ return lista[Math.floor(Math.random() * lista.length)]; }

function gerarComida(){
  const livres = celulasLivres();
  if(!livres.length){ fimDeJogo(true); return; }
  comida = sortear(livres);
}
function gerarEspecial(){
  const livres = celulasLivres();
  if(livres.length) especial = { ...sortear(livres), expira: Date.now() + DURACAO_ESPECIAL };
}
function gerarPedra(){
  // nunca nasce perto da cabeça, para não ser injusto
  const h = cobra[0];
  const livres = celulasLivres().filter(p => Math.abs(p.x - h.x) + Math.abs(p.y - h.y) > 5);
  if(livres.length) pedras.push(sortear(livres));
}

//=============================
// ENTRADA
//=============================
function mudarDirecao(nova){
  const ultima = fila.length ? fila[fila.length - 1] : direcao;
  if(nova !== ultima && nova !== OPOSTO[ultima] && fila.length < 2) fila.push(nova);
}

document.addEventListener('keydown', function(e){
  const mapa = { ArrowUp:'cima', w:'cima', W:'cima', ArrowDown:'baixo', s:'baixo', S:'baixo',
                 ArrowLeft:'esquerda', a:'esquerda', A:'esquerda', ArrowRight:'direita', d:'direita', D:'direita' };
  if(mapa[e.key]){ e.preventDefault(); mudarDirecao(mapa[e.key]); }
  else if(e.key === ' ' || e.key === 'p' || e.key === 'P'){ e.preventDefault(); pausarJogo(); }
  else if(e.key === 'Enter' && estado !== 'jogando'){ e.preventDefault(); iniciarJogo(); }
});

// deslizar o dedo no canvas
let toqueIni = null;
canvas.addEventListener('touchstart', e => { toqueIni = e.touches[0]; }, { passive: true });
canvas.addEventListener('touchend', e => {
  if(!toqueIni) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - toqueIni.clientX, dy = t.clientY - toqueIni.clientY;
  toqueIni = null;
  if(Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
  if(Math.abs(dx) > Math.abs(dy)) mudarDirecao(dx > 0 ? 'direita' : 'esquerda');
  else mudarDirecao(dy > 0 ? 'baixo' : 'cima');
});

//=============================
// PAINEL
//=============================
function atualizarPainel(){
  document.getElementById('pontos').textContent = pontos;
  document.getElementById('nivel').textContent = nivel;
  document.getElementById('recorde').textContent = recorde;
}

//=============================
// DESENHO (loop próprio, independe da velocidade do jogo)
//=============================
function retanguloArredondado(x, y, w, h, r){
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function desenharFundo(){
  ctx.fillStyle = '#EFE3C8';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#D8C6A0';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  for(let i = 0; i <= N; i++){
    ctx.moveTo(i * T, 0); ctx.lineTo(i * T, canvas.height);
    ctx.moveTo(0, i * T); ctx.lineTo(canvas.width, i * T);
  }
  ctx.stroke();
}

function desenharCorpo(p, i){
  const x = p.x * T + 1, y = p.y * T + 1, t = T - 2, cx = x + t / 2, cy = y + t / 2;
  const par = i % 2 === 0;
  const g = ctx.createRadialGradient(cx - 3, cy - 3, 1, cx, cy, T / 2);
  g.addColorStop(0, par ? '#8B5A2B' : '#6B4423');
  g.addColorStop(1, par ? '#5C3A1E' : '#42280F');
  ctx.fillStyle = g;
  retanguloArredondado(x, y, t, t, 8);
  ctx.fill();
}

function desenharCabeca(p){
  const cx = p.x * T + T / 2, cy = p.y * T + T / 2, r = T / 2;
  const [dx, dy] = VETOR[direcao];
  const px = -dy, py = dx;

  ctx.fillStyle = '#5C3A1E'; // orelhas
  [1, -1].forEach(s => {
    ctx.beginPath();
    ctx.arc(cx - dx * r * .3 + px * s * r * .75, cy - dy * r * .3 + py * s * r * .75, r * .35, 0, Math.PI * 2);
    ctx.fill();
  });

  const g = ctx.createRadialGradient(cx - 3, cy - 3, 1, cx, cy, r + 1);
  g.addColorStop(0, '#8B5A2B'); g.addColorStop(1, '#42280F');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();

  const ang = Math.atan2(dy, dx);
  ctx.fillStyle = '#D9B48C'; // focinho
  ctx.beginPath(); ctx.ellipse(cx + dx * r * .7, cy + dy * r * .7, r * .55, r * .42, ang, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1A1A1A'; // nariz
  ctx.beginPath(); ctx.ellipse(cx + dx * (r + 2), cy + dy * (r + 2), 2.4, 1.7, ang, 0, Math.PI * 2); ctx.fill();

  [1, -1].forEach(s => { // olhos
    const ox = cx + dx + px * 4 * s, oy = cy + dy + py * 4 * s;
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ox, oy, 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(ox + dx * .6, oy + dy * .6, 1, 0, Math.PI * 2); ctx.fill();
  });
}

function hexagono(cx, cy, raio){
  ctx.beginPath();
  for(let i = 0; i < 6; i++){
    const a = Math.PI / 3 * i - Math.PI / 2;
    const px = cx + raio * Math.cos(a), py = cy + raio * Math.sin(a);
    if(i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function desenharMel(){
  const cx = comida.x * T + T / 2, cy = comida.y * T + T / 2;
  const pulso = 1 + Math.sin(Date.now() / 250) * 0.06;
  const r = (T / 2 - 2) * pulso;
  const g = ctx.createRadialGradient(cx - 2, cy - 2, 1, cx, cy, r + 2);
  g.addColorStop(0, '#FFD166'); g.addColorStop(.6, '#F4A300'); g.addColorStop(1, '#C97B00');
  ctx.fillStyle = g; hexagono(cx, cy, r); ctx.fill();
  ctx.strokeStyle = '#A85E00'; ctx.lineWidth = 1; ctx.stroke();
  ctx.strokeStyle = 'rgba(168,94,0,.5)'; ctx.lineWidth = .6; hexagono(cx, cy, r * .5); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.5)';
  ctx.beginPath(); ctx.ellipse(cx - r / 3, cy - r / 3, r / 5, r / 8, -Math.PI / 5, 0, Math.PI * 2); ctx.fill();
}

function desenharEspecial(){
  const restante = especial.expira - Date.now();
  if(restante < 1500 && Math.floor(Date.now() / 150) % 2) return; // pisca antes de sumir
  const cx = especial.x * T + T / 2, cy = especial.y * T + T / 2;
  ctx.fillStyle = 'rgba(255,201,77,.45)';
  ctx.beginPath(); ctx.arc(cx, cy, T / 2 + Math.sin(Date.now() / 120) * 2, 0, Math.PI * 2); ctx.fill();
  ctx.font = '16px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000';
  ctx.fillText('🍯', cx, cy + 1);
}

function desenharPedra(p){
  const x = p.x * T + 1, y = p.y * T + 1, t = T - 2;
  ctx.fillStyle = '#6E5849'; retanguloArredondado(x, y, t, t, 6); ctx.fill();
  ctx.fillStyle = '#A88B72'; retanguloArredondado(x + 2, y + 2, t - 8, t - 10, 3); ctx.fill();
}

function desenharPopups(){
  const agora = Date.now();
  popups = popups.filter(p => agora - p.nasc < 900);
  popups.forEach(p => {
    const k = (agora - p.nasc) / 900;
    ctx.globalAlpha = 1 - k;
    ctx.fillStyle = p.cor;
    ctx.font = (p.grande ? 'bold 28px' : 'bold 16px') + ' "Baloo 2", Arial';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(p.texto, p.x * T + T / 2, p.y * T - k * 24);
  });
  ctx.globalAlpha = 1;
}

function sobreposicao(titulo, subtitulo, cor = '#FFC94D'){
  ctx.fillStyle = 'rgba(36,22,17,.8)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = cor; ctx.font = 'bold 38px "Baloo 2", Arial';
  ctx.fillText(titulo, canvas.width / 2, canvas.height / 2 - 6);
  ctx.fillStyle = '#FBEFD9'; ctx.font = '18px Quicksand, Arial';
  ctx.fillText(subtitulo, canvas.width / 2, canvas.height / 2 + 28);
}

function desenhar(){
  desenharFundo();
  pedras.forEach(desenharPedra);
  if(comida) desenharMel();
  if(especial) desenharEspecial();
  for(let i = cobra.length - 1; i >= 1; i--) desenharCorpo(cobra[i], i);
  desenharCabeca(cobra[0]);
  desenharPopups();

  // combo na tela de info expira sozinho
  const comboAtivo = (estado === 'jogando' && Date.now() - ultimaComida < JANELA_COMBO) ? combo : 1;
  document.getElementById('combo').textContent = 'x' + comboAtivo;

  if(estado === 'espera') sobreposicao('Pronto?', 'Aperte Enter ou "Iniciar Jogo"');
  else if(estado === 'pausado') sobreposicao('PAUSADO', 'Espaço para continuar', '#FBEFD9');
  else if(estado === 'fim') sobreposicao(mensagemFim, 'Pontos: ' + pontos + '  •  Nível ' + nivel + '  •  Enter para jogar de novo');

  requestAnimationFrame(desenhar);
}

//=============================
// INÍCIO
//=============================
mudarDificuldade('normal');
requestAnimationFrame(desenhar);