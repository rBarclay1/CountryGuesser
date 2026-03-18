import { GameController } from './game/game-controller.js';

// Sanity checklist for HUD startup:
// 1) Confirm key HUD nodes exist (#target, #score, #mode-label/#mode, #next, #reset).
// 2) Log element presence so missing selectors are immediately visible in console.
// 3) Throw a clear error and stop initialization if required HUD nodes are missing.
function validateHudElements() {
  const checks = [
    ['#hud-layer', document.getElementById('hud-layer')],
    ['#target', document.getElementById('target')],
    ['#score', document.getElementById('score')],
    ['#progress', document.getElementById('progress')],
    ['#timer', document.getElementById('timer')],
    ['#streak', document.getElementById('streak')],
    ['#wrong-indicator', document.getElementById('wrong-indicator')],
    ['#mode-label', document.getElementById('mode-label')],
    ['#mode', document.getElementById('mode')],
    ['#mode-select', document.getElementById('mode-select')],
    ['#mode-select-button', document.getElementById('mode-select-button')],
    ['#mode-select-label', document.getElementById('mode-select-label')],
    ['#mode-select-list', document.getElementById('mode-select-list')],
    ['#mode-normal', document.getElementById('mode-normal')],
    ['#mode-learning', document.getElementById('mode-learning')],
    ['#mode-review', document.getElementById('mode-review')],
    ['#hard-count', document.getElementById('hard-count')],
    ['#medium-count', document.getElementById('medium-count')],
    ['#mastered-count', document.getElementById('mastered-count')],
    ['#accuracy-rate', document.getElementById('accuracy-rate')],
    ['#next', document.getElementById('next')],
    ['#reset', document.getElementById('reset')],
    ['#play-again', document.getElementById('play-again')]
  ];

  checks.forEach(([selector, el]) => {
    console.info(`[HUD] ${selector}: ${el ? 'found' : 'MISSING'}`);
  });

  const optional = new Set(['#mode', '#play-again']);
  const required = checks.filter(([selector]) => !optional.has(selector));
  const missing = required.filter(([, el]) => !el).map(([selector]) => selector);

  if (missing.length) {
    throw new Error(`[HUD] Initialization failed. Missing required elements: ${missing.join(', ')}`);
  }
}

// Starts the app once the DOM is ready and HUD checks pass.
window.addEventListener('DOMContentLoaded', () => {
  try {
    validateHudElements();
    const game = new GameController();
    game.init();
  } catch (error) {
    console.error('[App] Startup aborted:', error);
  }
});
