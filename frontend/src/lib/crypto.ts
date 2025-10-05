export function toBase64(bytes: Uint8Array | ArrayBuffer): string {
  const u8 = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  let binary = "";
  for (let i = 0; i < u8.length; i++) binary += String.fromCharCode(u8[i]);
  return btoa(binary);
}

export async function sha256(
  data: Uint8Array | string | ArrayBuffer
): Promise<Uint8Array> {
  let inputBytes: Uint8Array;
  if (typeof data === "string") {
    inputBytes = new TextEncoder().encode(data);
  } else if (data instanceof ArrayBuffer) {
    inputBytes = new Uint8Array(data);
  } else {
    inputBytes = data;
  }
  const hash = await crypto.subtle.digest(
    "SHA-256",
    inputBytes.buffer as ArrayBuffer
  );
  return new Uint8Array(hash);
}
