from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime


class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str
    full_name: Optional[str] = None


class UserLogin(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    id: int
    username: str
    email: str
    full_name: Optional[str]
    avatar_color: str
    created_at: datetime

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserOut


class FriendRequest(BaseModel):
    username: str


class BillParticipantIn(BaseModel):
    user_id: int
    amount_owed: Optional[float] = None


class BillCreate(BaseModel):
    title: str
    description: Optional[str] = None
    total_amount: float
    participant_ids: List[int]
    custom_splits: Optional[List[BillParticipantIn]] = None


class BillParticipantOut(BaseModel):
    id: int
    user_id: int
    user: UserOut
    amount_owed: float
    status: str
    is_creator: bool
    # Merge tracking fields (added via migration-safe defaults)
    is_merged: bool = False
    merge_group_id: Optional[str] = None

    class Config:
        from_attributes = True


class BillOut(BaseModel):
    id: int
    title: str
    description: Optional[str]
    total_amount: float
    creator_id: int
    creator: UserOut
    status: str
    participants: List[BillParticipantOut]
    created_at: datetime

    class Config:
        from_attributes = True


class PaymentCreate(BaseModel):
    payee_id: int
    amount: float
    note: Optional[str] = None
    debt_id: Optional[int] = None  # Optional: link payment to a merged debt


class PaymentOut(BaseModel):
    id: int
    payer_id: int
    payee_id: int
    payer: UserOut
    payee: UserOut
    amount: float
    note: Optional[str]
    status: str
    debt_id: Optional[int] = None
    created_at: datetime
    accepted_at: Optional[datetime]

    class Config:
        from_attributes = True


class NotificationOut(BaseModel):
    id: int
    message: str
    type: str
    is_read: bool
    reference_id: Optional[int]
    created_at: datetime

    class Config:
        from_attributes = True


class BalanceSummary(BaseModel):
    total_owed: float
    total_owe: float
    net_balance: float


class FriendBalance(BaseModel):
    friend: UserOut
    net_balance: float


# ── Debt / Merge schemas ──────────────────────────────────────────────────────

class DebtOut(BaseModel):
    id: int
    from_user_id: int
    to_user_id: int
    from_user: UserOut
    to_user: UserOut
    net_amount: float
    description: Optional[str]
    status: str
    is_merged: bool
    merge_group_id: Optional[str]
    created_at: datetime
    settled_at: Optional[datetime]

    class Config:
        from_attributes = True


class MergeSourceItem(BaseModel):
    """One original bill-participant entry that was merged."""
    bill_id: int
    bill_title: str
    bill_description: Optional[str]
    amount: float
    direction: str   # "you_owe" | "they_owe"
    created_at: datetime


class MergeResult(BaseModel):
    """Full result returned after a merge operation."""
    debt: DebtOut
    sources: List[MergeSourceItem]
    from_user: UserOut
    to_user: UserOut
    net_amount: float
    message: str
