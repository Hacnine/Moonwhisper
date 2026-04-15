export function looksEncrypted(text: string): boolean {
  if (!text || typeof text !== 'string' || text.length < 20) return false;
  const base64Pattern = /^[A-Za-z0-9+/=]+$/;
  if (!base64Pattern.test(text)) return false;
  const commonWords = ['the', 'and', 'hello', 'hi', 'how', 'what', 'when', 'where'];
  const lowerText = text.toLowerCase();
  return !commonWords.some((word) => lowerText.includes(word));
}

export function validateEncryptedFormat(encryptedText: string) {
  const result = { isValid: false, isEncrypted: false, format: 'unknown', error: null as string | null };

  if (!encryptedText || typeof encryptedText !== 'string') {
    result.error = 'Text is required and must be a string';
    return result;
  }

  result.isEncrypted = looksEncrypted(encryptedText);
  if (!result.isEncrypted) {
    result.format = 'plaintext';
    result.isValid = true;
    return result;
  }

  try {
    Buffer.from(encryptedText, 'base64');
    result.format = 'base64-encoded';
    result.isValid = true;
  } catch {
    result.format = 'custom-encoding';
    result.isValid = true;
  }

  return result;
}

export function processMessageForZeroKnowledgeStorage(messageText: string) {
  const validation = validateEncryptedFormat(messageText);
  return {
    text: messageText,
    isEncrypted: validation.isEncrypted,
    isValid: validation.isValid,
    format: validation.format,
    processedAt: new Date(),
  };
}

export function enhanceMessageWithZeroKnowledgeEncryption(
  messageData: Record<string, any>,
  messageText: string
) {
  const processed = processMessageForZeroKnowledgeStorage(messageText);
  return {
    ...messageData,
    text: processed.text,
    isEncrypted: processed.isEncrypted,
  };
}
