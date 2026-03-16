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
  ALTITUDE_BASE,
  ALTITUDE_HIGHLIGHT
} from './config.js';
import { normalizeNumericCode, buildContinentMap, getFeatureCentroid } from './geo-utils.js?v=20260306a';
import { createUiBindings } from './ui.js?v=20260306a';

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
    this.altitudeById = new Map();
    this.revealedTargetId = null;
    this.canGuessCurrentTarget = true;
    // Tracks incorrect attempts for the currently active target country.
    this.wrongGuessCount = 0;

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

  // Connects UI events to controller actions.
  bindUiEvents() {
    this.ui.bindEvents({
      onMode: modeId => this.setMode(modeId),
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
      .polygonAltitude(d => this.altitudeById.get(d.properties.idStr) || ALTITUDE_BASE);
  }

  // Stores cap color + altitude in stable maps keyed by country id.
  setCountryVisual(id, color, altitude = ALTITUDE_HIGHLIGHT) {
    if (!id) return;
    this.colorById.set(id, color);
    this.altitudeById.set(id, altitude);
  }

  // Removes per-country visual override so default cap/altitude accessors apply.
  clearCountryVisual(id) {
    if (!id) return;
    this.colorById.delete(id);
    this.altitudeById.delete(id);
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

    const index = Math.floor(Math.random() * available.length);
    return available[index];
  }

  // Removes the yellow reveal highlight when moving to a new target.
  clearRevealHighlight() {
    if (!this.revealedTargetId) return;
    if (this.colorById.get(this.revealedTargetId) === REVEAL_FILL) {
      this.clearCountryVisual(this.revealedTargetId);
    }
    this.revealedTargetId = null;
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
    this.altitudeById.clear();
    this.clearRevealHighlight();
    this.resetWrongGuessTracking();

    this.score = 0;
    this.streak = 0;
    this.targetCountry = null;
    this.stopTimer();
    this.resetTimer();

    this.ui.setStatusMessage('');
    this.ui.setScore(this.score);
    this.ui.setStreak(this.streak);
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

    this.canGuessCurrentTarget = false;
    this.revealedTargetId = id;
    this.setCountryVisual(id, REVEAL_FILL);
    this.applyGlobeStyles();

    const currentPov = this.globe.pointOfView();
    const centroid = getFeatureCentroid(this.targetCountry);
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
    const prevAlt = this.altitudeById.get(id);
    this.setCountryVisual(id, WRONG_FLASH);
    this.applyGlobeStyles();

    this.wrongGuessCount += 1;
    this.streak = 0;
    this.ui.setWrongGuesses(this.wrongGuessCount);
    this.ui.setStreak(this.streak);
    // Trigger assist mode on the third incorrect guess for this target.
    if (this.wrongGuessCount >= 3) {
      this.revealCurrentTarget();
    }

    window.setTimeout(() => {
      if (prevColor === undefined) this.colorById.delete(id);
      else this.colorById.set(id, prevColor);

      if (prevAlt === undefined) this.altitudeById.delete(id);
      else this.altitudeById.set(id, prevAlt);

      this.applyGlobeStyles();
    }, 420);
  }
}
