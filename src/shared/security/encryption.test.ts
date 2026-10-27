import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildAad,
  createSingleKeyKeyring,
  decryptField,
  DecryptionError,
  encryptField,
  EncryptionKeyError,
  loadEncryptionKey,
} from './encryption';

const testKey = randomBytes(32);

describe('loadEncryptionKey', () => {
  it('accepts a valid 32-byte base64 key', () => {
    const key = loadEncryptionKey(testKey.toString('base64'));
    expect(key.length).toBe(32);
    expect(key.equals(testKey)).toBe(true);
  });

  it('rejects a key that decodes to the wrong length', () => {
    const shortKey = randomBytes(16).toString('base64');
    expect(() => loadEncryptionKey(shortKey)).toThrow(EncryptionKeyError);
  });
});

describe('encryptField / decryptField', () => {
  const keyring = createSingleKeyKeyring(testKey, 1);
  const aad = buildAad('user_1', 'doc_1');

  it('round-trips plaintext through encrypt then decrypt', () => {
    const blob = encryptField('local protocol: amoxicillin 500mg', aad, keyring);
    expect(blob.v).toBe(1);
    expect(decryptField(blob, aad, keyring)).toBe('local protocol: amoxicillin 500mg');
  });

  it('produces a different nonce and ciphertext each time, even for the same plaintext', () => {
    const blobA = encryptField('same text', aad, keyring);
    const blobB = encryptField('same text', aad, keyring);
    expect(blobA.nonce).not.toBe(blobB.nonce);
    expect(blobA.ciphertext).not.toBe(blobB.ciphertext);
  });

  it('throws DecryptionError when the ciphertext is tampered with', () => {
    const blob = encryptField('sensitive text', aad, keyring);
    const tamperedBytes = Buffer.from(blob.ciphertext, 'base64');
    tamperedBytes[0] = tamperedBytes[0]! ^ 0xff;
    const tampered = { ...blob, ciphertext: tamperedBytes.toString('base64') };
    expect(() => decryptField(tampered, aad, keyring)).toThrow(DecryptionError);
  });

  it('throws DecryptionError when the auth tag is tampered with', () => {
    const blob = encryptField('sensitive text', aad, keyring);
    const tamperedTag = Buffer.from(blob.tag, 'base64');
    tamperedTag[0] = tamperedTag[0]! ^ 0xff;
    const tampered = { ...blob, tag: tamperedTag.toString('base64') };
    expect(() => decryptField(tampered, aad, keyring)).toThrow(DecryptionError);
  });

  it('throws DecryptionError when decrypted under a different user\'s AAD (cross-user row swap)', () => {
    const blob = encryptField('user 1 secret', aad, keyring);
    const otherUserAad = buildAad('user_2', 'doc_1');
    expect(() => decryptField(blob, otherUserAad, keyring)).toThrow(DecryptionError);
  });

  it('throws DecryptionError when decrypted under a different record id (ciphertext copied to another row)', () => {
    const blob = encryptField('user 1 secret', aad, keyring);
    const otherRecordAad = buildAad('user_1', 'doc_2');
    expect(() => decryptField(blob, otherRecordAad, keyring)).toThrow(DecryptionError);
  });

  it('throws EncryptionKeyError when the keyring has no key for the blob\'s version (rotation gap)', () => {
    const blob = encryptField('text', aad, keyring);
    const keyringV2Only = createSingleKeyKeyring(randomBytes(32), 2);
    expect(() => decryptField(blob, aad, keyringV2Only)).toThrow(EncryptionKeyError);
  });
});

describe('createSingleKeyKeyring', () => {
  it('exposes its version and rejects a request for a different one', () => {
    const keyring = createSingleKeyKeyring(testKey, 3);
    expect(keyring.activeVersion).toBe(3);
    expect(keyring.getKey(3)).toEqual(testKey);
    expect(() => keyring.getKey(1)).toThrow(EncryptionKeyError);
  });
});

describe('buildAad', () => {
  it('joins userId and recordId with a pipe', () => {
    expect(buildAad('u1', 'r1').toString('utf8')).toBe('u1|r1');
  });
});
