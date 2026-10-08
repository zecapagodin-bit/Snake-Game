(() => {
  'use strict';

  const COLS = 10, ROWS = 20, TAM = 30;
  const CHAVE_RECORDE = 'tetris_recorde';

  const cv = document.getElementById('tabuleiro');
  const ctx = cv.getContext('2d');
  const cvProx = document.getElementById('proximo');
  const ctxProx = cvProx.getContext('2d');
  const cvGuard = document.getElementById('guardado');
  const ctxGuard = cvGuard.getContext('2d');

  const el = {
    pontos: document.getElementById('pontos'),
    nivel: document.getElementById('nivel'),
    linhas: document.getElementById('linhas'),
    recorde: document.getElementById('recorde'),
    tela: document.getElementById('tela'),
    titulo: document.getElementById('telaTitulo'),
    texto: document.getElementById('telaTexto'),
    btnIniciar: document.getElementById('btnIniciar'),
    btnPausar: document.getElementById('btnPausar'),
  };

  // Formas e cores (paleta de mel)
  const PECAS = {
    I: { cor: '#7fd6e0', m: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]] },
    O: { cor: '#ffd23f', m: [[1,1],[1,1]] },
    T: { cor: '#c77dff', m: [[0,1,0],[1,1,1],[0,0,0]] },
    S: { cor: '#7bc86c', m: [[0,1,1],[1,1,0],[0,0,0]] },
    Z: { cor: '#ef6f6c', m: [[1,1,0],[0,1,1],[0,0,0]] },
    J: { cor: '#5b8def', m: [[1,0,0],[1,1,1],[0,0,0]] },
    L: { cor: '#f59e42', m: [[0,0,1],[1,1,1],[0,0,0]] },
  };
  const TIPOS = Object.keys(PECAS);
  const PONTOS_LINHAS = [0, 100, 300, 500, 800];

  let tab, atual, proxima, guardada, podeGuardar, saco;
  let pontos, nivel, linhas, recorde;
  let estado = 'pronto'; // pronto | jogando | pausado | fim
  let acumulado = 0, ultimo = 0;
  let efeitos = []; // linhas piscando / textos flutuantes

  // ---------- util ----------
  const vazioTab = () => Array.from({ length: ROWS }, () => Array(COLS).fill(null));

  function embaralhar(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function proximoDoSaco() {
    if (!saco || saco.length === 0) saco = embaralhar([...TIPOS]);
    return saco.pop();
  }
  function nova(tipo) {
    const m = PECAS[tipo].m.map(l => [...l]);
    return { tipo, m, x: Math.floor((COLS - m[0].length) / 2), y: tipo === 'I' ? -1 : 0 };
  }
  function girar(m, horario = true) {
    const n = m.length;
    const r = Array.from({ length: n }, () => Array(n).fill(0));
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++)
        if (horario) r[x][n - 1 - y] = m[y][x];
        else r[n - 1 - x][y] = m[y][x];
    return r;
  }
  function colide(m, px, py) {
    for (let y = 0; y < m.length; y++)
      for (let x = 0; x < m[y].length; x++) {
        if (!m[y][x]) continue;
        const tx = px + x, ty = py + y;
        if (tx < 0 || tx >= COLS || ty >= ROWS) return true;
        if (ty >= 0 && tab[ty][tx]) return true;
      }
    return false;
  }

  // ---------- som ----------
  let audio = null;
  function bip(freq, dur = 0.08, tipo = 'square', vol = 0.04) {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = tipo; o.frequency.value = freq;
      g.gain.value = vol;
      g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + dur);
      o.connect(g); g.connect(audio.destination);
      o.start(); o.stop(audio.currentTime + dur);
    } catch (e) { /* sem áudio, tudo bem */ }
  }

  // ---------- recorde ----------
  function lerRecorde() {
    try { return parseInt(localStorage.getItem(CHAVE_RECORDE), 10) || 0; } catch (e) { return 0; }
  }
  function salvarRecorde() {
    try { localStorage.setItem(CHAVE_RECORDE, String(recorde)); } catch (e) { /* ignora */ }
  }

  // ---------- jogo ----------
  function reiniciar() {
    tab = vazioTab();
    saco = [];
    pontos = 0; nivel = 1; linhas = 0;
    guardada = null; podeGuardar = true;
    efeitos = [];
    recorde = lerRecorde();
    proxima = proximoDoSaco();
    gerar();
    atualizarHud();
  }

  function gerar() {
    atual = nova(proxima);
    proxima = proximoDoSaco();
    podeGuardar = true;
    if (colide(atual.m, atual.x, atual.y)) fimDeJogo();
  }

  function intervalo() {
    return Math.max(70, 800 - (nivel - 1) * 70);
  }

  function mover(dx) {
    if (estado !== 'jogando') return;
    if (!colide(atual.m, atual.x + dx, atual.y)) { atual.x += dx; bip(300, 0.03); }
  }
  function rotacionar(horario = true) {
    if (estado !== 'jogando' || atual.tipo === 'O') return;
    const m = girar(atual.m, horario);
    for (const k of [0, -1, 1, -2, 2]) {
      if (!colide(m, atual.x + k, atual.y)) {
        atual.m = m; atual.x += k; bip(440, 0.04); return;
      }
    }
  }
  function descer(manual = true) {
    if (estado !== 'jogando') return;
    if (!colide(atual.m, atual.x, atual.y + 1)) {
      atual.y++;
      if (manual) { pontos += 1; atualizarHud(); }
      acumulado = 0;
    } else {
      travar();
    }
  }
  function quedaRapida() {
    if (estado !== 'jogando') return;
    let d = 0;
    while (!colide(atual.m, atual.x, atual.y + 1)) { atual.y++; d++; }
    pontos += d * 2;
    bip(180, 0.08, 'sawtooth');
    travar();
  }
  function guardar() {
    if (estado !== 'jogando' || !podeGuardar) return;
    const tipoAtual = atual.tipo;
    if (guardada) {
      atual = nova(guardada);
    } else {
      atual = nova(proxima);
      proxima = proximoDoSaco();
    }
    guardada = tipoAtual;
    podeGuardar = false;
    bip(520, 0.05, 'triangle');
    if (colide(atual.m, atual.x, atual.y)) fimDeJogo();
  }

  function travar() {
    atual.m.forEach((l, y) => l.forEach((v, x) => {
      if (v && atual.y + y >= 0) tab[atual.y + y][atual.x + x] = PECAS[atual.tipo].cor;
    }));
    if (atual.m.some((l, y) => l.some((v) => v) && atual.y + y < 0)) { fimDeJogo(); return; }

    const cheias = [];
    for (let y = 0; y < ROWS; y++) if (tab[y].every(c => c)) cheias.push(y);

    if (cheias.length) {
      cheias.forEach(y => efeitos.push({ tipo: 'linha', y, t: 0, dur: 220 }));
      cheias.sort((a, b) => a - b).forEach(y => {
        tab.splice(y, 1);
        tab.unshift(Array(COLS).fill(null));
      });
      const ganho = PONTOS_LINHAS[cheias.length] * nivel;
      pontos += ganho;
      linhas += cheias.length;
      const nv = Math.floor(linhas / 10) + 1;
      const rotulo = cheias.length === 4 ? 'TETRIS! +' + ganho : '+' + ganho;
      efeitos.push({ tipo: 'texto', txt: rotulo, x: COLS * TAM / 2, y: Math.max(60, cheias[0] * TAM), t: 0, dur: 900 });
      if (nv > nivel) {
        nivel = nv;
        efeitos.push({ tipo: 'texto', txt: 'Nível ' + nivel + '!', x: COLS * TAM / 2, y: 120, t: 0, dur: 1200 });
        bip(880, 0.15, 'triangle');
      }
      bip(600 + cheias.length * 100, 0.12, 'triangle');
    }
    atualizarHud();
    gerar();
  }

  function fimDeJogo() {
    estado = 'fim';
    const novoRecorde = pontos > recorde;
    if (novoRecorde) { recorde = pontos; salvarRecorde(); }
    atualizarHud();
    bip(140, 0.4, 'sawtooth', 0.06);
    mostrarTela('Fim de jogo',
      (novoRecorde ? 'Novo recorde! ' : '') + pontos + ' pontos, nível ' + nivel + '.',
      'Jogar de novo (Enter)');
    el.btnPausar.disabled = true;
  }

  function iniciar() {
    reiniciar();
    estado = 'jogando';
    acumulado = 0;
    ocultarTela();
    el.btnPausar.disabled = false;
    el.btnPausar.textContent = 'Pausar (P)';
  }
  function alternarPausa() {
    if (estado === 'jogando') {
      estado = 'pausado';
      mostrarTela('Pausado', 'Respire. Os blocos esperam.', 'Continuar (P)');
      el.btnPausar.textContent = 'Continuar (P)';
    } else if (estado === 'pausado') {
      estado = 'jogando';
      ocultarTela();
      el.btnPausar.textContent = 'Pausar (P)';
    }
  }

  // ---------- interface ----------
  function mostrarTela(t, txt, botao) {
    el.titulo.textContent = t;
    el.texto.textContent = txt;
    el.btnIniciar.textContent = botao;
    el.tela.classList.remove('oculta');
  }
  function ocultarTela() { el.tela.classList.add('oculta'); }
  function atualizarHud() {
    if (pontos > recorde && estado === 'jogando') { /* só grava no fim */ }
    el.pontos.textContent = pontos;
    el.nivel.textContent = nivel;
    el.linhas.textContent = linhas;
    el.recorde.textContent = Math.max(recorde, pontos);
  }

  // ---------- desenho ----------
  function bloco(c, x, y, cor, tam = TAM, alfa = 1) {
    c.globalAlpha = alfa;
    c.fillStyle = cor;
    c.fillRect(x + 1, y + 1, tam - 2, tam - 2);
    c.fillStyle = 'rgba(255,255,255,.28)';
    c.fillRect(x + 1, y + 1, tam - 2, 4 * tam / TAM);
    c.fillStyle = 'rgba(0,0,0,.22)';
    c.fillRect(x + 1, y + tam - 5 * tam / TAM, tam - 2, 4 * tam / TAM);
    c.globalAlpha = 1;
  }

  function desenharMini(c, canvas, tipo) {
    c.clearRect(0, 0, canvas.width, canvas.height);
    if (!tipo) return;
    const m = PECAS[tipo].m;
    // recorta linhas/colunas vazias para centralizar
    const ys = [], xs = [];
    m.forEach((l, y) => l.forEach((v, x) => { if (v) { ys.push(y); xs.push(x); } }));
    const minY = Math.min(...ys), maxY = Math.max(...ys), minX = Math.min(...xs), maxX = Math.max(...xs);
    const t = 22;
    const w = (maxX - minX + 1) * t, h = (maxY - minY + 1) * t;
    const ox = (canvas.width - w) / 2, oy = (canvas.height - h) / 2;
    m.forEach((l, y) => l.forEach((v, x) => {
      if (v) bloco(c, ox + (x - minX) * t, oy + (y - minY) * t, PECAS[tipo].cor, t);
    }));
  }

  function desenhar(dt) {
    ctx.clearRect(0, 0, cv.width, cv.height);

    // grade
    ctx.strokeStyle = 'rgba(255, 217, 120, .06)';
    ctx.lineWidth = 1;
    for (let x = 1; x < COLS; x++) { ctx.beginPath(); ctx.moveTo(x * TAM, 0); ctx.lineTo(x * TAM, ROWS * TAM); ctx.stroke(); }
    for (let y = 1; y < ROWS; y++) { ctx.beginPath(); ctx.moveTo(0, y * TAM); ctx.lineTo(COLS * TAM, y * TAM); ctx.stroke(); }

    if (!tab) return;

    // blocos fixos
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++)
        if (tab[y][x]) bloco(ctx, x * TAM, y * TAM, tab[y][x]);

    // peça + sombra
    if (atual && (estado === 'jogando' || estado === 'pausado')) {
      let gy = atual.y;
      while (!colide(atual.m, atual.x, gy + 1)) gy++;
      atual.m.forEach((l, y) => l.forEach((v, x) => {
        if (!v) return;
        if (gy + y >= 0) bloco(ctx, (atual.x + x) * TAM, (gy + y) * TAM, PECAS[atual.tipo].cor, TAM, 0.2);
      }));
      atual.m.forEach((l, y) => l.forEach((v, x) => {
        if (v && atual.y + y >= 0) bloco(ctx, (atual.x + x) * TAM, (atual.y + y) * TAM, PECAS[atual.tipo].cor);
      }));
    }

    // efeitos
    efeitos = efeitos.filter(e => (e.t += dt) < e.dur);
    efeitos.forEach(e => {
      const p = e.t / e.dur;
      if (e.tipo === 'linha') {
        ctx.fillStyle = 'rgba(255, 241, 208,' + (1 - p) + ')';
        ctx.fillRect(0, e.y * TAM, COLS * TAM, TAM);
      } else {
        ctx.globalAlpha = 1 - p;
        ctx.fillStyle = '#ffd978';
        ctx.font = '800 22px "Trebuchet MS", sans-serif';
        ctx.textAlign = 'center';
        ctx.strokeStyle = '#2b1a0e'; ctx.lineWidth = 4;
        ctx.strokeText(e.txt, e.x, e.y - p * 40);
        ctx.fillText(e.txt, e.x, e.y - p * 40);
        ctx.globalAlpha = 1;
      }
    });

    desenharMini(ctxProx, cvProx, proxima);
    desenharMini(ctxGuard, cvGuard, guardada);
    if (guardada && !podeGuardar) { cvGuard.style.opacity = '.45'; } else { cvGuard.style.opacity = '1'; }
  }

  // ---------- laço principal ----------
  function laco(agora) {
    const dt = Math.min(100, agora - (ultimo || agora));
    ultimo = agora;
    if (estado === 'jogando') {
      acumulado += dt;
      if (acumulado >= intervalo()) {
        acumulado = 0;
        descer(false);
      }
    }
    desenhar(dt);
    requestAnimationFrame(laco);
  }

  // ---------- entrada ----------
  document.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    const jogoTecla = ['arrowleft','arrowright','arrowdown','arrowup',' ','a','d','s','w','x','z','c','shift','p','enter'];
    if (jogoTecla.includes(k) && document.activeElement && document.activeElement.tagName !== 'BUTTON') e.preventDefault();

    if (k === 'enter') {
      if (estado === 'pronto' || estado === 'fim') iniciar();
      return;
    }
    if (k === 'p' || (k === ' ' && estado === 'pausado')) { e.preventDefault(); alternarPausa(); return; }
    if (estado !== 'jogando') return;

    if (k === 'arrowleft' || k === 'a') mover(-1);
    else if (k === 'arrowright' || k === 'd') mover(1);
    else if (k === 'arrowdown' || k === 's') descer(true);
    else if (k === 'arrowup' || k === 'w' || k === 'x') rotacionar(true);
    else if (k === 'z') rotacionar(false);
    else if (k === ' ') { e.preventDefault(); quedaRapida(); }
    else if (k === 'c' || k === 'shift') guardar();
  });

  el.btnIniciar.addEventListener('click', () => {
    if (estado === 'pausado') alternarPausa(); else iniciar();
  });
  el.btnPausar.addEventListener('click', alternarPausa);

  const acoes = {
    esq: () => mover(-1), dir: () => mover(1), baixo: () => descer(true),
    giro: () => rotacionar(true), queda: quedaRapida, guardar: guardar,
  };
  document.querySelectorAll('.controles button').forEach(b => {
    let rep = null;
    const f = acoes[b.dataset.acao];
    const parar = () => { clearInterval(rep); rep = null; };
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      f();
      if (['esq', 'dir', 'baixo'].includes(b.dataset.acao)) rep = setInterval(f, 110);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, parar));
  });

  // pausa automática ao trocar de aba
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && estado === 'jogando') alternarPausa();
  });

  // ---------- início ----------
  recorde = lerRecorde();
  el.recorde.textContent = recorde;
  el.btnPausar.disabled = true;
  requestAnimationFrame(laco);
})();