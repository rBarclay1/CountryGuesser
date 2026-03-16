export const WORLD_TOPO_URL = 'https://unpkg.com/world-atlas@2/countries-110m.json';
export const COUNTRY_META_URL = 'https://raw.githubusercontent.com/mledoze/countries/master/countries.json';
export const CONTINENTS_CONFIG_URL = './continents.json';

// Near-transparent default cap preserves reliable picking while keeping borders-only look.
export const CAP_DEFAULT = 'rgba(0,0,0,0.01)';
export const BORDER_WORLD = 'rgba(255,255,255,0.45)';
export const BORDER_ACTIVE = 'rgba(255,255,255,0.82)';
export const BORDER_DIM = 'rgba(255,255,255,0.12)';
// Opaque highlight colors avoid translucent depth blending artifacts.
export const WRONG_FLASH = 'red';
export const CORRECT_FILL = 'green';
export const REVEAL_FILL = 'yellow';

// Stable altitude defaults and highlight elevation to reduce surface z-fighting.
export const ALTITUDE_BASE = 0.006;
export const ALTITUDE_HIGHLIGHT = 0.016;
