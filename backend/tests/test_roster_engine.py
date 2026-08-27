"""
Comprehensive Acceptance Test Suite for BMRCL PYIDCC Roster Duty-Assignment Engine.
Tests all requirements from MASTER_SPEC:
1. JMD TD Running Sets (Counts, exclusions, G duties).
2. PRO Slots & Priority Rules (PR1–PR6, H28, rotational queue, 7-day restriction, night cohort gating).
3. TGTP OR Duties (Exact 8h day fractions, TGTP location, fairness ordering).
4. Solve Priority Sequence (NIGHT -> NPRO -> PRO1/2 -> A -> B -> OR1/2).
5. Shortage Protection (Running = blocking, PRO/OR = warning).
6. REST API endpoints (GET /plan, POST /assign).
7. Data-driven configuration modifications.
"""

import pytest
from datetime import date, timedelta
from fastapi.testclient import TestClient

from backend.app.config import (
    DayType, ShiftBand,
    JMD_TD_RUNNING_SETS_CONFIG,
    PRO_SLOTS_CONFIG,
    TGTP_OR_SLOTS_CONFIG,
    OrSlotDef
)
from backend.app.models import OperatorInput
from backend.app.engine import (
    resolve_day_type,
    duties_for_date,
    assign_day
)
from backend.app.main import app


# ─────────────────────────────────────────────────────────────────────────────
# 1. JMD TD RUNNING-DUTY SETS ACCEPTANCE CHECKS
# ─────────────────────────────────────────────────────────────────────────────
def test_jmd_td_exact_counts():
    """Counts exactly: MONDAY 25, WEEKDAY 26, SATURDAY 32, SUNDAY 28."""
    monday_plan = duties_for_date(date(2026, 8, 24))  # Monday
    tuesday_plan = duties_for_date(date(2026, 8, 25))  # Tuesday (Weekday)
    saturday_plan = duties_for_date(date(2026, 8, 29))  # Saturday
    sunday_plan = duties_for_date(date(2026, 8, 30))  # Sunday

    assert monday_plan.day_type == "MONDAY"
    assert monday_plan.total_running_duties == 25

    assert tuesday_plan.day_type == "WEEKDAY"
    assert tuesday_plan.total_running_duties == 26

    assert saturday_plan.day_type == "SATURDAY"
    assert saturday_plan.total_running_duties == 32

    assert sunday_plan.day_type == "SUNDAY"
    assert sunday_plan.total_running_duties == 28


def test_monday_excludes_n70_weekday_includes_n70():
    """Monday excludes N70; Tue–Fri includes N70; otherwise identical."""
    monday_plan = duties_for_date(date(2026, 8, 24))
    weekday_plan = duties_for_date(date(2026, 8, 25))

    assert "N70" not in monday_plan.running_duty_ids
    assert "N70" in weekday_plan.running_duty_ids

    # All Monday duties are in Weekday
    for duty_id in monday_plan.running_duty_ids:
        assert duty_id in weekday_plan.running_duty_ids

    assert set(weekday_plan.running_duty_ids) - set(monday_plan.running_duty_ids) == {"N70"}


def test_no_duplicate_ids_and_sunday_g_duties_only():
    """No duplicate ids within any set; SUNDAY is the only set with G duties."""
    for day_type, running_dict in JMD_TD_RUNNING_SETS_CONFIG.items():
        all_ids = []
        for band, nums in running_dict.items():
            for num in nums:
                all_ids.append(f"{band.value}{num}")
        # Assert no duplicates
        assert len(all_ids) == len(set(all_ids))

        # Check G band only on Sunday
        has_g = any(i.startswith("G") for i in all_ids)
        if day_type == DayType.SUNDAY:
            assert has_g is True
            assert "G21" in all_ids
            assert "G22" in all_ids
        else:
            assert has_g is False


# ─────────────────────────────────────────────────────────────────────────────
# 2. PRO ACCEPTANCE CHECKS
# ─────────────────────────────────────────────────────────────────────────────
def test_pro_slots_per_day_type():
    """Slots per day type: MONDAY 3, WEEKDAY 3, SATURDAY 4 (two NPRO: 73 & 74), SUNDAY 3."""
    monday_plan = duties_for_date(date(2026, 8, 24))
    assert monday_plan.total_pro_slots == 3
    assert [p["slot_id"] for p in monday_plan.pro_slots] == ["PRO1", "PRO2", "NPRO"]
    assert [p["duty_num"] for p in monday_plan.pro_slots] == [1, 43, 78]

    saturday_plan = duties_for_date(date(2026, 8, 29))
    assert saturday_plan.total_pro_slots == 4
    assert [p["slot_id"] for p in saturday_plan.pro_slots] == ["PRO1", "PRO2", "NPRO1", "NPRO2"]
    assert [p["duty_num"] for p in saturday_plan.pro_slots] == [1, 32, 73, 74]

    sunday_plan = duties_for_date(date(2026, 8, 30))
    assert sunday_plan.total_pro_slots == 3
    assert [p["slot_id"] for p in sunday_plan.pro_slots] == ["PRO1", "PRO2", "NPRO"]
    assert [p["duty_num"] for p in sunday_plan.pro_slots] == [1, 31, 63]


def test_pr5_npro_night_cohort_and_pr4_day_pro_never_night():
    """
    NPRO is only assigned to night-cohort operators (PR5).
    PRO1/PRO2 are never assigned to night-block / adjacent operators (PR4).
    """
    target = date(2026, 8, 25)  # Tuesday (14 night running duties)
    night_ops = [
        OperatorInput(emp_id=88000 + i, name=f"NightOp{i}", is_night_cohort=True, solo_certified_from=date(2025, 1, 1))
        for i in range(16)  # 14 for running night + 1 for NPRO + 1 spare night
    ]
    day_ops = [
        OperatorInput(emp_id=88101, name="DayOp1", is_night_cohort=False, is_adjacent_to_night=False, solo_certified_from=date(2025, 1, 1), pro_last_date=date(2026, 7, 1)),
        OperatorInput(emp_id=88102, name="DayOp2", is_night_cohort=False, is_adjacent_to_night=False, solo_certified_from=date(2025, 1, 1), pro_last_date=date(2026, 7, 1)),
        OperatorInput(emp_id=88103, name="AdjacentOp", is_night_cohort=False, is_adjacent_to_night=True, solo_certified_from=date(2025, 1, 1), pro_last_date=date(2026, 7, 1)),
    ]
    # Extra day ops to ensure A and B bands don't starve PRO
    extra_day_ops = [
        OperatorInput(emp_id=88200 + i, name=f"ExtraDay{i}", is_night_cohort=False, solo_certified_from=date(2025, 1, 1), pro_last_date=date(2026, 8, 24))
        for i in range(15)
    ]

    res = assign_day(target, night_ops + day_ops + extra_day_ops)
    assigned_dict = {p.duty_id: p for p in res.assigned_pairs}

    # NPRO assigned to night cohort
    assert "NPRO" in assigned_dict
    npro_emp = next(o for o in night_ops + day_ops + extra_day_ops if o.emp_id == assigned_dict["NPRO"].emp_id)
    assert npro_emp.is_night_cohort is True

    # PRO1/PRO2 assigned to day operators, never adjacent
    assert "PRO1" in assigned_dict
    pro1_emp = next(o for o in night_ops + day_ops + extra_day_ops if o.emp_id == assigned_dict["PRO1"].emp_id)
    assert pro1_emp.is_night_cohort is False
    assert pro1_emp.is_adjacent_to_night is False

    assert "PRO2" in assigned_dict
    pro2_emp = next(o for o in night_ops + day_ops + extra_day_ops if o.emp_id == assigned_dict["PRO2"].emp_id)
    assert pro2_emp.is_night_cohort is False
    assert pro2_emp.is_adjacent_to_night is False


def test_pr3_no_pro_twice_within_7_days():
    """No operator gets PRO twice within any 7-day window."""
    target = date(2026, 8, 25)
    night_ops = [
        OperatorInput(emp_id=88000 + i, name=f"NightOp{i}", is_night_cohort=True, solo_certified_from=date(2025, 1, 1))
        for i in range(15)
    ]
    day_ops = [
        # Did PRO 5 days ago (should be rejected for PRO)
        OperatorInput(emp_id=88101, name="RecentPro", pro_last_date=date(2026, 8, 20), solo_certified_from=date(2025, 1, 1)),
        # Did PRO 10 days ago (eligible)
        OperatorInput(emp_id=88102, name="EligiblePro", pro_last_date=date(2026, 8, 15), solo_certified_from=date(2025, 1, 1)),
    ]
    extra_day = [
        OperatorInput(emp_id=88200 + i, name=f"ExtraDay{i}", is_night_cohort=False, solo_certified_from=date(2025, 1, 1), pro_last_date=date(2026, 8, 24))
        for i in range(15)
    ]

    res = assign_day(target, night_ops + day_ops + extra_day)
    pro_assigned = [p for p in res.assigned_pairs if p.duty_type == "PRO" and p.duty_id in ("PRO1", "PRO2")]
    assert all(p.emp_id != 88101 for p in pro_assigned)


def test_h28_solo_certified_gate():
    """A JMD TD with solo_certified_from > date or None is never assigned PRO."""
    target = date(2026, 8, 25)
    night_ops = [
        OperatorInput(emp_id=88000 + i, name=f"NightOp{i}", is_night_cohort=True, solo_certified_from=date(2025, 1, 1))
        for i in range(15)
    ]
    day_ops = [
        # Certified in the future
        OperatorInput(emp_id=88101, name="FutureCertified", solo_certified_from=date(2026, 9, 1), pro_last_date=date(2026, 7, 1)),
        # Not certified
        OperatorInput(emp_id=88102, name="Uncertified", solo_certified_from=None, pro_last_date=date(2026, 7, 1)),
        # Validly certified
        OperatorInput(emp_id=88103, name="Certified", solo_certified_from=date(2026, 1, 1), pro_last_date=date(2026, 7, 1)),
    ]
    extra_day = [
        OperatorInput(emp_id=88200 + i, name=f"ExtraDay{i}", is_night_cohort=False, solo_certified_from=date(2025, 1, 1), pro_last_date=date(2026, 8, 24))
        for i in range(15)
    ]

    res = assign_day(target, night_ops + day_ops + extra_day)
    pro_assigned = [p for p in res.assigned_pairs if p.duty_type == "PRO" and p.duty_id in ("PRO1", "PRO2")]
    for p in pro_assigned:
        assert p.emp_id == 88103


def test_pr2_rotational_queue_ordering():
    """
    PRO1/PRO2 selection follows days_since_last_pro DESC, pro_count_ytd ASC order.
    Assert with a fixture of operators with known histories.
    """
    target = date(2026, 8, 25)
    night_ops = [
        OperatorInput(emp_id=88000 + i, name=f"NightOp{i}", is_night_cohort=True, solo_certified_from=date(2025, 1, 1))
        for i in range(15)
    ]
    opA = OperatorInput(emp_id=88101, name="OpA", pro_last_date=date(2026, 8, 1), pro_count_ytd=5, solo_certified_from=date(2025, 1, 1))  # 24 days ago
    opB = OperatorInput(emp_id=88102, name="OpB", pro_last_date=date(2026, 7, 1), pro_count_ytd=3, solo_certified_from=date(2025, 1, 1))  # 55 days ago (should be 1st)
    opC = OperatorInput(emp_id=88103, name="OpC", pro_last_date=date(2026, 7, 1), pro_count_ytd=8, solo_certified_from=date(2025, 1, 1))  # 55 days ago, higher count (2nd)

    extra_day = [
        OperatorInput(emp_id=88200 + i, name=f"ExtraDay{i}", is_night_cohort=False, solo_certified_from=date(2025, 1, 1), pro_last_date=date(2026, 8, 24))
        for i in range(15)
    ]

    res = assign_day(target, night_ops + [opA, opB, opC] + extra_day)
    assigned_dict = {p.duty_id: p for p in res.assigned_pairs}

    assert assigned_dict["PRO1"].emp_id == 88102  # OpB (longest days_since_last_pro, lowest count)
    assert assigned_dict["PRO2"].emp_id == 88103  # OpC


# ─────────────────────────────────────────────────────────────────────────────
# 3. TGTP ROSTERED-OR CHECKS
# ─────────────────────────────────────────────────────────────────────────────
def test_tgtp_or_exact_fractions_and_location():
    """Both OR1 and OR2 filled; each is 8h; fractions match unmodified; location is TGTP."""
    monday_plan = duties_for_date(date(2026, 8, 24))
    or1 = next(o for o in monday_plan.or_slots if o["slot_id"] == "OR1")
    or2 = next(o for o in monday_plan.or_slots if o["slot_id"] == "OR2")

    assert or1["sign_on_loc"] == "TGTP"
    assert or1["duty_num"] == 2
    assert or1["sign_on_frac"] == 0.291667
    assert or1["sign_off_frac"] == 0.625000
    assert or1["duration_hours"] == 8.0

    assert or2["sign_on_loc"] == "TGTP"
    assert or2["duty_num"] == 42
    assert or2["sign_on_frac"] == 0.572917
    assert or2["sign_off_frac"] == 0.906250
    assert or2["duration_hours"] == 8.0


def test_or_candidate_order_fairness():
    """OR candidate order follows days_since_last_or DESC."""
    target = date(2026, 8, 25)
    # 15 night running operators
    night_ops = [
        OperatorInput(emp_id=100 + i, name=f"NightOp{i}", is_night_cohort=True, solo_certified_from=date(2025, 1, 1))
        for i in range(15)
    ]
    # 14 day running/PRO operators
    day_ops = [
        OperatorInput(emp_id=200 + i, name=f"DayOp{i}", solo_certified_from=date(2025, 1, 1), pro_last_date=date(2026, 7, 1), or_last_date=date(2026, 8, 10))
        for i in range(14)
    ]
    # Operators for OR testing (recent pro_last_date so they aren't taken for PRO)
    op_or1 = OperatorInput(emp_id=901, name="LongAgoOR", solo_certified_from=date(2025, 1, 1), pro_last_date=date(2026, 8, 23), or_last_date=date(2026, 5, 1))  # 116 days ago
    op_or2 = OperatorInput(emp_id=902, name="RecentOR", solo_certified_from=date(2025, 1, 1), pro_last_date=date(2026, 8, 23), or_last_date=date(2026, 8, 20))  # 5 days ago

    all_ops = night_ops + day_ops + [op_or2, op_or1]
    res = assign_day(target, all_ops)
    assigned_dict = {p.duty_id: p for p in res.assigned_pairs}

    assert assigned_dict["OR1"].emp_id == 901
    assert assigned_dict["OR1"].sign_on_loc == "TGTP"


# ─────────────────────────────────────────────────────────────────────────────
# 4. ORDERING & SHORTAGE PROTECTION CHECKS
# ─────────────────────────────────────────────────────────────────────────────
def test_shortage_running_duty_never_dropped_for_pro_or():
    """
    When operators < running duties: unfilled running duties are returned as a blocking shortage
    and is_publishable is False. A running duty is never dropped to fill PRO or OR.
    """
    target = date(2026, 8, 25)  # 26 running duties
    # Supply only 10 operators
    ops = [
        OperatorInput(emp_id=88000 + i, name=f"Op{i}", solo_certified_from=date(2025, 1, 1))
        for i in range(10)
    ]

    res = assign_day(target, ops)
    assert res.is_publishable is False
    assert len(res.unfilled_running_duties) > 0
    # All 10 operators must be assigned to running duties, NOT PRO/OR
    assert len(res.assigned_pairs) == 10
    assert all(p.duty_type == "RUNNING" for p in res.assigned_pairs)


def test_pro_or_shortage_emits_warning():
    """When PRO/OR can't be filled after running duties, they return as warnings, not blocking errors."""
    target = date(2026, 8, 25)  # 26 running duties + 3 PRO + 2 OR = 31 total
    # Supply exactly 26 operators (14 night + 12 day) -> satisfies 100% running duties
    night_ops = [
        OperatorInput(emp_id=88000 + i, name=f"NightOp{i}", is_night_cohort=True, solo_certified_from=date(2025, 1, 1))
        for i in range(14)
    ]
    day_ops = [
        OperatorInput(emp_id=88100 + i, name=f"DayOp{i}", is_night_cohort=False, solo_certified_from=date(2025, 1, 1))
        for i in range(12)
    ]

    res = assign_day(target, night_ops + day_ops)
    assert res.is_publishable is True  # Running duties are 100% satisfied
    assert len(res.unfilled_running_duties) == 0
    assert len(res.unfilled_pro_or_slots) == 5  # 3 PRO + 2 OR unfilled
    assert len(res.warnings) >= 5


# ─────────────────────────────────────────────────────────────────────────────
# 5. DATA-DRIVEN CONFIGURATION CHECK
# ─────────────────────────────────────────────────────────────────────────────
def test_data_driven_config_change():
    """Modifying configuration updates the API response dynamically without code changes."""
    original_val = TGTP_OR_SLOTS_CONFIG[DayType.WEEKDAY][0].sign_on_frac
    try:
        # Simulate an editable config update
        TGTP_OR_SLOTS_CONFIG[DayType.WEEKDAY][0] = OrSlotDef(
            slot_id="OR1", duty_num=2, sign_on_frac=0.300000, sign_off_frac=0.633333, sign_on_loc="TGTP"
        )
        plan = duties_for_date(date(2026, 8, 25))
        or1 = next(o for o in plan.or_slots if o["slot_id"] == "OR1")
        assert or1["sign_on_frac"] == 0.300000
    finally:
        # Restore original seed configuration
        TGTP_OR_SLOTS_CONFIG[DayType.WEEKDAY][0] = OrSlotDef(
            slot_id="OR1", duty_num=2, sign_on_frac=original_val, sign_off_frac=0.625000, sign_on_loc="TGTP"
        )


# ─────────────────────────────────────────────────────────────────────────────
# 6. REST API ENDPOINTS CHECKS
# ─────────────────────────────────────────────────────────────────────────────
client = TestClient(app)


def test_api_get_plan():
    response = client.get("/api/v1/roster/plan?date=2026-08-25")
    assert response.status_code == 200
    data = response.json()
    assert data["day_type"] == "WEEKDAY"
    assert data["total_running_duties"] == 26
    assert data["total_pro_slots"] == 3
    assert data["total_or_slots"] == 2
    assert "N70" in data["running_duty_ids"]


def test_api_post_assign():
    ops_payload = [
        {
            "emp_id": 88000 + i,
            "name": f"Operator_{i}",
            "solo_certified_from": "2025-01-01",
            "is_night_cohort": i < 15,
            "pro_last_date": "2026-07-01",
            "pro_count_ytd": 0
        }
        for i in range(35)
    ]

    payload = {
        "target_date": "2026-08-25",
        "operators": ops_payload,
        "is_public_holiday": False
    }

    response = client.post("/api/v1/roster/assign", json=payload)
    if response.status_code != 200:
        print("API ERROR DETAIL:", response.json())
    assert response.status_code == 200
    data = response.json()
    assert data["is_publishable"] is True
    assert len(data["assigned_pairs"]) == 31  # 26 running + 3 PRO + 2 OR
    assert len(data["spare_operators"]) == 4
