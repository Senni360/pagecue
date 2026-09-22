"""An explicitly fake provider for browser integration tests: no external calls."""
import tempfile
from http.server import ThreadingHTTPServer
from test_companion import server_module, FakeProvider

with tempfile.TemporaryDirectory(prefix="pagecue-test-") as directory:
    store = server_module.JobStore(directory, FakeProvider())
    server = ThreadingHTTPServer(("127.0.0.1", 8765), server_module.handler_for(store, "pagecue-test-token"))
    print("READY", flush=True)
    try: server.serve_forever()
    finally: server.server_close(); store.executor.shutdown()
