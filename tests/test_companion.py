import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import time
import unittest
from urllib import request, error
from http.server import ThreadingHTTPServer

spec = importlib.util.spec_from_file_location("pagecue_server", Path(__file__).resolve().parents[1] / "companion/server.py")
server_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server_module)


class FakeProvider:
    model = transcription_model = "fake-no-network"
    def __init__(self): self.calls = []; self.wait = threading.Event(); self.wait.set()
    def check(self): pass
    def ask(self, payload):
        self.calls.append(payload)
        self.wait.wait(3)
        return "B. Four — two plus two equals four."
    def transcribe(self, path):
        self.calls.append(path.read_bytes())
        return "This is the recorded source."


class CompanionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.provider = FakeProvider()
        self.store = server_module.JobStore(self.tmp.name, self.provider)
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), server_module.handler_for(self.store, "test-token"))
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True); self.thread.start()
        self.base = f"http://127.0.0.1:{self.server.server_port}"

    def tearDown(self):
        self.provider.wait.set(); self.server.shutdown(); self.server.server_close()
        self.store.executor.shutdown(wait=True); self.tmp.cleanup()

    def call(self, path, data=None, headers=None):
        h = {"Authorization": "Bearer test-token"}; h.update(headers or {})
        if isinstance(data, dict): data = json.dumps(data).encode(); h["Content-Type"] = "application/json"
        req = request.Request(self.base + path, data=data, headers=h)
        try:
            with request.urlopen(req, timeout=3) as response: return response.status, json.load(response)
        except error.HTTPError as exc: return exc.code, json.load(exc)

    def complete(self, job_id):
        for _ in range(100):
            code, result = self.call("/jobs/" + job_id)
            if result["status"] != "running": return result
            time.sleep(.01)
        self.fail("Job never finished")

    def test_requires_pairing_and_rejects_web_origins_and_rebinding(self):
        self.assertEqual(self.call("/health", headers={"Authorization": ""})[0], 401)
        self.assertEqual(self.call("/health", headers={"Origin": "https://malicious.example"})[0], 403)
        self.assertEqual(self.call("/health", headers={"Host": "attacker.example"})[0], 403)
        self.assertEqual(self.call("/health", headers={"Origin": "chrome-extension://" + "a" * 32})[0], 200)

    def test_question_context_preserved_and_result_survives_restart(self):
        source = {"question": "What is 2+2? A. Three B. Four", "context": "Lesson transcript"}
        code, result = self.call("/jobs/ask", source); self.assertEqual(code, 202)
        job = self.complete(result["id"])
        self.assertEqual(job["status"], "done"); self.assertEqual(self.provider.calls, [source])
        recovered = server_module.JobStore(self.tmp.name, self.provider)
        self.assertEqual(recovered.get(job["id"])["text"], job["text"])
        recovered.executor.shutdown()

    def test_recording_is_saved_byte_for_byte_before_transcription(self):
        data = b"webm fixture bytes"
        code, result = self.call("/jobs/transcribe?ext=webm", data); self.assertEqual(code, 202)
        job = self.complete(result["id"])
        self.assertEqual(job["text"], "This is the recorded source.")
        self.assertEqual((Path(self.tmp.name) / job["file"]).read_bytes(), data)

    def test_duplicate_and_invalid_jobs_are_not_charged(self):
        self.assertEqual(self.call("/jobs/ask", {"question": ""})[0], 400)
        self.assertEqual(self.call("/jobs/transcribe?ext=exe", b"bad")[0], 400)
        self.provider.wait.clear()
        self.assertEqual(self.call("/jobs/ask", {"question": "First"})[0], 202)
        self.assertEqual(self.call("/jobs/ask", {"question": "Second"})[0], 400)
        self.provider.wait.set()

    def test_restart_does_not_automatically_resubmit_paid_job(self):
        job_id = "a" * 32
        (Path(self.tmp.name) / (job_id + ".json")).write_text(json.dumps({"id":job_id, "status":"running"}))
        self.assertEqual(self.store.get(job_id)["status"], "error")
        self.assertEqual(self.provider.calls, [])
        self.assertIsNone(self.store.get("../pairing"))

    def test_provider_failure_becomes_recoverable_error(self):
        def reject(payload): raise server_module.UserError("Quota reached")
        self.provider.ask = reject
        _, result = self.call("/jobs/ask", {"question":"Question"})
        self.assertEqual(self.complete(result["id"])["error"], "Quota reached")


if __name__ == "__main__": unittest.main()
