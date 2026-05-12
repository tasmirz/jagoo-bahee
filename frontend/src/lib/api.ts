import { backendJson } from "./backend";

export async function getChallenge(): Promise<string> {
  const res = await fetch("/api/auth/challenge");
  if (!res.ok) throw new Error(`Challenge request failed: ${res.status}`);
  return res.text();
}

export async function authenticate(
  challenge: string,
  nonce: number,
  signedData: string,
  publicKey: string,
  mcaptchaToken?: string,
): Promise<string> {
  const res = await fetch("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      challenge,
      nonce,
      signedData,
      publicKey,
      mcaptchaToken,
    }),
  });
  if (!res.ok) throw new Error(`Authenticate failed: ${res.status}`);
  return res.text();
}

export async function postComment(body: Record<string, unknown>) {
  return backendJson("POST", "/comments", body);
}

export async function postVote(body: Record<string, unknown>) {
  return backendJson("POST", "/votes", body);
}

export default { getChallenge, authenticate, postComment, postVote };
