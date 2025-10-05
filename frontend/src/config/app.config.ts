export const appConfig = {
  // Public-facing port can be set at build-time with NEXT_PUBLIC_PORT
  port: process.env.NEXT_PUBLIC_PORT
    ? Number(process.env.NEXT_PUBLIC_PORT)
    : 3000,
};

export default appConfig;
