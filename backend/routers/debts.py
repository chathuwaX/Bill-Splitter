"""
Debt Merging (Netting) Router
─────────────────────────────
POST /api/v1/debts/merge/{friend_id}
  - Fetches all active, unmerged bill-participant entries between the two users
  - Separates by direction, calculates net amount
  - Marks originals as is_merged=True with a shared merge_group_id
  - Creates a single Debt record representing the net result
  - Returns full merge details for the frontend

GET /api/v1/debts/
  - Returns all active merged debts involving the current user

GET /api/v1/debts/{debt_id}
  - Returns a single debt with its source items

GET /api/v1/debts/{debt_id}/sources
  - Returns the original BillParticipant entries that were merged

POST /api/v1/debts/{debt_id}/settle
  - Marks a debt as settled (called after payment is accepted)
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

router = APIRouter(prefix="/api/v1/debts", tags=["debts"])


def _get_unmerged_participants(db: Session, user_id: int, friend_id: int):
    """
    Return all BillParticipant rows that represent an active, unmerged debt
    between user_id and friend_id.

    A 'debt' from A to B exists when:
      - Bill was created by A, and B is a non-creator participant (B owes A)
      - Bill was created by B, and A is a non-creator participant (A owes B)
    """
    # Bills created by user where friend is a non-creator participant
    user_created = (
        db.query(models.BillParticipant)
        .join(models.Bill, models.Bill.id == models.BillParticipant.bill_id)
        .filter(
            models.Bill.creator_id == user_id,
            models.BillParticipant.user_id == friend_id,
            models.BillParticipant.is_creator == False,
            models.BillParticipant.is_merged == False,
        )
        .all()
    )

    # Bills created by friend where user is a non-creator participant
    friend_created = (
        db.query(models.BillParticipant)
        .join(models.Bill, models.Bill.id == models.BillParticipant.bill_id)
        .filter(
            models.Bill.creator_id == friend_id,
            models.BillParticipant.user_id == user_id,
            models.BillParticipant.is_creator == False,
            models.BillParticipant.is_merged == False,
        )
        .all()
    )

    return user_created, friend_created


@router.post("/merge/{friend_id}", response_model=schemas.MergeResult)
def merge_debts(
    friend_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Merge all active, unmerged debts between current_user and friend into
    a single net Debt record.

    Direction semantics:
      friend_owes_user  = bills created by current_user, friend is participant
      user_owes_friend  = bills created by friend, current_user is participant

    Net = friend_owes_user_total - user_owes_friend_total
      Positive → friend owes current_user  (from=friend, to=current_user)
      Negative → current_user owes friend  (from=current_user, to=friend)
      Zero     → fully settled, no debt record needed
    """
    friend = db.query(models.User).filter(models.User.id == friend_id).first()
    if not friend:
        raise HTTPException(status_code=404, detail="Friend not found")
    if friend_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot merge debts with yourself")

    # Verify friendship
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

    # Fetch unmerged participants in both directions
    friend_owes_entries, user_owes_entries = _get_unmerged_participants(
        db, current_user.id, friend_id
    )

    if not friend_owes_entries and not user_owes_entries:
        raise HTTPException(
            status_code=400,
            detail="No active unmerged debts found between you and this friend",
        )

    friend_owes_total = round(sum(p.amount_owed for p in friend_owes_entries), 2)
    user_owes_total = round(sum(p.amount_owed for p in user_owes_entries), 2)
    net = round(friend_owes_total - user_owes_total, 2)

    # Determine direction of the net debt
    if net > 0:
        from_user_id = friend_id       # friend owes current_user
        to_user_id = current_user.id
    elif net < 0:
        from_user_id = current_user.id  # current_user owes friend
        to_user_id = friend_id
    else:
        # Net is zero — mark all as merged but create no debt record
        group_id = str(uuid.uuid4())
        for p in friend_owes_entries + user_owes_entries:
            p.is_merged = True
            p.merge_group_id = group_id
        db.commit()
        raise HTTPException(
            status_code=200,
            detail="Debts cancel out perfectly — all marked as merged, net is zero",
        )

    # Generate a shared merge_group_id (UUID) linking originals to this Debt
    group_id = str(uuid.uuid4())

    # Build a human-readable description
    all_entries = friend_owes_entries + user_owes_entries
    bill_titles = list({
        db.query(models.Bill).filter(models.Bill.id == p.bill_id).first().title
        for p in all_entries
    })
    description = f"Merged {len(all_entries)} debt(s): {', '.join(bill_titles[:5])}"
    if len(bill_titles) > 5:
        description += f" and {len(bill_titles) - 5} more"

    # Create the net Debt record
    debt = models.Debt(
        from_user_id=from_user_id,
        to_user_id=to_user_id,
        net_amount=abs(net),
        description=description,
        status=models.DebtStatus.active,
        is_merged=False,          # This IS the merged result
        merge_group_id=group_id,
    )
    db.add(debt)
    db.flush()  # Get debt.id before committing

    # Mark all original BillParticipant rows as merged
    for p in all_entries:
        p.is_merged = True
        p.merge_group_id = group_id

    # Notify both users
    db.add(models.Notification(
        user_id=friend_id,
        message=(
            f"{current_user.username} merged your debts — "
            f"net: LKR {abs(net):.2f} "
            f"({'you owe' if from_user_id == friend_id else 'they owe you'})"
        ),
        type="bill",
        reference_id=debt.id,
    ))

    db.commit()
    db.refresh(debt)

    # Build source items for the response
    sources = _build_sources(db, friend_owes_entries, user_owes_entries, current_user.id)

    return schemas.MergeResult(
        debt=debt,
        sources=sources,
        from_user=debt.from_user,
        to_user=debt.to_user,
        net_amount=abs(net),
        message=(
            f"Merged {len(all_entries)} debts. "
            f"Net: LKR {abs(net):.2f} — "
            f"{'friend owes you' if from_user_id == friend_id else 'you owe friend'}."
        ),
    )


def _build_sources(
    db: Session,
    friend_owes_entries: list,
    user_owes_entries: list,
    current_user_id: int,
) -> list:
    sources = []
    for p in friend_owes_entries:
        bill = db.query(models.Bill).filter(models.Bill.id == p.bill_id).first()
        sources.append(schemas.MergeSourceItem(
            bill_id=bill.id,
            bill_title=bill.title,
            bill_description=bill.description,
            amount=p.amount_owed,
            direction="they_owe",   # friend owes current_user
            created_at=bill.created_at,
        ))
    for p in user_owes_entries:
        bill = db.query(models.Bill).filter(models.Bill.id == p.bill_id).first()
        sources.append(schemas.MergeSourceItem(
            bill_id=bill.id,
            bill_title=bill.title,
            bill_description=bill.description,
            amount=p.amount_owed,
            direction="you_owe",    # current_user owes friend
            created_at=bill.created_at,
        ))
    return sources


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
            models.Debt.is_merged == False,  # Only the result records, not originals
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
        # Direction from current_user's perspective
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
