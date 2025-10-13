// lib/nobleClient.ts
type NobleSecpModule = {
  utils?: {
    sha256?: (msg: Uint8Array) => Promise<Uint8Array>;
  } & Record<string, unknown>;
  [k: string]: unknown;
};

let nobleSecpPromise: Promise<NobleSecpModule> | null = null;

export function getNobleSecp() {
  if (!nobleSecpPromise) {
    nobleSecpPromise = import("@noble/secp256k1").then((noble) => {
      const nobleModule = noble as unknown as NobleSecpModule;
      nobleModule.utils = nobleModule.utils || {};
      nobleModule.utils.sha256 = async (msg: Uint8Array | Buffer) => {
        const input =
          msg instanceof Uint8Array
            ? msg
            : new Uint8Array(msg as unknown as ArrayBuffer);
        if (typeof window !== "undefined" && window.crypto?.subtle) {
          const buf = input.buffer as ArrayBuffer;
          const h = await window.crypto.subtle.digest("SHA-256", buf);
          return new Uint8Array(h as ArrayBuffer);
        }
        throw new Error("Web Crypto not available for SHA-256");
      };
      return nobleModule;
    });
  }
  return nobleSecpPromise;
}
