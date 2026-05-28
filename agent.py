# -*- coding: utf-8 -*-
"""
CheckCTS Agent - dich vu doc USB token chay LOCAL tren may nguoi dung.
Mo cong HTTP noi bo (127.0.0.1:8765) co CORS de trang web (ke ca web online) goi fetch doc token.
Doc token truc tiep qua PKCS#11 (khong can plugin VGCA / SDK cua hang).

Cach dung:
    python agent.py                 # chay tai 127.0.0.1:8765
    python agent.py 9000            # chay cong khac
Hoac dong goi: pyinstaller --onefile agent.py  -> CheckCTS-Agent.exe (portable, khong can cai)

Endpoint:
    GET /ping   -> {"app":"CheckCTS-Agent","version":...,"status":"ok"}
    GET /certs  -> {"tokens":[{label,serial,driver,certs:[base64 DER,...]}]}
"""
import sys
import os
import socket
import json
import logging
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import checkcts

VERSION = "1.0"
PORT = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else 8765

# Ghi log ra file de debug khi chay an (hidden window)
_log_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "agent.log")
logging.basicConfig(
    filename=_log_file, level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    encoding="utf-8",
)


class Server(ThreadingHTTPServer):
    """ThreadingHTTPServer voi quyen bind mo rong tren Windows (fix WinError 10013)."""
    allow_reuse_address = True

    def server_bind(self):
        # Windows mac dinh dat SO_EXCLUSIVEADDRUSE gay ra WinError 10013 (WSAEACCES).
        # Tat co nay truoc khi bind cho phep tai su dung cong sau khi dich vu dung/khoi dong lai.
        if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            try:
                self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 0)
            except OSError:
                pass
        super().server_bind()


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self._cors()
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        path = self.path.split("?")[0].rstrip("/")
        if path in ("", "/ping"):
            self._json({"app": "CheckCTS-Agent", "version": VERSION, "status": "ok"})
        elif path == "/certs":
            try:
                tokens = checkcts.read_token_certs()
                self._json({"status": "ok", "count": len(tokens), "tokens": tokens})
            except Exception as e:
                self._json({"status": "error", "message": str(e)}, 500)
        else:
            self._json({"status": "error", "message": "not found"}, 404)

    def log_message(self, fmt, *args):
        print("  [%s] %s" % (self.address_string(), fmt % args))


def main():
    print("=" * 60)
    print(" CheckCTS Agent v%s - doc USB token cho web" % VERSION)
    print(" Dang chay tai: http://127.0.0.1:%d" % PORT)
    print(" Endpoint: /ping  /certs")
    print("=" * 60)
    try:
        srv = Server(("127.0.0.1", PORT), Handler)
    except OSError as e:
        msg = (
            f"[LOI] Khong the mo cong {PORT}: {e}\n"
            "  -> Hay chay voi quyen Administrator, hoac:\n"
            "     netsh int ipv4 add excludedportrange protocol=tcp startport=8765 numberofports=1\n"
            "  -> Hoac doi sang cong khac: python agent.py 9000"
        )
        print(msg)
        logging.error(msg)
        import time; time.sleep(30)
        sys.exit(1)

    logging.info("Agent khoi dong tai cong %d", PORT)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nDa dung agent.")
        srv.shutdown()
    finally:
        logging.info("Agent da dung.")


if __name__ == "__main__":
    main()
