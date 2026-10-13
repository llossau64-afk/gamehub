from __future__ import annotations

from pydantic import BaseModel, Field, field_validator

USERNAME_RE = r"^[A-Za-z0-9_.\-]{3,32}$"


class LoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)


class RegisterIn(BaseModel):
    username: str = Field(pattern=USERNAME_RE)
    password: str = Field(min_length=8, max_length=256)
    display_name: str = Field(default="", max_length=80)
    invite_code: str = Field(default="", max_length=64)


class ProfileIn(BaseModel):
    display_name: str | None = Field(default=None, max_length=80)
    memory_enabled: bool | None = None
    prefs: dict | None = None

    @field_validator("prefs")
    @classmethod
    def _small_prefs(cls, v):
        if v is not None and len(str(v)) > 4000:
            raise ValueError("prefs too large")
        return v


class PasswordIn(BaseModel):
    current_password: str = Field(max_length=256)
    new_password: str = Field(min_length=8, max_length=256)


class DeleteDataIn(BaseModel):
    password: str = Field(max_length=256)
    delete_account: bool = False
