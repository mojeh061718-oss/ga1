/*
 * To use your own pictures: drop e.g. my-pup.png into assets/pups/,
 * change the matching path below, and add the filename to
 * js/precache-list.js so it works offline. Any square-ish PNG/JPG/SVG works.
 */
const PUPS = {
  balloon:   'assets/pups/pup1.svg',
  breathing: 'assets/pups/pup2.svg',
  glitter:   'assets/pups/pup3.svg',
  board:     'assets/pups/pup1.svg',
};

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('img[data-pup]').forEach((img) => {
    img.src = PUPS[img.dataset.pup];
  });
  // Login pup: reuse the breathing pup as the greeter.
  const loginPup = document.getElementById('login-pup');
  if (loginPup) loginPup.src = PUPS.breathing;
});
