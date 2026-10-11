import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { Secret, TOTP } from 'otpauth';
import { TotpService } from './totp.service.js';

function serviceWithKey(key = randomBytes(32).toString('base64')) {
  const values: Record<string, string> = { TOTP_ENCRYPTION_KEY: key };
  const config = {
    getOrThrow: (name: string) => values[name],
    get: (_name: string, fallback: string) => fallback,
  } as unknown as ConfigService;
  return new TotpService(config);
}

function currentCode(secret: string) {
  return new TOTP({ secret: Secret.fromBase32(secret) }).generate();
}

describe('TotpService', () => {
  it('accepts the current code for a newly created secret', async () => {
    const service = serviceWithKey();
    const setup = await service.createSetup('100000');

    expect(setup.otpauthUri).toMatch(/^otpauth:\/\/totp\/Dentacore:100000\?/);
    expect(setup.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    const step = service.matchStep(
      setup.encryptedSecret,
      currentCode(setup.secret),
    );
    expect(step).toBe(Math.floor(Date.now() / 1000 / 30));
  });

  it('rejects a wrong code', async () => {
    const service = serviceWithKey();
    const setup = await service.createSetup('100000');
    const wrong = currentCode(setup.secret) === '000000' ? '111111' : '000000';

    expect(service.matchStep(setup.encryptedSecret, wrong)).toBeNull();
  });

  it('never stores the secret in plain text', async () => {
    const setup = await serviceWithKey().createSetup('100000');
    expect(setup.encryptedSecret).not.toContain(setup.secret);
  });

  it('cannot read a secret encrypted with a different key', async () => {
    const setup = await serviceWithKey().createSetup('100000');
    expect(() =>
      serviceWithKey().matchStep(setup.encryptedSecret, '123456'),
    ).toThrow();
  });

  it('refuses to start with a key that is not 32 bytes', () => {
    expect(() => serviceWithKey(randomBytes(16).toString('base64'))).toThrow(
      /32 bytes/,
    );
  });
});
