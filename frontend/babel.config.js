module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Must be listed last (react-native-reanimated docs) — used by design-system/sheet.tsx.
    plugins: ['react-native-reanimated/plugin'],
  };
};
