import json

from fastapi.responses import StreamingResponse

SSE_HEADERS = {"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no", "Connection": "keep-alive"}


def sse_event(data: dict, event_id: int | None = None) -> str:
    out = ""
    if event_id is not None:
        out += f"id: {event_id}\n"
    return out + f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


def sse_response(gen) -> StreamingResponse:
    return StreamingResponse(gen, media_type="text/event-stream", headers=SSE_HEADERS)
