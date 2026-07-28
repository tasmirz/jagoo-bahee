export interface AuthChallenge {
  readonly challenge: Uint8Array;
  readonly claim: 'login';
  readonly expiresAtMs: number;
}

export interface SessionTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly accessExpiresAtMs: number;
  readonly refreshExpiresAtMs: number;
}

export interface AccessPrincipal {
  readonly key: Uint8Array;
  readonly tokenId: string;
}

export abstract class SessionAuth {
  abstract challenge(key: Uint8Array): Promise<AuthChallenge>;
  abstract authenticate(
    key: Uint8Array,
    challenge: Uint8Array,
    claim: string,
    signature: Uint8Array,
  ): Promise<SessionTokens>;
  abstract refresh(refreshToken: string): Promise<SessionTokens>;
  abstract verifyAccess(accessToken: string): Promise<AccessPrincipal>;
  abstract logout(refreshToken: string): Promise<void>;
}
