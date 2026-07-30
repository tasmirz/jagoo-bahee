export const AuxiliaryServiceKind = {
  AUDIT_LOG: 'audit-log',
  MCAPTCHA: 'mcaptcha',
  FEDERATION: 'federation',
  BLOB: 'blob',
} as const;

export type AuxiliaryServiceKind = (typeof AuxiliaryServiceKind)[keyof typeof AuxiliaryServiceKind];

export interface AuxiliaryService {
  readonly id: string;
  readonly kind: AuxiliaryServiceKind;
  /** The address this node uses. May be internal (`http://minio:9000`) and unreachable elsewhere. */
  readonly address: string;
  readonly host: string;
  readonly port: number;
  readonly available: boolean;
  /**
   * The address a CLIENT should use, when the operator's port map declares one.
   *
   * Kept separate from `address` rather than overwriting it: the two answer different questions,
   * and collapsing them means an operator debugging "why can my phone not reach this" can no
   * longer see what the node itself is talking to. Null means the map did not cover this service
   * and the client should fall back to its own resolution rule.
   */
  readonly publicAddress: string | null;
}

/**
 * Operator-configured service discovery. Keeping the environment parser behind a port
 * prevents HTTP handlers and the application core from learning deployment details.
 */
export abstract class ServiceDirectory {
  abstract localAddresses(): readonly string[];
  abstract services(kind?: AuxiliaryServiceKind): Promise<readonly AuxiliaryService[]>;
}
