#!/usr/bin/env python3
"""Run the full UI through the real module Worker and WASM in Chrome."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import html,json,os,re,shutil,subprocess,threading
root=Path(__file__).resolve().parents[1]
chrome=os.environ.get('CHROME_BIN') or next((p for n in ('google-chrome','chromium','chromium-browser') if (p:=shutil.which(n))),None)
if not chrome: raise SystemExit('Chrome required; set CHROME_BIN')
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(root)))
thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
try:
    result=subprocess.run(['node','--experimental-websocket',str(root/'scripts/explorer-chrome.mjs'),f'http://127.0.0.1:{server.server_port}/explorer/test/browser.html'],capture_output=True,text=True,timeout=120)
    if result.returncode: raise SystemExit(result.stderr or result.stdout)
    print(result.stdout.strip())
finally:
    server.shutdown();server.server_close();thread.join(timeout=5)
