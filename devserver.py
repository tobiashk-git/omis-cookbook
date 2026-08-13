"""Local dev server for Omi's Cookbook that disables caching, so edits show
up on every reload. For production use a normal static host (see README)."""
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8137


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


if __name__ == "__main__":
    print(f"Serving Omi's Cookbook (no-cache) at http://127.0.0.1:{PORT}")
    HTTPServer(("127.0.0.1", PORT), NoCacheHandler).serve_forever()
