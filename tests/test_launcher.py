"""Real-process checks for the standard-library launcher; no test dependencies."""

from contextlib import contextmanager
from pathlib import Path
import queue
import re
import signal
import subprocess
import sys
import tempfile
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import urlopen


ROOT = Path(__file__).resolve().parents[1]
COMMAND = [sys.executable, "-u", str(ROOT / "demo.py")]


@contextmanager
def running_demo(*args):
    # A different working directory catches fragile relative asset paths.
    with tempfile.TemporaryDirectory() as directory:
        process = subprocess.Popen(COMMAND + ["--no-browser", *args], cwd=directory,
                                   stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                   text=True)
        lines = queue.Queue()
        def read_output():
            for line in process.stdout:
                lines.put(line)
        thread = threading.Thread(target=read_output, daemon=True)
        thread.start()
        try:
            while True:
                line = lines.get(timeout=8)
                match = re.search(r"http://127\.0\.0\.1:\d+/\?room=[\w-]+", line)
                if match:
                    yield match.group(0), process
                    break
        finally:
            if process.poll() is None:
                if sys.platform == "win32":
                    process.terminate()
                else:
                    process.send_signal(signal.SIGINT)
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)
            thread.join(timeout=2)
            process.stdout.close()


class LauncherTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.running = running_demo()
        cls.url, cls.process = cls.running.__enter__()
        cls.origin = cls.url.split("/?")[0]

    @classmethod
    def tearDownClass(cls):
        cls.running.__exit__(None, None, None)

    def test_serves_page_from_unrelated_working_directory(self):
        with urlopen(self.url, timeout=4) as response:
            self.assertEqual(response.status, 200)
            self.assertIn(b"Interactive isometric room", response.read())

    def test_serves_bundled_javascript_and_css(self):
        for asset, content in [("app.js", b"buildFurniture"), ("styles.css", b"canvas-wrap")]:
            with self.subTest(asset=asset), urlopen(self.origin + "/" + asset, timeout=4) as response:
                self.assertEqual(response.status, 200)
                self.assertIn(content, response.read())

    def test_room_argument_is_in_launch_url(self):
        with running_demo("--room", "tiny-bedroom") as (url, process):
            self.assertTrue(url.endswith("?room=tiny-bedroom"))
            with urlopen(url, timeout=4) as response:
                self.assertEqual(response.status, 200)

    def test_busy_port_has_actionable_error(self):
        port = self.origin.rsplit(":", 1)[1]
        result = subprocess.run(COMMAND + ["--no-browser", "--port", port], capture_output=True, text=True, timeout=5)
        self.assertEqual(result.returncode, 1)
        self.assertIn("Try again without --port", result.stderr)

    def test_invalid_room_is_rejected(self):
        result = subprocess.run(COMMAND + ["--room", "unknown"], capture_output=True, text=True, timeout=5)
        self.assertEqual(result.returncode, 2)
        self.assertIn("invalid choice", result.stderr)

    def test_invalid_port_is_rejected(self):
        result = subprocess.run(COMMAND + ["--port", "65536"], capture_output=True, text=True, timeout=5)
        self.assertEqual(result.returncode, 2)
        self.assertIn("between 0 and 65535", result.stderr)

    def test_help_exits_without_starting_server(self):
        result = subprocess.run(COMMAND + ["--help"], capture_output=True, text=True, timeout=5)
        self.assertEqual(result.returncode, 0)
        self.assertIn("--room", result.stdout)
        self.assertIn("--no-browser", result.stdout)

    def test_server_cannot_serve_launcher_outside_assets(self):
        with self.assertRaises(HTTPError) as error:
            urlopen(self.origin + "/%2e%2e/demo.py", timeout=4)
        self.assertEqual(error.exception.code, 404)

    @unittest.skipIf(sys.platform == "win32", "Windows console interruption is checked manually")
    def test_ctrl_c_stops_cleanly(self):
        with running_demo() as (url, process):
            process.send_signal(signal.SIGINT)
            self.assertEqual(process.wait(timeout=5), 0)


if __name__ == "__main__":
    unittest.main()
