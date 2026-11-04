"use strict";

// A deliberately plain editor: JavaScript and TypeScript run in a local worker.

const C_BLOCK = String.raw`\/\*[\s\S]*?(?:\*\/|$)`;
const SLASH_LINE = String.raw`\/\/[^\n]*`;
const HASH_LINE = String.raw`#[^\n]*`;
const DQ = String.raw`"(?:\\.|[^"\\\n])*"?`;
const SQ = String.raw`'(?:\\.|[^'\\\n])*'?`;
const BACKTICK = String.raw`\x60(?:\\[\s\S]|[^\x60\\])*\x60?`;
const TRIPLE_DQ = String.raw`"""[\s\S]*?(?:"""|$)`;
const TRIPLE_SQ = String.raw`'''[\s\S]*?(?:'''|$)`;
const words = (text) => new Set(text.split(/\s+/).filter(Boolean));
const JS_WORDS =
  "async await break case catch class const continue debugger default delete do else export extends false finally for function if import in instanceof let new null of return static super switch this throw true try typeof undefined var void while with yield";

const LANGUAGES = [
  {
    id: "python",
    name: "Python",
    indent: "    ",
    comments: [HASH_LINE],
    strings: [`[rRbBuUfF]{0,2}(?:${TRIPLE_DQ}|${TRIPLE_SQ})`, DQ, SQ],
    keywords: words(
      "False None True and as assert async await break case class continue def del elif else except finally for from global if import in is lambda match nonlocal not or pass raise return self try while with yield",
    ),
    opensBlock: /[:{[(]$/,
    starter: `import sys


def main():
    lines = sys.stdin.read().splitlines()
    print("Hello, world!")
    if lines:
        print(f"Read {len(lines)} line(s) of input.")


if __name__ == "__main__":
    main()
`,
  },
  {
    id: "javascript",
    name: "JavaScript",
    indent: "  ",
    comments: [C_BLOCK, SLASH_LINE],
    strings: [BACKTICK, DQ, SQ],
    keywords: words(JS_WORDS),
    starter: `const input = require("fs").readFileSync(0, "utf8");
const lines = input.split("\\n").filter((line, i, all) => line || i < all.length - 1);

console.log("Hello, world!");
if (lines.length > 0) {
  console.log(\`Read \${lines.length} line(s) of input.\`);
}
`,
  },
  {
    id: "typescript",
    name: "TypeScript",
    indent: "  ",
    comments: [C_BLOCK, SLASH_LINE],
    strings: [BACKTICK, DQ, SQ],
    keywords: words(
      JS_WORDS +
        " abstract any as boolean declare enum implements interface keyof namespace never number private protected public readonly string type unknown",
    ),
    starter: `const input: string = require("fs").readFileSync(0, "utf8");
const lines: string[] = input.split("\\n").filter((line, i, all) => line || i < all.length - 1);

console.log("Hello, world!");
if (lines.length > 0) {
  console.log(\`Read \${lines.length} line(s) of input.\`);
}
`,
  },
  {
    id: "other",
    name: "Other",
    indent: "    ",
    starter:
      "Write your solution here in any language.\nRunning isn't available for Other: talk us through it instead.",
  },
];
const BY_ID = Object.fromEntries(LANGUAGES.map((language) => [language.id, language]));
const NUMBER = String.raw`\b(?:0[xX][\da-fA-F_]+|0[bB][01_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?)[A-Za-z]*\b`;
const WORD = String.raw`[A-Za-z_$][\w$]*\??`;

for (const language of LANGUAGES) {
  if (!language.comments) continue;
  // Group order: comment, string, extra (keyword-like), number, word.
  const comment = language.comments.join("|");
  const string = language.strings.join("|");
  const extra = (language.extra || []).join("|") || "(?!)";
  language.tokenizer = new RegExp(
    `(${comment})|(${string})|(${extra})|(${NUMBER})|(${WORD})`,
    "g",
  );
}

const $ = (id) => document.getElementById(id);
const code = $("code");
const highlight = $("highlight");
const highlightLayer = highlight.parentElement;
const gutter = $("gutter");
const languageSelect = $("language");
const languageStatus = $("language-status");
const runButton = $("run");
const stdin = $("stdin");
const output = $("output");
const runStatus = $("run-status");
const challenge = $("challenge");
const cursorPosition = $("cursor-position");
const indentInfo = $("indent-info");

const tokenMeta = document.querySelector('meta[name="room-remix-run-token"]');
const runToken = tokenMeta ? tokenMeta.content : "";
const hasToken = runToken && !runToken.startsWith("__");

// Work is saved per question; the unlocked question lives only in this tab's session.
const STORAGE_PREFIX = "room-remix.code-desk.v3.";
const UNLOCKED_KEY = "room-remix.code-desk.unlocked";
let storageKey = "";
let saved = {};
let current = LANGUAGES[0];
let deskStarted = false;
let available = {};
let lineCount = 0;
let escapeArmed = false;
let saveTimer = 0;
let renderQueued = false;
let running = false;

function loadSaved() {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || "{}");
    return value && typeof value === "object" ? value : {};
  } catch (_) {
    return {};
  }
}

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 250);
}

function saveNow() {
  clearTimeout(saveTimer);
  if (!deskStarted) return;
  saved.language = current.id;
  saved.codes = saved.codes || {};
  saved.codes[current.id] = code.value;
  saved.stdin = stdin.value;
  try {
    localStorage.setItem(storageKey, JSON.stringify(saved));
  } catch (_) {
    // Storage can be full or disabled; the editor keeps working without it.
  }
}

function escapeHtml(text) {
  return text.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
}

function highlightCode(text, language) {
  if (!language.tokenizer) return escapeHtml(text) + " ";
  const tokenizer = language.tokenizer;
  tokenizer.lastIndex = 0;
  let html = "";
  let last = 0;
  for (let match = tokenizer.exec(text); match; match = tokenizer.exec(text)) {
    if (match[0] === "") {
      tokenizer.lastIndex++;
      continue;
    }
    let kind = "";
    if (match[1] !== undefined) kind = "comment";
    else if (match[2] !== undefined) kind = "string";
    else if (match[3] !== undefined) kind = "keyword";
    else if (match[4] !== undefined) kind = "number";
    else if (language.keywords.has(match[5])) kind = "keyword";
    else if (language.types !== false && /^[A-Z][a-z]/.test(match[5])) kind = "type";
    html += escapeHtml(text.slice(last, match.index));
    html += kind
      ? `<span class="tok-${kind}">${escapeHtml(match[0])}</span>`
      : escapeHtml(match[0]);
    last = tokenizer.lastIndex;
  }
  // A trailing newline needs a character after it to keep the last line tall.
  return html + escapeHtml(text.slice(last)) + " ";
}

function render() {
  renderQueued = false;
  highlight.innerHTML = highlightCode(code.value, current);
  const lines = code.value.split("\n").length;
  if (lines !== lineCount) {
    lineCount = lines;
    gutter.textContent = Array.from({ length: lines }, (_, i) => i + 1).join("\n");
  }
  syncScroll();
  updateCursor();
}

function queueRender() {
  if (!renderQueued) {
    renderQueued = true;
    requestAnimationFrame(render);
  }
}

function syncScroll() {
  highlightLayer.style.transform = `translate(${-code.scrollLeft}px, ${-code.scrollTop}px)`;
  gutter.style.transform = `translateY(${-code.scrollTop}px)`;
}

function updateCursor() {
  const before = code.value.slice(0, code.selectionStart);
  const line = before.split("\n").length;
  const column = before.length - before.lastIndexOf("\n");
  const selected = Math.abs(code.selectionEnd - code.selectionStart);
  cursorPosition.textContent =
    `Ln ${line}, Col ${column}` + (selected ? ` (${selected} selected)` : "");
}

function replaceRange(start, end, text, selectStart, selectEnd) {
  code.focus();
  code.setSelectionRange(start, end);
  const inserted = text
    ? document.execCommand("insertText", false, text)
    : document.execCommand("delete");
  if (!inserted) {
    code.setRangeText(text, start, end, "end");
    code.dispatchEvent(new Event("input"));
  }
  if (selectStart !== undefined) code.setSelectionRange(selectStart, selectEnd ?? selectStart);
}

function lineStartOf(index) {
  return code.value.lastIndexOf("\n", index - 1) + 1;
}

function indentLines(outdent) {
  const value = code.value;
  const { selectionStart: start, selectionEnd: end } = code;
  const blockStart = lineStartOf(start);
  const lastChar = end > start && value[end - 1] === "\n" ? end - 1 : end;
  let blockEnd = value.indexOf("\n", lastChar);
  if (blockEnd === -1) blockEnd = value.length;
  const unit = current.indent;
  const lines = value.slice(blockStart, blockEnd).split("\n");
  let firstShift = 0;
  let totalShift = 0;
  const changed = lines.map((line, i) => {
    let shift;
    let next;
    if (outdent) {
      const removable = line.startsWith("\t") ? 1 : Math.min(unit.length, line.match(/^ */)[0].length);
      shift = -removable;
      next = line.slice(removable);
    } else {
      shift = line ? unit.length : 0;
      next = line ? unit + line : line;
    }
    if (i === 0) firstShift = shift;
    totalShift += shift;
    return next;
  });
  if (totalShift === 0) return;
  const newStart = Math.max(blockStart, start + firstShift);
  replaceRange(blockStart, blockEnd, changed.join("\n"), newStart, Math.max(newStart, end + totalShift));
}

function handleEditorKey(event) {
  if (event.key === "Escape") {
    escapeArmed = true;
    return;
  }
  if (event.key === "Tab") {
    if (escapeArmed || event.ctrlKey || event.metaKey || event.altKey) {
      escapeArmed = false;
      return;
    }
    event.preventDefault();
    const { selectionStart: start, selectionEnd: end } = code;
    const multiLine = code.value.slice(start, end).includes("\n");
    if (event.shiftKey || multiLine) indentLines(event.shiftKey);
    else replaceRange(start, end, current.indent);
    return;
  }
  escapeArmed = false;
  if (event.key === "Enter" && !event.ctrlKey && !event.metaKey && !event.altKey && !event.isComposing) {
    event.preventDefault();
    const { selectionStart: start, selectionEnd: end, value } = code;
    const lineStart = lineStartOf(start);
    const before = value.slice(lineStart, start);
    const indent = before.match(/^[ \t]*/)[0];
    const opens = (current.opensBlock || /[{[(]$/).test(before.trimEnd());
    const closes = /^[ \t]*[}\])]/.test(value.slice(end, end + 40));
    if (opens && closes) {
      const text = "\n" + indent + current.indent + "\n" + indent;
      const caret = start + 1 + indent.length + current.indent.length;
      replaceRange(start, end, text, caret);
    } else {
      replaceRange(start, end, "\n" + indent + (opens ? current.indent : ""));
    }
    return;
  }
  if (event.key === "Backspace" && code.selectionStart === code.selectionEnd && current.indent !== "\t") {
    const start = code.selectionStart;
    const before = code.value.slice(lineStartOf(start), start);
    if (before.length > 0 && /^ +$/.test(before)) {
      event.preventDefault();
      const width = current.indent.length;
      const remove = before.length % width || width;
      replaceRange(start - remove, start, "");
    }
  }
}

function setLanguage(id, { keepCode = false } = {}) {
  if (!keepCode) saveNow();
  current = BY_ID[id] || LANGUAGES[0];
  languageSelect.value = current.id;
  const stored = saved.codes && typeof saved.codes[current.id] === "string" ? saved.codes[current.id] : null;
  code.value = stored ?? current.starter;
  code.setSelectionRange(0, 0);
  code.scrollTop = 0;
  code.scrollLeft = 0;
  indentInfo.textContent = current.indent === "\t" ? "Tabs" : `Spaces: ${current.indent.length}`;
  updateLanguageStatus();
  const other = current.id === "other";
  stdin.closest(".io-panel").hidden = other;
  if (other) {
    runButton.title = "Other is write-only and cannot be run.";
    setRunStatus("Write only");
    showOutput([["note", "Running isn't available for Other."]]);
  } else {
    runButton.title = "Run (Ctrl+Enter / ⌘+Enter)";
  }
  render();
  saveNow();
}

function updateLanguageStatus() {
  const info = available[current.id];
  if (current.id === "other") {
    languageStatus.textContent = "write only, not run";
  } else if (current.id === "javascript" || current.id === "typescript") {
    languageStatus.textContent = "runs in your browser";
  } else if (!hasToken) {
    languageStatus.textContent = "Open this page from the link printed by demo.py to run Python.";
  } else if (!info) {
    languageStatus.textContent = "Checking your Python…";
  } else {
    languageStatus.textContent = `${info.version ? "Python · " + info.version : "Python"} · runs with your Python`;
  }
  languageStatus.title = languageStatus.textContent;
  runButton.disabled =
    running ||
    current.id === "other" ||
    (current.id === "python" && (!hasToken || !(info && info.available)));
}

function populateLanguages() {
  languageSelect.replaceChildren(
    ...LANGUAGES.map((language) => new Option(language.name, language.id)),
  );
  languageSelect.value = current.id;
}

async function loadLanguages() {
  try {
    const response = await fetch("api/languages", { cache: "no-store" });
    if (!response.ok) throw new Error(response.statusText);
    const data = await response.json();
    available = Object.fromEntries(data.languages.map((info) => [info.id, info]));
  } catch (_) {
    available = {};
    languageStatus.textContent = "Can't reach Room Remix. Start it with: python3 demo.py --ide";
    languageStatus.title = languageStatus.textContent;
    return;
  }
  populateLanguages();
  updateLanguageStatus();
}

function showOutput(parts) {
  output.replaceChildren(
    ...parts.map(([kind, text]) => {
      const span = document.createElement("span");
      span.className = kind;
      span.textContent = text;
      return span;
    }),
  );
  output.scrollTop = 0;
}

function setRunStatus(text, tone) {
  runStatus.textContent = text;
  runStatus.className = "run-status" + (tone ? " is-" + tone : "");
}

function formatDuration(ms) {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)} s`;
}

function renderResult(result) {
  const parts = [];
  if (result.stdout) parts.push(["stdout", result.stdout]);
  if (result.stderr) {
    const gap = result.stdout && !result.stdout.endsWith("\n") ? "\n" : "";
    parts.push(["stderr", gap + result.stderr]);
  }
  if (!parts.length) parts.push(["note", "(no output)"]);
  if (result.truncated) parts.push(["note", "\n… output was cut off because it was very long."]);
  const took = formatDuration(result.durationMs || 0);
  if (result.phase === "compile") {
    setRunStatus(result.timedOut ? `Compile timed out · ${took}` : "Compile error", "error");
  } else if (result.timedOut) {
    setRunStatus(`Stopped at the time limit · ${took}`, "error");
    parts.push(["note", "\nYour program ran too long and was stopped. Check for an infinite loop or waiting on input."]);
  } else if (result.exitCode === 0) {
    setRunStatus(`Finished · ${took}`, "ok");
  } else {
    setRunStatus(`Exit code ${result.exitCode} · ${took}`, "error");
  }
  showOutput(parts);
}

function runInWorker() {
  return new Promise((resolve, reject) => {
    const worker = new Worker("js-runner.js");
    const started = performance.now();
    const timeout = setTimeout(() => {
      worker.terminate();
      resolve({
        phase: "run",
        exitCode: null,
        stdout: "",
        stderr: "",
        timedOut: true,
        durationMs: Math.round(performance.now() - started),
        truncated: false,
      });
    }, 10_000);
    worker.onmessage = ({ data }) => {
      clearTimeout(timeout);
      worker.terminate();
      resolve(data);
    };
    worker.onerror = (event) => {
      clearTimeout(timeout);
      worker.terminate();
      reject(new Error(event.message || "The browser worker failed."));
    };
    worker.postMessage({ language: current.id, code: code.value, stdin: stdin.value });
  });
}

async function run() {
  if (runButton.disabled || current.id === "other") return;
  saveNow();
  running = true;
  runButton.disabled = true;
  runButton.classList.add("is-running");
  runButton.textContent = "Running…";
  setRunStatus(`Running ${current.name}…`);
  showOutput([["note", "Running…"]]);
  try {
    let result;
    if (current.id === "javascript" || current.id === "typescript") {
      result = await runInWorker();
    } else {
      const response = await fetch("api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Room-Remix-Token": runToken },
        body: JSON.stringify({ language: current.id, code: code.value, stdin: stdin.value }),
      });
      result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `The local server answered ${response.status}.`);
    }
    renderResult(result);
  } catch (error) {
    setRunStatus("Couldn't run", "error");
    showOutput([["stderr", error.message || "Can't reach Room Remix. Is demo.py still running?"]]);
  } finally {
    running = false;
    runButton.classList.remove("is-running");
    runButton.textContent = "▶ Run";
    updateLanguageStatus();
  }
}

async function copyCode() {
  const button = $("copy-code");
  try {
    await navigator.clipboard.writeText(code.value);
  } catch (_) {
    code.focus();
    code.select();
    document.execCommand("copy");
  }
  button.textContent = "Copied";
  setTimeout(() => (button.textContent = "Copy"), 1400);
}

code.addEventListener("input", () => {
  queueRender();
  save();
});
code.addEventListener("scroll", syncScroll);
code.addEventListener("keydown", handleEditorKey);
for (const type of ["keyup", "click", "select", "focus"]) code.addEventListener(type, updateCursor);
document.addEventListener("selectionchange", () => {
  if (document.activeElement === code) updateCursor();
});
stdin.addEventListener("input", save);
addEventListener("pagehide", saveNow);
languageSelect.addEventListener("change", () => setLanguage(languageSelect.value));
runButton.addEventListener("click", run);
$("copy-code").addEventListener("click", copyCode);
$("reset-code").addEventListener("click", () => {
  if (code.value === current.starter) return;
  if (!confirm(`Replace your ${current.name} code with the starter code?`)) return;
  replaceRange(0, code.value.length, current.starter, 0);
  code.scrollTop = 0;
});
$("switch-question").addEventListener("click", () => {
  if (!confirm("Lock this question and choose again? Your code is kept on this computer.")) return;
  saveNow();
  try {
    sessionStorage.removeItem(UNLOCKED_KEY);
  } catch (_) {
    // Nothing stored; reloading still shows the gate.
  }
  location.reload();
});
document.addEventListener("keydown", (event) => {
  if (deskStarted && event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    if (current.id !== "other") run();
  }
});

function startDesk(track, question) {
  storageKey = STORAGE_PREFIX + track;
  saved = loadSaved();
  BY_ID.python.starter = question.starter;
  current = BY_ID[saved.language] || BY_ID.python;
  $("challenge-eyebrow").textContent = `THE CHALLENGE · ${question.title.toUpperCase()}`;
  challenge.value = question.prompt;
  stdin.value = typeof saved.stdin === "string" ? saved.stdin : "";
  $("question-gate").hidden = true;
  document.querySelector(".ide-shell").hidden = false;
  deskStarted = true;
  populateLanguages();
  setLanguage(current.id, { keepCode: true });
  new ResizeObserver(syncScroll).observe(code);
  if (hasToken) loadLanguages();
  else updateLanguageStatus();
  code.focus();
}

function setupGate() {
  const pick = $("gate-pick");
  const form = $("gate-unlock");
  const password = $("gate-password");
  const error = $("gate-error");
  const submit = $("gate-submit");
  let track = "";

  try {
    const remembered = JSON.parse(sessionStorage.getItem(UNLOCKED_KEY) || "null");
    if (remembered && QUESTION_TRACKS[remembered.track] && remembered.question) {
      startDesk(remembered.track, remembered.question);
      return;
    }
  } catch (_) {
    // Fall through to the gate.
  }

  for (const button of document.querySelectorAll(".track-button")) {
    button.addEventListener("click", () => {
      track = button.dataset.track;
      $("gate-track").textContent = QUESTION_TRACKS[track].toUpperCase();
      error.textContent = "";
      password.value = "";
      pick.hidden = true;
      form.hidden = false;
      password.focus();
    });
  }
  $("gate-back").addEventListener("click", () => {
    form.hidden = true;
    pick.hidden = false;
    pick.querySelector(`[data-track="${track}"]`).focus();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    submit.disabled = true;
    submit.textContent = "Unlocking…";
    error.textContent = "";
    try {
      const response = await fetch(`questions/${track}.json`, { cache: "no-store" });
      if (!response.ok) throw new Error("Can't load the question. Is demo.py still running?");
      const question = await unlockQuestion(await response.json(), password.value, track);
      if (!question) {
        error.textContent = "That password didn't work. Try again.";
        password.select();
        return;
      }
      try {
        sessionStorage.setItem(UNLOCKED_KEY, JSON.stringify({ track, question }));
      } catch (_) {
        // Without session storage a reload simply asks again.
      }
      password.value = "";
      startDesk(track, question);
    } catch (failure) {
      error.textContent = failure.message || "Couldn't unlock the question.";
    } finally {
      submit.disabled = false;
      submit.textContent = "Unlock";
    }
  });
}

setupGate();
