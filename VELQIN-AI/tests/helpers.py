import json

H = {"X-Velqin-Request": "1"}


def read_sse(resp) -> list[dict]:
    events = []
    for line in resp.iter_lines():
        if line.startswith("data: "):
            events.append(json.loads(line[6:]))
    return events


def ensure_owner(client, username="owner", password="owner-password-1"):
    if client.get("/api/auth/me").status_code == 200:
        return client
    st = client.get("/api/auth/status").json()
    if st["needs_setup"]:
        r = client.post("/api/auth/setup", json={"username": username, "password": password}, headers=H)
        assert r.status_code == 200, r.text
    else:
        r = client.post("/api/auth/login", json={"username": username, "password": password}, headers=H)
        assert r.status_code == 200, r.text
    return client


def invite_and_register(owner_client, new_client, username, plan="free", password="friend-password-1"):
    code = owner_client.post("/api/admin/invites", json={"plan": plan}, headers=H).json()["code"]
    r = new_client.post("/api/auth/register", json={"username": username, "password": password, "invite_code": code},
                        headers=H)
    assert r.status_code == 200, r.text
    return code


def last_chat_request() -> dict:
    """Most recent streaming chat request received by the Ollama test double (skips title requests)."""
    from fakes import STATE

    return next(r for r in reversed(STATE["requests"]) if r.get("stream", True))
