"""
SQLAlchemy and Pydantic models for BMRCL Roster & Operator management.
"""

from datetime import date as DateType, datetime, timezone
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, ConfigDict
from sqlalchemy import (
    Column, Integer, String, Boolean, Date, DateTime, Float, ForeignKey, JSON
)
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


# ─────────────────────────────────────────────────────────────────────────────
# SQLAlchemy Database Models
# ─────────────────────────────────────────────────────────────────────────────
class OperatorDB(Base):
    __tablename__ = "operators"

    emp_id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    solo_certified_from = Column(Date, nullable=True)
    is_night_cohort = Column(Boolean, default=False)
    pro_last_date = Column(Date, nullable=True)
    pro_count_ytd = Column(Integer, default=0)
    or_last_date = Column(Date, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class RosterAssignmentLogDB(Base):
    __tablename__ = "roster_assignment_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    target_date = Column(Date, nullable=False, index=True)
    day_type = Column(String, nullable=False)
    assigned_by = Column(String, default="SYSTEM_ROSTER_OPTIMIZER")
    assigned_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    is_publishable = Column(Boolean, default=True)
    assigned_pairs = Column(JSON, nullable=False)
    unfilled_running = Column(JSON, nullable=False)
    unfilled_pro_or = Column(JSON, nullable=False)
    spare_operators = Column(JSON, nullable=False)
    warnings = Column(JSON, nullable=False)


# ─────────────────────────────────────────────────────────────────────────────
# Pydantic Schemas
# ─────────────────────────────────────────────────────────────────────────────
class OperatorInput(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    emp_id: int
    name: str
    solo_certified_from: Optional[DateType] = None
    is_night_cohort: bool = False
    is_adjacent_to_night: bool = False
    pro_last_date: Optional[DateType] = None
    pro_count_ytd: int = 0
    or_last_date: Optional[DateType] = None


class DutySlotInfo(BaseModel):
    duty_id: str  # e.g. 'A4', 'B34', 'N64', 'G21', 'PRO1', 'OR1'
    category: str  # 'RUNNING', 'PRO', 'OR'
    band: Optional[str] = None
    duty_num: int
    sign_on_loc: str = "PYID"
    sign_on_frac: Optional[float] = None
    sign_off_frac: Optional[float] = None
    duration_hours: Optional[float] = None


class DayPlanResponse(BaseModel):
    target_date: DateType
    day_type: str
    is_public_holiday: bool = False
    holiday_notice: Optional[str] = None
    total_running_duties: int
    total_pro_slots: int
    total_or_slots: int
    running_duty_ids: List[str]
    pro_slots: List[Dict[str, Any]]
    or_slots: List[Dict[str, Any]]


class AssignedPair(BaseModel):
    duty_id: str
    duty_type: str  # 'RUNNING', 'PRO', 'OR'
    duty_num: int
    band: Optional[str] = None
    emp_id: int
    name: str
    sign_on_loc: str = "PYID"
    sign_on_frac: Optional[float] = None
    sign_off_frac: Optional[float] = None
    assignment_reason: str


class UnfilledDuty(BaseModel):
    duty_id: str
    category: str
    duty_num: int
    band: Optional[str] = None
    severity: str  # 'BLOCKING_SHORTAGE' or 'WARNING'
    reason: str


class AssignmentResponse(BaseModel):
    target_date: DateType
    day_type: str
    is_publishable: bool
    assigned_by: str
    assigned_at: datetime
    assigned_pairs: List[AssignedPair]
    unfilled_running_duties: List[UnfilledDuty] = Field(default_factory=list)
    unfilled_pro_or_slots: List[UnfilledDuty] = Field(default_factory=list)
    spare_operators: List[OperatorInput] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    summary: Dict[str, Any] = Field(default_factory=dict)


class AssignRosterRequest(BaseModel):
    target_date: DateType
    operators: List[OperatorInput]
    is_public_holiday: bool = False
    assigned_by: str = "SYSTEM_ROSTER_OPTIMIZER"
