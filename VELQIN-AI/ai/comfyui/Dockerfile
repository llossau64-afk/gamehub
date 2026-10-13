# ComfyUI for VELQIN (CUDA 12.8). Untested in this repository's CI — see docs/IMAGE_VIDEO_SETUP.md.
FROM pytorch/pytorch:2.8.0-cuda12.8-cudnn9-runtime
RUN apt-get update && apt-get install -y --no-install-recommends git ffmpeg && rm -rf /var/lib/apt/lists/*
RUN git clone https://github.com/comfyanonymous/ComfyUI.git /opt/ComfyUI \
 && pip install --no-cache-dir -r /opt/ComfyUI/requirements.txt \
 && git clone https://github.com/city96/ComfyUI-GGUF.git /opt/ComfyUI/custom_nodes/ComfyUI-GGUF \
 && pip install --no-cache-dir -r /opt/ComfyUI/custom_nodes/ComfyUI-GGUF/requirements.txt
WORKDIR /opt/ComfyUI
EXPOSE 8188
CMD ["python", "main.py", "--listen", "0.0.0.0", "--port", "8188", "--preview-method", "auto"]
