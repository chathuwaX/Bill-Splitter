from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from auth import get_current_user
import models
import schemas
from typing import List

router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"])
 
 
def mark_notif_read_by_ref(db: Session, user_id: int, type: str, ref_id: int):
    """Internal helper to mark a notification as read based on its reference."""
    db.query(models.Notification).filter(
        models.Notification.user_id == user_id,
        models.Notification.type == type,
        models.Notification.reference_id == ref_id,
        models.Notification.is_read == False
    ).update({"is_read": True})
    # No commit here; assume the caller will commit


@router.get("/", response_model=List[schemas.NotificationOut])
def get_notifications(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    return db.query(models.Notification).filter(
        models.Notification.user_id == current_user.id
    ).order_by(models.Notification.created_at.desc()).limit(50).all()


@router.post("/read-all")
def mark_all_read(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    db.query(models.Notification).filter(
        models.Notification.user_id == current_user.id,
        models.Notification.is_read == False
    ).update({"is_read": True})
    db.commit()
    return {"message": "All notifications marked as read"}


@router.post("/{notif_id}/read")
def mark_read(
    notif_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    notif = db.query(models.Notification).filter(
        models.Notification.id == notif_id,
        models.Notification.user_id == current_user.id
    ).first()
    if notif:
        notif.is_read = True
        db.commit()
    return {"message": "Marked as read"}

@router.post("/read-by-type")
def mark_read_by_type(
    type: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    db.query(models.Notification).filter(
        models.Notification.user_id == current_user.id,
        models.Notification.type == type,
        models.Notification.is_read == False
    ).update({"is_read": True})
    db.commit()
    return {"message": f"All {type} notifications marked as read"}
