
import { AfterlightGame } from './game.js';
import { AudioManager } from './audio.js';
import { POWER_INFO, DISTRICTS } from './config.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const elements = {
  homeScreen: $('#homeScreen'), gameScreen: $('#gameScreen'), siteFooter: $('#siteFooter'),
  modeModal: $('#modeModal'), howModal: $('#howModal'),
  canvas: $('#gameCanvas'), gameStage: $('#gameStage'),
  pauseOverlay: $('#pauseOverlay'), resultOverlay: $('#resultOverlay'),
  countdownCover: $('#countdownCover'), countdownNumber: $('#countdownNumber'),
  soundToggle: $('#soundToggle'), mobileMenu: $('#mobileMenu'), mobileMenuButton: $('#mobileMenuButton')
};

const audio = new AudioManager();
let selectedMode = 'endless';
let currentGame = null;
let session = { runs: 0, best: 0, longestDistance: 0, energy: 0, achievements: new Set() };
let toastTimer = 0;
let countdownTimer = 0;

function showToast(message) {
  const toast = $('#globalToast');
  toast.textContent = message;
  toast.classList.add('visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 1900);
}

function setScreen(screen) {
  const isGame = screen === 'game';
  elements.homeScreen.hidden = isGame;
  elements.gameScreen.hidden = !isGame;
  elements.siteFooter.hidden = isGame;
  $('#topbar').hidden = isGame;
  window.scrollTo(0, 0);
  if (isGame && currentGame) currentGame.resize();
}

function openModeModal() {
  audio.play('click');
  elements.modeModal.hidden = false;
  selectedMode = 'endless';
  $$('.mode-option').forEach((button) => button.classList.toggle('selected', button.dataset.mode === selectedMode));
}

function closeModeModal() { elements.modeModal.hidden = true; }
function openHowModal() { audio.play('click'); elements.howModal.hidden = false; }
function closeHowModal() { elements.howModal.hidden = true; }

function updateHomeStats() {
  $('#homeBest').textContent = session.best.toLocaleString();
  $('#homeDistance').innerHTML = `${session.longestDistance.toLocaleString()}<span>m</span>`;
  $('#homeEnergy').textContent = session.energy.toLocaleString();
  $('#homeRuns').textContent = session.runs.toLocaleString();
}

function formatScore(value) { return Math.max(0, Math.floor(value)).toString().padStart(6, '0'); }

function setHealth(value) {
  const health = $('#hudHealth');
  health.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const pip = document.createElement('i');
    if (i >= value) pip.classList.add('empty');
    health.append(pip);
  }
  health.setAttribute('aria-label', `${value} health points remaining`);
}

function renderMissionLists(missions) {
  const list = $('#sideMissionList');
  list.innerHTML = '';
  for (const mission of missions) {
    const row = document.createElement('div');
    row.className = `side-mission${mission.done ? ' done' : ''}`;
    const check = document.createElement('span');
    check.className = 'side-mission-check';
    check.textContent = mission.done ? '✓' : '·';
    const content = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = mission.short;
    const progress = document.createElement('small');
    const shown = mission.id === 'survive' ? Math.floor(mission.progress) : Math.floor(mission.progress);
    progress.textContent = mission.done ? `COMPLETE · +${mission.reward}` : `${shown}/${mission.target} ${mission.unit}`;
    content.append(title, progress);
    row.append(check, content);
    list.append(row);
  }
}

function updateGameHUD(snapshot) {
  $('#hudScore').textContent = formatScore(snapshot.score);
  $('#hudDistance').innerHTML = `${snapshot.distance.toLocaleString()} <i>m</i>`;
  $('#hudEnergy').textContent = snapshot.energy.toLocaleString();
  $('#hudCombo').textContent = `COMBO x${snapshot.multiplier}`;
  $('#hudDistrict').textContent = snapshot.district;
  setHealth(snapshot.health);
  $('#missionChip').hidden = snapshot.missions.length === 0;
  const activeMission = snapshot.missions.find((mission) => !mission.done) || snapshot.missions[0];
  if (activeMission) {
    $('#missionText').textContent = activeMission.short;
    $('#missionProgress').textContent = activeMission.done ? 'DONE' : `${Math.floor(activeMission.progress)}/${activeMission.target}`;
  }
  $('#sideSpeed').innerHTML = `${snapshot.speedRatio.toFixed(1)}<span>x</span>`;
  $('#speedBar').style.width = `${Math.min(100, (snapshot.speedRatio / 1.8) * 100)}%`;
  const power = snapshot.activePower;
  $('#sidePower').textContent = snapshot.shield ? 'ENERGY SHIELD' : (POWER_INFO[power]?.name || 'NONE');
  $('#sidePowerHint').textContent = snapshot.shield ? 'One collision absorbed' : power && snapshot.powerRemaining > 0 ? `${snapshot.powerRemaining.toFixed(1)} seconds remaining` : 'Find a glowing tech core';
  const powerStatus = $('#powerStatus');
  if (snapshot.shield || (power && snapshot.powerRemaining > 0)) {
    powerStatus.hidden = false;
    powerStatus.textContent = snapshot.shield ? '⬡ SHIELD READY' : `${POWER_INFO[power]?.name || power} · ${snapshot.powerRemaining.toFixed(1)}s`;
  } else powerStatus.hidden = true;
  if (snapshot.mode === 'time') {
    $('#gameModeLabel').innerHTML = `TIME ATTACK <span>•</span> ${snapshot.timeLeft}s LEFT`;
  } else {
    $('#gameModeLabel').innerHTML = `ENDLESS RUN <span>•</span> NOVA-9`;
  }
  renderMissionLists(snapshot.missions);
}

function calculateAchievements(result) {
  const earned = [];
  if (session.runs === 1) earned.push('FIRST FLIGHT');
  if (result.energy >= 50) earned.push('CRYSTAL HUNTER');
  if (result.hits === 0 && result.elapsed >= 60) earned.push('CLEAN RUN');
  if (result.combo >= 12) earned.push('COMBO MASTER');
  if (result.distance >= 2000) earned.push('CITY LEGEND');
  if (result.powerups >= 4) earned.push('TECH COLLECTOR');
  return earned.filter((achievement) => {
    if (session.achievements.has(achievement)) return false;
    session.achievements.add(achievement);
    return true;
  });
}

function performanceRank(result) {
  if (result.score >= 12000 || result.distance >= 2500) return 'AFTERLIGHT MASTER';
  if (result.score >= 7000 || result.distance >= 1500) return 'CITY LEGEND';
  if (result.score >= 3500 || result.distance >= 800) return 'NEON SURVIVOR';
  if (result.score >= 1200 || result.distance >= 300) return 'STREET RUNNER';
  return 'ROOKIE COURIER';
}

function showResult(result) {
  session.runs++;
  session.best = Math.max(session.best, result.score);
  session.longestDistance = Math.max(session.longestDistance, result.distance);
  session.energy += result.energy;
  updateHomeStats();
  const earned = calculateAchievements(result);
  $('#resultEyebrow').textContent = result.reason === 'time' ? 'TIME EXPIRED // SIGNAL RECEIVED' : 'RUN COMPLETE // SIGNAL RECEIVED';
  $('#resultTitle').innerHTML = result.reason === 'time' ? 'TIME IS<br><span>UP.</span>' : result.hits >= 3 ? 'NOVA-9<br><span>GOT YOU.</span>' : 'NICE<br><span>RUN.</span>';
  const messages = result.score > 7000 ? 'The city felt that one. Absolutely electric.' : result.score > 3000 ? 'You are learning the rhythm of the city.' : 'Every run makes the next one stronger.';
  $('#resultMessage').textContent = messages;
  $('#resultScore').textContent = result.score.toLocaleString();
  $('#resultBestVisit').textContent = session.best.toLocaleString();
  $('#resultRank').textContent = performanceRank(result);
  $('#resultDistance').textContent = `${result.distance.toLocaleString()}m`;
  $('#resultEnergy').textContent = result.energy.toLocaleString();
  $('#resultAvoided').textContent = result.avoided.toLocaleString();
  $('#resultMissions').textContent = `${result.missionsCompleted}/3`;
  $('#resultAchievements').textContent = earned.length ? `✦ NEW: ${earned.join('  /  ')}` : (result.missionsCompleted ? '✦ MISSIONS COMPLETED — NICE WORK' : '');
  elements.resultOverlay.hidden = false;
  elements.pauseOverlay.hidden = true;
  $('#pauseButton').disabled = true;
  audio.stopMusic();
}

function startGame(mode = selectedMode) {
  closeModeModal();
  closeHowModal();
  selectedMode = mode;
  if (currentGame) currentGame.destroy();
  currentGame = new AfterlightGame(elements.canvas, audio, {
    onStart: (snapshot) => {
      setScreen('game');
      elements.pauseOverlay.hidden = true;
      elements.resultOverlay.hidden = true;
      $('#pauseButton').disabled = true;
      $('#gameModeLabel').textContent = mode === 'time' ? 'TIME ATTACK • 60 SECONDS' : 'ENDLESS RUN • NOVA-9';
      $('#fieldTip').textContent = DISTRICTS[0].tip;
      updateGameHUD(snapshot);
      audio.play('start');
      audio.setMusicEnabled(false);
      currentGame.pause();
      startCountdown(true);
    },
    onUpdate: updateGameHUD,
    onEnd: showResult,
    onMission: (mission) => showToast(`MISSION COMPLETE: ${mission.short}`),
    onDistrict: (district) => { $('#fieldTip').textContent = district.tip; },
    onToast: (message) => { /* Canvas also displays the in-run notification. */ }
  });
  currentGame.start(mode);
  updateGameHUD(currentGame.snapshot());
}

function startCountdown(resumeAfter = false) {
  window.clearInterval(countdownTimer);
  let count = 3;
  elements.countdownCover.hidden = false;
  $('#countdownNumber').textContent = count;
  countdownTimer = window.setInterval(() => {
    count--;
    if (count <= 0) {
      window.clearInterval(countdownTimer);
      elements.countdownCover.hidden = true;
      if (resumeAfter) {
        currentGame?.resume();
        $('#pauseButton').disabled = false;
      }
      return;
    }
    $('#countdownNumber').textContent = count;
  }, 420);
}

function returnHome() {
  window.clearInterval(countdownTimer);
  if (currentGame) { currentGame.destroy(); currentGame = null; }
  elements.pauseOverlay.hidden = true;
  elements.resultOverlay.hidden = true;
  elements.countdownCover.hidden = true;
  setScreen('home');
  updateHomeStats();
  audio.stopMusic();
}

function pauseGame() {
  if (!currentGame || currentGame.state !== 'running') return;
  currentGame.pause();
  audio.play('pause');
  elements.pauseOverlay.hidden = false;
  $('#pauseButton').disabled = true;
}

function resumeGame() {
  if (!currentGame || currentGame.state !== 'paused') return;
  elements.pauseOverlay.hidden = true;
  $('#pauseButton').disabled = false;
  let count = 3;
  elements.countdownCover.hidden = false;
  $('#countdownNumber').textContent = count;
  window.clearInterval(countdownTimer);
  countdownTimer = window.setInterval(() => {
    count--;
    if (count <= 0) {
      window.clearInterval(countdownTimer);
      elements.countdownCover.hidden = true;
      currentGame?.resume();
      return;
    }
    $('#countdownNumber').textContent = count;
  }, 420);
}

function restartCurrentRun() {
  const mode = currentGame?.mode || selectedMode;
  startGame(mode);
}

function handleAction(action) {
  if (!currentGame || currentGame.state !== 'running') return;
  if (action === 'left') currentGame.move(-1);
  if (action === 'right') currentGame.move(1);
  if (action === 'jump') currentGame.jump();
  if (action === 'slide') currentGame.slide();
}

function setupInput() {
  window.addEventListener('keydown', (event) => {
    if (elements.gameScreen.hidden || !currentGame) return;
    const key = event.key.toLowerCase();
    const controls = ['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' ', 'w', 'a', 's', 'd'];
    if (controls.includes(key)) event.preventDefault();
    if (key === 'arrowleft' || key === 'a') handleAction('left');
    else if (key === 'arrowright' || key === 'd') handleAction('right');
    else if (key === 'arrowup' || key === 'w' || key === ' ') handleAction('jump');
    else if (key === 'arrowdown' || key === 's') handleAction('slide');
    else if ((key === 'escape' || key === 'p') && currentGame.state === 'running') pauseGame();
    else if ((key === 'escape' || key === 'p') && currentGame.state === 'paused') resumeGame();
  });

  $$('.touch-controls button').forEach((button) => {
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      handleAction(button.dataset.action);
    });
  });

  let touchStart = null;
  elements.gameStage.addEventListener('touchstart', (event) => {
    if (event.target.closest('.touch-controls') || event.target.closest('.game-overlay')) return;
    const touch = event.changedTouches[0];
    touchStart = { x: touch.clientX, y: touch.clientY, time: Date.now() };
  }, { passive: true });
  elements.gameStage.addEventListener('touchend', (event) => {
    if (!touchStart || event.target.closest('.touch-controls') || event.target.closest('.game-overlay')) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStart.x;
    const dy = touch.clientY - touchStart.y;
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (Math.max(ax, ay) > 24) {
      if (ax > ay) handleAction(dx < 0 ? 'left' : 'right');
      else handleAction(dy < 0 ? 'jump' : 'slide');
    }
    touchStart = null;
  }, { passive: true });
  elements.gameStage.addEventListener('touchmove', (event) => {
    if (event.target.closest('.touch-controls')) return;
    if (currentGame && currentGame.state === 'running') event.preventDefault();
  }, { passive: false });
}

function setupEvents() {
  ['#headerPlay', '#heroPlay', '#footerPlay', '#mobilePlay'].forEach((selector) => $(selector).addEventListener('click', openModeModal));
  $('#heroHow').addEventListener('click', openHowModal);
  $('#guidePlayButton').addEventListener('click', () => { closeHowModal(); openModeModal(); });
  $('#closeModeModal').addEventListener('click', closeModeModal);
  $('#closeHowModal').addEventListener('click', closeHowModal);
  $('#confirmModeButton').addEventListener('click', () => startGame(selectedMode));
  $$('.mode-option').forEach((button) => button.addEventListener('click', () => {
    selectedMode = button.dataset.mode;
    $$('.mode-option').forEach((option) => option.classList.toggle('selected', option === button));
    audio.play('click');
  }));
  $('#pauseButton').addEventListener('click', pauseGame);
  $('#resumeButton').addEventListener('click', resumeGame);
  $('#restartButton').addEventListener('click', restartCurrentRun);
  $('#pauseHomeButton').addEventListener('click', returnHome);
  $('#gameHome').addEventListener('click', () => {
    if (currentGame?.state === 'running') pauseGame();
    else returnHome();
  });
  $('#playAgainButton').addEventListener('click', () => startGame(currentGame?.mode || selectedMode));
  $('#changeModeButton').addEventListener('click', () => { elements.resultOverlay.hidden = true; openModeModal(); });
  $('#resultHomeButton').addEventListener('click', returnHome);
  elements.soundToggle.addEventListener('click', () => {
    const enabled = !audio.enabled;
    audio.setEnabled(enabled);
    elements.soundToggle.innerHTML = `<span class="sound-icon">${enabled ? '♫' : '♪'}</span><span class="sound-label">SOUND ${enabled ? 'ON' : 'OFF'}</span>`;
    showToast(`SOUND ${enabled ? 'ON' : 'OFF'}`);
  });
  $('#mobileMenuButton').addEventListener('click', () => {
    const isHidden = elements.mobileMenu.hidden;
    elements.mobileMenu.hidden = !isHidden;
    $('#mobileMenuButton').setAttribute('aria-expanded', String(isHidden));
  });
  $$('[data-how-link]').forEach((link) => link.addEventListener('click', (event) => { event.preventDefault(); elements.mobileMenu.hidden = true; openHowModal(); }));
  $$('[data-power-link], [data-missions-link]').forEach((link) => link.addEventListener('click', () => { elements.mobileMenu.hidden = true; }));
  $$('[data-home-link]').forEach((link) => link.addEventListener('click', (event) => { event.preventDefault(); elements.mobileMenu.hidden = true; window.scrollTo({ top: 0, behavior: 'smooth' }); }));
  [elements.modeModal, elements.howModal].forEach((modal) => modal.addEventListener('click', (event) => { if (event.target === modal) modal.hidden = true; }));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && currentGame?.state === 'running') pauseGame();
  });
}

setupEvents();
setupInput();
updateHomeStats();
