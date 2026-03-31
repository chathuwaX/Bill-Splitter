from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from database import get_db
from auth import get_current_user
import models
import schemas
from typing import List

router = APIRouter(prefix="/api/v1/friends", tags=["friends"])


def calc_net_balance(db: Session, user_id: int, friend_id: int) -> float:
    """Positive = friend owes user. Negative = user owes friend."""
    friend_owes = 0.0
    user_owes = 0.0

    for bill in db.query(models.Bill).filter(models.Bill.creator_id == user_id).all():
        for p in bill.participants:
            if p.user_id == friend_id and not p.is_creator:
                friend_owes += p.amount_owed

    for bill in db.query(models.Bill).filter(models.Bill.creator_id == friend_id).all():
        for p in bill.participants:
            if p.user_id == user_id and not p.is_creator:
                user_owes += p.amount_owed

    for p in db.query(models.Payment).filter(
        models.Payment.payer_id == user_id,
        models.Payment.payee_id == friend_id,
        models.Payment.status == models.PaymentStatus.accepted
    ).all():
        user_owes -= p.amount

    for p in db.query(models.Payment).filter(
        models.Payment.payer_id == friend_id,
        models.Payment.payee_id == user_id,
        models.Payment.status == models.PaymentStatus.accepted
    ).all():
        friend_owes -= p.amount

    return round(friend_owes - user_owes, 2)


@router.post("/request")
def send_friend_request(
    req: schemas.FriendRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    target = db.query(models.User).filter(
        or_(models.User.username == req.username, models.User.email == req.username)
    ).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot add yourself")

    existing = db.query(models.Friendship).filter(
        or_(
            and_(models.Friendship.requester_id == current_user.id, models.Friendship.addressee_id == target.id),
            and_(models.Friendship.requester_id == target.id, models.Friendship.addressee_id == current_user.id),
        )
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Friend request already exists")

    db.add(models.Friendship(requester_id=current_user.id, addressee_id=target.id))
    db.add(models.Notification(
        user_id=target.id,
        message=f"{current_user.username} sent you a friend request",
        type="friend", reference_id=current_user.id
    ))
    db.commit()
    return {"message": "Friend request sent"}


@router.post("/accept/{friendship_id}")
def accept_friend_request(
    friendship_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    friendship = db.query(models.Friendship).filter(
        models.Friendship.id == friendship_id,
        models.Friendship.addressee_id == current_user.id
    ).first()
    if not friendship:
        raise HTTPException(status_code=404, detail="Friend request not found")

    friendship.status = models.FriendshipStatus.accepted
    db.add(models.Notification(
        user_id=friendship.requester_id,
        message=f"{current_user.username} accepted your friend request",
        type="friend", reference_id=current_user.id
    ))
    db.commit()
    return {"message": "Friend request accepted"}


@router.get("/requests")
def get_friend_requests(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    requests = db.query(models.Friendship).filter(
        models.Friendship.addressee_id == current_user.id,
        models.Friendship.status == models.FriendshipStatus.pending
    ).all()
    return [
        {
            "id": r.id,
            "requester": {
                "id": r.requester.id,
                "username": r.requester.username,
                "full_name": r.requester.full_name,
                "avatar_color": r.requester.avatar_color,
            },
            "created_at": r.created_at
        }
        for r in requests
    ]


@router.get("/", response_model=List[schemas.FriendBalance])
def get_friends(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    friendships = db.query(models.Friendship).filter(
        or_(
            models.Friendship.requester_id == current_user.id,
            models.Friendship.addressee_id == current_user.id
        ),
        models.Friendship.status == models.FriendshipStatus.accepted
    ).all()

    result = []
    for f in friendships:
        friend = f.addressee if f.requester_id == current_user.id else f.requester
        net = calc_net_balance(db, current_user.id, friend.id)
        result.append(schemas.FriendBalance(friend=friend, net_balance=net))
    return result


@router.get("/search")
def search_users(
    q: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    users = db.query(models.User).filter(
        or_(models.User.username.ilike(f"%{q}%"), models.User.email.ilike(f"%{q}%")),
        models.User.id != current_user.id
    ).limit(10).all()
    return [{"id": u.id, "username": u.username, "full_name": u.full_name, "avatar_color": u.avatar_color} for u in users]
