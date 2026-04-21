import argon2 from "argon2-browser/dist/argon2-bundled.min.js";

const DEFAULT_TIME_COST = 3;
const DEFAULT_MEMORY_COST = 65536;
const DEFAULT_PARALLELISM = 1;
const DEFAULT_HASH_LENGTH = 32;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const toBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return window.btoa(binary);
};

const fromBase64 = (value) => {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
};

const deriveBits = async (password, meta) => {
  const salt = typeof meta.salt === "string" ? fromBase64(meta.salt) : meta.salt;
  const result = await argon2.hash({
    pass: password,
    salt,
    time: meta.timeCost,
    mem: meta.memoryCost,
    parallelism: meta.parallelism,
    hashLen: meta.hashLength,
    type: argon2.ArgonType.Argon2id,
  });

  return result.hash;
};

export const createVaultMeta = async (password) => {
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const meta = {
    salt,
    kdf: "argon2id",
    timeCost: DEFAULT_TIME_COST,
    memoryCost: DEFAULT_MEMORY_COST,
    parallelism: DEFAULT_PARALLELISM,
    hashLength: DEFAULT_HASH_LENGTH,
  };
  const keyBits = await deriveBits(password, meta);
  const verifierBuffer = await window.crypto.subtle.digest("SHA-256", keyBits);

  return {
    salt: toBase64(salt),
    kdf: "argon2id",
    timeCost: DEFAULT_TIME_COST,
    memoryCost: DEFAULT_MEMORY_COST,
    parallelism: DEFAULT_PARALLELISM,
    hashLength: DEFAULT_HASH_LENGTH,
    verifier: toBase64(verifierBuffer),
  };
};

export const deriveVaultKey = async (password, meta) => {
  const keyBits = await deriveBits(password, meta);
  const verifierBuffer = await window.crypto.subtle.digest("SHA-256", keyBits);
  const key = await window.crypto.subtle.importKey(
    "raw",
    keyBits,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );

  return {
    key,
    verifier: toBase64(verifierBuffer),
  };
};

export const encryptValue = async (value, key) => {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encryptedBuffer = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    textEncoder.encode(value),
  );

  return {
    passwordCiphertext: toBase64(encryptedBuffer),
    passwordIv: toBase64(iv),
  };
};

export const decryptValue = async (ciphertext, iv, key) => {
  const decryptedBuffer = await window.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: fromBase64(iv),
    },
    key,
    fromBase64(ciphertext),
  );

  return textDecoder.decode(decryptedBuffer);
};