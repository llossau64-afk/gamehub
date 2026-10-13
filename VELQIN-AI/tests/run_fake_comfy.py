"""Run the ComfyUI protocol double on :18188 for UI screenshots/development. NO AI — placeholder outputs only."""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from fake_comfy import STATE, make_app  # noqa: E402
from fakes import ServerThread  # noqa: E402

STATE["step_delay"] = 0.6
t = ServerThread(make_app(), 18188)
t.start()
t.wait_ready()
print("Fake ComfyUI on :18188 (test double, no AI)", flush=True)
while True:
    time.sleep(3600)
