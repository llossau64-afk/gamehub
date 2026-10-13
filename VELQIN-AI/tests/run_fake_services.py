"""Start the Ollama/SearXNG *protocol test doubles* on fixed ports for UI development & screenshots.

!! This does NOT run any AI. Answers are deterministic echo text. Never use it in production.
Usage:  python tests/run_fake_services.py   (Ollama double on :11534, SearXNG double on :18888)
"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from fakes import STATE, ServerThread, make_ollama, make_searxng  # noqa: E402

STATE["delay"] = 0.03
o = ServerThread(make_ollama(), 11534)
s = ServerThread(make_searxng(), 18888)
o.start()
s.start()
o.wait_ready()
s.wait_ready()
print("Fake Ollama on :11534, fake SearXNG on :18888 (test doubles only)", flush=True)
while True:
    time.sleep(3600)
