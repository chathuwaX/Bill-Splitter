from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from auth import get_current_user
import models
import schemas
from typing import List
from routers.friends import get_or_create_balance
from routers.notifications import mark_notif_read_by_ref

router = APIRouter(prefix="/api/v1/bills", tags=["bills"])


@router.post("/", response_model=schemas.BillOut, status_code=201)
def create_bill(
    bill_data: schemas.BillCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Create a bill and immediately update FriendBalance for every debtor.

    Debtor's to_give increases as soon as the bill is created.
    Creator's to_receive is updated separately when the debtor ACCEPTS
    (see accept_bill below) — matching the acceptance-gated display rule.
    """
    all_ids = list(set(bill_data.participant_ids + [current_user.id]))
    total = bill_data.total_amount

    if bill_data.custom_splits:
        split_map = {s.user_id: s.amount_owed for s in bill_data.custom_splits}
        if abs(sum(split_map.values()) - total) > 0.01:
            raise HTTPException(status_code=400, detail="Custom splits must sum to total amount")
    else:
        equal = round(total / len(all_ids), 2)
        split_map = {uid: equal for uid in all_ids}

    bill = models.Bill(
        title=bill_data.title,
        description=bill_data.description,
        total_amount=total,
        creator_id=current_user.id,
    )
    db.add(bill)
    db.flush()

    # Pre-fetch balances to avoid double-counting due to implicit flushes 
    # inside get_or_create_balance when adding participants.
    for uid in all_ids:
        if uid != current_user.id:
            get_or_create_balance(db, uid, current_user.id)
            get_or_create_balance(db, current_user.id, uid)

    for uid in all_ids:
        is_creator = uid == current_user.id
        share = float(split_map.get(uid, round(total / len(all_ids), 2)))

        db.add(models.BillParticipant(
            bill_id=bill.id,
            user_id=uid,
            amount_owed=share,
            status=models.ParticipantStatus.accepted if is_creator else models.ParticipantStatus.pending,
            is_creator=is_creator,
        ))

        if not is_creator:
            db.add(models.Notification(
                user_id=uid,
                message=f"{current_user.username} added you to '{bill_data.title}' — LKR {share:.2f}",
                type="bill", reference_id=bill.id
            ))

            # ── Persistent balance update ───────────────────────
            # The debtor owes from the moment the bill is created.
            # Both ends of the balance are updated immediately.
            debtor_rec = get_or_create_balance(db, uid, current_user.id)
            debtor_rec.to_give = max(0.0, round(float(debtor_rec.to_give) + share, 2))
            
            creator_rec = get_or_create_balance(db, current_user.id, uid)
            creator_rec.to_receive = max(0.0, round(float(creator_rec.to_receive) + share, 2))

    db.commit()
    db.refresh(bill)
    return bill


@router.get("/", response_model=List[schemas.BillOut])
def get_bills(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    bill_ids = [p.bill_id for p in db.query(models.BillParticipant).filter(
        models.BillParticipant.user_id == current_user.id
    ).all()]
    return db.query(models.Bill).filter(
        models.Bill.id.in_(bill_ids)
    ).order_by(models.Bill.created_at.desc()).all()


@router.get("/summary/balances", response_model=schemas.BalanceSummary)
def get_balance_summary(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Dashboard totals — reads directly from the friend_balances table.

    Since every bill creation, acceptance, and merge writes to this table,
    the totals here always reflect the current DB state and never reset to zero.
    """
    recs = db.query(models.FriendBalance).filter(
        models.FriendBalance.user_id == current_user.id
    ).all()

    total_owed = max(0.0, round(sum(float(r.to_receive) for r in recs), 2))
    total_owe  = max(0.0, round(sum(float(r.to_give)    for r in recs), 2))

    return schemas.BalanceSummary(
        total_owed=total_owed,
        total_owe=total_owe,
        net_balance=round(total_owed - total_owe, 2)
    )


@router.get("/{bill_id}", response_model=schemas.BillOut)
def get_bill(
    bill_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    bill = db.query(models.Bill).filter(models.Bill.id == bill_id).first()
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")
    if current_user.id not in [p.user_id for p in bill.participants]:
        raise HTTPException(status_code=403, detail="Not authorized")
    return bill


@router.post("/{bill_id}/accept")
def accept_bill(
    bill_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Accept a bill.
    Updates the creator's FriendBalance.to_receive to reflect the accepted amount.
    The debtor's to_give was already set at bill creation — no change needed there.
    """
    participant = db.query(models.BillParticipant).filter(
        models.BillParticipant.bill_id == bill_id,
        models.BillParticipant.user_id == current_user.id
    ).first()
    if not participant:
        raise HTTPException(status_code=404, detail="Not a participant")
    if participant.status == models.ParticipantStatus.accepted:
        return {"message": "Already accepted"}

    participant.status = models.ParticipantStatus.accepted

    bill = db.query(models.Bill).filter(models.Bill.id == bill_id).first()

    # The balances were already updated when the bill was created.
    # We only need to notify the creator that the bill was accepted.
    db.add(models.Notification(
        user_id=bill.creator_id,
        message=f"{current_user.username} accepted the bill '{bill.title}'",
        type="bill", reference_id=bill_id
    ))
    
    # Auto-mark the incoming notification as read for the current user
    mark_notif_read_by_ref(db, current_user.id, "bill", bill_id)
    
    db.commit()
    return {"message": "Bill accepted"}
