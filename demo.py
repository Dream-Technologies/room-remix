#!/usr/bin/env python3
"""Launch Room Remix using only the Python standard library."""

import argparse
import functools
import html
import json
import math
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import secrets
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
import time
from urllib.parse import urlsplit
import webbrowser


OUTPUT_LIMIT = 1_000_000
BODY_LIMIT = 2_000_000
RUN_LOCK = threading.Lock()
# Dream's api, where the Code page spends a one-time interview code for its
# question. ROOM_REMIX_INTERVIEW_API points it elsewhere (local or staging).
DEFAULT_INTERVIEW_API = "https://api.dreamhq.com"


LANGUAGE_TABLE = [
    {
        "id": "python",
        "name": "Python",
        "file": "main.py",
        "install": "Install Python 3.9+ from https://www.python.org/downloads",
    },
]
LANGUAGES_BY_ID = {language["id"]: language for language in LANGUAGE_TABLE}


def _language_listing():
    return [
        {
            "id": "python",
            "name": "Python",
            "available": True,
            "version": sys.version.split()[0],
            "install": language["install"],
        }
        for language in LANGUAGE_TABLE
    ]


def _decode_output(value):
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    return value.decode("utf-8", errors="replace")


def _limited_output(stdout, stderr, truncated=False):
    truncated = truncated or len(stdout) > OUTPUT_LIMIT or len(stderr) > OUTPUT_LIMIT
    return (
        _decode_output(stdout[:OUTPUT_LIMIT]),
        _decode_output(stderr[:OUTPUT_LIMIT]),
        truncated,
    )


def _terminate_process(process):
    if os.name == "nt":
        try:
            subprocess.run(
                ["taskkill", "/T", "/F", "/PID", str(process.pid)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=5,
                check=False,
            )
        except (OSError, subprocess.SubprocessError):
            process.kill()
    else:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass


def _run_process(command, workspace, environment, timeout, stdin_text=None):
    options = {
        "args": command,
        "cwd": str(workspace),
        "env": environment,
        "stdout": subprocess.PIPE,
        "stderr": subprocess.PIPE,
        "stdin": subprocess.PIPE if stdin_text is not None else subprocess.DEVNULL,
    }
    if os.name == "nt":
        options["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
        if os.path.splitext(command[0])[1].lower() in (".bat", ".cmd"):
            options["args"] = subprocess.list2cmdline(command)
            options["shell"] = True
    else:
        options["start_new_session"] = True
    started = time.monotonic()
    process = subprocess.Popen(**options)

    output = {"stdout": bytearray(), "stderr": bytearray()}
    truncated = threading.Event()
    terminate_lock = threading.Lock()

    def capture(stream, destination):
        try:
            while True:
                chunk = stream.read(65536)
                if not chunk or truncated.is_set():
                    return
                remaining = OUTPUT_LIMIT - len(destination)
                if len(chunk) > remaining:
                    destination.extend(chunk[:remaining])
                    with terminate_lock:
                        if not truncated.is_set():
                            truncated.set()
                            _terminate_process(process)
                    return
                destination.extend(chunk)
        except (OSError, ValueError):
            return

    reader_threads = []
    for name in ("stdout", "stderr"):
        thread = threading.Thread(
            target=capture,
            args=(getattr(process, name), output[name]),
            daemon=True,
        )
        thread.start()
        reader_threads.append(thread)

    writer_thread = None
    if stdin_text is not None:

        def write_stdin():
            try:
                process.stdin.write(stdin_text.encode("utf-8"))
                process.stdin.flush()
            except (BrokenPipeError, OSError, ValueError):
                pass
            finally:
                try:
                    process.stdin.close()
                except (OSError, ValueError):
                    pass

        writer_thread = threading.Thread(target=write_stdin, daemon=True)
        writer_thread.start()

    try:
        process.wait(timeout=timeout)
        timed_out = False
    except subprocess.TimeoutExpired:
        _terminate_process(process)
        timed_out = True
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()

    join_deadline = time.monotonic() + 5
    for thread in reader_threads + ([writer_thread] if writer_thread else []):
        thread.join(max(0, join_deadline - time.monotonic()))

    duration_ms = int((time.monotonic() - started) * 1000)
    stdout, stderr, was_truncated = _limited_output(
        output["stdout"], output["stderr"], truncated.is_set()
    )
    return {
        "exitCode": process.returncode,
        "stdout": stdout,
        "stderr": stderr,
        "timedOut": timed_out,
        "durationMs": duration_ms,
        "truncated": was_truncated,
    }


def _run_code(language, code, stdin_text, run_timeout):
    response = {
        "phase": "run",
        "exitCode": None,
        "stdout": "",
        "stderr": "",
        "timedOut": False,
        "durationMs": 0,
        "truncated": False,
    }
    with RUN_LOCK:
        directory = tempfile.mkdtemp(prefix="room-remix-run-")
        try:
            workspace = Path(directory)
            with open(workspace / language["file"], "w", encoding="utf-8", newline="") as source:
                source.write(code)
            try:
                result = _run_process(
                    [sys.executable, language["file"]],
                    workspace,
                    _run_environment(),
                    run_timeout,
                    stdin_text,
                )
            except OSError as error:
                response.update(exitCode=1, stderr=str(error))
                return response
            response.update(result)
        finally:
            shutil.rmtree(directory, ignore_errors=True)
    return response


def _run_environment():
    environment = os.environ.copy()
    environment.update(
        {
            "PYTHONIOENCODING": "utf-8",
            "PYTHONUNBUFFERED": "1",
        }
    )
    return environment


def _error_response(handler, status, message):
    body = json.dumps({"error": message}).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def _plain_response(handler, status, message):
    body = message.encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "text/plain; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def _json_response(handler, value, status=200):
    body = json.dumps(value).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


class LocalServer(ThreadingHTTPServer):
    daemon_threads = True


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, run_token, run_timeout, interview_api, **kwargs):
        self.run_token = run_token
        self.interview_api = interview_api
        self.run_timeout = run_timeout
        super().__init__(*args, **kwargs)

    def parse_request(self):
        if not super().parse_request():
            return False
        port = self.server.server_port
        if self.headers.get("Host") not in (
            "127.0.0.1:{}".format(port),
            "localhost:{}".format(port),
        ):
            _plain_response(self, 403, "Forbidden")
            return False
        path = urlsplit(self.path).path
        origin = self.headers.get("Origin")
        if path.startswith("/api/") and origin is not None and origin not in (
            "http://127.0.0.1:{}".format(port),
            "http://localhost:{}".format(port),
        ):
            _plain_response(self, 403, "Forbidden")
            return False
        return True

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == "/ide":
            self.send_response(302)
            self.send_header("Location", "/ide.html")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if path == "/ide.html":
            ide_file = Path(__file__).resolve().parent / "dist" / "ide.html"
            try:
                content = ide_file.read_text(encoding="utf-8")
            except OSError:
                return super().do_GET()
            content = content.replace("__ROOM_REMIX_RUN_TOKEN__", self.run_token)
            content = content.replace(
                "__ROOM_REMIX_INTERVIEW_API__", html.escape(self.interview_api, quote=True)
            )
            body = content.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path == "/api/languages":
            _json_response(self, {"languages": _language_listing()})
            return
        return super().do_GET()

    def do_POST(self):
        if urlsplit(self.path).path != "/api/run":
            return super().do_POST()
        request_token = self.headers.get("X-Room-Remix-Token")
        if request_token is None or not secrets.compare_digest(request_token, self.run_token):
            _error_response(self, 403, "Invalid run token.")
            return
        content_type = self.headers.get("Content-Type", "")
        if not content_type.lower().startswith("application/json"):
            _error_response(self, 415, "Content-Type must be application/json.")
            return
        content_length = self.headers.get("Content-Length")
        try:
            length = int(content_length)
        except (TypeError, ValueError):
            _error_response(self, 400, "A valid Content-Length is required.")
            return
        if length < 0:
            _error_response(self, 400, "A valid Content-Length is required.")
            return
        if length > BODY_LIMIT:
            _error_response(self, 413, "Request body is too large.")
            return
        try:
            payload = json.loads(self.rfile.read(length))
        except (json.JSONDecodeError, UnicodeDecodeError):
            _error_response(self, 400, "Request body must be valid JSON.")
            return
        if not isinstance(payload, dict) or not all(
            isinstance(payload.get(key), str) for key in ("language", "code", "stdin")
        ):
            _error_response(self, 400, "language, code, and stdin must be strings.")
            return
        language = LANGUAGES_BY_ID.get(payload["language"])
        if language is None:
            _error_response(self, 400, "Unknown language.")
            return
        _json_response(
            self,
            _run_code(language, payload["code"], payload["stdin"], self.run_timeout),
        )

    def log_message(self, format, *args):
        # Keep the terminal focused on the launch URL and stop instruction.
        if len(args) < 2 or str(args[1]) not in ("200", "304"):
            super().log_message(format, *args)


def main():
    parser = argparse.ArgumentParser(description="Open a tiny, interactive room-design playground.")
    parser.add_argument("--room", choices=("studio", "tiny-bedroom"), default="studio", help="choose a fictional room (default: studio)")
    parser.add_argument("--port", type=int, default=0, help="choose a local port; 0 finds an available port (default)")
    parser.add_argument("--no-browser", action="store_true", help="print both links without opening a browser")
    parser.add_argument("--ide", action="store_true", help="open the coding-challenge editor in your browser")
    parser.add_argument("--run-timeout", type=float, default=10, help=argparse.SUPPRESS)
    parser.add_argument(
        "--interview-api",
        default=os.environ.get("ROOM_REMIX_INTERVIEW_API") or DEFAULT_INTERVIEW_API,
        help=argparse.SUPPRESS,
    )
    args = parser.parse_args()
    if not 0 <= args.port <= 65535:
        parser.error("--port must be between 0 and 65535")
    if not math.isfinite(args.run_timeout) or args.run_timeout <= 0:
        parser.error("--run-timeout must be greater than 0")
    if urlsplit(args.interview_api).scheme not in ("http", "https"):
        parser.error("--interview-api must be an http(s) URL")
    assets = Path(__file__).resolve().parent / "dist"
    run_token = secrets.token_urlsafe(24)
    handler = functools.partial(
        Handler,
        directory=str(assets),
        run_token=run_token,
        run_timeout=args.run_timeout,
        interview_api=args.interview_api,
    )
    try:
        server = LocalServer(("127.0.0.1", args.port), handler)
    except OSError as error:
        parser.exit(1, "Could not start the local server: {}\nTry again without --port to use an available port.\n".format(error))
    url = "http://127.0.0.1:{}/?room={}".format(server.server_port, args.room)
    code_url = "http://127.0.0.1:{}/ide.html".format(server.server_port)
    print("\n  ROOM REMIX\n  A tiny room-design playground.\n")
    print("  Open: {}".format(url))
    print("  Code: {}\n".format(code_url), flush=True)
    print("  Drag a piece. Change the palette. Make yourself at home.")
    print("  Press Ctrl+C here to stop.\n", flush=True)
    if not args.no_browser:
        browser_url = code_url if args.ide else url
        browser_timer = threading.Timer(0.3, lambda: webbrowser.open(browser_url))
        browser_timer.daemon = True
        browser_timer.start()
    try:
        server.serve_forever(poll_interval=0.2)
    except KeyboardInterrupt:
        print("\n  Room Remix stopped. Thanks for dropping by.\n")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
