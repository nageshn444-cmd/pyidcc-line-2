"""
BMRCL PYIDCC Roster Configuration & Data Definitions.
Single source of truth for JMD TD Running Sets, PRO Slots, and TGTP Rostered OR Duties.
Editable configuration/data — changing values here updates roster behavior without code changes.
"""

from enum import Enum
from typing import Dict, List, Optional
from pydantic import BaseModel, Field


class DayType(str, Enum):
    MONDAY = "MONDAY"
    WEEKDAY = "WEEKDAY"
    SATURDAY = "SATURDAY"
    SUNDAY = "SUNDAY"


class ShiftBand(str, Enum):
    A = "A"
    B = "B"
    N = "N"
    G = "G"


class RoleSlotType(str, Enum):
    PRO1 = "PRO1"
    PRO2 = "PRO2"
    NPRO = "NPRO"
    NPRO1 = "NPRO1"
    NPRO2 = "NPRO2"
    OR1 = "OR1"
    OR2 = "OR2"


class RunningDutyDef(BaseModel):
    duty_id: str
    band: ShiftBand
    duty_num: int
    sign_on_loc: str = "PYID"


class ProSlotDef(BaseModel):
    slot_id: str  # e.g. 'PRO1', 'PRO2', 'NPRO', 'NPRO1', 'NPRO2'
    duty_num: int
    is_night: bool = False
    description: str = ""


class OrSlotDef(BaseModel):
    slot_id: str  # 'OR1' or 'OR2'
    duty_num: int
    sign_on_frac: float
    sign_off_frac: float
    sign_on_loc: str = "TGTP"
    duration_hours: float = 8.0


# ─────────────────────────────────────────────────────────────────────────────
# 1. AUTHORITATIVE JMD TD RUNNING-DUTY SETS
# ─────────────────────────────────────────────────────────────────────────────
JMD_TD_RUNNING_SETS_CONFIG: Dict[DayType, Dict[ShiftBand, List[int]]] = {
    DayType.MONDAY: {
        ShiftBand.A: [4, 12, 15, 18, 19, 21, 24],
        ShiftBand.B: [34, 53, 57, 58, 62],
        ShiftBand.N: [64, 65, 66, 67, 68, 69, 71, 72, 73, 74, 75, 76, 77],
    },
    DayType.WEEKDAY: {
        ShiftBand.A: [4, 12, 15, 18, 19, 21, 24],
        ShiftBand.B: [34, 53, 57, 58, 62],
        ShiftBand.N: [64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77],
    },
    DayType.SATURDAY: {
        ShiftBand.A: [4, 5, 9, 11, 13, 14, 15, 18, 20, 22],
        ShiftBand.B: [34, 35, 36, 44, 45, 46, 52, 53, 54, 55, 57],
        ShiftBand.N: [59, 60, 62, 63, 65, 66, 67, 68, 69, 70, 72],
    },
    DayType.SUNDAY: {
        ShiftBand.A: [5, 6, 7, 8, 9, 10, 18, 19, 20],
        ShiftBand.G: [21, 22],
        ShiftBand.B: [23, 32, 33, 34, 35, 38, 39, 47],
        ShiftBand.N: [48, 49, 51, 53, 55, 57, 58, 61, 62],
    }
}


# ─────────────────────────────────────────────────────────────────────────────
# 2. PRO SLOTS (MASTER_SPEC Part 8.1)
# ─────────────────────────────────────────────────────────────────────────────
PRO_SLOTS_CONFIG: Dict[DayType, List[ProSlotDef]] = {
    DayType.MONDAY: [
        ProSlotDef(slot_id="PRO1", duty_num=1, is_night=False, description="Pilot Relief Operator 1"),
        ProSlotDef(slot_id="PRO2", duty_num=43, is_night=False, description="Pilot Relief Operator 2"),
        ProSlotDef(slot_id="NPRO", duty_num=78, is_night=True, description="Night Pilot Relief Operator"),
    ],
    DayType.WEEKDAY: [
        ProSlotDef(slot_id="PRO1", duty_num=1, is_night=False, description="Pilot Relief Operator 1"),
        ProSlotDef(slot_id="PRO2", duty_num=43, is_night=False, description="Pilot Relief Operator 2"),
        ProSlotDef(slot_id="NPRO", duty_num=78, is_night=True, description="Night Pilot Relief Operator"),
    ],
    DayType.SATURDAY: [
        ProSlotDef(slot_id="PRO1", duty_num=1, is_night=False, description="Pilot Relief Operator 1"),
        ProSlotDef(slot_id="PRO2", duty_num=32, is_night=False, description="Pilot Relief Operator 2"),
        ProSlotDef(slot_id="NPRO1", duty_num=73, is_night=True, description="Night Pilot Relief Operator 1"),
        ProSlotDef(slot_id="NPRO2", duty_num=74, is_night=True, description="Night Pilot Relief Operator 2"),
    ],
    DayType.SUNDAY: [
        ProSlotDef(slot_id="PRO1", duty_num=1, is_night=False, description="Pilot Relief Operator 1"),
        ProSlotDef(slot_id="PRO2", duty_num=31, is_night=False, description="Pilot Relief Operator 2"),
        ProSlotDef(slot_id="NPRO", duty_num=63, is_night=True, description="Night Pilot Relief Operator"),
    ],
}


# ─────────────────────────────────────────────────────────────────────────────
# 3. TGTP ROSTERED-OR DUTIES (MASTER_SPEC Part 8.2(a))
# Exact day fractions preserved without normalisation
# ─────────────────────────────────────────────────────────────────────────────
TGTP_OR_SLOTS_CONFIG: Dict[DayType, List[OrSlotDef]] = {
    DayType.MONDAY: [
        OrSlotDef(slot_id="OR1", duty_num=2, sign_on_frac=0.291667, sign_off_frac=0.625000),
        OrSlotDef(slot_id="OR2", duty_num=42, sign_on_frac=0.572917, sign_off_frac=0.906250),
    ],
    DayType.WEEKDAY: [
        OrSlotDef(slot_id="OR1", duty_num=2, sign_on_frac=0.291667, sign_off_frac=0.625000),
        OrSlotDef(slot_id="OR2", duty_num=42, sign_on_frac=0.593750, sign_off_frac=0.906250),
    ],
    DayType.SATURDAY: [
        OrSlotDef(slot_id="OR1", duty_num=2, sign_on_frac=0.291667, sign_off_frac=0.604167),
        OrSlotDef(slot_id="OR2", duty_num=31, sign_on_frac=0.572917, sign_off_frac=0.906250),
    ],
    DayType.SUNDAY: [
        OrSlotDef(slot_id="OR1", duty_num=2, sign_on_frac=0.312500, sign_off_frac=0.625000),
        OrSlotDef(slot_id="OR2", duty_num=30, sign_on_frac=0.583333, sign_off_frac=0.907292),
    ],
}
