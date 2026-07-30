const { withAppBuildGradle, withProjectBuildGradle } = require('@expo/config-plugins');

const CHAQUOPY = "classpath 'com.chaquo.python:gradle:16.1.0'";
const CHAQUOPY_REPOSITORY = "maven { url 'https://chaquo.com/maven' }";
const CHAQUOPY_JNI_PICK_FIRST = 'libchaquopy_java.so';

/** Adds the embedded Python runtime only to Android development builds. */
module.exports = function withJagooRns(config) {
  config = withProjectBuildGradle(config, (mod) => {
    if (!mod.modResults.contents.includes('https://chaquo.com/maven')) {
      mod.modResults.contents = mod.modResults.contents.replace(
        /repositories\s*\{/g,
        `repositories {\n        ${CHAQUOPY_REPOSITORY}`,
      );
    }
    if (!mod.modResults.contents.includes(CHAQUOPY)) {
      mod.modResults.contents = mod.modResults.contents.replace(
        /dependencies\s*\{/,
        `dependencies {\n        ${CHAQUOPY}`,
      );
    }
    return mod;
  });
  return withAppBuildGradle(config, (mod) => {
    if (!mod.modResults.contents.includes("apply plugin: 'com.chaquo.python'")) {
      mod.modResults.contents = mod.modResults.contents.replace(
        /apply plugin:\s*["']com\.android\.application["']/,
        (match) => `${match}\napply plugin: 'com.chaquo.python'`,
      );
    }
    if (!mod.modResults.contents.includes('install "rns==1.4.2"')) {
      mod.modResults.contents += `\nchaquopy {\n  defaultConfig {\n    version \"3.11\"\n    pip {\n      install \"rns==1.4.2\"\n      install \"lxmf==1.1.0\"\n    }\n  }\n}\n`;
    }
    // The Expo module also applies Chaquopy to compile its Kotlin bridge. The
    // application owns the runtime native library, so declare that choice here
    // as a defensive package-level rule as well.
    if (!mod.modResults.contents.includes(CHAQUOPY_JNI_PICK_FIRST)) {
      mod.modResults.contents += `\nandroid {\n  packaging {\n    jniLibs {\n      pickFirsts += ['**/libchaquopy_java.so']\n    }\n  }\n}\n`;
    }
    return mod;
  });
  return config;
};
