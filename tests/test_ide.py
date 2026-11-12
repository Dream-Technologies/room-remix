"""Real-process checks for the local coding editor and runner."""

import http.client
import json
import os
import queue
import re
import shutil
import signal
import subprocess
import sys
import threading
import time
import unittest

from test_launcher import COMMAND, ROOT, running_demo


class IdeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.running = running_demo("--run-timeout", "2")
        cls.url, cls.process = cls.running.__enter__()
        cls.origin = cls.url.split("/?")[0]
        cls.port = int(cls.origin.rsplit(":", 1)[1])
        status, _, body = cls.request("GET", "/ide.html")
        if status != 200:
            cls.running.__exit__(None, None, None)
            raise AssertionError("Expected dist/ide.html to be served (HTTP {}).".format(status))
        cls.ide_html = body.decode("utf-8")
        token = re.search(
            r'<meta name="room-remix-run-token" content="([^"]+)"',
            cls.ide_html,
        )
        if not token:
            cls.running.__exit__(None, None, None)
            raise AssertionError("The IDE page must include the run-token meta tag.")
        cls.token = token.group(1)

    @classmethod
    def tearDownClass(cls):
        cls.running.__exit__(None, None, None)

    @classmethod
    def request(cls, method, path, payload=None, headers=None, host=None):
        request_headers = dict(headers or {})
        if host is not None:
            request_headers["Host"] = host
        body = payload
        if isinstance(payload, dict):
            body = json.dumps(payload).encode("utf-8")
        connection = http.client.HTTPConnection("127.0.0.1", cls.port, timeout=10)
        try:
            connection.request(method, path, body=body, headers=request_headers)
            response = connection.getresponse()
            return response.status, response.headers, response.read()
        finally:
            connection.close()

    def post_run(self, payload, token=None, headers=None):
        request_headers = {
            "Content-Type": "application/json",
        }
        if token is not None:
            request_headers["X-Room-Remix-Token"] = token
        request_headers.update(headers or {})
        return self.request("POST", "/api/run", payload, request_headers)

    def test_languages_are_reported_in_order(self):
        status, _, body = self.request("GET", "/api/languages")
        self.assertEqual(status, 200)
        languages = json.loads(body)["languages"]
        self.assertEqual(
            [language["id"] for language in languages],
            ["python"],
        )
        python = languages[0]
        self.assertTrue(python["available"])
        self.assertTrue(python["version"])
        self.assertIsInstance(python["install"], str)

    def test_ide_page_injects_a_non_cached_token(self):
        status, headers, body = self.request("GET", "/ide.html")
        self.assertEqual(status, 200)
        self.assertEqual(headers.get("Content-Type"), "text/html; charset=utf-8")
        self.assertEqual(headers.get("Cache-Control"), "no-store")
        page = body.decode("utf-8")
        self.assertNotIn("__ROOM_REMIX_RUN_TOKEN__", page)
        self.assertRegex(page, r'<meta name="room-remix-run-token" content="[^"]+"')
        status, headers, _ = self.request("GET", "/ide")
        self.assertEqual(status, 302)
        self.assertEqual(headers.get("Location"), "/ide.html")

    def test_python_run_receives_stdin(self):
        status, _, body = self.post_run(
            {
                "language": "python",
                "code": "import sys\nprint('input: ' + sys.stdin.read(), end='')",
                "stdin": "hello",
            },
            self.token,
        )
        self.assertEqual(status, 200)
        result = json.loads(body)
        self.assertEqual(result["phase"], "run")
        self.assertEqual(result["exitCode"], 0)
        self.assertEqual(result["stdout"], "input: hello")
        self.assertEqual(result["stderr"], "")
        self.assertFalse(result["timedOut"])

    def test_python_error_returns_exit_code_and_stderr(self):
        status, _, body = self.post_run(
            {
                "language": "python",
                "code": "import sys; print('x', file=sys.stderr); sys.exit(3)",
                "stdin": "",
            },
            self.token,
        )
        self.assertEqual(status, 200)
        result = json.loads(body)
        self.assertEqual(result["phase"], "run")
        self.assertEqual(result["exitCode"], 3)
        self.assertIn("x", result["stderr"])

    def test_timeout_kills_the_running_process(self):
        status, _, body = self.post_run(
            {
                "language": "python",
                "code": "import os\nprint(os.getpid(), flush=True)\nwhile True: pass",
                "stdin": "",
            },
            self.token,
        )
        self.assertEqual(status, 200)
        result = json.loads(body)
        self.assertTrue(result["timedOut"])
        self.assertLess(result["durationMs"], 4000)
        pid = int(result["stdout"].splitlines()[0])
        if os.name == "nt":
            check = subprocess.run(
                ["tasklist", "/FI", "PID eq {}".format(pid), "/NH"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            self.assertNotIn(str(pid), check.stdout)
        else:
            with self.assertRaises(ProcessLookupError):
                os.kill(pid, 0)

    def test_output_flood_is_truncated_and_bounded(self):
        status, _, body = self.post_run(
            {
                "language": "python",
                "code": "import sys\nwhile True: sys.stdout.write('x' * 65536)",
                "stdin": "",
            },
            self.token,
        )
        self.assertEqual(status, 200)
        result = json.loads(body)
        self.assertTrue(result["truncated"])
        self.assertLessEqual(len(result["stdout"]), 1_000_000)
        self.assertFalse(result["timedOut"])
        self.assertLess(result["durationMs"], 4000)

    def test_missing_and_wrong_tokens_are_forbidden(self):
        payload = {"language": "python", "code": "print('no')", "stdin": ""}
        for token in (None, "wrong"):
            with self.subTest(token=token):
                status, _, _ = self.post_run(payload, token)
                self.assertEqual(status, 403)

    def test_wrong_host_is_forbidden_for_static_pages(self):
        status, headers, body = self.request(
            "GET", "/", host="evil.example:{}".format(self.port)
        )
        self.assertEqual(status, 403)
        self.assertTrue(headers.get("Content-Type", "").startswith("text/plain"))
        self.assertEqual(body, b"Forbidden")

    def test_cross_origin_run_is_forbidden(self):
        status, _, _ = self.post_run(
            {"language": "python", "code": "print('no')", "stdin": ""},
            self.token,
            {"Origin": "http://evil.example"},
        )
        self.assertEqual(status, 403)

    def test_non_json_run_is_rejected(self):
        status, _, _ = self.request(
            "POST",
            "/api/run",
            b"{}",
            {
                "Content-Type": "text/plain",
                "X-Room-Remix-Token": self.token,
            },
        )
        self.assertEqual(status, 415)

    def test_unknown_language_is_rejected(self):
        status, _, body = self.post_run(
            {"language": "unknown", "code": "", "stdin": ""}, self.token
        )
        self.assertEqual(status, 400)
        self.assertIn("error", json.loads(body))

    def test_browser_language_is_not_accepted_by_the_server(self):
        status, _, body = self.post_run(
            {"language": "javascript", "code": "console.log('no')", "stdin": ""},
            self.token,
        )
        self.assertEqual(status, 400)
        self.assertIn("error", json.loads(body))

    @unittest.skipUnless(shutil.which("node"), "Node.js is not installed")
    def test_browser_worker_runs_javascript_and_typescript(self):
        harness = r"""
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { performance } = require("node:perf_hooks");
const workerPath = process.env.ROOM_REMIX_RUNNER;
const workerSource = fs.readFileSync(workerPath, "utf8");

async function run(language, code, stdin) {
  const messages = [];
  const self = {
    postMessage(message) {
      messages.push(JSON.parse(JSON.stringify(message)));
    },
  };
  let context;
  context = vm.createContext({
    self,
    performance,
    importScripts(...scripts) {
      for (const script of scripts) {
        const file = path.resolve(path.dirname(workerPath), script);
        vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
      }
    },
  });
  vm.runInContext(workerSource, context, { filename: workerPath });
  await self.onmessage({ data: { language, code, stdin } });
  return messages[messages.length - 1];
}

(async () => {
  const javascript = `const input = require("fs").readFileSync(0, "utf8");
const lines = input.split("\\n").filter((line, i, all) => line || i < all.length - 1);
console.log("Hello, world!");
if (lines.length > 0) console.log(\`Read \${lines.length} line(s) of input.\`);`;
  const typescript = `const input: string = require("fs").readFileSync(0, "utf8");
const lines: string[] = input.split("\\n").filter((line, i, all) => line || i < all.length - 1);
console.log("Hello, world!");
if (lines.length > 0) console.log(\`Read \${lines.length} line(s) of input.\`);`;
  const flood = await run(
    "javascript",
    'while (true) { console.log("x".repeat(65536)); console.error("y".repeat(65536)); }',
    "",
  );
  const results = {
    javascript: await run("javascript", javascript, "a\nb\nc\n"),
    processExit: await run(
      "javascript",
      'console.log("before"); process.exit(3); console.log("after");',
      "",
    ),
    thrown: await run("javascript", 'throw new Error("worker boom");', ""),
    flood: {
      phase: flood.phase,
      exitCode: flood.exitCode,
      stdoutLength: flood.stdout.length,
      stderrLength: flood.stderr.length,
      timedOut: flood.timedOut,
      truncated: flood.truncated,
    },
    typescript: await run("typescript", typescript, "a\nb\nc\n"),
    invalidTypescript: await run("typescript", "const value: string = ;", ""),
  };
  process.stdout.write(JSON.stringify(results));
})().catch((error) => {
  process.stderr.write(error.stack || String(error));
  process.exitCode = 1;
});
"""
        environment = os.environ.copy()
        environment["ROOM_REMIX_RUNNER"] = os.path.join(
            str(ROOT), "dist", "js-runner.js"
        )
        result = subprocess.run(
            [shutil.which("node"), "-e", harness],
            capture_output=True,
            text=True,
            timeout=30,
            env=environment,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        results = json.loads(result.stdout)
        self.assertEqual(results["javascript"]["phase"], "run")
        self.assertEqual(results["javascript"]["exitCode"], 0)
        self.assertEqual(
            results["javascript"]["stdout"],
            "Hello, world!\nRead 3 line(s) of input.\n",
        )
        self.assertEqual(results["processExit"]["phase"], "run")
        self.assertEqual(results["processExit"]["exitCode"], 3)
        self.assertEqual(results["processExit"]["stdout"], "before\n")
        self.assertEqual(results["thrown"]["exitCode"], 1)
        self.assertIn("worker boom", results["thrown"]["stderr"])
        self.assertEqual(results["flood"]["phase"], "run")
        self.assertTrue(results["flood"]["truncated"])
        self.assertFalse(results["flood"]["timedOut"])
        self.assertLessEqual(results["flood"]["stdoutLength"], 1_000_000)
        self.assertLessEqual(results["flood"]["stderrLength"], 1_000_000)
        self.assertEqual(results["typescript"]["exitCode"], 0)
        self.assertEqual(
            results["typescript"]["stdout"],
            "Hello, world!\nRead 3 line(s) of input.\n",
        )
        self.assertEqual(results["invalidTypescript"]["phase"], "compile")
        self.assertEqual(results["invalidTypescript"]["exitCode"], 1)
        self.assertTrue(results["invalidTypescript"]["stderr"])

    def test_help_and_launch_output_include_ide_link(self):
        help_result = subprocess.run(
            COMMAND + ["--help"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        self.assertEqual(help_result.returncode, 0)
        self.assertIn("--ide", help_result.stdout)

        process = subprocess.Popen(
            COMMAND + ["--no-browser"],
            cwd=str(ROOT),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
        lines = queue.Queue()

        def read_lines():
            for line in process.stdout:
                lines.put(line)

        reader = threading.Thread(target=read_lines, daemon=True)
        reader.start()
        output = []
        try:
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline:
                try:
                    line = lines.get(timeout=max(0.01, deadline - time.monotonic()))
                except queue.Empty:
                    break
                output.append(line)
                if line.startswith("  Code:"):
                    break
        finally:
            if process.poll() is None:
                if sys.platform == "win32":
                    process.terminate()
                else:
                    process.send_signal(signal.SIGINT)
                process.wait(timeout=5)
            reader.join(timeout=2)
            process.stdout.close()
        self.assertTrue(any(line.startswith("  Open: http://127.0.0.1:") for line in output))
        self.assertTrue(any(line.startswith("  Code: http://127.0.0.1:") for line in output))

    def test_code_page_redeems_codes_with_dream_api(self):
        expected = os.environ.get("ROOM_REMIX_INTERVIEW_API") or "https://api.dreamhq.com"
        self.assertIn(
            '<meta name="room-remix-interview-api" content="{}" />'.format(expected),
            self.ide_html,
        )
        self.assertIn('id="gate-code"', self.ide_html)
        self.assertIn("/interview/redeem", (ROOT / "dist" / "ide.js").read_text(encoding="utf-8"))

    def test_questions_never_ship_with_the_repo(self):
        # The questions live in Dream's private api; only a one-time code opens one.
        self.assertFalse((ROOT / "dist" / "questions").exists())
        for path in (ROOT / "dist").rglob("*"):
            if path.is_file() and path.suffix in (".html", ".js", ".css", ".json"):
                text = path.read_text(encoding="utf-8", errors="replace")
                for marker in ("cross_entropy_with_softmax", "Attend All Meetings", "Buy and Sell Stock"):
                    self.assertNotIn(marker, text, str(path))

    def test_interview_api_can_be_pointed_elsewhere(self):
        with running_demo("--interview-api", "http://localhost:3000/") as (url, _):
            port = int(url.split("/?")[0].rsplit(":", 1)[1])
            connection = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
            try:
                connection.request("GET", "/ide.html")
                page = connection.getresponse().read().decode("utf-8")
            finally:
                connection.close()
        self.assertIn('name="room-remix-interview-api" content="http://localhost:3000/"', page)
        result = subprocess.run(
            COMMAND + ["--no-browser", "--interview-api", "javascript:alert(1)"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("--interview-api must be an http(s) URL", result.stderr)

if __name__ == "__main__":
    unittest.main()
