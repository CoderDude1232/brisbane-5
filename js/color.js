'use strict';
// All colours in this game are authored as sRGB hex. The renderer works in linear space with an
// sRGB output, so convert every hex/CSS colour to linear the moment it is set.
(function () {
  const C = THREE.Color.prototype;
  let depth = 0;
  for (const fn of ['setHex', 'setStyle']) {
    const orig = C[fn];
    C[fn] = function (...args) {
      depth++;
      try { orig.apply(this, args); } finally { depth--; }
      if (depth === 0) this.convertSRGBToLinear();
      return this;
    };
  }
})();
