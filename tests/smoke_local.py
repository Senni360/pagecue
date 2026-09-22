"""Start the real companion, check configuration locally, then shut it down. No paid API call."""
import json
from pathlib import Path
import subprocess
import sys
import time
from urllib import request, error

root = Path(__file__).resolve().parents[1]
process = subprocess.Popen([sys.executable, str(root / "companion/server.py")], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
try:
    for _ in range(40):
        if process.poll() is not None:
            raise RuntimeError("Companion exited unexpectedly: " + process.stderr.read().decode())
        token_file = root / "companion/pairing.txt"
        if token_file.exists():
            req = request.Request("http://127.0.0.1:8765/health", headers={"Authorization":"Bearer " + token_file.read_text().strip()})
            try:
                with request.urlopen(req, timeout=1) as response:
                    result = json.load(response)
                print("PASS: real companion starts; pairing works; API key configured; model=" + result["model"] + "; no external request made")
                break
            except error.HTTPError as exc:
                print("Companion starts and pairing works; configuration: " + json.load(exc)["error"])
                break
            except (error.URLError, TimeoutError): pass
        time.sleep(.1)
    else: raise RuntimeError("Companion did not become healthy")
finally:
    process.terminate()
    process.wait(timeout=5)
