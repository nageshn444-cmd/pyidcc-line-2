"""
BMRCL PYIDCC Crew Duty-Assignment Engine.
Implements the 6-Phase Solve Priority Pipeline (NIGHT -> NPRO -> PRO1/2 -> A -> B -> OR1/2),
Hard constraints PR1–PR6, H28, TGTP OR rules, and Shortage Protection.
"""

from datetime import date as DateType, datetime, timezone
from typing import List, Dict, Any, Optional, Set, Tuple
from .config import (
    DayType, ShiftBand,
    JMD_TD_RUNNING_SETS_CONFIG,
    PRO_SLOTS_CONFIG,
    TGTP_OR_SLOTS_CONFIG,
    ProSlotDef,
    OrSlotDef
)
from .models import (
    OperatorInput,
    DayPlanResponse,
    AssignmentResponse,
    AssignedPair,
    UnfilledDuty
)


def resolve_day_type(target_date: DateType) -> DayType:
    """
    Resolves the day type from a calendar date.
    MONDAY (0), WEEKDAY (1-4), SATURDAY (5), SUNDAY (6).
    """
    weekday = target_date.weekday()
    if weekday == 0:
        return DayType.MONDAY
    elif 1 <= weekday <= 4:
        return DayType.WEEKDAY
    elif weekday == 5:
        return DayType.SATURDAY
    elif weekday == 6:
        return DayType.SUNDAY
    raise ValueError(f"Invalid weekday index: {weekday}")


def duties_for_date(target_date: DateType, is_public_holiday: bool = False) -> DayPlanResponse:
    """
    Returns the day's JMD TD running ids, PRO slots, and TGTP OR slots (with times).
    Server-authoritative and data-driven from config.
    """
    day_type = resolve_day_type(target_date)
    running_set = JMD_TD_RUNNING_SETS_CONFIG[day_type]
    pro_slots = PRO_SLOTS_CONFIG[day_type]
    or_slots = TGTP_OR_SLOTS_CONFIG[day_type]

    running_ids: List[str] = []
    for band, duty_nums in running_set.items():
        for d_num in duty_nums:
            running_ids.append(f"{band.value}{d_num}")

    pro_slot_dicts = [
        {
            "slot_id": p.slot_id,
            "duty_num": p.duty_num,
            "is_night": p.is_night,
            "description": p.description,
        }
        for p in pro_slots
    ]

    or_slot_dicts = [
        {
            "slot_id": o.slot_id,
            "duty_num": o.duty_num,
            "sign_on_frac": o.sign_on_frac,
            "sign_off_frac": o.sign_off_frac,
            "sign_on_loc": o.sign_on_loc,
            "duration_hours": o.duration_hours,
        }
        for o in or_slots
    ]

    holiday_notice = (
        "operations decide the reduced pattern"
        if is_public_holiday
        else None
    )

    return DayPlanResponse(
        target_date=target_date,
        day_type=day_type.value,
        is_public_holiday=is_public_holiday,
        holiday_notice=holiday_notice,
        total_running_duties=len(running_ids),
        total_pro_slots=len(pro_slots),
        total_or_slots=len(or_slots),
        running_duty_ids=running_ids,
        pro_slots=pro_slot_dicts,
        or_slots=or_slot_dicts,
    )


def assign_day(
    target_date: DateType,
    operators: List[OperatorInput],
    is_public_holiday: bool = False,
    assigned_by: str = "SYSTEM_ROSTER_OPTIMIZER"
) -> AssignmentResponse:
    """
    Assigns JMD TD running duties, PRO, and TGTP OR in priority order:
    1. JMD TD NIGHT running duties (N, and G on Sunday)
    2. NPRO (night pilot from night cohort, PR5/PR6)
    3. PRO1, PRO2 (day pilots via rotational queue, PR2-PR4, H28)
    4. JMD TD A-band running duties
    5. JMD TD B-band running duties
    6. OR1, OR2 (TGTP fixed OR, fairness order)

    Protection Rules:
    - Running duties (A/B/N/G) are NEVER dropped to fill PRO or OR.
    - If daytime operators are only enough for A/B running duties, PRO/OR run short with warnings.
    - 1 operator = 1 duty per day (P0.01).
    - Deterministic and idempotent.
    """
    day_type = resolve_day_type(target_date)
    running_set = JMD_TD_RUNNING_SETS_CONFIG[day_type]
    pro_slots = PRO_SLOTS_CONFIG[day_type]
    or_slots = TGTP_OR_SLOTS_CONFIG[day_type]

    assigned_pairs: List[AssignedPair] = []
    unfilled_running: List[UnfilledDuty] = []
    unfilled_pro_or: List[UnfilledDuty] = []
    warnings: List[str] = []

    if is_public_holiday:
        warnings.append("Public Holiday: operations decide the reduced pattern.")

    # Deduplicate & index operators deterministically by emp_id
    op_map: Dict[int, OperatorInput] = {}
    for op in sorted(operators, key=lambda o: o.emp_id):
        if op.emp_id not in op_map:
            op_map[op.emp_id] = op

    assigned_emp_ids: Set[int] = set()

    def get_available_pool() -> List[OperatorInput]:
        return [op for eid, op in op_map.items() if eid not in assigned_emp_ids]

    def is_solo_certified(op: OperatorInput) -> bool:
        if op.solo_certified_from is None:
            return False
        return op.solo_certified_from <= target_date

    def calc_days_since_pro(op: OperatorInput) -> int:
        if op.pro_last_date is None:
            return 999999
        return (target_date - op.pro_last_date).days

    def calc_days_since_or(op: OperatorInput) -> int:
        if op.or_last_date is None:
            return 999999
        return (target_date - op.or_last_date).days

    # Count required running duties by shift
    night_duties: List[Tuple[str, int, ShiftBand]] = []
    if ShiftBand.N in running_set:
        for num in running_set[ShiftBand.N]:
            night_duties.append((f"N{num}", num, ShiftBand.N))
    if ShiftBand.G in running_set:
        for num in running_set[ShiftBand.G]:
            night_duties.append((f"G{num}", num, ShiftBand.G))

    a_duties: List[Tuple[str, int]] = []
    if ShiftBand.A in running_set:
        for num in running_set[ShiftBand.A]:
            a_duties.append((f"A{num}", num))

    b_duties: List[Tuple[str, int]] = []
    if ShiftBand.B in running_set:
        for num in running_set[ShiftBand.B]:
            b_duties.append((f"B{num}", num))

    total_day_running_needed = len(a_duties) + len(b_duties)
    npro_slots = [p for p in pro_slots if p.is_night]
    day_pro_slots = [p for p in pro_slots if not p.is_night]

    # ─────────────────────────────────────────────────────────────────────────
    # STEP 1: JMD TD NIGHT RUNNING DUTIES
    # ─────────────────────────────────────────────────────────────────────────
    for duty_id, duty_num, band in night_duties:
        available = get_available_pool()
        night_eligible = [op for op in available if op.is_night_cohort]
        candidate = night_eligible[0] if night_eligible else (available[0] if available else None)

        if candidate:
            assigned_emp_ids.add(candidate.emp_id)
            assigned_pairs.append(AssignedPair(
                duty_id=duty_id,
                duty_type="RUNNING",
                duty_num=duty_num,
                band=band.value,
                emp_id=candidate.emp_id,
                name=candidate.name,
                sign_on_loc="PYID",
                assignment_reason=f"JMD TD {band.value}-Band Running Duty"
            ))
        else:
            unfilled_running.append(UnfilledDuty(
                duty_id=duty_id,
                category="RUNNING",
                duty_num=duty_num,
                band=band.value,
                severity="BLOCKING_SHORTAGE",
                reason=f"No operator available for mandatory running duty {duty_id}"
            ))

    # ─────────────────────────────────────────────────────────────────────────
    # STEP 2: NPRO SLOTS (Night Pilot)
    # ─────────────────────────────────────────────────────────────────────────
    for npro in npro_slots:
        available = get_available_pool()
        eligible_npro = [
            op for op in available
            if op.is_night_cohort and is_solo_certified(op)
        ]
        eligible_npro.sort(key=lambda o: (-calc_days_since_pro(o), o.pro_count_ytd, o.emp_id))
        candidate = eligible_npro[0] if eligible_npro else None

        if candidate:
            assigned_emp_ids.add(candidate.emp_id)
            assigned_pairs.append(AssignedPair(
                duty_id=npro.slot_id,
                duty_type="PRO",
                duty_num=npro.duty_num,
                band="N",
                emp_id=candidate.emp_id,
                name=candidate.name,
                sign_on_loc="PYID",
                assignment_reason=f"Night Pilot Relief ({npro.slot_id})"
            ))
        else:
            unfilled_pro_or.append(UnfilledDuty(
                duty_id=npro.slot_id,
                category="PRO",
                duty_num=npro.duty_num,
                band="N",
                severity="WARNING",
                reason=f"No night-cohort solo-certified operator available for {npro.slot_id} (Duty {npro.duty_num})"
            ))
            warnings.append(f"Unfilled PRO slot: {npro.slot_id} (Duty {npro.duty_num}) due to lack of eligible night cohort operator.")

    # ─────────────────────────────────────────────────────────────────────────
    # STEP 3: PRO1, PRO2 (Day Pilots — rotational queue PR2–PR4, H28)
    # Protection: Do not fill PRO if it would starve mandatory A/B running duties
    # ─────────────────────────────────────────────────────────────────────────
    for dpro in day_pro_slots:
        available = get_available_pool()
        day_available = [op for op in available if not op.is_night_cohort]
        
        # Check shortage protection: Must reserve enough day ops for A and B running duties
        if len(day_available) <= total_day_running_needed:
            unfilled_pro_or.append(UnfilledDuty(
                duty_id=dpro.slot_id,
                category="PRO",
                duty_num=dpro.duty_num,
                band="A",
                severity="WARNING",
                reason=f"Day operators reserved for mandatory A/B running duties ({dpro.slot_id} unfilled)"
            ))
            warnings.append(f"Unfilled PRO slot: {dpro.slot_id} (Duty {dpro.duty_num}) to protect mandatory running duties.")
            continue

        eligible_day_pro = [
            op for op in day_available
            if is_solo_certified(op)
            and not op.is_adjacent_to_night
            and calc_days_since_pro(op) >= 7
        ]
        eligible_day_pro.sort(key=lambda o: (-calc_days_since_pro(o), o.pro_count_ytd, o.emp_id))
        candidate = eligible_day_pro[0] if eligible_day_pro else None

        if candidate:
            assigned_emp_ids.add(candidate.emp_id)
            assigned_pairs.append(AssignedPair(
                duty_id=dpro.slot_id,
                duty_type="PRO",
                duty_num=dpro.duty_num,
                band="A",
                emp_id=candidate.emp_id,
                name=candidate.name,
                sign_on_loc="PYID",
                assignment_reason=f"Day Pilot Relief ({dpro.slot_id})"
            ))
        else:
            unfilled_pro_or.append(UnfilledDuty(
                duty_id=dpro.slot_id,
                category="PRO",
                duty_num=dpro.duty_num,
                band="A",
                severity="WARNING",
                reason=f"No eligible candidate meeting PR1-PR4/H28 criteria for {dpro.slot_id} (Duty {dpro.duty_num})"
            ))
            warnings.append(f"Unfilled PRO slot: {dpro.slot_id} (Duty {dpro.duty_num}) due to lack of eligible day-pilot operator.")

    # ─────────────────────────────────────────────────────────────────────────
    # STEP 4: JMD TD A-BAND RUNNING DUTIES
    # ─────────────────────────────────────────────────────────────────────────
    for duty_id, duty_num in a_duties:
        available = get_available_pool()
        day_available = [op for op in available if not op.is_night_cohort]
        candidate = day_available[0] if day_available else (available[0] if available else None)

        if candidate:
            assigned_emp_ids.add(candidate.emp_id)
            assigned_pairs.append(AssignedPair(
                duty_id=duty_id,
                duty_type="RUNNING",
                duty_num=duty_num,
                band="A",
                emp_id=candidate.emp_id,
                name=candidate.name,
                sign_on_loc="PYID",
                assignment_reason="JMD TD A-Band Running Duty"
            ))
        else:
            unfilled_running.append(UnfilledDuty(
                duty_id=duty_id,
                category="RUNNING",
                duty_num=duty_num,
                band="A",
                severity="BLOCKING_SHORTAGE",
                reason=f"No operator available for mandatory running duty {duty_id}"
            ))

    # ─────────────────────────────────────────────────────────────────────────
    # STEP 5: JMD TD B-BAND RUNNING DUTIES
    # ─────────────────────────────────────────────────────────────────────────
    for duty_id, duty_num in b_duties:
        available = get_available_pool()
        day_available = [op for op in available if not op.is_night_cohort]
        candidate = day_available[0] if day_available else (available[0] if available else None)

        if candidate:
            assigned_emp_ids.add(candidate.emp_id)
            assigned_pairs.append(AssignedPair(
                duty_id=duty_id,
                duty_type="RUNNING",
                duty_num=duty_num,
                band="B",
                emp_id=candidate.emp_id,
                name=candidate.name,
                sign_on_loc="PYID",
                assignment_reason="JMD TD B-Band Running Duty"
            ))
        else:
            unfilled_running.append(UnfilledDuty(
                duty_id=duty_id,
                category="RUNNING",
                duty_num=duty_num,
                band="B",
                severity="BLOCKING_SHORTAGE",
                reason=f"No operator available for mandatory running duty {duty_id}"
            ))

    # ─────────────────────────────────────────────────────────────────────────
    # STEP 6: TGTP FIXED OR (OR1, OR2)
    # ─────────────────────────────────────────────────────────────────────────
    for or_slot in or_slots:
        available = get_available_pool()
        # Fairness order: order by days_since_last_or DESC, then emp_id ASC
        available.sort(key=lambda o: (-calc_days_since_or(o), o.emp_id))
        candidate = available[0] if available else None

        if candidate:
            assigned_emp_ids.add(candidate.emp_id)
            assigned_pairs.append(AssignedPair(
                duty_id=or_slot.slot_id,
                duty_type="OR",
                duty_num=or_slot.duty_num,
                band="OR",
                emp_id=candidate.emp_id,
                name=candidate.name,
                sign_on_loc=or_slot.sign_on_loc,
                sign_on_frac=or_slot.sign_on_frac,
                sign_off_frac=or_slot.sign_off_frac,
                assignment_reason=f"TGTP Rostered Operating Reserve ({or_slot.slot_id})"
            ))
        else:
            unfilled_pro_or.append(UnfilledDuty(
                duty_id=or_slot.slot_id,
                category="OR",
                duty_num=or_slot.duty_num,
                band="OR",
                severity="WARNING",
                reason=f"No operator available for {or_slot.slot_id} (Duty {or_slot.duty_num}) at TGTP"
            ))
            warnings.append(f"Unfilled TGTP OR slot: {or_slot.slot_id} (Duty {or_slot.duty_num}).")

    # Determine spare operators
    spare_operators = [op for eid, op in op_map.items() if eid not in assigned_emp_ids]

    # Publishability: False if ANY running duty is unfilled
    is_publishable = len(unfilled_running) == 0

    return AssignmentResponse(
        target_date=target_date,
        day_type=day_type.value,
        is_publishable=is_publishable,
        assigned_by=assigned_by,
        assigned_at=datetime.now(timezone.utc),
        assigned_pairs=assigned_pairs,
        unfilled_running_duties=unfilled_running,
        unfilled_pro_or_slots=unfilled_pro_or,
        spare_operators=spare_operators,
        warnings=warnings,
        summary={
            "total_operators_supplied": len(op_map),
            "total_assigned": len(assigned_pairs),
            "unfilled_running_count": len(unfilled_running),
            "unfilled_pro_or_count": len(unfilled_pro_or),
            "spare_operators_count": len(spare_operators),
        }
    )
