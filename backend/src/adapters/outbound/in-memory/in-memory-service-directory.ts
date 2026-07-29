import {
  ServiceDirectory,
  type AuxiliaryService,
  type AuxiliaryServiceKind,
} from '../../../core/ports/service-directory.port.js';

export class InMemoryServiceDirectory extends ServiceDirectory {
  constructor(
    private readonly addresses: readonly string[] = [],
    private readonly configured: readonly AuxiliaryService[] = [],
  ) {
    super();
  }

  localAddresses(): readonly string[] {
    return this.addresses;
  }

  async services(kind?: AuxiliaryServiceKind): Promise<readonly AuxiliaryService[]> {
    return kind ? this.configured.filter((service) => service.kind === kind) : this.configured;
  }
}
