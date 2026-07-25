/* Flat ESLint config. No build step, no bundler — this lints the files exactly
 * as the browser loads them.
 *
 * The rule that earns its keep here is `no-undef`. Every module is an IIFE that
 * assigns a global const, dependency order is implicit in the <script> order in
 * index.html and enforced by nothing, and every handler is wrapped in an empty
 * catch. So a typo'd or renamed global doesn't crash the app — it silently
 * removes one feature. Declaring the module globals below turns that class of
 * mistake into a lint error.
 */
const browser = {
  window: 'readonly', document: 'readonly', navigator: 'readonly',
  localStorage: 'readonly', indexedDB: 'readonly', location: 'readonly',
  console: 'readonly', fetch: 'readonly', caches: 'readonly',
  setTimeout: 'readonly', clearTimeout: 'readonly',
  setInterval: 'readonly', clearInterval: 'readonly',
  requestAnimationFrame: 'readonly', cancelAnimationFrame: 'readonly',
  performance: 'readonly', Image: 'readonly', Blob: 'readonly', File: 'readonly',
  FileReader: 'readonly', URL: 'readonly', MediaRecorder: 'readonly',
  AudioContext: 'readonly', webkitAudioContext: 'readonly',
  SpeechSynthesisUtterance: 'readonly', speechSynthesis: 'readonly',
  Audio: 'readonly', CustomEvent: 'readonly', Event: 'readonly',
  DOMParser: 'readonly', getComputedStyle: 'readonly', matchMedia: 'readonly',
  devicePixelRatio: 'readonly', Request: 'readonly', Response: 'readonly',
  URLSearchParams: 'readonly', MutationObserver: 'readonly',
};

// The app's own modules, in <script> order.
const appGlobals = {
  Day: 'readonly', Sounds: 'readonly', Sfx: 'readonly', Mic: 'readonly',
  Store: 'readonly', App: 'readonly', Login: 'readonly', Hub: 'readonly',
  Board: 'readonly', Mail: 'readonly', MailSync: 'readonly',
  MailTemplates: 'readonly', Backup: 'readonly', PUPS: 'readonly',
};

const rules = {
  'no-undef': 'error',
  'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^(Day|Store|App|Hub|Board|Mail|MailSync|MailTemplates|Backup|Sounds|Sfx|Mic|Login|PUPS)$' }],
  // The module globals below are declared in config so cross-file references
  // resolve; builtinGlobals:false stops the file that DEFINES each one from
  // being flagged for redeclaring it.
  'no-redeclare': ['error', { builtinGlobals: false }],
  eqeqeq: ['warn', 'smart'],
  'no-empty': ['warn', { allowEmptyCatch: true }],
};

module.exports = [
  {
    files: ['dev/js/**/*.js', 'js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...browser, ...appGlobals },
    },
    rules,
  },
  {
    // Service workers get a different global scope.
    files: ['dev/sw.js', 'sw.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...browser, self: 'readonly', importScripts: 'readonly' },
    },
    rules,
  },
  {
    files: ['tools/**/*.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      // The tools drive a real page, so their page.evaluate() callbacks are
      // browser code living inside a Node file.
      globals: {
        require: 'readonly', module: 'writable', process: 'readonly',
        __dirname: 'readonly', console: 'readonly',
        ...browser, ...appGlobals,
      },
    },
    rules,
  },
  { ignores: ['dev/js/precache-list.js', 'js/precache-list.js'] },
];
