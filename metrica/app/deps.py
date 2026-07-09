"""Dependencias de autenticación y control de acceso por rol (RBAC)."""
from __future__ import annotations

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from .db import get_session
from .models import Role, User
from .security import decode_access_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

# Jerarquía de roles: admin > editor > viewer
_ROLE_LEVEL = {Role.viewer.value: 0, Role.editor.value: 1, Role.admin.value: 2}


def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    session: Session = Depends(get_session),
) -> User:
    cred_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No autenticado",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise cred_exc
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise cred_exc
    user = session.query(User).filter(User.username == payload["sub"]).first()
    if not user or not user.is_active:
        raise cred_exc
    return user


def require_role(minimum: str):
    """Factory: exige que el usuario tenga al menos el rol indicado."""
    needed = _ROLE_LEVEL[minimum]

    def checker(user: User = Depends(get_current_user)) -> User:
        if _ROLE_LEVEL.get(user.role, 0) < needed:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Permisos insuficientes")
        return user

    return checker


# Atajos
require_viewer = require_role(Role.viewer.value)
require_editor = require_role(Role.editor.value)
require_admin = require_role(Role.admin.value)
