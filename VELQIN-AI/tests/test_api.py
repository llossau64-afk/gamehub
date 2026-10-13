"""API tests for VELQIN. Run:  cd VELQIN-AI && python -m pytest -q tests"""
import io
import time

from conftest import make_client
from helpers import H, ensure_owner, invite_and_register, last_chat_request, read_sse


def test_health_and_frontend_missing(client):
    assert client.get("/api/health").json() == {"status": "ok"}
    r = client.get("/")
    assert r.status_code == 503


def test_setup_creates_owner_once(client):
    assert client.get("/api/auth/status").json()["needs_setup"] is True
    ensure_owner(client)
    me = client.get("/api/auth/me").json()["user"]
    assert me["role"] == "owner" and "admin" in me["features"]
    other = make_client()
    r = other.post("/api/auth/setup", json={"username": "evil", "password": "evil-password"}, headers=H)
    assert r.status_code == 409


def test_csrf_header_required(client):
    ensure_owner(client)
    r = client.post("/api/chats", json={"title": "x"})
    assert r.status_code == 403
    r = client.post("/api/chats", json={"title": "x"}, headers={**H, "Origin": "https://evil.example"})
    assert r.status_code == 403


def test_unauthenticated_is_rejected():
    c = make_client()
    assert c.get("/api/chats").status_code == 401
    assert c.get("/api/admin/overview").status_code == 401


def test_login_rate_limit():
    c = make_client()
    codes = [c.post("/api/auth/login", json={"username": "nobody", "password": "wrongwrong"}, headers=H).status_code
             for _ in range(7)]
    assert codes[:5] == [401] * 5
    assert codes[-1] == 429
    from api.auth import login_limiter

    login_limiter._hits.clear()


def test_registration_requires_invite(client):
    ensure_owner(client)
    c = make_client()
    r = c.post("/api/auth/register", json={"username": "noinvite", "password": "password-123"}, headers=H)
    assert r.status_code == 403
    code = invite_and_register(client, c, "alice", plan="creator")
    assert c.get("/api/auth/me").json()["user"]["plan"] == "creator"
    c2 = make_client()
    r = c2.post("/api/auth/register", json={"username": "alice2", "password": "password-123", "invite_code": code},
                headers=H)
    assert r.status_code == 403  # single use


def test_chat_streaming_persistence_and_title(client):
    ensure_owner(client)
    chat = client.post("/api/chats", json={}, headers=H).json()["chat"]
    with client.stream("POST", f"/api/chats/{chat['id']}/messages",
                       json={"content": "Hallo, wie geht es dir?", "model": "auto"}, headers=H) as r:
        assert r.status_code == 200
        events = read_sse(r)
    types = [e["type"] for e in events]
    assert types[0] == "start" and "meta" in types and "token" in types and "done" in types
    meta = next(e for e in events if e["type"] == "meta")
    assert meta["profile"] == "swift"  # short question -> VELQIN Swift
    text = "".join(e["content"] for e in events if e["type"] == "token")
    assert "Hallo, wie geht es dir?" in text
    done = next(e for e in events if e["type"] == "done")
    assert done["status"] == "complete" and done["message"]["meta"]["tokens_per_s"] > 0
    # title is generated after the answer
    for _ in range(50):
        c = client.get(f"/api/chats/{chat['id']}").json()
        if c["chat"]["title"] != "New chat":
            break
        time.sleep(0.05)
    assert c["chat"]["title"] == "Test Title"
    assert [m["role"] for m in c["messages"]] == ["user", "assistant"]
    assert c["messages"][1]["content"].strip() == text.strip()
    # resume endpoint after completion returns the final state
    with client.stream("GET", f"/api/generations/{done['message']['id']}/stream?offset=0") as r:
        evs = read_sse(r)
    assert "done" in [e["type"] for e in evs]


def test_auto_routes_code_requests_to_code_model(client):
    ensure_owner(client)
    chat = client.post("/api/chats", json={}, headers=H).json()["chat"]
    with client.stream("POST", f"/api/chats/{chat['id']}/messages",
                       json={"content": "Fix this python traceback: KeyError in dict", "model": "auto"}, headers=H) as r:
        events = read_sse(r)
    assert next(e for e in events if e["type"] == "meta")["profile"] == "code"


def test_missing_model_gives_clear_error(client):
    ensure_owner(client)
    chat = client.post("/api/chats", json={}, headers=H).json()["chat"]
    with client.stream("POST", f"/api/chats/{chat['id']}/messages",
                       json={"content": "Hi", "model": "core"}, headers=H) as r:
        events = read_sse(r)
    err = next(e for e in events if e["type"] == "error")
    assert "not installed" in err["message"]


def test_stop_regenerate_and_edit(client):
    from fakes import STATE

    ensure_owner(client)
    chat = client.post("/api/chats", json={}, headers=H).json()["chat"]
    STATE["delay"] = 0.05
    import threading

    result = {}

    def _send():
        with client.stream("POST", f"/api/chats/{chat['id']}/messages",
                           json={"content": "one two three four five six seven eight nine ten", "model": "swift"},
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
            time.sleep(0.03)
        assert mid, "generation did not start"
        time.sleep(0.2)
        assert client.post(f"/api/generations/{mid}/stop", headers=H).json()["stopped"] is True
        t.join(10)
        done = next(e for e in result["events"] if e["type"] == "done")
        assert done["status"] == "stopped"
        assert len(done["message"]["content"].split()) < 12  # partial answer kept
    finally:
        STATE["delay"] = 0.0
    with client.stream("POST", f"/api/chats/{chat['id']}/messages", json={"mode": "regenerate"}, headers=H) as r:
        events = read_sse(r)
    assert events[-1]["type"] in ("done", "title")
    msgs = client.get(f"/api/chats/{chat['id']}").json()["messages"]
    assert len(msgs) == 2 and msgs[1]["status"] == "complete"
    with client.stream("POST", f"/api/chats/{chat['id']}/messages",
                       json={"mode": "edit", "message_id": msgs[0]["id"], "content": "edited question"}, headers=H) as r:
        read_sse(r)
    msgs = client.get(f"/api/chats/{chat['id']}").json()["messages"]
    assert msgs[0]["content"] == "edited question" and "edited question" in msgs[1]["content"]


def test_web_search_sources_and_ssrf_protection(client):
    ensure_owner(client)
    chat = client.post("/api/chats", json={}, headers=H).json()["chat"]
    with client.stream("POST", f"/api/chats/{chat['id']}/messages",
                       json={"content": "Was ist heute in der Bundesliga passiert?", "web_search": True}, headers=H) as r:
        events = read_sse(r)
    src = next(e for e in events if e["type"] == "sources")["sources"]
    assert src[0]["title"].startswith("Bundesliga") and src[0]["published"] == "2026-10-12"
    assert src[0]["fetched"] is False  # 127.0.0.1 result must NOT be fetched (SSRF guard)
    done = next(e for e in events if e["type"] == "done")
    assert "web" in done["message"]["meta"]["knowledge"]


def test_ssrf_validator_blocks_internal_targets():
    import asyncio

    from security.ssrf import BlockedURL, validate_url

    for url in ("http://127.0.0.1/", "http://10.0.0.5/", "http://169.254.169.254/latest", "http://localhost:8080/",
                "file:///etc/passwd", "http://[::1]/", "http://192.168.1.1/admin", "http://user:pw@example.com/"):
        try:
            asyncio.run(validate_url(url))
        except BlockedURL:
            continue
        raise AssertionError(f"not blocked: {url}")


def test_file_upload_parsing_and_type_checks(client):
    ensure_owner(client)
    r = client.post("/api/files", files={"file": ("../../notes.txt", b"Projekt Racing Game: Auto ist rot.", "text/plain")},
                    headers=H)
    assert r.status_code == 200, r.text
    f = r.json()["file"]
    assert f["filename"] == "notes.txt" and f["kind"] == "document" and f["text_chars"] > 10
    r = client.post("/api/files", files={"file": ("evil.png", b"MZ\x90\x00 not a png", "image/png")}, headers=H)
    assert r.status_code == 415
    # use the file in a chat
    chat = client.post("/api/chats", json={}, headers=H).json()["chat"]
    with client.stream("POST", f"/api/chats/{chat['id']}/messages",
                       json={"content": "Welche Farbe hat das Auto?", "attachment_ids": [f["id"]]}, headers=H) as r:
        events = read_sse(r)
    done = next(e for e in events if e["type"] == "done")
    assert "file" in done["message"]["meta"]["knowledge"]
    from fakes import STATE

    assert "Auto ist rot" in last_chat_request()["messages"][0]["content"]


def test_image_upload_and_vision_requirement(client):
    from PIL import Image

    ensure_owner(client)
    buf = io.BytesIO()
    Image.new("RGB", (64, 64), "red").save(buf, "PNG")
    r = client.post("/api/files", files={"file": ("red.png", buf.getvalue(), "image/png")}, headers=H)
    assert r.status_code == 200
    img_id = r.json()["file"]["id"]
    chat = client.post("/api/chats", json={}, headers=H).json()["chat"]
    with client.stream("POST", f"/api/chats/{chat['id']}/messages",
                       json={"content": "Was siehst du?", "attachment_ids": [img_id]}, headers=H) as r:
        events = read_sse(r)
    err = next(e for e in events if e["type"] == "error")
    assert "vision" in err["message"].lower()


def test_user_isolation(client):
    ensure_owner(client)
    chat = client.post("/api/chats", json={"title": "secret"}, headers=H).json()["chat"]
    f = client.post("/api/files", files={"file": ("s.txt", b"secret data", "text/plain")}, headers=H).json()["file"]
    bob = make_client()
    invite_and_register(client, bob, "bob")
    assert bob.get(f"/api/chats/{chat['id']}").status_code == 404
    assert bob.delete(f"/api/chats/{chat['id']}", headers=H).status_code == 404
    assert bob.get(f"/api/files/{f['id']}/content").status_code == 404
    assert all(c["id"] != chat["id"] for c in bob.get("/api/chats").json()["chats"])
    assert bob.get("/api/admin/overview").status_code == 403
    r = bob.get("/api/search?q=secret").json()
    assert r["chats"] == [] and r["files"] == []


def test_plan_gating_and_moderation(client):
    ensure_owner(client)
    free = make_client()
    invite_and_register(client, free, "freeuser", plan="free")
    r = free.post("/api/studio/video", json={"prompt": "a car driving"}, headers=H)
    assert r.status_code == 403
    r = free.post("/api/projects", json={"name": "x"}, headers=H)
    assert r.status_code == 403
    r = free.post("/api/studio/image", json={"prompt": "nude teen girl"}, headers=H)
    assert r.status_code == 400


def test_image_job_fails_gracefully_without_comfyui(client):
    ensure_owner(client)
    r = client.post("/api/studio/image", json={"prompt": "a red sports car at sunset", "aspect": "16:9"}, headers=H)
    assert r.status_code == 200, r.text
    jid = r.json()["job"]["id"]
    for _ in range(100):
        j = client.get(f"/api/jobs/{jid}").json()["job"]
        if j["status"] in ("failed", "done"):
            break
        time.sleep(0.1)
    assert j["status"] == "failed" and "ComfyUI" in j["error"]
    r = client.post(f"/api/jobs/{jid}/retry", headers=H)
    assert r.status_code == 200
    presets = client.get("/api/studio/presets").json()
    assert presets["comfyui_online"] is False and all(not p["available"] for p in presets["presets"])


def test_admin_overview_has_no_private_content(client):
    ensure_owner(client)
    ov = client.get("/api/admin/overview")
    assert ov.status_code == 200
    body = ov.text
    assert "Hallo, wie geht es dir" not in body and "Auto ist rot" not in body
    jobs = client.get("/api/admin/jobs").json()["jobs"]
    assert all("prompt" not in j["params"] for j in jobs)
    users = client.get("/api/admin/users").json()["users"]
    assert any(u["username"] == "owner" for u in users)


def test_settings_and_plans_toggle(client):
    ensure_owner(client)
    r = client.patch("/api/admin/settings", json={"plans_enabled": False}, headers=H)
    assert r.status_code == 200
    free = make_client()
    invite_and_register(client, free, "tierless", plan="free")
    assert "video" in free.get("/api/auth/me").json()["user"]["features"]
    client.patch("/api/admin/settings", json={"plans_enabled": True}, headers=H)
    assert client.patch("/api/admin/settings", json={"nope": 1}, headers=H).status_code == 422
    assert client.patch("/api/admin/settings", json={"plans_enabled": "yes"}, headers=H).status_code == 422


def test_projects_and_project_context(client):
    ensure_owner(client)
    p = client.post("/api/projects", json={"name": "My Racing Game", "instructions": "Always answer as a game designer."},
                    headers=H).json()["project"]
    client.post("/api/files", data={"project_id": p["id"]},
                files={"file": ("design.md", b"# Design\nThe hero car is called Velocity X and is blue.", "text/markdown")},
                headers=H)
    chat = client.post("/api/chats", json={"project_id": p["id"]}, headers=H).json()["chat"]
    with client.stream("POST", f"/api/chats/{chat['id']}/messages", json={"content": "What is the hero car called?"},
                       headers=H) as r:
        read_sse(r)
    from fakes import STATE

    sys_prompt = last_chat_request()["messages"][0]["content"]
    assert "game designer" in sys_prompt and "Velocity X" in sys_prompt
    assert client.get(f"/api/projects/{p['id']}").json()["project"]["counts"]["files"] == 1


def test_model_library_and_pull(client):
    ensure_owner(client)
    lib = client.get("/api/models/library").json()
    assert lib["runtime_online"] and any(p["id"] == "swift" and p["installed"] for p in lib["profiles"])
    r = client.post("/api/models/pull", json={"tag": "qwen3:8b"}, headers=H)
    assert r.status_code == 200
    for _ in range(50):
        pulls = client.get("/api/models/pulls").json()["pulls"]
        if pulls and pulls[0]["state"] == "done":
            break
        time.sleep(0.05)
    assert pulls[0]["state"] == "done" and pulls[0]["percent"] == 100.0
    assert client.post("/api/models/pull", json={"tag": "bad tag; rm -rf"}, headers=H).status_code == 422


def test_memory_and_delete_data(client):
    ensure_owner(client)
    carol = make_client()
    invite_and_register(carol if False else client, carol, "carol")
    carol.post("/api/memory", json={"content": "Ich heiße Carol und mag Rennspiele."}, headers=H)
    carol.patch("/api/auth/me", json={"memory_enabled": True}, headers=H)
    chat = carol.post("/api/chats", json={}, headers=H).json()["chat"]
    with carol.stream("POST", f"/api/chats/{chat['id']}/messages", json={"content": "Wer bin ich?"}, headers=H) as r:
        read_sse(r)
    from fakes import STATE

    assert "mag Rennspiele" in last_chat_request()["messages"][0]["content"]
    r = carol.post("/api/auth/delete-data", json={"password": "friend-password-1", "delete_account": True}, headers=H)
    assert r.json()["account_deleted"] is True
    assert carol.get("/api/auth/me").status_code == 401


def test_backup(client):
    ensure_owner(client)
    r = client.post("/api/admin/backups", json={"include_files": True}, headers=H)
    assert r.status_code == 200
    name = r.json()["name"]
    assert any(b["name"] == name for b in client.get("/api/admin/backups").json()["backups"])
    assert client.get("/api/admin/backups/..%2Fvelqin.db").status_code == 404
