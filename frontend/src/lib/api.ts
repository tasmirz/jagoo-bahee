import { backendJson, backendFetch } from "./backend";

export async function getChallenge(): Promise<string> {
  const res = await backendFetch("/auth/challenge");
  if (!res.ok) throw new Error(`Challenge request failed: ${res.status}`);
  return res.text();
}

export async function authenticate(
  challenge: string,
  signedData: string,
  publicKey: string
): Promise<string> {
  const res = await backendJson("POST", "/auth", {
    challenge,
    signedData,
    publicKey,
  });
  if (!res.ok) throw new Error(`Authenticate failed: ${res.status}`);
  const data = await res.json();
  // Backend returns { accessToken, refreshToken } but we only need accessToken
  // Cookies are automatically set by the backend
  return data.accessToken;
}

export async function postComment(body: object) {
  return backendJson("POST", "/comments", body);
}

export async function postVote(body: object) {
  return backendJson("POST", "/votes", body);
}

export default { getChallenge, authenticate, postComment, postVote };
