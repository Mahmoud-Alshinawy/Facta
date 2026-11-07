"""Keep only a disposable SQL bridge clock just ahead of a native test client.

This is not Auth/JWT/PostgREST evidence. Stops when the workspace sentinel exists.
"""
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import sys
import time
from urllib.request import Request, urlopen
from urllib.parse import urlparse

base = sys.argv[1]
url = urlparse(base)
if url.scheme != "http" or url.hostname != "127.0.0.1" or not url.port:
    raise SystemExit("Disposable loopback fixture required")
sentinel = Path(__file__).resolve().parents[1] / "tmp/shared-step6/stop-clock"
while not sentinel.exists():
    body = json.dumps({"action": "clock", "now": (datetime.now(timezone.utc) + timedelta(seconds=2)).isoformat()}).encode()
    with urlopen(Request(base + "/test/control", data=body, headers={"Content-Type": "application/json"}), timeout=5) as response:
        response.read()
    time.sleep(0.5)
