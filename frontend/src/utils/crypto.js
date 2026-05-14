/**
 * Crypto utilities for End-to-End Encryption
 */

// Generate RSA-OAEP key pair
export async function generateKeyPair() {
  return await window.crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"]
  );
}

// Export public key to base64 string
export async function exportPublicKey(key) {
  const exported = await window.crypto.subtle.exportKey("spki", key);
  return btoa(String.fromCharCode(...new Uint8Array(exported)));
}

// Import public key from base64 string
export async function importPublicKey(pemContents) {
  const binaryDerString = atob(pemContents);
  const binaryDer = str2ab(binaryDerString);

  return await window.crypto.subtle.importKey(
    "spki",
    binaryDer,
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    true,
    ["encrypt"]
  );
}

// Encrypt a message using a public key
export async function encryptMessage(publicKey, message) {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const encrypted = await window.crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    publicKey,
    data
  );
  return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
}

// Decrypt a message using a private key
export async function decryptMessage(privateKey, encryptedBase64) {
  const binaryString = atob(encryptedBase64);
  const encryptedData = str2ab(binaryString);

  const decrypted = await window.crypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    privateKey,
    encryptedData
  );

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

// Helper: String to ArrayBuffer
function str2ab(str) {
  const buf = new ArrayBuffer(str.length);
  const bufView = new Uint8Array(buf);
  for (let i = 0, strLen = str.length; i < strLen; i++) {
    bufView[i] = str.charCodeAt(i);
  }
  return buf;
}
