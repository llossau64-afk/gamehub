import os
import sys
import tempfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "tests"))

from fakes import ServerThread, free_port, make_ollama, make_searxng  # noqa: E402

_tmp = tempfile.mkdtemp(prefix="velqin-test-")
_oport, _sport = free_port(), free_port()
os.environ.update({
    "VELQIN_DATA_DIR": _tmp,
    "VELQIN_ENVIRONMENT": "test",
    "VELQIN_OLLAMA_URL": f"http://127.0.0.1:{_oport}",
    "VELQIN_SEARXNG_URL": f"http://127.0.0.1:{_sport}",
    "VELQIN_COMFYUI_URL": "http://127.0.0.1:9",  # nothing listens here -> "ComfyUI offline" paths
    "VELQIN_FRONTEND_DIST": str(Path(_tmp) / "no-frontend"),
    "VELQIN_LOGIN_ATTEMPTS_PER_15MIN": "5",
})

_ollama = ServerThread(make_ollama(), _oport)
_searx = ServerThread(make_searxng(), _sport)
_ollama.start()
_searx.start()
_ollama.wait_ready()
_searx.wait_ready()

H = {"X-Velqin-Request": "1"}


@pytest.fixture(scope="session")
def client():
    from fastapi.testclient import TestClient

    import main

    with TestClient(main.app, base_url="http://testserver") as c:
        yield c


def make_client():
    from fastapi.testclient import TestClient

    import main

    return TestClient(main.app, base_url="http://testserver")
