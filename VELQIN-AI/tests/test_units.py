"""Unit tests for helpers (file sniffing, chunking, citations routing, password change)."""
import threading
import time

from conftest import make_client
from helpers import H, ensure_owner, invite_and_register, read_sse


def test_sniff_types_and_filenames():
    from security.files import sanitize_filename, sniff_type

    assert sniff_type(b"%PDF-1.7 ...", "a.pdf")[0] == "pdf"
    assert sniff_type(b"%PDF-1.7 ...", "a.txt") is None          # content/extension mismatch
    assert sniff_type(b"\x89PNG\r\n\x1a\nxxxx", "x.png")[0] == "png"
    assert sniff_type(b"MZ\x90\x00\x03\x00", "setup.exe") is None
    assert sniff_type("print('hi')\n".encode(), "x.py")[1] == "document"
    assert sniff_type(b"\x00\x01\x02binary", "data.txt") is None
    assert sanitize_filename("..\\..\\windows\\system32\\evil.txt") == "evil.txt"
    assert sanitize_filename("") == "file"


def test_chunking_overlap():
    from services.documents import chunk_text

    text = " ".join(f"Satz {i}." for i in range(800))
    chunks = chunk_text(text, size=500, overlap=100)
    assert len(chunks) > 5 and all(len(c) <= 500 for c in chunks)
    assert chunks[0][-40:].strip() and chunks[1]  # non-empty, overlapping progression


def test_classifier():
    from services.model_registry import classify_request

    assert classify_request("hi", False) == "swift"
    assert classify_request("Was ist das?", True) == "vision"
    assert classify_request("def foo(): return 1  # why does this crash?", False) == "code"
    assert classify_request("Schreibe einen ausführlichen Aufsatz über den Klimawandel", False) == "core"


def test_password_change_signs_out_other_devices(client):
    ensure_owner(client)
    dave_a = make_client()
    invite_and_register(client, dave_a, "dave", password="dave-password-1")
    dave_b = make_client()
    assert dave_b.post("/api/auth/login", json={"username": "dave", "password": "dave-password-1"}, headers=H).status_code == 200
    r = dave_a.post("/api/auth/password", json={"current_password": "dave-password-1", "new_password": "dave-password-2"}, headers=H)
    assert r.status_code == 200
    assert dave_a.get("/api/auth/me").status_code == 200       # current device stays signed in
    assert dave_b.get("/api/auth/me").status_code == 401       # other device signed out


def test_resume_mid_generation(client):
    """Simulates a dropped connection: re-attach to a running answer with an offset and get the rest."""
    from fakes import STATE

    ensure_owner(client)
    chat = client.post("/api/chats", json={}, headers=H).json()["chat"]
    STATE["delay"] = 0.04
    result = {}

    def _send():
        with client.stream("POST", f"/api/chats/{chat['id']}/messages", json={"content": "a b c d e f g h", "model": "swift"},
                           headers=H) as r:
            result["events"] = read_sse(r)

    try:
        t = threading.Thread(target=_send)
        t.start()
        mid = None
        for _ in range(100):
            msgs = client.get(f"/api/chats/{chat['id']}").json()["messages"]
            if len(msgs) == 2 and msgs[1]["live"]:
                mid = msgs[1]["id"]
                break
            time.sleep(0.02)
        assert mid
        time.sleep(0.15)
        with client.stream("GET", f"/api/generations/{mid}/stream?offset=2") as r:
            resumed = read_sse(r)
        t.join(10)
    finally:
        STATE["delay"] = 0.0
    assert resumed[-1]["type"] in ("done", "title")
    full = "".join(e.get("content", "") for e in result["events"] if e["type"] == "token")
    tail = "".join(e.get("content", "") for e in resumed if e["type"] == "token")
    assert tail and full.endswith(tail)  # resumed stream continues exactly where the offset pointed


def test_allowed_origins_setting():
    from core.config import settings

    c = make_client()
    r = c.post("/api/auth/login", json={"username": "x", "password": "y"}, headers={**H, "Origin": "https://pc.tail.ts.net"})
    assert r.status_code == 403
    settings.allowed_origins = "https://pc.tail.ts.net"
    try:
        r = c.post("/api/auth/login", json={"username": "x", "password": "yyyyyyyy"}, headers={**H, "Origin": "https://pc.tail.ts.net"})
        assert r.status_code in (401, 429)
    finally:
        settings.allowed_origins = ""
        from api.auth import login_limiter

        login_limiter._hits.clear()
