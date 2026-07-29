import type Redis from 'ioredis';
import {
  OperatorConfig,
  type SecurityConfig,
} from '../../../core/ports/operator-config.port.js';

export const OPERATOR_CONFIG_KEY = 'jb:operator:config';

export class RedisOperatorConfig extends OperatorConfig {
  constructor(
    private readonly redis: Redis,
    private readonly defaultRequestLimit = 300,
    private readonly defaultRegistrationsOpen = true,
  ) {
    super();
  }

  async security(): Promise<SecurityConfig> {
    const value = await this.redis.hgetall(OPERATOR_CONFIG_KEY);
    return {
      requestLimitPerMinute:
        Number(value['requestLimitPerMinute']) || this.defaultRequestLimit,
      registrationsOpen:
        value['registrationsOpen'] === undefined
          ? this.defaultRegistrationsOpen
          : value['registrationsOpen'] === 'true',
    };
  }

  async updateSecurity(value: SecurityConfig): Promise<SecurityConfig> {
    await this.redis.hset(OPERATOR_CONFIG_KEY, {
      requestLimitPerMinute: String(value.requestLimitPerMinute),
      registrationsOpen: String(value.registrationsOpen),
    });
    return value;
  }
}
