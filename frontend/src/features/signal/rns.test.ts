import { parseRnsTcpEndpoints } from './rns';

describe('Signal RNS bootstrap parsing', () => {
  it('accepts only explicit TCP relay endpoints', () => {
    expect(parseRnsTcpEndpoints(['tcp://relay.example:4242', 'https://not-rns.example', 'tcp://missing-port'])).toEqual([
      { kind: 'tcp', host: 'relay.example', port: 4242, enabled: true },
    ]);
  });
});
