// Creates and returns all UI read/write helpers plus event bindings.
export function createUiBindings() {
  const targetEl = document.getElementById('target');
  const scoreEl = document.getElementById('score');
  const progressEl = document.getElementById('progress');
  const timerEl = document.getElementById('timer');
  const streakEl = document.getElementById('streak');
  const wrongIndicatorEl = document.getElementById('wrong-indicator');
  const modeLabelEl = document.getElementById('mode-label');
  const modeEl = document.getElementById('mode');
  const modeSelect = document.getElementById('mode-select');
  const toastEl = document.getElementById('hud-toast');
  const nextBtn = document.getElementById('next');
  const resetBtn = document.getElementById('reset');
  const playAgainBtn = document.getElementById('play-again');
  let toastTimerId = null;
  let modeOptions = [];

  const requiredElements = [
    ['#target', targetEl],
    ['#score', scoreEl],
    ['#progress', progressEl],
    ['#timer', timerEl],
    ['#streak', streakEl],
    ['#wrong-indicator', wrongIndicatorEl],
    ['#mode-label', modeLabelEl],
    ['#mode-select', modeSelect],
    ['#next', nextBtn],
    ['#reset', resetBtn]
  ];
  const missingRequired = requiredElements.filter(([, el]) => !el).map(([id]) => id);
  if (missingRequired.length) {
    throw new Error(`[UI] Missing required HUD elements: ${missingRequired.join(', ')}`);
  }

  // Converts mode label to compact left-side HUD label.
  function toModeName(label) {
    return (label || '').replace(/\s*Quiz$/i, '') || 'World';
  }

  // Renders three-strike indicator as filled/empty dots (for example: 2 of 3).
  function renderWrongDots(count, max = 3) {
    const safeCount = Math.max(0, Math.min(count, max));
    return '\u25CF'.repeat(safeCount) + '\u25CB'.repeat(max - safeCount);
  }

  // Formats elapsed seconds as mm:ss for the HUD timer.
  function formatElapsed(seconds) {
    const safe = Math.max(0, Number(seconds) || 0);
    const mins = Math.floor(safe / 60);
    const secs = safe % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  // Shows a small toast under the HUD pill and auto-hides it.
  function showToast(text, durationMs = 1700) {
    if (!toastEl) return;
    if (toastTimerId !== null) {
      window.clearTimeout(toastTimerId);
      toastTimerId = null;
    }

    if (!text) {
      toastEl.textContent = '';
      toastEl.classList.remove('visible');
      return;
    }

    toastEl.textContent = text;
    toastEl.classList.add('visible');
    toastTimerId = window.setTimeout(() => {
      toastEl.classList.remove('visible');
      toastTimerId = null;
    }, durationMs);
  }

  return {
    // Builds mode selector options from loaded config.
    setModes(modes) {
      modeOptions = Array.isArray(modes) ? modes : [];
      modeSelect.innerHTML = '';

      for (const mode of modeOptions) {
        const option = document.createElement('option');
        option.value = mode.id;
        option.textContent = mode.label;
        modeSelect.appendChild(option);
      }
    },

    // Updates the "Find:" target text.
    setTargetText(text) {
      targetEl.textContent = text;
    },

    // Updates the score display.
    setScore(score) {
      scoreEl.textContent = score;
    },

    // Updates progress text as "correct/total" for current quiz pool.
    setProgress(correct, total) {
      progressEl.textContent = `${correct}/${total}`;
    },

    // Updates elapsed timer in mm:ss format.
    setTimer(seconds) {
      timerEl.textContent = formatElapsed(seconds);
    },

    // Updates the current streak display.
    setStreak(streak) {
      streakEl.textContent = String(streak);
    },

    // Updates the 3-strike visual indicator.
    setWrongGuesses(count) {
      wrongIndicatorEl.textContent = renderWrongDots(count, 3);
    },

    // Shows transient gameplay status text as a floating toast.
    setStatusMessage(text) {
      showToast(text || '');
    },

    // Toggles completed-state controls when a quiz pool is exhausted.
    setCompletionState(isComplete) {
      nextBtn.disabled = isComplete;
      if (playAgainBtn) {
        playAgainBtn.classList.toggle('hidden', !isComplete);
      }
    },

    // Updates mode selector and compact mode label.
    setActiveMode(modeId) {
      modeSelect.value = modeId;
      const mode = modeOptions.find(item => item.id === modeId);
      const modeText = toModeName(mode ? mode.label : 'World');
      if (modeEl) modeEl.textContent = modeText;
      else modeLabelEl.textContent = modeText;
    },

    // Wires all HUD controls to controller-provided handlers.
    bindEvents(handlers) {
      modeSelect.addEventListener('change', () => handlers.onMode(modeSelect.value));
      nextBtn.addEventListener('click', handlers.onNext);
      resetBtn.addEventListener('click', handlers.onReset);
      if (playAgainBtn) {
        playAgainBtn.addEventListener('click', handlers.onPlayAgain);
      }
    }
  };
}
