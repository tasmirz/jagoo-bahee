export const backendConfig = {
  // Prefer providing a full origin at build-time using NEXT_PUBLIC_API_URL (e.g. https://api.example.com)
  // If not provided, frontend code can fallback to building an origin at runtime using location.
  url: process.env.NEXT_PUBLIC_API_URL || null,
};

export default backendConfig;
