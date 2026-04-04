from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from database import get_db
from auth import get_current_user
import models
import schemas
from typing import List
from routers.notifications import mark_notif_read_by_ref

router = APIRouter(prefix="/api/v1/friends", tags=["friends"])


# ── FriendBalance helpers ─────────────────────────────────────────────────────

def get_or_create_balance(
    db: Session, user_id: int, friend_id: int
) -> models.FriendBalance:
    """
    Return the FriendBalance row for (user_id, friend_id).

    If no row exists yet (e.g. data pre-dates this schema), bootstrap the
    values from BillParticipant and Debt records so the first read is accurate,
    then persist the row so all future reads are O(1) direct selects.
    """
    rec = (
        db.query(models.FriendBalance)
        .filter(
            models.FriendBalance.user_id   == user_id,
            models.FriendBalance.friend_id == friend_id,
        )
        .first()
    )
    if rec is None:
        # ── Bootstrap from existing relational data ───────────────────────────
        bal = _compute_from_relations(db, user_id, friend_id)
        rec = models.FriendBalance(
            user_id=user_id,
            friend_id=friend_id,
            to_receive=bal["to_receive"],
            to_give=bal["to_give"],
        )
        db.add(rec)
        db.flush()   # assign id without committing yet
    return rec


def _compute_from_relations(db: Session, user_id: int, friend_id: int) -> dict:
    """
    One-time bootstrap: compute balances from BillParticipant + Debt rows.
    Only called when no FriendBalance row exists for this pair.
    After bootstrap the explicit row is the source of truth.
    """
    # to_receive: accepted bills I created where friend is participant (unmerged)
    to_receive = 0.0
    for bill in db.query(models.Bill).filter(models.Bill.creator_id == user_id).all():
        for p in bill.participants:
            if (
                p.user_id == friend_id
                and not p.is_creator
                and not p.is_merged
            ):
                to_receive += float(p.amount_owed)

    # to_give: unmerged bills friend created where I am participant
    to_give = 0.0
    for bill in db.query(models.Bill).filter(models.Bill.creator_id == friend_id).all():
        for p in bill.participants:
            if (p.user_id == user_id and not p.is_creator and not p.is_merged):
                to_give += float(p.amount_owed)

    # Include any existing active Debt records (from old-style merges)
    for debt in db.query(models.Debt).filter(
        models.Debt.from_user_id == friend_id,
        models.Debt.to_user_id   == user_id,
        models.Debt.status       == models.DebtStatus.active,
        models.Debt.is_merged    == False,
    ).all():
        to_receive += float(debt.net_amount)

    for debt in db.query(models.Debt).filter(
        models.Debt.from_user_id == user_id,
        models.Debt.to_user_id   == friend_id,
        models.Debt.status       == models.DebtStatus.active,
        models.Debt.is_merged    == False,
    ).all():
        to_give += float(debt.net_amount)

    return {
        "to_receive": max(0.0, round(to_receive, 2)),
        "to_give":    max(0.0, round(to_give,    2)),
    }


# ── Friend request endpoints ──────────────────────────────────────────────────

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
    
    # Auto-mark the incoming friend request notification as read
    # Reference ID for friend requests is the requester's ID
    mark_notif_read_by_ref(db, current_user.id, "friend", friendship.requester_id)
    
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
    """
    Return all accepted friends with their persistent FriendBalance values.

    Uses the friend_balances table as the source of truth.
    On first access for any pair, bootstraps from BillParticipant / Debt rows
    so that data created before this schema is not lost.
    """
    friendships = db.query(models.Friendship).filter(
        or_(
            models.Friendship.requester_id == current_user.id,
            models.Friendship.addressee_id == current_user.id
        ),
        models.Friendship.status == models.FriendshipStatus.accepted
    ).all()

    result = []
    needs_commit = False

    for f in friendships:
        friend = f.addressee if f.requester_id == current_user.id else f.requester

        # get_or_create_balance will INSERT a new row if needed (bootstrap)
        rec = get_or_create_balance(db, current_user.id, friend.id)
        if not rec.id:
            needs_commit = True   # new row was flushed but not committed yet

        to_receive = max(0.0, round(float(rec.to_receive), 2))
        to_give    = max(0.0, round(float(rec.to_give),    2))

        result.append(schemas.FriendBalance(
            friend=friend,
            to_receive=to_receive,
            to_give=to_give,
            net_balance=round(to_receive - to_give, 2),
        ))

    if needs_commit:
        db.commit()   # persist all bootstrapped rows in one shot

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
