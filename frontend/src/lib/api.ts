import { backendJson } from "./backend";
import backend from "./backend";

export async function getChallenge(): Promise<string> {
  const res = await backend.backendFetch("/auth/challenge");
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
  const res = await backend.backendFetch("/auth", {
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
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const data = await res.json();
    return data.accessToken || data.token || "";
  }
  return res.text();
}

export async function postComment(body: Record<string, unknown>) {
  return backendJson("POST", "/comments", body);
}

export async function postVote(body: Record<string, unknown>) {
  return backendJson("POST", "/votes", body);
}

export default { getChallenge, authenticate, postComment, postVote };
