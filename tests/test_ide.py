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
            [
                "python", "javascript", "typescript", "java", "c", "cpp", "csharp",
                "go", "rust", "kotlin", "swift", "ruby", "php", "bash",
            ],
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

    def test_unavailable_language_is_rejected(self):
        status, _, body = self.request("GET", "/api/languages")
        self.assertEqual(status, 200)
        unavailable = next(
            (language for language in json.loads(body)["languages"] if not language["available"]),
            None,
        )
        if unavailable is None:
            self.skipTest("Every supported language is installed.")
        status, _, body = self.post_run(
            {"language": unavailable["id"], "code": "", "stdin": ""}, self.token
        )
        self.assertEqual(status, 409)
        self.assertIn(unavailable["name"], json.loads(body)["error"])
        self.assertIn(unavailable["install"], json.loads(body)["error"])

    @unittest.skipUnless(shutil.which("node"), "Node.js is not installed")
    def test_javascript_runs_when_node_is_installed(self):
        status, _, body = self.post_run(
            {"language": "javascript", "code": "console.log('node ok')", "stdin": ""},
            self.token,
        )
        self.assertEqual(status, 200)
        result = json.loads(body)
        self.assertEqual(result["phase"], "run")
        self.assertEqual(result["exitCode"], 0)
        self.assertEqual(result["stdout"].strip(), "node ok")

    @unittest.skipUnless(
        shutil.which("gcc") or shutil.which("clang") or shutil.which("cc"),
        "A C compiler is not installed",
    )
    def test_c_compile_error_is_reported_as_compile_phase(self):
        status, _, body = self.post_run(
            {"language": "c", "code": "int main( {", "stdin": ""}, self.token
        )
        self.assertEqual(status, 200)
        result = json.loads(body)
        self.assertEqual(result["phase"], "compile")
        self.assertNotEqual(result["exitCode"], 0)
        self.assertTrue(result["stderr"])

    @unittest.skipUnless(
        shutil.which("g++") or shutil.which("clang++") or shutil.which("c++"),
        "A C++ compiler is not installed",
    )
    def test_cpp_runs_when_a_compiler_is_installed(self):
        status, _, body = self.post_run(
            {
                "language": "cpp",
                "code": "#include <iostream>\nint main() { std::cout << \"cpp ok\\n\"; }",
                "stdin": "",
            },
            self.token,
        )
        self.assertEqual(status, 200)
        result = json.loads(body)
        self.assertEqual(result["phase"], "run")
        self.assertEqual(result["exitCode"], 0)
        self.assertEqual(result["stdout"].strip(), "cpp ok")

    @unittest.skipUnless(
        shutil.which("java") and shutil.which("javac"),
        "A JDK is not installed",
    )
    def test_java_runs_when_a_jdk_is_installed(self):
        status, _, body = self.post_run(
            {
                "language": "java",
                "code": "public class Main { public static void main(String[] args) { System.out.println(\"java ok\"); } }",
                "stdin": "",
            },
            self.token,
        )
        self.assertEqual(status, 200)
        result = json.loads(body)
        self.assertEqual(result["phase"], "run")
        self.assertEqual(result["exitCode"], 0)
        self.assertEqual(result["stdout"].strip(), "java ok")

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


if __name__ == "__main__":
    unittest.main()
