import hashlib
import secrets

from core.config import settings


def new_token(nbytes: int = 32) -> str:
    return secrets.token_urlsafe(nbytes)


def hash_token(token: str) -> str:
    return hashlib.sha256((settings.secret_pepper + token).encode()).hexdigest()
