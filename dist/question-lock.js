"use strict";

// Interview questions ship encrypted (AES-256-GCM, key from PBKDF2-SHA256 of the
// password). The password is never stored in this repository, so the questions
// stay unreadable until an interviewer types it. tools/seal-questions.mjs writes
// the sealed files.

const QUESTION_TRACKS = {
  ml: "ML coding",
  swe: "Software engineering",
};

function questionBytes(base64) {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

async function unlockQuestion(sealed, password, track) {
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (!subtle) throw new Error("This browser can't unlock questions (Web Crypto is unavailable).");
  if (!sealed || sealed.version !== 1 || sealed.track !== track) {
    throw new Error("The question file is damaged. Reseal it with tools/seal-questions.mjs.");
  }
  const material = await subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  const key = await subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: questionBytes(sealed.kdf.salt),
      iterations: sealed.kdf.iterations,
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
  let plain;
  try {
    plain = await subtle.decrypt(
      {
        name: "AES-GCM",
        iv: questionBytes(sealed.cipher.iv),
        additionalData: new TextEncoder().encode(track),
      },
      key,
      questionBytes(sealed.data),
    );
  } catch (_) {
    return null; // Wrong password: GCM authentication fails.
  }
  return JSON.parse(new TextDecoder().decode(plain));
}

if (typeof module !== "undefined") module.exports = { QUESTION_TRACKS, unlockQuestion };
