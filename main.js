import { GameController } from './game-controller.js?v=20260306a';

// Sanity checklist for HUD startup:
// 1) Confirm key HUD nodes exist (#target, #score, #mode-label/#mode, #next, #reset).
// 2) Log element presence so missing selectors are immediately visible in console.
// 3) Throw a clear error and stop initialization if required HUD nodes are missing.
function validateHudElements() {
  const checks = [
    ['#hud-layer', document.getElementById('hud-layer')],
    ['#target', document.getElementById('target')],
    ['#score', document.getElementById('score')],
    ['#mode-label', document.getElementById('mode-label')],
    ['#mode', document.getElementById('mode')],
    ['#mode-select', document.getElementById('mode-select')],
    ['#next', document.getElementById('next')],
    ['#reset', document.getElementById('reset')],
    ['#play-again', document.getElementById('play-again')]
  ];

  checks.forEach(([selector, el]) => {
    console.info(`[HUD] ${selector}: ${el ? 'found' : 'MISSING'}`);
  });

  const required = checks.filter(([selector]) => selector !== '#mode');
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
