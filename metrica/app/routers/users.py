"""Panel de administración de usuarios (solo admin)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..db import get_session
from ..deps import require_admin
from ..models import Role, User
from ..schemas import UserCreate, UserOut, UserUpdate
from ..security import hash_password

router = APIRouter(prefix="/api/users", tags=["users"])

_VALID_ROLES = {r.value for r in Role}


@router.get("", response_model=list[UserOut])
def list_users(session: Session = Depends(get_session), _: User = Depends(require_admin)):
    return session.query(User).order_by(User.id).all()


@router.post("", response_model=UserOut, status_code=201)
def create_user(payload: UserCreate, session: Session = Depends(get_session),
                _: User = Depends(require_admin)):
    if payload.role not in _VALID_ROLES:
        raise HTTPException(400, f"Rol inválido. Opciones: {sorted(_VALID_ROLES)}")
    if session.query(User).filter(User.username == payload.username).first():
        raise HTTPException(409, "El usuario ya existe")
    user = User(
        username=payload.username, email=payload.email, role=payload.role,
        hashed_password=hash_password(payload.password),
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


@router.put("/{user_id}", response_model=UserOut)
def update_user(user_id: int, payload: UserUpdate, session: Session = Depends(get_session),
                admin: User = Depends(require_admin)):
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(404, "Usuario no encontrado")
    if payload.role is not None:
        if payload.role not in _VALID_ROLES:
            raise HTTPException(400, "Rol inválido")
        user.role = payload.role
    if payload.email is not None:
        user.email = payload.email
    if payload.is_active is not None:
        # evita que un admin se autodesactive y quede el sistema sin admins
        if user.id == admin.id and not payload.is_active:
            raise HTTPException(400, "No podés desactivarte a vos mismo")
        user.is_active = payload.is_active
    if payload.password:
        user.hashed_password = hash_password(payload.password)
    session.commit()
    session.refresh(user)
    return user


@router.delete("/{user_id}", status_code=204)
def delete_user(user_id: int, session: Session = Depends(get_session),
                admin: User = Depends(require_admin)):
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(404, "Usuario no encontrado")
    if user.id == admin.id:
        raise HTTPException(400, "No podés eliminarte a vos mismo")
    session.delete(user)
    session.commit()
