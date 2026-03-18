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
  const modeSelectButton = document.getElementById('mode-select-button');
  const modeSelectLabel = document.getElementById('mode-select-label');
  const modeSelectList = document.getElementById('mode-select-list');
  const modeNormalBtn = document.getElementById('mode-normal');
  const modeLearningBtn = document.getElementById('mode-learning');
  const modeReviewBtn = document.getElementById('mode-review');
  const hardCountEl = document.getElementById('hard-count');
  const mediumCountEl = document.getElementById('medium-count');
  const masteredCountEl = document.getElementById('mastered-count');
  const accuracyRateEl = document.getElementById('accuracy-rate');
  const toastEl = document.getElementById('hud-toast');
  const nextBtn = document.getElementById('next');
  const resetBtn = document.getElementById('reset');
  const playAgainBtn = document.getElementById('play-again');
  let toastTimerId = null;
  let modeOptions = [];
  let modeMenuOpen = false;

  const requiredElements = [
    ['#target', targetEl],
    ['#score', scoreEl],
    ['#progress', progressEl],
    ['#timer', timerEl],
    ['#streak', streakEl],
    ['#wrong-indicator', wrongIndicatorEl],
    ['#mode-label', modeLabelEl],
    ['#mode-select-button', modeSelectButton],
    ['#mode-select-label', modeSelectLabel],
    ['#mode-select-list', modeSelectList],
    ['#mode-normal', modeNormalBtn],
    ['#mode-learning', modeLearningBtn],
    ['#mode-review', modeReviewBtn],
    ['#hard-count', hardCountEl],
    ['#medium-count', mediumCountEl],
    ['#mastered-count', masteredCountEl],
    ['#accuracy-rate', accuracyRateEl],
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

  function setModeMenuOpen(isOpen) {
    modeMenuOpen = Boolean(isOpen);
    modeSelectList.classList.toggle('is-open', modeMenuOpen);
    modeSelectButton.setAttribute('aria-expanded', String(modeMenuOpen));
  }

  return {
    // Builds mode selector options from loaded config.
    setModes(modes) {
      modeOptions = Array.isArray(modes) ? modes : [];
      modeSelectList.innerHTML = '';

      for (const mode of modeOptions) {
        const item = document.createElement('li');
        item.className = 'mode-select__item';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mode-select__option';
        btn.dataset.modeId = mode.id;
        btn.setAttribute('role', 'option');
        btn.textContent = mode.label;
        item.appendChild(btn);
        modeSelectList.appendChild(item);
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
      const mode = modeOptions.find(item => item.id === modeId);
      const modeText = toModeName(mode ? mode.label : 'World');
      if (modeSelectLabel) {
        modeSelectLabel.textContent = mode ? mode.label : 'World';
      }
      const options = modeSelectList.querySelectorAll('.mode-select__option');
      options.forEach(option => {
        const isSelected = option.dataset.modeId === modeId;
        option.classList.toggle('is-selected', isSelected);
        option.setAttribute('aria-selected', String(isSelected));
      });
      if (modeEl) modeEl.textContent = modeText;
      else modeLabelEl.textContent = modeText;
    },

    // Updates active learning mode button highlight.
    setLearningMode(modeId) {
      const isNormal = modeId === 'normal';
      const isLearning = modeId === 'learning';
      const isReview = modeId === 'review';
      modeNormalBtn.classList.toggle('is-active', isNormal);
      modeLearningBtn.classList.toggle('is-active', isLearning);
      modeReviewBtn.classList.toggle('is-active', isReview);
    },

    // Updates learning stats panel values.
    setLearningStats({ hard = 0, medium = 0, mastered = 0, accuracy = 0 } = {}) {
      if (hardCountEl) hardCountEl.textContent = String(hard);
      if (mediumCountEl) mediumCountEl.textContent = String(medium);
      if (masteredCountEl) masteredCountEl.textContent = String(mastered);
      if (accuracyRateEl) accuracyRateEl.textContent = `${Math.round(accuracy)}%`;
    },

    // Wires all HUD controls to controller-provided handlers.
    bindEvents(handlers) {
      modeSelectButton.addEventListener('click', () => setModeMenuOpen(!modeMenuOpen));
      modeSelectList.addEventListener('click', event => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const option = target.closest('.mode-select__option');
        if (!option) return;
        const modeId = option.dataset.modeId;
        if (modeId) {
          handlers.onMode(modeId);
          setModeMenuOpen(false);
        }
      });
      document.addEventListener('click', event => {
        if (!modeMenuOpen) return;
        if (event.target === modeSelectButton || modeSelectButton.contains(event.target)) return;
        if (modeSelectList.contains(event.target)) return;
        setModeMenuOpen(false);
      });
      document.addEventListener('keydown', event => {
        if (!modeMenuOpen) return;
        if (event.key === 'Escape') {
          setModeMenuOpen(false);
          modeSelectButton.focus();
        }
      });
      nextBtn.addEventListener('click', handlers.onNext);
      resetBtn.addEventListener('click', handlers.onReset);
      if (playAgainBtn) {
        playAgainBtn.addEventListener('click', handlers.onPlayAgain);
      }
      if (handlers.onLearningMode) {
        modeNormalBtn.addEventListener('click', () => handlers.onLearningMode('normal'));
        modeLearningBtn.addEventListener('click', () => handlers.onLearningMode('learning'));
        modeReviewBtn.addEventListener('click', () => handlers.onLearningMode('review'));
      }
    }
  };
}
