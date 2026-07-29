export interface SecurityConfig {
  readonly registrationsOpen: boolean;
  readonly requestLimitPerMinute: number;
}

export abstract class OperatorConfig {
  abstract security(): Promise<SecurityConfig>;
  abstract updateSecurity(value: SecurityConfig): Promise<SecurityConfig>;
}
