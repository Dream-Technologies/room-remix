"use strict";

const OUTPUT_LIMIT = 1_000_000;
const EXIT_SENTINEL = Symbol("process.exit");
const STOP_SENTINEL = Symbol("output limit");

self.onmessage = async ({ data }) => {
  const started = performance.now();
  let stdout = "";
  let stderr = "";
  let exitCode = 0;
  let truncated = false;
  let sent = false;

  const postResult = (phase, code) => {
    if (sent) return;
    sent = true;
    self.postMessage({
      phase,
      exitCode: code,
      stdout,
      stderr,
      timedOut: false,
      durationMs: Math.round(performance.now() - started),
      truncated,
    });
  };

  const append = (stream, text, overflowCode = 0) => {
    if (sent) return;
    const current = stream === "stdout" ? stdout : stderr;
    const remaining = OUTPUT_LIMIT - current.length;
    if (text.length > remaining) {
      if (stream === "stdout") stdout += text.slice(0, remaining);
      else stderr += text.slice(0, remaining);
      truncated = true;
      postResult("run", overflowCode);
      throw STOP_SENTINEL;
    }
    if (stream === "stdout") stdout += text;
    else stderr += text;
  };

  const formatValue = (value) => {
    if (typeof value === "string") return value;
    if (value instanceof Error) return value.stack || String(value);
    try {
      const json = JSON.stringify(value);
      return json === undefined ? String(value) : json;
    } catch (_) {
      return String(value);
    }
  };

  const write = (stream, value) => {
    append(stream, String(value));
    return true;
  };

  const log = (stream, ...values) => {
    append(stream, values.map(formatValue).join(" ") + "\n");
  };

  const processShim = {
    argv: ["node", "main.js"],
    env: {},
    stdout: { write: (value) => write("stdout", value) },
    stderr: { write: (value) => write("stderr", value) },
    exit(code = 0) {
      exitCode = Number(code) || 0;
      const error = new Error("process.exit");
      error[EXIT_SENTINEL] = true;
      error.exitCode = exitCode;
      postResult("run", exitCode);
      throw error;
    },
  };

  const requireShim = (name) => {
    if (name === "fs") {
      return {
        readFileSync(file) {
          if (file === 0 || file === "/dev/stdin") return data.stdin;
          throw new Error("Only stdin is available in the browser runner.");
        },
      };
    }
    throw new Error(
      `Cannot find module '${name}' (only fs stdin is available in the browser runner)`,
    );
  };

  let source = data.code;
  if (data.language === "typescript") {
    try {
      importScripts("vendor/sucrase.js");
      source = sucrase.transform(source, { transforms: ["typescript"] }).code;
    } catch (error) {
      stderr = error.message || String(error);
      postResult("compile", 1);
      return;
    }
  }

  try {
    const run = new Function(
      "require",
      "process",
      "console",
      `return (async function () {\n${source}\n}).call(undefined);`,
    );
    await run(
      requireShim,
      processShim,
      {
        log: (...values) => log("stdout", ...values),
        info: (...values) => log("stdout", ...values),
        debug: (...values) => log("stdout", ...values),
        error: (...values) => log("stderr", ...values),
        warn: (...values) => log("stderr", ...values),
      },
    );
  } catch (error) {
    if (error === STOP_SENTINEL || sent) return;
    if (error && error[EXIT_SENTINEL]) {
      exitCode = error.exitCode;
    } else {
      exitCode = 1;
      append("stderr", (error.stack || String(error)) + "\n", 1);
    }
  }
  postResult("run", exitCode);
};
