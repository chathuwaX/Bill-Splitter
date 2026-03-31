from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from auth import get_current_user
import models
import schemas
from typing import List

router = APIRouter(prefix="/api/v1/bills", tags=["bills"])


@router.post("/", response_model=schemas.BillOut, status_code=201)
def create_bill(
    bill_data: schemas.BillCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
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

    for uid in all_ids:
        is_creator = uid == current_user.id
        db.add(models.BillParticipant(
            bill_id=bill.id,
            user_id=uid,
            amount_owed=split_map.get(uid, round(total / len(all_ids), 2)),
            status=models.ParticipantStatus.accepted if is_creator else models.ParticipantStatus.pending,
            is_creator=is_creator,
        ))
        if not is_creator:
            db.add(models.Notification(
                user_id=uid,
                message=f"{current_user.username} added you to '{bill_data.title}' — LKR {split_map.get(uid, 0):.2f}",
                type="bill", reference_id=bill.id
            ))

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
    total_owed = sum(
        p.amount_owed
        for bill in db.query(models.Bill).filter(models.Bill.creator_id == current_user.id).all()
        for p in bill.participants if not p.is_creator
    )
    total_owe = sum(
        p.amount_owed
        for p in db.query(models.BillParticipant).filter(
            models.BillParticipant.user_id == current_user.id,
            models.BillParticipant.is_creator == False
        ).all()
    )

    for p in db.query(models.Payment).filter(
        models.Payment.payer_id == current_user.id,
        models.Payment.status == models.PaymentStatus.accepted
    ).all():
        total_owe -= p.amount

    for p in db.query(models.Payment).filter(
        models.Payment.payee_id == current_user.id,
        models.Payment.status == models.PaymentStatus.accepted
    ).all():
        total_owed -= p.amount

    total_owed = max(0, round(total_owed, 2))
    total_owe = max(0, round(total_owe, 2))
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
    participant = db.query(models.BillParticipant).filter(
        models.BillParticipant.bill_id == bill_id,
        models.BillParticipant.user_id == current_user.id
    ).first()
    if not participant:
        raise HTTPException(status_code=404, detail="Not a participant")

    participant.status = models.ParticipantStatus.accepted
    bill = db.query(models.Bill).filter(models.Bill.id == bill_id).first()
    db.add(models.Notification(
        user_id=bill.creator_id,
        message=f"{current_user.username} accepted the bill '{bill.title}'",
        type="bill", reference_id=bill_id
    ))
    db.commit()
    return {"message": "Bill accepted"}
