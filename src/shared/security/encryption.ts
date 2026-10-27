import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// Module 10 field-level encryption: "Application-level AES-256-GCM for uploaded
// documents and watch definitions: random 96-bit nonce per record, authenticated data
// = user_id|record_id, key APP_ENCRYPTION_KEY (32 bytes, base64) from env; key version
// stored with the record to allow rotation. Decrypt in memory only for the request."
// This module never logs plaintext, keys, or nonces.

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH_BYTES = 32;
const NONCE_LENGTH_BYTES = 12; // 96 bits

/** Matches the `encrypted_blob` jsonb shape used by the documents/watch_definitions tables. */
export interface EncryptedBlob {
  v: number;
  nonce: string; // base64
  ciphertext: string; // base64
  tag: string; // base64
}

export class EncryptionKeyError extends Error {}
export class DecryptionError extends Error {}

/** Parses and validates APP_ENCRYPTION_KEY. Throws rather than silently using a weak key. */
export function loadEncryptionKey(base64Key: string): Buffer {
  const key = Buffer.from(base64Key, 'base64');
  if (key.length !== KEY_LENGTH_BYTES) {
    throw new EncryptionKeyError(
      `APP_ENCRYPTION_KEY must decode to ${KEY_LENGTH_BYTES} bytes, got ${key.length}`,
    );
  }
  return key;
}

export interface EncryptionKeyring {
  activeVersion: number;
  getKey(version: number): Buffer;
}

/** Day-1 keyring: one active key. Add more versions here when rotation is needed. */
export function createSingleKeyKeyring(key: Buffer, version = 1): EncryptionKeyring {
  return {
    activeVersion: version,
    getKey(requestedVersion) {
      if (requestedVersion !== version) {
        throw new EncryptionKeyError(`No key available for version ${requestedVersion}`);
      }
      return key;
    },
  };
}

/** Module 10: authenticated data binds the ciphertext to exactly this user and row. */
export function buildAad(userId: string, recordId: string): Buffer {
  return Buffer.from(`${userId}|${recordId}`, 'utf8');
}

export function encryptField(plaintext: string, aad: Buffer, keyring: EncryptionKeyring): EncryptedBlob {
  const version = keyring.activeVersion;
  const key = keyring.getKey(version);
  const nonce = randomBytes(NONCE_LENGTH_BYTES);

  const cipher = createCipheriv(ALGORITHM, key, nonce);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    v: version,
    nonce: nonce.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    tag: tag.toString('base64'),
  };
}

/**
 * Decrypts a field. Throws DecryptionError on any tamper (ciphertext, tag, or wrong
 * AAD — e.g. the blob being read for a different user or record than it was written
 * for) rather than returning corrupted or wrong-owner plaintext.
 */
export function decryptField(blob: EncryptedBlob, aad: Buffer, keyring: EncryptionKeyring): string {
  const key = keyring.getKey(blob.v);
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(blob.nonce, 'base64'));
  decipher.setAAD(aad);
  decipher.setAuthTag(Buffer.from(blob.tag, 'base64'));

  try {
    const plaintext = Buffer.concat([decipher.update(Buffer.from(blob.ciphertext, 'base64')), decipher.final()]);
    return plaintext.toString('utf8');
  } catch {
    throw new DecryptionError('Failed to decrypt field: ciphertext, tag, or AAD do not match');
  }
}
