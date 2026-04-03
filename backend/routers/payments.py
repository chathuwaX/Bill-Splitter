from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_
from database import get_db
from auth import get_current_user
import models
import schemas
from typing import List

router = APIRouter(prefix="/api/v1/payments", tags=["payments"])


@router.post("/", response_model=schemas.PaymentOut, status_code=201)
def create_payment(
    data: schemas.PaymentCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    payee = db.query(models.User).filter(models.User.id == data.payee_id).first()
    if not payee:
        raise HTTPException(status_code=404, detail="Payee not found")
    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    # Validate linked debt if provided
    is_auto_accept = False
    if data.debt_id:
        debt = db.query(models.Debt).filter(models.Debt.id == data.debt_id).first()
        if not debt:
            raise HTTPException(status_code=404, detail="Linked debt not found")
        if debt.status == models.DebtStatus.settled:
            raise HTTPException(status_code=400, detail="This debt is already settled")
        is_auto_accept = True

    payment = models.Payment(
        payer_id=current_user.id,
        payee_id=data.payee_id,
        amount=data.amount,
        note=data.note,
        debt_id=data.debt_id,
        status=models.PaymentStatus.accepted if is_auto_accept else models.PaymentStatus.pending,
        accepted_at=datetime.utcnow() if is_auto_accept else None
    )
    db.add(payment)
    db.flush()
    
    if is_auto_accept:
        debt.status = models.DebtStatus.settled
        debt.settled_at = datetime.utcnow()
        db.add(models.Notification(
            user_id=data.payee_id,
            message=f"{current_user.username} settled the merged debt of LKR {data.amount:.2f}",
            type="payment", reference_id=payment.id
        ))
    else:
        db.add(models.Notification(
            user_id=data.payee_id,
            message=f"{current_user.username} sent you LKR {data.amount:.2f} — awaiting your acceptance",
            type="payment", reference_id=payment.id
        ))
        
    db.commit()
    db.refresh(payment)
    return payment


@router.post("/{payment_id}/accept")
def accept_payment(
    payment_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    payment = db.query(models.Payment).filter(
        models.Payment.id == payment_id,
        models.Payment.payee_id == current_user.id
    ).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    if payment.status == models.PaymentStatus.accepted:
        raise HTTPException(status_code=400, detail="Already accepted")

    payment.status = models.PaymentStatus.accepted
    payment.accepted_at = datetime.utcnow()

    # Auto-settle the linked merged debt when payment is accepted
    if payment.debt_id:
        debt = db.query(models.Debt).filter(models.Debt.id == payment.debt_id).first()
        if debt and debt.status == models.DebtStatus.active:
            debt.status = models.DebtStatus.settled
            debt.settled_at = datetime.utcnow()

    db.add(models.Notification(
        user_id=payment.payer_id,
        message=f"{current_user.username} accepted your payment of LKR {payment.amount:.2f}",
        type="payment", reference_id=payment_id
    ))
    db.commit()
    return {"message": "Payment accepted"}


@router.get("/", response_model=List[schemas.PaymentOut])
def get_payments(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    return db.query(models.Payment).filter(
        or_(models.Payment.payer_id == current_user.id, models.Payment.payee_id == current_user.id)
    ).order_by(models.Payment.created_at.desc()).all()
