import path from 'path';
import { existsSync } from 'fs';

const ALLOWED_MIME_TYPES: Record<string, string[]> = {
  image: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
  document: [
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
  ],
  audio: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm'],
  video: ['video/mp4', 'video/webm', 'video/ogg'],
};

const MAX_FILE_SIZES: Record<string, number> = {
  image: 10 * 1024 * 1024,
  document: 50 * 1024 * 1024,
  audio: 20 * 1024 * 1024,
  video: 100 * 1024 * 1024,
};

export function sanitizeFilename(filename: string): string {
  if (!filename) return '';
  let sanitized = filename.replace(/[\/\\:\x00]/g, '_');
  sanitized = sanitized.replace(/^\.+/, '');
  const maxLength = 255;
  if (sanitized.length > maxLength) {
    const ext = path.extname(sanitized);
    const name = path.basename(sanitized, ext);
    sanitized = name.substring(0, maxLength - ext.length) + ext;
  }
  return sanitized;
}

export async function validateFile(
  file: Express.Multer.File,
  filePath: string,
  options: { allowedTypes?: string[]; maxSize?: number; scanMalware?: boolean } = {}
): Promise<boolean> {
  const { allowedTypes = [], maxSize = 50 * 1024 * 1024 } = options;

  if (!existsSync(filePath)) {
    throw new Error('File does not exist');
  }

  if (allowedTypes.length > 0 && !allowedTypes.includes(file.mimetype)) {
    throw new Error(`File type ${file.mimetype} is not allowed.`);
  }

  if (file.size > maxSize) {
    const maxSizeMB = (maxSize / (1024 * 1024)).toFixed(2);
    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
    throw new Error(`File size ${fileSizeMB}MB exceeds maximum ${maxSizeMB}MB`);
  }

  if (file.filename && (file.filename.includes('..') || file.filename.includes('/') || file.filename.includes('\\'))) {
    throw new Error('Invalid filename: directory traversal attempt detected');
  }

  return true;
}

export function getAllowedTypes(category: string): string[] {
  return ALLOWED_MIME_TYPES[category] || [];
}

export function getMaxSize(category: string): number {
  return MAX_FILE_SIZES[category] || 50 * 1024 * 1024;
}

export function getFileValidationOptions(category: string) {
  return {
    allowedTypes: getAllowedTypes(category),
    maxSize: getMaxSize(category),
    scanMalware: false,
  };
}
