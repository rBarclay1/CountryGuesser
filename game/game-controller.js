import {
  WORLD_TOPO_URL,
  COUNTRY_META_URL,
  CONTINENTS_CONFIG_URL,
  CAP_DEFAULT,
  BORDER_WORLD,
  BORDER_ACTIVE,
  BORDER_DIM,
  WRONG_FLASH,
  CORRECT_FILL,
  REVEAL_FILL,
  ALTITUDE_BASE
} from '../config.js';
import { normalizeNumericCode, buildContinentMap, getFeatureCentroid } from '../utils/geo-utils.js';
import { createUiBindings } from '../ui/hud.js';
import { LearningStore } from '../learning/learning-store.js';
import { getWeightedRandomCountry, pickReviewCountry } from '../learning/learning-select.js';

const LEARNING_MODE = 'learning';
const REVIEW_MODE = 'review';

export class GameController {
  // Initializes game state containers and UI bindings.
  constructor() {
    this.globe = null;
    this.countriesGeoJson = null;
    this.modesById = new Map();
    this.activeModeId = 'world';
    this.activePool = [];
    this.targetCountry = null;
    this.score = 0;
    this.quizTotal = 0;
    this.streak = 0;
    this.timerSeconds = 0;
    this.timerStarted = false;
    this.timerIntervalId = null;

    this.modeToken = 0;
    this.targetToken = 0;
    this.flyToTimerId = null;

    this.guessed = new Set();
    this.colorById = new Map();
    this.revealedTargetId = null;
    this.revealLabelData = [];
    this.wrongLabelData = [];
    this.revealAdvanceTimerId = null;
    this.canGuessCurrentTarget = true;
    // Tracks incorrect attempts for the currently active target country.
    this.wrongGuessCount = 0;
    // Learning mode stats keyed by country name.
    this.learningStore = new LearningStore();
    this.learningModeEnabled = false;
    this.reviewModeEnabled = false;

    this.ui = createUiBindings();
  }

  // Bootstraps globe, UI handlers, remote data, and starts in world mode.
  async init() {
    this.setupGlobe();
    this.bindUiEvents();

    try {
      const [topo, countryMeta, continentsConfig] = await Promise.all([
        this.fetchJson(WORLD_TOPO_URL),
        this.fetchJson(COUNTRY_META_URL),
        this.fetchJson(CONTINENTS_CONFIG_URL)
      ]);

      const modes = Array.isArray(continentsConfig.modes) ? continentsConfig.modes : [];
      for (const mode of modes) {
        this.modesById.set(mode.id, mode);
      }
      this.ui.setModes(modes);

      this.countriesGeoJson = topojson.feature(topo, topo.objects.countries);
      const continentByNumeric = buildContinentMap(countryMeta);
      const subregionByNumeric = new Map();

      for (const item of countryMeta) {
        const numeric = normalizeNumericCode(item.ccn3);
        if (!numeric) continue;
        subregionByNumeric.set(numeric, item.subregion || null);
      }

      for (const feature of this.countriesGeoJson.features) {
        const idStr = normalizeNumericCode(feature.id);
        feature.properties = feature.properties || {};
        feature.properties.idStr = idStr;
        feature.properties.continent = continentByNumeric.get(idStr) || null;
        feature.properties.subregion = subregionByNumeric.get(idStr) || null;
      }

      this.globe.polygonsData(this.countriesGeoJson.features);
      this.applyGlobeStyles();
      await this.setMode('world');
    } catch (error) {
      console.error('Initialization failed:', error);
      this.ui.setTargetText('Failed to load data');
      this.ui.setStatusMessage('Data load failed');
    }
  }

  // Fetches JSON and throws a clear error on non-2xx responses.
  async fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Request failed (${response.status}) for ${url}`);
    }
    return response.json();
  }

  // Updates per-country learning stats and recalculates difficulty.
  updateCountryStats(countryName, wasCorrect) {
    const stats = this.learningStore.updateCountryStats(countryName, wasCorrect);
    this.updateLearningStatsHud();
    return stats;
  }

  // Pushes learning stats summary into the HUD.
  updateLearningStatsHud() {
    const summary = this.learningStore.computeSummary();
    this.ui.setLearningStats(summary);
  }

  // Connects UI events to controller actions.
  bindUiEvents() {
    this.ui.bindEvents({
      onMode: modeId => this.setMode(modeId),
      onLearningMode: modeId => {
        this.setLearningMode(modeId === 'learning');
        this.setReviewMode(modeId === 'review');
        this.ui.setLearningMode(modeId);
      },
      onNext: () => {
        if (this.targetCountry) this.updateTarget();
      },
      onReset: () => {
        this.resetModeProgress();
        this.updateTarget();
      },
      onPlayAgain: () => {
        this.resetModeProgress();
        this.updateTarget();
      }
    });
  }

  // Creates and configures the globe.gl instance and resize handling.
  setupGlobe() {
    const container = document.getElementById('globe-container');

    this.globe = Globe()(container)
      .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
      .showAtmosphere(true)
      .enablePointerInteraction(true)
      .polygonsData([])
      .polygonCapColor(() => CAP_DEFAULT)
      .polygonStrokeColor(() => BORDER_WORLD)
      .polygonSideColor(() => 'rgba(0,0,0,0)')
      .polygonAltitude(ALTITUDE_BASE)
      .htmlElementsData([])
      .htmlLat(d => d.lat)
      .htmlLng(d => d.lng)
      .htmlAltitude(d => d.altitude || 0.05)
      .htmlElement(d => {
        const el = document.createElement('div');
        el.className = d.type === 'wrong' ? 'guess-label guess-label--wrong' : 'guess-label';
        el.textContent = d.name || '';
        return el;
      })
      .onPolygonClick(feature => this.onPolygonClick(feature));

    const renderer = this.globe.renderer();
    const camera = this.globe.camera();
    camera.near = 1.5;
    camera.far = 2000;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);

    window.addEventListener('resize', () => {
      renderer.setSize(container.clientWidth, container.clientHeight);
    });
  }

  // Returns mode config by id with a world fallback.
  getMode(modeId) {
    return this.modesById.get(modeId) || this.modesById.get('world');
  }

  // Indicates whether the active mode is world mode.
  isWorldMode() {
    return this.activeModeId === 'world';
  }

  // Checks whether a country feature belongs to the currently selected mode.
  isFeatureInActiveMode(feature) {
    const mode = this.getMode(this.activeModeId);
    if (!mode) return true;

    if (mode.continent && feature.properties.continent !== mode.continent) {
      return false;
    }

    if (Array.isArray(mode.subregions) && mode.subregions.length) {
      return mode.subregions.includes(feature.properties.subregion);
    }

    return true;
  }

  // Applies cap/stroke/altitude accessors using current state maps/sets.
  applyGlobeStyles() {
    this.globe
      .polygonCapColor(d => this.colorById.get(d.properties.idStr) || CAP_DEFAULT)
      .polygonStrokeColor(d => {
        if (this.isWorldMode()) return BORDER_WORLD;
        return this.isFeatureInActiveMode(d) ? BORDER_ACTIVE : BORDER_DIM;
      })
      .polygonAltitude(ALTITUDE_BASE);
  }

  // Stores cap color in a stable map keyed by country id.
  setCountryVisual(id, color) {
    if (!id) return;
    this.colorById.set(id, color);
  }

  // Removes per-country visual override so default cap applies.
  clearCountryVisual(id) {
    if (!id) return;
    this.colorById.delete(id);
  }

  // Recomputes the selectable country pool for the active mode.
  refreshPool() {
    if (!this.countriesGeoJson) {
      this.activePool = [];
      this.quizTotal = 0;
      this.ui.setProgress(this.score, this.quizTotal);
      return;
    }

    this.activePool = this.countriesGeoJson.features.filter(feature => {
      if (this.isWorldMode()) return true;
      return this.isFeatureInActiveMode(feature);
    });

    this.quizTotal = this.activePool.length;
    this.ui.setProgress(this.score, this.quizTotal);
  }

  // Picks a random unguessed country from the current mode pool.
  pickRandomCountry() {
    const available = this.activePool.filter(feature => !this.guessed.has(feature.properties.idStr));
    if (!available.length) return null;

    if (this.reviewModeEnabled) {
      const reviewPick = pickReviewCountry(available, this.learningStore, 5);
      if (reviewPick) return reviewPick;
    }

    if (this.learningModeEnabled) {
      const chosenName = getWeightedRandomCountry(available, this.learningStore);
      if (chosenName) {
        const chosen = available.find(feature => feature.properties.name === chosenName);
        if (chosen) return chosen;
      }
    }

    const index = Math.floor(Math.random() * available.length);
    return available[index];
  }

  // Enables or disables learning mode selection behavior.
  setLearningMode(enabled) {
    this.learningModeEnabled = Boolean(enabled);
  }

  // Enables or disables review mode selection behavior.
  setReviewMode(enabled) {
    this.reviewModeEnabled = Boolean(enabled);
  }

  // Removes the yellow reveal highlight when moving to a new target.
  clearRevealHighlight() {
    if (!this.revealedTargetId) return;
    if (this.colorById.get(this.revealedTargetId) === REVEAL_FILL) {
      this.clearCountryVisual(this.revealedTargetId);
    }
    this.revealedTargetId = null;
    this.clearRevealLabel();
    this.clearRevealAdvance();
  }

  // Clears the on-globe reveal label.
  clearRevealLabel() {
    if (!this.revealLabelData.length) return;
    this.revealLabelData = [];
    this.syncGuessLabels();
  }

  // Cancels any scheduled auto-advance after reveal.
  clearRevealAdvance() {
    if (this.revealAdvanceTimerId !== null) {
      window.clearTimeout(this.revealAdvanceTimerId);
      this.revealAdvanceTimerId = null;
    }
  }

  // Clears the last wrong-guess label.
  clearWrongLabel() {
    if (!this.wrongLabelData.length) return;
    this.wrongLabelData = [];
    this.syncGuessLabels();
  }

  // Syncs both reveal + wrong labels to the globe.
  syncGuessLabels() {
    const data = [...this.revealLabelData, ...this.wrongLabelData];
    this.globe.htmlElementsData(data);
  }

  // Resets per-target wrong-guess tracking and unlocks guessing.
  resetWrongGuessTracking() {
    this.wrongGuessCount = 0;
    this.canGuessCurrentTarget = true;
    this.ui.setWrongGuesses(0);
  }

  // Starts elapsed timer on first guess and updates HUD once per second.
  startTimerIfNeeded() {
    if (this.timerStarted) return;
    this.timerStarted = true;
    this.timerIntervalId = window.setInterval(() => {
      this.timerSeconds += 1;
      this.ui.setTimer(this.timerSeconds);
    }, 1000);
  }

  // Stops elapsed timer without resetting displayed value.
  stopTimer() {
    if (this.timerIntervalId !== null) {
      window.clearInterval(this.timerIntervalId);
      this.timerIntervalId = null;
    }
  }

  // Resets elapsed timer to 00:00 for a new quiz run.
  resetTimer() {
    this.timerSeconds = 0;
    this.timerStarted = false;
    this.ui.setTimer(0);
  }

  // Advances to a new target (or completion state) and resets per-target UI state.
  updateTarget() {
    this.targetToken += 1;
    this.clearRevealHighlight();
    this.targetCountry = this.pickRandomCountry();
    this.resetWrongGuessTracking();
    this.ui.setStatusMessage('');

    if (!this.targetCountry) {
      const mode = this.getMode(this.activeModeId);
      const modeLabel = mode && mode.label ? mode.label.replace(' Quiz', '') : 'Quiz';
      this.stopTimer();
      this.ui.setTargetText(`Completed ${modeLabel}!`);
      this.ui.setCompletionState(true);
      this.ui.setStatusMessage(`Completed ${modeLabel}!`);
      return;
    }

    this.ui.setCompletionState(false);
    this.ui.setTargetText(this.targetCountry.properties.name || '-');
  }

  // Resets round progress for the active mode while keeping loaded data intact.
  resetModeProgress() {
    this.targetToken += 1;
    this.guessed.clear();
    this.colorById.clear();
    this.clearRevealHighlight();
    this.clearRevealLabel();
    this.clearRevealAdvance();
    this.resetWrongGuessTracking();

    this.score = 0;
    this.streak = 0;
    this.targetCountry = null;
    this.stopTimer();
    this.resetTimer();

    this.ui.setStatusMessage('');
    this.ui.setScore(this.score);
    this.ui.setStreak(this.streak);
    this.updateLearningStatsHud();
    this.refreshPool();
    this.applyGlobeStyles();
  }

  // Animates camera movement and ensures older pending fly-to timers are cleared.
  flyTo(pov, durationMs = 1200) {
    return new Promise(resolve => {
      if (this.flyToTimerId !== null) {
        window.clearTimeout(this.flyToTimerId);
        this.flyToTimerId = null;
      }

      this.globe.pointOfView(pov, durationMs);
      this.flyToTimerId = window.setTimeout(() => {
        this.flyToTimerId = null;
        resolve();
      }, durationMs);
    });
  }

  // Reveals the current target after 3 misses and flies camera to its centroid.
  async revealCurrentTarget() {
    if (!this.targetCountry) return;

    const id = this.targetCountry.properties.idStr;
    if (!id) return;
    const revealToken = this.targetToken;
    const targetName = this.targetCountry.properties.name || 'Unknown';

    this.canGuessCurrentTarget = false;
    this.revealedTargetId = id;
    this.setCountryVisual(id, REVEAL_FILL);
    this.applyGlobeStyles();

    const currentPov = this.globe.pointOfView();
    const centroid = getFeatureCentroid(this.targetCountry);
    this.revealLabelData = [
      {
        name: targetName,
        type: 'reveal',
        lat: centroid.lat,
        lng: centroid.lng,
        altitude: Math.min(currentPov.altitude || 2, 1.35) * 0.03
      }
    ];
    this.syncGuessLabels();
    await this.flyTo(
      {
        lat: centroid.lat,
        lng: centroid.lng,
        altitude: Math.min(currentPov.altitude || 2, 1.35)
      },
      1200
    );

    if (revealToken !== this.targetToken || this.revealedTargetId !== id) return;
    this.ui.setStatusMessage('Revealed after 3 incorrect guesses');
    this.clearRevealAdvance();
    this.revealAdvanceTimerId = window.setTimeout(() => {
      if (revealToken !== this.targetToken) return;
      this.guessed.add(id);
      this.clearRevealLabel();
      this.updateTarget();
    }, 400);
  }

  // Switches active mode, resets mode progress, flies to mode POV, then picks target.
  async setMode(modeId) {
    if (!this.modesById.has(modeId)) return;

    this.activeModeId = modeId;
    this.modeToken += 1;
    const token = this.modeToken;

    this.ui.setActiveMode(modeId);
    this.resetModeProgress();
    this.ui.setCompletionState(false);
    this.ui.setTargetText('...');

    const mode = this.getMode(modeId);
    await this.flyTo(mode.focus, 1200);

    if (token !== this.modeToken) return;
    this.updateTarget();
  }

  // Handles polygon guesses, including correct hits, miss flashes, and 3-strike reveal.
  onPolygonClick(feature) {
    if (!feature || !this.targetCountry) return;
    if (!this.canGuessCurrentTarget) return;

    const id = feature.properties.idStr;
    if (!id || this.guessed.has(id)) return;
    if (!this.isWorldMode() && !this.isFeatureInActiveMode(feature)) return;

    this.startTimerIfNeeded();

    if (id === this.targetCountry.properties.idStr) {
      this.resetWrongGuessTracking();
      this.clearWrongLabel();
      this.updateCountryStats(this.targetCountry.properties.name, true);

      this.guessed.add(id);
      this.score += 1;
      this.streak += 1;
      this.setCountryVisual(id, CORRECT_FILL);

      this.ui.setScore(this.score);
      this.ui.setProgress(this.score, this.quizTotal);
      this.ui.setStreak(this.streak);
      this.ui.setStatusMessage('Correct!');
      this.applyGlobeStyles();
      this.updateTarget();
      return;
    }

    const prevColor = this.colorById.get(id);
    this.setCountryVisual(id, WRONG_FLASH);
    this.applyGlobeStyles();

    this.wrongGuessCount += 1;
    this.streak = 0;
    this.ui.setWrongGuesses(this.wrongGuessCount);
    this.ui.setStreak(this.streak);
    this.updateCountryStats(this.targetCountry.properties.name, false);
    const guessedName = feature.properties.name || 'Unknown';
    const guessedCentroid = getFeatureCentroid(feature);
    this.wrongLabelData = [
      {
        name: guessedName,
        type: 'wrong',
        lat: guessedCentroid.lat,
        lng: guessedCentroid.lng,
        altitude: 0.06
      }
    ];
    this.syncGuessLabels();
    // Trigger assist mode on the third incorrect guess for this target.
    if (this.wrongGuessCount >= 3) {
      this.revealCurrentTarget();
    }

    window.setTimeout(() => {
      if (prevColor === undefined) this.colorById.delete(id);
      else this.colorById.set(id, prevColor);

      this.applyGlobeStyles();
      this.clearWrongLabel();
    }, 420);
  }
}
