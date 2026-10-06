#!/usr/bin/env python3
"""Launch Room Remix using only Python's standard library."""

import argparse
import functools
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading
import webbrowser


class LocalServer(ThreadingHTTPServer):
    daemon_threads = True


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        # Keep the terminal focused on the launch URL and stop instruction.
        if len(args) < 2 or str(args[1]) not in ("200", "304"):
            super().log_message(format, *args)


def main():
    parser = argparse.ArgumentParser(description="Open a tiny, interactive room-design playground.")
    parser.add_argument("--room", choices=("studio", "tiny-bedroom"), default="studio", help="choose a fictional room (default: studio)")
    parser.add_argument("--port", type=int, default=0, help="choose a local port; 0 finds an available port (default)")
    parser.add_argument("--no-browser", action="store_true", help="print the link without opening your browser")
    args = parser.parse_args()
    if not 0 <= args.port <= 65535:
        parser.error("--port must be between 0 and 65535")
    assets = Path(__file__).resolve().parent / "dist"
    handler = functools.partial(Handler, directory=str(assets))
    try:
        server = LocalServer(("127.0.0.1", args.port), handler)
    except OSError as error:
        parser.exit(1, "Could not start the local server: {}\nTry again without --port to use an available port.\n".format(error))
    url = "http://127.0.0.1:{}/?room={}".format(server.server_port, args.room)
    print("\n  ROOM REMIX\n  A tiny room-design playground.\n")
    print("  Open: {}\n".format(url), flush=True)
    print("  Drag a piece. Change the palette. Make yourself at home.")
    print("  Press Ctrl+C here to stop.\n", flush=True)
    if not args.no_browser:
        browser_timer = threading.Timer(0.3, lambda: webbrowser.open(url))
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
