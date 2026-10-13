# Ollama (Chatmodelle)

VELQIN-Profile → Ollama-Tags (änderbar in der Model Library):

| Profil | Standard-Tag | Größe (Q4) | Lizenz | Zweck |
|---|---|---|---|---|
| VELQIN Swift | `qwen3:4b` | ~2,6 GB | Apache-2.0 | schnell, Alltag |
| VELQIN Core | `qwen3:8b` | ~5,2 GB | Apache-2.0 | ausführlich, Schreiben |
| VELQIN Vision | `qwen3-vl:4b` | ~3,3 GB | Apache-2.0 | Bilder & Screenshots |
| VELQIN Code | `qwen2.5-coder:7b` | ~4,7 GB | Apache-2.0 | Programmierung |
| Embeddings | `nomic-embed-text` | ~0,3 GB | Apache-2.0 | Projekt-/Dateisuche |

Hinweise: `qwen2.5-coder:3b` steht unter der Qwen-Research-Lizenz (nicht kommerziell). Größere Modelle (z. B. `qwen3:14b`)
laufen nur teilweise auf der GPU und sind deutlich langsamer. Vor dem Download die Tags auf ollama.com/library prüfen.

Empfohlene Umgebungsvariablen (setzt `install-windows.ps1`):
```
OLLAMA_HOST=127.0.0.1:11434      # nie öffentlich
OLLAMA_FLASH_ATTENTION=1         # weniger VRAM
OLLAMA_KV_CACHE_TYPE=q8_0        # halber KV-Cache-Speicher
OLLAMA_MAX_LOADED_MODELS=1       # 8 GB VRAM: ein großes Modell zur Zeit
OLLAMA_NUM_PARALLEL=2            # zwei gleichzeitige Antworten pro Modell
```
