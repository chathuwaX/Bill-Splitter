"""
Debt Merging (Netting) Router
─────────────────────────────
POST /api/v1/debts/merge/{friend_id}
  PRIMARY: Reads to_receive / to_give from friend_balances table (source of truth).
  Calculates remainder = ABS(to_receive - to_give).
  SQL UPDATE: sets the larger column to remainder, smaller column to 0.
  Both the caller's row AND the friend's mirrored row are updated atomically.

GET /api/v1/debts/
  Returns all active merged debts involving the current user.

GET /api/v1/debts/{debt_id}
  Returns a single debt with its source items.

GET /api/v1/debts/{debt_id}/sources
  Returns the original BillParticipant entries that were merged.

POST /api/v1/debts/{debt_id}/settle
  Marks a debt as settled (called after payment is accepted).
"""

import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from database import get_db
from auth import get_current_user
import models
import schemas
from typing import List
from routers.friends import get_or_create_balance

router = APIRouter(prefix="/api/v1/debts", tags=["debts"])


@router.post("/merge/{friend_id}")
def merge_debts(
    friend_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Merge the balances between current_user and friend.

    Reads directly from the friend_balances table (source of truth) so the
    calculation always uses the same values that the Dashboard displays.

    SQL UPDATE logic:
      remainder = ABS(to_receive - to_give)

      If to_receive > to_give:
        my_row.to_receive  = remainder   (I am still owed the difference)
        my_row.to_give     = 0
        friend_row.to_give = remainder   (friend still owes the difference)
        friend_row.to_receive = 0

      If to_give > to_receive:
        my_row.to_give        = remainder (I still owe the difference)
        my_row.to_receive     = 0
        friend_row.to_receive = remainder (friend is still owed the difference)
        friend_row.to_give    = 0

      If equal: all four columns → 0 (fully settled)

    Values are always stored as positive floats — never negative.
    """
    # ── Validate friend ───────────────────────────────────────────────────────
    friend = db.query(models.User).filter(models.User.id == friend_id).first()
    if not friend:
        raise HTTPException(status_code=404, detail="Friend not found")
    if friend_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot merge debts with yourself")

    friendship = db.query(models.Friendship).filter(
        or_(
            and_(
                models.Friendship.requester_id == current_user.id,
                models.Friendship.addressee_id == friend_id,
            ),
            and_(
                models.Friendship.requester_id == friend_id,
                models.Friendship.addressee_id == current_user.id,
            ),
        ),
        models.Friendship.status == models.FriendshipStatus.accepted,
    ).first()
    if not friendship:
        raise HTTPException(status_code=400, detail="Not friends with this user")

    # ── Read current balances from friend_balances table ─────────────────────
    # get_or_create_balance bootstraps from BillParticipants on first access.
    my_rec     = get_or_create_balance(db, current_user.id, friend_id)
    friend_rec = get_or_create_balance(db, friend_id, current_user.id)

    recv = round(float(my_rec.to_receive), 2)
    give = round(float(my_rec.to_give),    2)

    if recv == 0.0 and give == 0.0:
        raise HTTPException(
            status_code=400,
            detail="No active balances to merge between you and this friend",
        )

    # ── Calculate remainder ───────────────────────────────────────────────────
    remainder = round(abs(recv - give), 2)

    # ── SQL UPDATE: both rows in one atomic transaction ───────────────────────
    if recv > give:
        # to_receive wins — I am still owed the difference
        my_rec.to_receive     = remainder
        my_rec.to_give        = 0.0
        friend_rec.to_give    = remainder   # mirror: friend still owes me
        friend_rec.to_receive = 0.0
        direction = "friend_owes_you"
    elif give > recv:
        # to_give wins — I still owe the difference
        my_rec.to_give        = remainder
        my_rec.to_receive     = 0.0
        friend_rec.to_receive = remainder   # mirror: friend is still owed
        friend_rec.to_give    = 0.0
        direction = "you_owe_friend"
    else:
        # Equal — fully settled
        my_rec.to_receive     = 0.0
        my_rec.to_give        = 0.0
        friend_rec.to_receive = 0.0
        friend_rec.to_give    = 0.0
        direction = "settled"

    # ── Create Debt record for History ────────────────────────────────────────
    desc_dir = "You Owe" if direction == "you_owe_friend" else "They Owe"
    if direction == "settled":
        description = f"Merged debts with {friend.username} — Settled"
        from_user = current_user.id
        to_user = friend_id
    else:
        description = f"Merged debts with {friend.username} — Remaining: LKR {remainder:.2f} ({desc_dir})"
        from_user = current_user.id if direction == "you_owe_friend" else friend_id
        to_user = friend_id if direction == "you_owe_friend" else current_user.id
        
    debt = models.Debt(
        from_user_id=from_user,
        to_user_id=to_user,
        net_amount=remainder,
        description=description,
        status=models.DebtStatus.active if remainder > 0 else models.DebtStatus.settled,
        is_merged=False
    )
    db.add(debt)

    # Notify the friend
    db.add(models.Notification(
        user_id=friend_id,
        message=(
            f"{current_user.username} merged your balances — "
            f"remainder: LKR {remainder:.2f} "
            f"({'you owe' if direction == 'friend_owes_you' else 'they owe you' if direction == 'you_owe_friend' else 'settled'})"
        ),
        type="bill",
        reference_id=None,
    ))

    db.commit()

    return {
        "remainder": remainder,
        "direction": direction,
        "to_receive": float(my_rec.to_receive),
        "to_give":    float(my_rec.to_give),
        "message": (
            f"Merged. Remainder LKR {remainder:.2f} — "
            f"{'friend owes you' if direction == 'friend_owes_you' else 'you owe friend' if direction == 'you_owe_friend' else 'fully settled'}."
        ),
    }


@router.get("/", response_model=List[schemas.DebtOut])
def get_my_debts(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Return all active merged debt records involving the current user."""
    return (
        db.query(models.Debt)
        .filter(
            or_(
                models.Debt.from_user_id == current_user.id,
                models.Debt.to_user_id == current_user.id,
            ),
            models.Debt.is_merged == False,
        )
        .order_by(models.Debt.created_at.desc())
        .all()
    )


@router.get("/{debt_id}", response_model=schemas.DebtOut)
def get_debt(
    debt_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    debt = db.query(models.Debt).filter(models.Debt.id == debt_id).first()
    if not debt:
        raise HTTPException(status_code=404, detail="Debt not found")
    if current_user.id not in (debt.from_user_id, debt.to_user_id):
        raise HTTPException(status_code=403, detail="Not authorized")
    return debt


@router.get("/{debt_id}/sources")
def get_debt_sources(
    debt_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Return the original BillParticipant entries that were merged into this debt."""
    debt = db.query(models.Debt).filter(models.Debt.id == debt_id).first()
    if not debt:
        raise HTTPException(status_code=404, detail="Debt not found")
    if current_user.id not in (debt.from_user_id, debt.to_user_id):
        raise HTTPException(status_code=403, detail="Not authorized")

    participants = (
        db.query(models.BillParticipant)
        .filter(models.BillParticipant.merge_group_id == debt.merge_group_id)
        .all()
    )

    result = []
    for p in participants:
        bill = db.query(models.Bill).filter(models.Bill.id == p.bill_id).first()
        direction = "they_owe" if bill.creator_id == current_user.id else "you_owe"
        result.append({
            "bill_id": bill.id,
            "bill_title": bill.title,
            "bill_description": bill.description,
            "amount": p.amount_owed,
            "direction": direction,
            "created_at": bill.created_at,
        })
    return result


@router.post("/{debt_id}/settle")
def settle_debt(
    debt_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Mark a merged debt as settled. Called after the linked payment is accepted."""
    debt = db.query(models.Debt).filter(models.Debt.id == debt_id).first()
    if not debt:
        raise HTTPException(status_code=404, detail="Debt not found")
    if current_user.id not in (debt.from_user_id, debt.to_user_id):
        raise HTTPException(status_code=403, detail="Not authorized")
    if debt.status == models.DebtStatus.settled:
        raise HTTPException(status_code=400, detail="Already settled")

    debt.status = models.DebtStatus.settled
    debt.settled_at = datetime.utcnow()
    db.commit()
    return {"message": "Debt marked as settled"}
