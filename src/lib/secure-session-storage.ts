import * as aesjs from 'aes-js';

type Deps = {
  secureGet: (k: string) => Promise<string | null>;
  secureSet: (k: string, v: string) => Promise<void>;
  kvGet: (k: string) => Promise<string | null>;
  kvSet: (k: string, v: string) => Promise<void>;
  kvRemove: (k: string) => Promise<void>;
  randomBytes: (n: number) => Uint8Array;
};

// SecureStore caps values at 2048 bytes; Supabase sessions exceed that.
// Per Supabase guidance: keep an AES-256 key in SecureStore, store the encrypted blob in
// ordinary storage.
export class LargeSecureStore {
  constructor(private d: Deps) {}

  private async keyFor(name: string): Promise<Uint8Array> {
    const id = `sk_${name}`;
    const hex = await this.d.secureGet(id);
    if (hex) return aesjs.utils.hex.toBytes(hex);
    const key = this.d.randomBytes(32);
    await this.d.secureSet(id, aesjs.utils.hex.fromBytes(key));
    return key;
  }

  async getItem(name: string): Promise<string | null> {
    const blob = await this.d.kvGet(name);
    const hex = await this.d.secureGet(`sk_${name}`);
    if (!blob || !hex) return null;
    const cipher = new aesjs.ModeOfOperation.ctr(
      aesjs.utils.hex.toBytes(hex),
      new aesjs.Counter(1),
    );
    return aesjs.utils.utf8.fromBytes(cipher.decrypt(aesjs.utils.hex.toBytes(blob)));
  }

  async setItem(name: string, value: string): Promise<void> {
    const key = await this.keyFor(name);
    const cipher = new aesjs.ModeOfOperation.ctr(key, new aesjs.Counter(1));
    await this.d.kvSet(
      name,
      aesjs.utils.hex.fromBytes(cipher.encrypt(aesjs.utils.utf8.toBytes(value))),
    );
  }

  async removeItem(name: string): Promise<void> {
    await this.d.kvRemove(name);
    await this.d.secureSet(`sk_${name}`, '');
  }
}
