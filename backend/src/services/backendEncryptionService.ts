import crypto from 'crypto';
import { getRedisClient } from '../config/redisClient.js';
import logger from '../common/utils/logger.js';

const REDIS_KEY_PREFIX = 'backend_encryption_keys';
const REDIS_CURRENT_KEY_INDEX = 'backend_encryption_current_index';
const KEY_ARRAY_SIZE = 5;
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 16;

function generateEncryptionKey(): string {
  return crypto.randomBytes(KEY_LENGTH).toString('base64');
}

export async function initializeEncryptionKeys(): Promise<string[]> {
  const redis = getRedisClient();
  const existingKeys = await redis.lRange(REDIS_KEY_PREFIX, 0, -1);

  if (existingKeys.length === 0) {
    logger.info('Initializing backend encryption keys...');
    const keys: string[] = [];
    for (let i = 0; i < KEY_ARRAY_SIZE; i++) {
      keys.push(generateEncryptionKey());
    }
    await redis.del(REDIS_KEY_PREFIX);
    await redis.rPush(REDIS_KEY_PREFIX, keys);
    await redis.set(REDIS_CURRENT_KEY_INDEX, '0');
    logger.info({ keyCount: keys.length }, 'Backend encryption keys initialized');
    return keys;
  }

  logger.info({ keyCount: existingKeys.length }, 'Backend encryption keys already exist');
  return existingKeys;
}

export async function getCurrentEncryptionKey(): Promise<string> {
  const redis = getRedisClient();
  const keys = await redis.lRange(REDIS_KEY_PREFIX, 0, 0);
  if (keys.length === 0) {
    const newKeys = await initializeEncryptionKeys();
    return newKeys[0];
  }
  return keys[0];
}

export async function getAllEncryptionKeys(): Promise<string[]> {
  const redis = getRedisClient();
  const keys = await redis.lRange(REDIS_KEY_PREFIX, 0, -1);
  if (keys.length === 0) return await initializeEncryptionKeys();
  return keys;
}

export async function rotateEncryptionKeys() {
  const redis = getRedisClient();
  const newKey = generateEncryptionKey();
  const currentKeys = await redis.lRange(REDIS_KEY_PREFIX, 0, -1);
  await redis.lPush(REDIS_KEY_PREFIX, newKey);
  await redis.lTrim(REDIS_KEY_PREFIX, 0, KEY_ARRAY_SIZE - 1);
  const updatedKeys = await redis.lRange(REDIS_KEY_PREFIX, 0, -1);

  logger.info({
    previousKeyCount: currentKeys.length,
    newKeyCount: updatedKeys.length,
  }, 'Encryption keys rotated');

  return { success: true, previousKeyCount: currentKeys.length, newKeyCount: updatedKeys.length };
}

export async function encryptMessage(plaintext: string): Promise<string> {
  if (!plaintext || typeof plaintext !== 'string') throw new Error('Invalid plaintext');

  const keyBase64 = await getCurrentEncryptionKey();
  const key = Buffer.from(keyBase64, 'base64');
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag();

  return `${salt.toString('base64')}:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
}

export async function decryptMessage(encryptedData: string): Promise<string> {
  if (!encryptedData || typeof encryptedData !== 'string') throw new Error('Invalid encrypted data');

  const parts = encryptedData.split(':');
  if (parts.length !== 4) throw new Error('Invalid encrypted data format');

  const [, ivBase64, authTagBase64, ciphertext] = parts;
  const iv = Buffer.from(ivBase64, 'base64');
  const authTag = Buffer.from(authTagBase64, 'base64');
  const keys = await getAllEncryptionKeys();

  for (let i = 0; i < keys.length; i++) {
    try {
      const key = Buffer.from(keys[i], 'base64');
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch {
      continue;
    }
  }

  throw new Error('Failed to decrypt message with any available key');
}

export function isBackendEncrypted(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const parts = text.split(':');
  if (parts.length !== 4) return false;
  const base64Pattern = /^[A-Za-z0-9+/]+=*$/;
  return parts.every((part) => base64Pattern.test(part) && part.length > 0);
}

// Binary file encryption
const FILE_MAGIC = Buffer.from('BENC');

export async function encryptBuffer(plainBuffer: Buffer): Promise<Buffer> {
  if (!Buffer.isBuffer(plainBuffer)) throw new Error('encryptBuffer: expected a Buffer');

  const keyBase64 = await getCurrentEncryptionKey();
  const key = Buffer.from(keyBase64, 'base64');
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainBuffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([FILE_MAGIC, salt, iv, authTag, encrypted]);
}

export async function decryptBuffer(encryptedBuffer: Buffer): Promise<Buffer> {
  if (!Buffer.isBuffer(encryptedBuffer) || encryptedBuffer.length < 52) {
    throw new Error('decryptBuffer: invalid buffer');
  }

  const magic = encryptedBuffer.subarray(0, 4);
  if (!magic.equals(FILE_MAGIC)) throw new Error('decryptBuffer: missing BENC header');

  const iv = encryptedBuffer.subarray(20, 20 + IV_LENGTH);
  const authTag = encryptedBuffer.subarray(36, 36 + AUTH_TAG_LENGTH);
  const ciphertext = encryptedBuffer.subarray(52);
  const keys = await getAllEncryptionKeys();

  for (let i = 0; i < keys.length; i++) {
    try {
      const key = Buffer.from(keys[i], 'base64');
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch {
      continue;
    }
  }

  throw new Error('decryptBuffer: failed with all available keys');
}

export function isEncryptedFile(buf: Buffer): boolean {
  if (!Buffer.isBuffer(buf) || buf.length < 4) return false;
  return buf.subarray(0, 4).equals(FILE_MAGIC);
}

export async function getEncryptionStats() {
  const redis = getRedisClient();
  const keys = await redis.lRange(REDIS_KEY_PREFIX, 0, -1);
  const currentIndex = await redis.get(REDIS_CURRENT_KEY_INDEX);

  return {
    totalKeys: keys.length,
    currentKeyIndex: parseInt(currentIndex || '0'),
    maxKeys: KEY_ARRAY_SIZE,
    algorithm: ALGORITHM,
    keyLength: KEY_LENGTH * 8,
    keysInitialized: keys.length > 0,
  };
}
