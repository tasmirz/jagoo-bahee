const config = {
  plugins: [
    "@tailwindcss/postcss",
    {
      postcssPlugin: "remove-firefox-invalid-text-size-adjust",
      Declaration(decl) {
        if (decl.prop === "-webkit-text-size-adjust") {
          decl.remove();
        }
      },
    },
  ],
};

export default config;
