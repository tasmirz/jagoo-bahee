import {
  OperatorConfig,
  type SecurityConfig,
} from '../../../core/ports/operator-config.port.js';

export class InMemoryOperatorConfig extends OperatorConfig {
  private value: SecurityConfig;

  constructor(requestLimitPerMinute = 300, registrationsOpen = true) {
    super();
    this.value = { requestLimitPerMinute, registrationsOpen };
  }

  async security(): Promise<SecurityConfig> {
    return this.value;
  }

  async updateSecurity(value: SecurityConfig): Promise<SecurityConfig> {
    this.value = value;
    return this.value;
  }
}
