#!/usr/bin/env python3
"""Exercise the actual web loader in local headless Chrome after the WASM build."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json
import os
import re
import shutil
import subprocess
import threading

root = Path(__file__).resolve().parents[1]
chrome = os.environ.get('CHROME_BIN') or next(
    (p for name in ('google-chrome', 'chromium', 'chromium-browser')
     if (p := shutil.which(name))), None)
if not chrome:
    raise SystemExit('Chrome is required; set CHROME_BIN to its executable')

class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass

server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(root)))
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()
try:
    url = f'http://127.0.0.1:{server.server_port}/npm/packages/graph-language-wasm/test/browser.html'
    result = subprocess.run(
        [chrome, '--headless', '--no-sandbox', '--disable-gpu',
         '--disable-dev-shm-usage', '--virtual-time-budget=10000', '--dump-dom', url],
        capture_output=True, text=True, timeout=45, check=True)
    match = re.search(r'<pre id="result">PASS ([a-f0-9]{64})</pre>', result.stdout)
    if not match:
        message = re.search(r'<pre id="result">(.*?)</pre>', result.stdout, re.S)
        raise SystemExit(f'Browser smoke failed: {message.group(1) if message else result.stderr[-1500:]}')
    # Compare to the native executable when present, rather than asserting a hardcoded hash.
    binary = Path(os.environ.get('RUGRAPH_REFERENCE_BIN', str(root / 'crates/ruvector-language/target/debug/rvg-core')))
    native_verified = binary.is_file()
    if native_verified:
        examples = root / 'crates/ruvector-language/examples'
        native = subprocess.check_output(
            [str(binary), 'run', str(examples/'incident.rvg'), '--snapshot',
             str(examples/'snapshot.json'), '--context', str(examples/'context.json')], text=True)
        assert json.loads(native)['receipt_hash'] == match.group(1), 'Browser/native receipt mismatch'
    print(json.dumps({'browser': 'PASS', 'receipt_hash': match.group(1), 'native_comparison': native_verified}))
finally:
    server.shutdown()
    server.server_close()
    thread.join(timeout=5)
