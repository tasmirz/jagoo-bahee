// lib/nobleClient.ts
let nobleSecpPromise: Promise<any> | null = null;

export function getNobleSecp() {
  if (!nobleSecpPromise) {
    nobleSecpPromise = import("@noble/secp256k1").then((noble) => {
      const nobleAny = noble as any;
      nobleAny.utils = nobleAny.utils || {};
      nobleAny.utils.sha256 = async (msg: Uint8Array | Buffer) => {
        const input =
          msg instanceof Uint8Array ? msg : new Uint8Array(msg as any);
        if (typeof window !== "undefined" && window.crypto?.subtle) {
          const h = await window.crypto.subtle.digest("SHA-256", input.buffer);
          return new Uint8Array(h);
        }
        throw new Error("Web Crypto not available for SHA-256");
      };
      return nobleAny;
    });
  }
  return nobleSecpPromise;
}
