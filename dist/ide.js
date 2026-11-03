"use strict";

// A deliberately plain editor: no autocomplete, suggestions, or network calls
// beyond the local Room Remix server that runs the code on this computer.

const C_BLOCK = String.raw`\/\*[\s\S]*?(?:\*\/|$)`;
const SLASH_LINE = String.raw`\/\/[^\n]*`;
const HASH_LINE = String.raw`#[^\n]*`;
const DQ = String.raw`"(?:\\.|[^"\\\n])*"?`;
const SQ = String.raw`'(?:\\.|[^'\\\n])*'?`;
const BACKTICK = String.raw`\x60(?:\\[\s\S]|[^\x60\\])*\x60?`;
const TRIPLE_DQ = String.raw`"""[\s\S]*?(?:"""|$)`;
const TRIPLE_SQ = String.raw`'''[\s\S]*?(?:'''|$)`;
const PREPROCESSOR = String.raw`#[ \t]*[A-Za-z]+`;

const words = (text) => new Set(text.split(/\s+/).filter(Boolean));
const C_WORDS =
  "auto break case char const continue default do double else enum extern float for goto if inline int long register restrict return short signed sizeof static struct switch typedef union unsigned void volatile while bool true false NULL";
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
    starter: `import { readFileSync } from "node:fs";

function main(): void {
  const input: string = readFileSync(0, "utf8");
  const lines: string[] = input.split("\\n").filter((line, i, all) => line || i < all.length - 1);

  console.log("Hello, world!");
  if (lines.length > 0) {
    console.log(\`Read \${lines.length} line(s) of input.\`);
  }
}

main();
`,
  },
  {
    id: "java",
    name: "Java",
    indent: "    ",
    comments: [C_BLOCK, SLASH_LINE],
    strings: [TRIPLE_DQ, DQ, SQ],
    keywords: words(
      "abstract assert boolean break byte case catch char class continue default do double else enum extends false final finally float for if implements import instanceof int interface long new null package private protected public record return short static super switch synchronized this throw throws true try var void volatile while",
    ),
    starter: `import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        List<String> lines = new ArrayList<>();
        for (String line = in.readLine(); line != null; line = in.readLine()) {
            lines.add(line);
        }

        System.out.println("Hello, world!");
        if (!lines.isEmpty()) {
            System.out.println("Read " + lines.size() + " line(s) of input.");
        }
    }
}
`,
  },
  {
    id: "c",
    name: "C",
    indent: "    ",
    comments: [C_BLOCK, SLASH_LINE],
    strings: [DQ, SQ],
    extra: [PREPROCESSOR],
    keywords: words(C_WORDS),
    starter: `#include <stdio.h>

int main(void) {
    char line[4096];
    int lines = 0;
    while (fgets(line, sizeof line, stdin)) {
        lines++;
    }

    printf("Hello, world!\\n");
    if (lines > 0) {
        printf("Read %d line(s) of input.\\n", lines);
    }
    return 0;
}
`,
  },
  {
    id: "cpp",
    name: "C++",
    indent: "    ",
    comments: [C_BLOCK, SLASH_LINE],
    strings: [DQ, SQ],
    extra: [PREPROCESSOR],
    keywords: words(
      C_WORDS +
        " catch class const_cast constexpr delete dynamic_cast explicit friend namespace new noexcept nullptr operator override private protected public reinterpret_cast static_cast std template this throw try typename using virtual",
    ),
    starter: `#include <iostream>
#include <string>
#include <vector>

int main() {
    std::vector<std::string> lines;
    for (std::string line; std::getline(std::cin, line);) {
        lines.push_back(line);
    }

    std::cout << "Hello, world!\\n";
    if (!lines.empty()) {
        std::cout << "Read " << lines.size() << " line(s) of input.\\n";
    }
    return 0;
}
`,
  },
  {
    id: "csharp",
    name: "C#",
    indent: "    ",
    comments: [C_BLOCK, SLASH_LINE],
    strings: [TRIPLE_DQ, `[$@]{0,2}${DQ}`, SQ],
    extra: [PREPROCESSOR],
    keywords: words(
      "abstract as async await base bool break byte case catch char class const continue decimal default delegate do double else enum false finally float for foreach if in int interface internal is long namespace new null object out override params private protected public readonly record ref return sealed static string struct switch this throw true try typeof using var virtual void while",
    ),
    starter: `using System;
using System.Collections.Generic;

class Program
{
    static void Main()
    {
        var lines = new List<string>();
        string line;
        while ((line = Console.ReadLine()) != null)
        {
            lines.Add(line);
        }

        Console.WriteLine("Hello, world!");
        if (lines.Count > 0)
        {
            Console.WriteLine($"Read {lines.Count} line(s) of input.");
        }
    }
}
`,
  },
  {
    id: "go",
    name: "Go",
    indent: "\t",
    comments: [C_BLOCK, SLASH_LINE],
    strings: [BACKTICK, DQ, SQ],
    keywords: words(
      "break case chan const continue default defer else fallthrough false for func go goto if import interface map nil package range return select struct switch true type var",
    ),
    starter: `package main

import (
	"bufio"
	"fmt"
	"os"
)

func main() {
	scanner := bufio.NewScanner(os.Stdin)
	lines := 0
	for scanner.Scan() {
		lines++
	}

	fmt.Println("Hello, world!")
	if lines > 0 {
		fmt.Printf("Read %d line(s) of input.\\n", lines)
	}
}
`,
  },
  {
    id: "rust",
    name: "Rust",
    indent: "    ",
    comments: [C_BLOCK, SLASH_LINE],
    strings: [`b?${DQ}`, String.raw`b?'(?:\\.|[^'\\\n])'`],
    keywords: words(
      "as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while",
    ),
    starter: `use std::io::{self, BufRead};

fn main() {
    let lines: Vec<String> = io::stdin().lock().lines().map(|line| line.unwrap()).collect();

    println!("Hello, world!");
    if !lines.is_empty() {
        println!("Read {} line(s) of input.", lines.len());
    }
}
`,
  },
  {
    id: "kotlin",
    name: "Kotlin",
    indent: "    ",
    comments: [C_BLOCK, SLASH_LINE],
    strings: [TRIPLE_DQ, DQ, SQ],
    keywords: words(
      "as break class companion continue data do else false for fun if import in interface internal is lateinit null object open override package private protected public return sealed super this throw true try typealias val var when while",
    ),
    starter: `fun main() {
    val lines = generateSequence(::readLine).toList()

    println("Hello, world!")
    if (lines.isNotEmpty()) {
        println("Read \${lines.size} line(s) of input.")
    }
}
`,
  },
  {
    id: "swift",
    name: "Swift",
    indent: "    ",
    comments: [C_BLOCK, SLASH_LINE],
    strings: [TRIPLE_DQ, DQ],
    keywords: words(
      "as break case catch class continue default defer do else enum extension false fileprivate for func guard if import in init inout internal is let nil private protocol public repeat return self Self static struct subscript super switch throw throws true try typealias var where while",
    ),
    starter: `var lines: [String] = []
while let line = readLine() {
    lines.append(line)
}

print("Hello, world!")
if !lines.isEmpty {
    print("Read \\(lines.count) line(s) of input.")
}
`,
  },
  {
    id: "ruby",
    name: "Ruby",
    indent: "  ",
    comments: [HASH_LINE],
    strings: [DQ, SQ],
    keywords: words(
      "alias and begin break case class def defined? do else elsif end ensure false for if in module next nil not or redo require rescue retry return self super then true undef unless until when while yield",
    ),
    starter: `lines = $stdin.readlines(chomp: true)

puts "Hello, world!"
puts "Read #{lines.size} line(s) of input." unless lines.empty?
`,
  },
  {
    id: "php",
    name: "PHP",
    indent: "    ",
    comments: [C_BLOCK, SLASH_LINE, HASH_LINE],
    strings: [DQ, SQ],
    keywords: words(
      "abstract and array as break case catch class clone const continue default do echo else elseif empty enum extends false final finally fn for foreach function global if implements include instanceof interface isset list match namespace new null or print private protected public readonly require return static switch throw trait true try unset use var while yield",
    ),
    starter: `<?php

$lines = file("php://stdin", FILE_IGNORE_NEW_LINES) ?: [];

echo "Hello, world!\\n";
if (count($lines) > 0) {
    echo "Read " . count($lines) . " line(s) of input.\\n";
}
`,
  },
  {
    id: "bash",
    name: "Bash",
    indent: "  ",
    comments: [String.raw`(?:^|(?<=[\s;]))#[^\n]*`],
    strings: [DQ, String.raw`'[^']*'?`],
    keywords: words(
      "case declare do done echo elif else esac exit export fi for function if in local printf read readonly return select shift then until while",
    ),
    types: false,
    starter: `#!/usr/bin/env bash

lines=0
while IFS= read -r line || [[ -n "$line" ]]; do
  lines=$((lines + 1))
done

echo "Hello, world!"
if (( lines > 0 )); then
  echo "Read $lines line(s) of input."
fi
`,
  },
];
const BY_ID = Object.fromEntries(LANGUAGES.map((language) => [language.id, language]));
const NUMBER = String.raw`\b(?:0[xX][\da-fA-F_]+|0[bB][01_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?)[A-Za-z]*\b`;
const WORD = String.raw`[A-Za-z_$][\w$]*\??`;

for (const language of LANGUAGES) {
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

const STORAGE_KEY = "room-remix.code-desk.v1";
const saved = loadSaved();
let current = BY_ID[saved.language] ? BY_ID[saved.language] : LANGUAGES[0];
let available = {};
let lineCount = 0;
let escapeArmed = false;
let saveTimer = 0;
let renderQueued = false;
let running = false;

function loadSaved() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
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
  saved.language = current.id;
  saved.codes = saved.codes || {};
  saved.codes[current.id] = code.value;
  saved.stdin = stdin.value;
  saved.challenge = challenge.value;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch (_) {
    // Storage can be full or disabled; the editor keeps working without it.
  }
}

function escapeHtml(text) {
  return text.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
}

function highlightCode(text, language) {
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
  render();
  saveNow();
}

function updateLanguageStatus() {
  const info = available[current.id];
  languageStatus.classList.remove("is-missing");
  if (!hasToken) {
    languageStatus.textContent = "Open this page from the link printed by demo.py to run code.";
    languageStatus.classList.add("is-missing");
  } else if (!info) {
    languageStatus.textContent = "Checking your computer…";
  } else if (info.available) {
    languageStatus.textContent = `${info.version ? current.name + " · " + info.version : current.name} · runs on this computer`;
  } else {
    languageStatus.textContent = `${current.name} isn't installed here. ${info.install || ""}`.trim();
    languageStatus.classList.add("is-missing");
  }
  languageStatus.title = languageStatus.textContent;
  runButton.disabled = running || !hasToken || !(info && info.available);
}

function populateLanguages() {
  languageSelect.replaceChildren(
    ...LANGUAGES.map((language) => {
      const info = available[language.id];
      const missing = info && !info.available;
      return new Option(language.name + (missing ? " — not installed" : ""), language.id);
    }),
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
    languageStatus.classList.add("is-missing");
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

async function run() {
  if (runButton.disabled) return;
  saveNow();
  running = true;
  runButton.disabled = true;
  runButton.classList.add("is-running");
  runButton.textContent = "Running…";
  setRunStatus(`Running ${current.name}…`);
  showOutput([["note", "Running…"]]);
  try {
    const response = await fetch("api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Room-Remix-Token": runToken },
      body: JSON.stringify({ language: current.id, code: code.value, stdin: stdin.value }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setRunStatus("Couldn't run", "error");
      showOutput([["stderr", result.error || `The local server answered ${response.status}.`]]);
      return;
    }
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
  } catch (_) {
    setRunStatus("Couldn't run", "error");
    showOutput([["stderr", "Can't reach Room Remix. Is demo.py still running in your terminal?"]]);
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
challenge.addEventListener("input", save);
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
$("clear-challenge").addEventListener("click", () => {
  if (challenge.value && !confirm("Clear the challenge text?")) return;
  challenge.value = "";
  save();
  challenge.focus();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    run();
  }
});

challenge.value = typeof saved.challenge === "string" ? saved.challenge : "";
stdin.value = typeof saved.stdin === "string" ? saved.stdin : "";
populateLanguages();
setLanguage(current.id, { keepCode: true });
new ResizeObserver(syncScroll).observe(code);
if (hasToken) loadLanguages();
else updateLanguageStatus();
