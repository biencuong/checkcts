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
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import checkcts

VERSION = "1.0"
PORT = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else 8765


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
    print(" GIU CUA SO NAY MO trong khi dung web. Dong cua so = tat agent.")
    print("=" * 60)
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nDa dung agent.")
        srv.shutdown()


if __name__ == "__main__":
    main()
