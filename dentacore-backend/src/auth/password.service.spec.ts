import { PasswordService } from './password.service.js';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await service.hash('Correct-Horse-1');

    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(service.verify(hash, 'Correct-Horse-1')).resolves.toBe(true);
    await expect(service.verify(hash, 'wrong')).resolves.toBe(false);
  });

  it('generates temporary passwords without look-alike characters', () => {
    const passwords = Array.from({ length: 50 }, () =>
      service.generateTemporaryPassword(),
    );

    for (const password of passwords) {
      expect(password).toMatch(/^[A-HJ-NP-Za-km-z2-9]{16}$/);
    }
    expect(new Set(passwords).size).toBe(passwords.length);
  });
});
