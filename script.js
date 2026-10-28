(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const directions = ['Up', 'Right', 'Down', 'Left'];
  const angle = { Up: 0, Right: 90, Down: 180, Left: 270 };
  const colors = [
    { name: 'green', value: '#9bff7c' },
    { name: 'blue', value: '#62a9ff' },
    { name: 'brown', value: '#8c5b4e' }
  ];
  const difficultySettings = {
    Easy:       { rounds: 20, interval: 1.5, reaction: 1.00 },
    Medium:     { rounds: 30, interval: 1.0, reaction: 1.00 },
    Hard:       { rounds: 65, interval: 0.7, reaction: 1.00 },
    Impossible:{ rounds:120, interval: 0.65, reaction: 0.42 }
  };

  const menu = $('#menu');
  const hud = $('#hud');
  const eyeStage = $('#eyeStage');
  const eyeRotator = $('#eyeRotator');
  const iris = $('#iris');
  const centerMessage = $('#centerMessage');
  const livesText = $('#livesText');
  const roundNow = $('#roundNow');
  const roundTotal = $('#roundTotal');
  const difficultyLabel = $('#difficultyLabel');
  const resultPanel = $('#resultPanel');
  const flash = $('#flash');
  const statusNote = $('#statusNote');
  const impossibleButton = $('#impossibleButton');

  // Áudio local: os arquivos ficam em assets/audio/.
  const backgroundMusic = new Audio('assets/audio/music.mp3');
  backgroundMusic.loop = true;
  backgroundMusic.volume = 0.24;
  backgroundMusic.preload = 'auto';

  const correctSound = new Audio('assets/audio/correct.mp3');
  correctSound.volume = 0.55;
  correctSound.preload = 'auto';

  const errorSound = new Audio('assets/audio/error.mp3');
  errorSound.volume = 0.58;
  errorSound.preload = 'auto';

  function playSound(sound) {
    try {
      sound.currentTime = 0;
      const playback = sound.play();
      if (playback && typeof playback.catch === 'function') playback.catch(() => {});
    } catch (_) {
      // Falhas de áudio não devem interromper a partida.
    }
  }

  function startBackgroundMusic() {
    if (!backgroundMusic.paused) return;
    playSound(backgroundMusic);
  }

  let currentSide = 'Up';
  let currentDifficulty = null;
  let lives = 3;
  let round = 0;
  let running = false;
  let unlockedImpossible = false;
  try { unlockedImpossible = localStorage.getItem('theEye.impossibleUnlocked') === 'true'; } catch (_) { /* Storage may be unavailable in private or restricted contexts. */ }
  // The value must be initialized before it is used to update the menu.
  if (unlockedImpossible) {
    impossibleButton.disabled = false;
    impossibleButton.classList.remove('locked');
    $('#impossibleMeta').textContent = 'Desbloqueado · 120 ataques';
    $('#impossibleButton .lock-icon').textContent = '✦';
  }
  let sessionId = 0;
  let activeWarnings = new Set();
  let resolvedRounds = new Set();
  let completedCount = 0;

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const isCurrentSession = (id) => running && id === sessionId;

  function setEyeColor() {
    const color = colors[Math.floor(Math.random() * colors.length)];
    document.documentElement.style.setProperty('--accent', color.value);
    iris.setAttribute('aria-label', `Íris ${color.name}`);
  }

  function pointEye(side, instant = false) {
    currentSide = side;
    const turnDuration = currentDifficulty === 'Impossible' ? '.3s' : '.5s';
    eyeRotator.style.transition = instant ? 'none' : `transform ${turnDuration} cubic-bezier(.2,.8,.2,1)`;
    eyeRotator.style.transform = `rotate(${angle[side]}deg)`;
    eyeStage.setAttribute('aria-label', `Olho apontando para ${sideName(side).toLowerCase()}`);
    if (instant) requestAnimationFrame(() => { eyeRotator.style.transition = ''; });
  }

  function sideName(side) {
    return ({ Up:'cima', Right:'a direita', Down:'baixo', Left:'a esquerda' })[side] || side;
  }

  function changeDirection(side) {
    pointEye(side);
    statusNote.textContent = running ? `OLHANDO PARA ${sideName(side).toUpperCase()}` : '';
  }

  function setLives(value) {
    lives = value;
    livesText.textContent = `${'♥ '.repeat(Math.max(0, lives)).trim()}${lives ? '' : '○'}`;
    livesText.style.color = lives === 1 ? '#ff6877' : '#f5f6fa';
  }

  function activateWarning(side) {
    const element = document.querySelector(`.warning[data-side="${side}"]`);
    if (!element) return;
    element.classList.add('active');
    activeWarnings.add(element);
    return element;
  }

  function deactivateWarning(element) {
    if (!element) return;
    element.classList.remove('active');
    activeWarnings.delete(element);
  }

  function clearWarnings() {
    activeWarnings.forEach(el => el.classList.remove('active'));
    activeWarnings.clear();
  }

  function hitFeedback(correct) {
    eyeStage.classList.remove('hit');
    void eyeStage.offsetWidth;
    eyeStage.classList.add('hit');
    if (!correct) {
      flash.classList.remove('on');
      void flash.offsetWidth;
      flash.classList.add('on');
    }
  }

  function endSession(won, id) {
    if (!isCurrentSession(id)) return;
    running = false;
    clearWarnings();
    hud.hidden = true;
    statusNote.textContent = '';
    centerMessage.textContent = '';
    $('#resultEyebrow').textContent = won ? 'RUN COMPLETE' : 'EYE CONTACT LOST';
    $('#resultTitle').textContent = won ? 'Você conseguiu.' : 'A escuridão venceu.';
    $('#resultDescription').textContent = won
      ? `Você sobreviveu aos ${difficultySettings[currentDifficulty].rounds} ataques da dificuldade ${currentDifficulty}.`
      : `Você resistiu a ${completedCount} de ${difficultySettings[currentDifficulty].rounds} ataques. Tente mais uma vez.`;
    resultPanel.hidden = false;
    if (won && currentDifficulty === 'Hard') {
      unlockedImpossible = true;
      try { localStorage.setItem('theEye.impossibleUnlocked', 'true'); } catch (_) { /* The unlock still works for this session. */ }
      impossibleButton.disabled = false;
      impossibleButton.classList.remove('locked');
      $('#impossibleMeta').textContent = 'Desbloqueado · 120 ataques';
      $('#impossibleButton .lock-icon').textContent = '✦';
    }
    if (won) {
      eyeStage.classList.add('victory-spin');
      window.setTimeout(() => eyeStage.classList.remove('victory-spin'), 2150);
    }
  }

  async function doAttack(side, id, attackNumber) {
    const warning = activateWarning(side);
    await sleep(difficultySettings[currentDifficulty].reaction * 1000);
    if (!isCurrentSession(id)) {
      deactivateWarning(warning);
      return;
    }

    resolvedRounds.add(attackNumber);
    completedCount = Math.max(completedCount, resolvedRounds.size);
    const correct = currentSide === side;
    roundNow.textContent = String(completedCount);
    deactivateWarning(warning);
    hitFeedback(correct);

    if (correct) {
      playSound(correctSound);
      centerMessage.textContent = 'DEFESA CONFIRMADA';
      centerMessage.style.color = 'rgba(185,255,167,.8)';
    } else {
      playSound(errorSound);
      setLives(lives - 1);
      centerMessage.textContent = `ATAQUE ${sideName(side).toUpperCase()}`;
      centerMessage.style.color = 'rgba(255,111,126,.9)';
      if (lives <= 0) {
        endSession(false, id);
        return;
      }
    }
    window.setTimeout(() => {
      if (isCurrentSession(id)) {
        centerMessage.textContent = '';
        centerMessage.style.color = '';
      }
    }, 430);

    if (completedCount >= difficultySettings[currentDifficulty].rounds && resolvedRounds.size >= difficultySettings[currentDifficulty].rounds) {
      // Allow any final overlapping attack to resolve before declaring victory.
      const settings = difficultySettings[currentDifficulty];
      window.setTimeout(() => {
        if (isCurrentSession(id) && lives > 0 && completedCount >= settings.rounds) endSession(true, id);
      }, settings.reaction * 1000 + 60);
    }
  }

  async function startGame(difficulty) {
    if (!difficultySettings[difficulty] || (difficulty === 'Impossible' && !unlockedImpossible)) return;
    // O clique na dificuldade libera a reprodução da música nos navegadores.
    startBackgroundMusic();
    sessionId += 1;
    const id = sessionId;
    currentDifficulty = difficulty;
    running = true;
    completedCount = 0;
    round = 0;
    resolvedRounds = new Set();
    clearWarnings();
    setLives(3);
    pointEye('Up', true);
    setEyeColor();

    menu.hidden = true;
    resultPanel.hidden = true;
    hud.hidden = false;
    difficultyLabel.textContent = difficulty.toUpperCase();
    roundNow.textContent = '0';
    roundTotal.textContent = String(difficultySettings[difficulty].rounds);
    centerMessage.textContent = 'PREPARE-SE';
    statusNote.textContent = 'SIGA O SINAL DE LUZ';
    await sleep(800);
    if (!isCurrentSession(id)) return;
    centerMessage.textContent = '';
    statusNote.textContent = '';

    const settings = difficultySettings[difficulty];
    for (let i = 1; i <= settings.rounds; i++) {
      if (!isCurrentSession(id) || lives <= 0) break;
      round = i;
      const side = directions[Math.floor(Math.random() * directions.length)];
      // Schedule attacks at the original script's interval; faster modes can overlap.
      void doAttack(side, id, i);
      await sleep(settings.interval * 1000);
    }

    // Wait for all scheduled attacks to finish before showing success.
    const finalWait = settings.reaction * 1000 + 100;
    await sleep(finalWait);
    if (isCurrentSession(id) && lives > 0 && completedCount >= settings.rounds) endSession(true, id);
    else if (isCurrentSession(id) && lives > 0) {
      // If the loop has finished but the last callbacks have not all settled yet, give them a brief final window.
      await sleep(finalWait);
      if (isCurrentSession(id) && lives > 0) endSession(completedCount >= settings.rounds, id);
    }
  }

  function showMenu() {
    sessionId += 1;
    running = false;
    clearWarnings();
    resultPanel.hidden = true;
    hud.hidden = true;
    menu.hidden = false;
    centerMessage.textContent = 'Escolha uma dificuldade';
    centerMessage.style.color = '';
    statusNote.textContent = '';
    pointEye('Up', true);
    setEyeColor();
  }

  document.querySelectorAll('[data-direction]').forEach(button => {
    const side = button.dataset.direction;
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      changeDirection(side);
    });
  });

  const keyMap = {
    w:'Up', arrowup:'Up', s:'Down', arrowdown:'Down',
    a:'Left', arrowleft:'Left', d:'Right', arrowright:'Right'
  };
  window.addEventListener('keydown', (event) => {
    const side = keyMap[event.key.toLowerCase()];
    if (!side || event.repeat) return;
    event.preventDefault();
    changeDirection(side);
  }, { passive: false });

  document.querySelectorAll('[data-difficulty]').forEach(button => {
    button.addEventListener('click', () => {
      if (button.disabled) return;
      void startGame(button.dataset.difficulty);
    });
  });
  $('#returnButton').addEventListener('click', showMenu);

  setLives(3);
  setEyeColor();
  showMenu();
})();
