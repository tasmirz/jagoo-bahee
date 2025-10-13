/**
 * Enable WebAssembly experiments for Webpack so tiny-secp256k1's WASM can be included in client bundle.
 * This keeps the library usable from browser code like `src/lib/auth.ts`.
 */
module.exports = {
  webpack: (config, { isServer }) => {
    config.experiments = config.experiments || {};
    config.experiments.asyncWebAssembly = true;
    return config;
  },
};
