#!/usr/bin/env node
// Encrypt the interview questions for the Code page.
//
// Reads private/questions/<track>/prompt.md and starter.py (git-ignored, never
// commit them) and writes dist/questions/<track>.json, which is safe to commit.
//
//   node tools/seal-questions.mjs            # asks for the password twice
//   QUESTION_PASSWORD=... node tools/seal-questions.mjs
//
// Never put the password in this repository.

import { createCipheriv, pbkdf2Sync, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "private", "questions");
const OUTPUT = join(ROOT, "dist", "questions");
const TRACKS = { ml: "ML coding", swe: "Software engineering" };
const ITERATIONS = 600_000;

function ask(prompt) {
  return new Promise((done) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (text) => {
      if (text.startsWith(prompt)) process.stdout.write(prompt);
    };
    rl.question(prompt, (answer) => {
      rl.close();
      process.stdout.write("\n");
      done(answer);
    });
  });
}

async function password() {
  if (process.env.QUESTION_PASSWORD) return process.env.QUESTION_PASSWORD;
  if (!process.stdin.isTTY) throw new Error("Set QUESTION_PASSWORD or run in a terminal.");
  const first = await ask("Question password: ");
  const second = await ask("Again: ");
  if (first !== second) throw new Error("The passwords didn't match.");
  return first;
}

function seal(track, payload, secret) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = pbkdf2Sync(secret, salt, ITERATIONS, 32, "sha256");
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(track));
  const data = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
    cipher.getAuthTag(), // Web Crypto expects the tag appended.
  ]);
  return {
    version: 1,
    track,
    kdf: { name: "PBKDF2", hash: "SHA-256", iterations: ITERATIONS, salt: salt.toString("base64") },
    cipher: { name: "AES-GCM", iv: iv.toString("base64") },
    data: data.toString("base64"),
  };
}

const secret = await password();
if (secret.length < 8) throw new Error("Use a password of at least 8 characters.");
mkdirSync(OUTPUT, { recursive: true });
for (const [track, title] of Object.entries(TRACKS)) {
  const folder = join(SOURCE, track);
  if (!existsSync(join(folder, "prompt.md"))) {
    console.log(`skip ${track}: no ${join("private", "questions", track, "prompt.md")}`);
    continue;
  }
  const payload = {
    title,
    prompt: readFileSync(join(folder, "prompt.md"), "utf8").trimEnd(),
    starter: readFileSync(join(folder, "starter.py"), "utf8"),
  };
  const file = join(OUTPUT, `${track}.json`);
  writeFileSync(file, JSON.stringify(seal(track, payload, secret), null, 2) + "\n");
  console.log(`sealed ${track} -> ${file}`);
}
