export class BloomFilter {
  private bits: Uint8Array;

  constructor(private readonly size = 4096, private readonly rounds = 4, encoded?: string) {
    this.bits = new Uint8Array(size);
    if (encoded) {
      try {
        const raw = atob(encoded);
        this.bits = Uint8Array.from(raw, (char) => char.charCodeAt(0));
      } catch {
        this.bits = new Uint8Array(size);
      }
    }
  }

  add(value: string) {
    for (const index of this.hashes(value)) this.bits[index] = 1;
  }

  has(value: string) {
    return this.hashes(value).every((index) => this.bits[index] === 1);
  }

  encode() {
    let raw = "";
    this.bits.forEach((bit) => { raw += String.fromCharCode(bit); });
    return btoa(raw);
  }

  private hashes(value: string) {
    const result: number[] = [];
    let h1 = 2166136261;
    let h2 = 0x9e3779b9;
    for (let i = 0; i < value.length; i += 1) {
      h1 ^= value.charCodeAt(i);
      h1 = Math.imul(h1, 16777619);
      h2 ^= value.charCodeAt(value.length - i - 1);
      h2 = Math.imul(h2, 1597334677);
    }
    for (let i = 0; i < this.rounds; i += 1) {
      result.push(Math.abs((h1 + i * h2 + i * i) % this.size));
    }
    return result;
  }
}
