from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Enum, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from database import Base


class FriendshipStatus(str, enum.Enum):
    pending = "pending"
    accepted = "accepted"


class BillStatus(str, enum.Enum):
    pending = "pending"
    active = "active"


class ParticipantStatus(str, enum.Enum):
    pending = "pending"
    accepted = "accepted"


class PaymentStatus(str, enum.Enum):
    pending = "pending"
    accepted = "accepted"


class DebtStatus(str, enum.Enum):
    active = "active"
    settled = "settled"


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=True)
    avatar_color = Column(String, default="#6366f1")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    sent_friendships = relationship("Friendship", foreign_keys="Friendship.requester_id", back_populates="requester")
    received_friendships = relationship("Friendship", foreign_keys="Friendship.addressee_id", back_populates="addressee")
    bills_created = relationship("Bill", back_populates="creator")
    bill_participations = relationship("BillParticipant", back_populates="user")
    notifications = relationship("Notification", back_populates="user")
    payments_sent = relationship("Payment", foreign_keys="Payment.payer_id", back_populates="payer")
    payments_received = relationship("Payment", foreign_keys="Payment.payee_id", back_populates="payee")
    debts_as_from = relationship("Debt", foreign_keys="Debt.from_user_id", back_populates="from_user")
    debts_as_to = relationship("Debt", foreign_keys="Debt.to_user_id", back_populates="to_user")


class Friendship(Base):
    __tablename__ = "friendships"
    id = Column(Integer, primary_key=True, index=True)
    requester_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    addressee_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(Enum(FriendshipStatus), default=FriendshipStatus.pending)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    requester = relationship("User", foreign_keys=[requester_id], back_populates="sent_friendships")
    addressee = relationship("User", foreign_keys=[addressee_id], back_populates="received_friendships")


class Bill(Base):
    __tablename__ = "bills"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    total_amount = Column(Float, nullable=False)
    creator_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(Enum(BillStatus), default=BillStatus.active)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    creator = relationship("User", back_populates="bills_created")
    participants = relationship("BillParticipant", back_populates="bill", cascade="all, delete-orphan")


class BillParticipant(Base):
    __tablename__ = "bill_participants"
    id = Column(Integer, primary_key=True, index=True)
    bill_id = Column(Integer, ForeignKey("bills.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    amount_owed = Column(Float, nullable=False)
    status = Column(Enum(ParticipantStatus), default=ParticipantStatus.pending)
    is_creator = Column(Boolean, default=False)
    # Merge tracking: True when this entry has been absorbed into a Debt record
    is_merged = Column(Boolean, default=False, nullable=False)
    # UUID string linking back to the Debt.merge_group_id
    merge_group_id = Column(String, nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    bill = relationship("Bill", back_populates="participants")
    user = relationship("User", back_populates="bill_participations")


class Payment(Base):
    __tablename__ = "payments"
    id = Column(Integer, primary_key=True, index=True)
    payer_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    payee_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    amount = Column(Float, nullable=False)
    note = Column(String, nullable=True)
    status = Column(Enum(PaymentStatus), default=PaymentStatus.pending)
    # Optional link to a merged debt this payment is settling
    debt_id = Column(Integer, ForeignKey("debts.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    accepted_at = Column(DateTime(timezone=True), nullable=True)

    payer = relationship("User", foreign_keys=[payer_id], back_populates="payments_sent")
    payee = relationship("User", foreign_keys=[payee_id], back_populates="payments_received")
    debt = relationship("Debt", back_populates="payments")


class Notification(Base):
    __tablename__ = "notifications"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    message = Column(String, nullable=False)
    type = Column(String, default="info")
    is_read = Column(Boolean, default=False)
    reference_id = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="notifications")


class Debt(Base):
    """
    Represents a merged debt record.
    - Original debts (bill-based) are tracked via BillParticipant.
    - When merging, all active bill-based debts between two users are
      consolidated into a single Debt record.
    - Original BillParticipant records are marked is_merged=True with a
      common merge_group_id pointing back to this Debt's id.
    - The Debt itself stores the net direction and amount.
    """
    __tablename__ = "debts"
    id = Column(Integer, primary_key=True, index=True)
    # The user who owes money in the net result
    from_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    # The user who is owed money in the net result
    to_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    net_amount = Column(Float, nullable=False)
    # Human-readable summary of what was merged
    description = Column(Text, nullable=True)
    status = Column(Enum(DebtStatus), default=DebtStatus.active)
    # is_merged=False means this IS the merged result record
    # (original sources are BillParticipants with is_merged=True)
    is_merged = Column(Boolean, default=False)
    # merge_group_id links all original BillParticipants to this Debt
    merge_group_id = Column(String, nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    settled_at = Column(DateTime(timezone=True), nullable=True)

    from_user = relationship("User", foreign_keys=[from_user_id], back_populates="debts_as_from")
    to_user = relationship("User", foreign_keys=[to_user_id], back_populates="debts_as_to")
    payments = relationship("Payment", back_populates="debt")
