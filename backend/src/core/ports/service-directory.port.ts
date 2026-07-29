export const AuxiliaryServiceKind = {
  AUDIT_LOG: 'audit-log',
  MCAPTCHA: 'mcaptcha',
  FEDERATION: 'federation',
} as const;

export type AuxiliaryServiceKind = (typeof AuxiliaryServiceKind)[keyof typeof AuxiliaryServiceKind];

export interface AuxiliaryService {
  readonly id: string;
  readonly kind: AuxiliaryServiceKind;
  readonly address: string;
  readonly host: string;
  readonly port: number;
  readonly available: boolean;
}

/**
 * Operator-configured service discovery. Keeping the environment parser behind a port
 * prevents HTTP handlers and the application core from learning deployment details.
 */
export abstract class ServiceDirectory {
  abstract localAddresses(): readonly string[];
  abstract services(kind?: AuxiliaryServiceKind): Promise<readonly AuxiliaryService[]>;
}
