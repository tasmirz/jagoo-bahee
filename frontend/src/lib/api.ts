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
  return res.text();
}

export async function postComment(body: any) {
  return backendJson("POST", "/comments", body);
}

export async function postVote(body: any) {
  return backendJson("POST", "/votes", body);
}

export default { getChallenge, authenticate, postComment, postVote };
