"""
FastAPI REST API for BMRCL PYIDCC Duty-Assignment System.
Endpoints:
- GET /api/v1/roster/plan?date=YYYY-MM-DD
- POST /api/v1/roster/assign
"""

import json
from contextlib import asynccontextmanager
from datetime import date as DateType
from typing import Optional
from fastapi import FastAPI, Depends, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from .models import (
    DayPlanResponse,
    AssignmentResponse,
    AssignRosterRequest,
    RosterAssignmentLogDB
)
from .engine import (
    duties_for_date,
    assign_day,
    resolve_day_type
)
from .database import get_db, init_db


# Ensure database tables exist
init_db()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="BMRCL PYIDCC Roster Duty-Assignment API",
    version="1.0.0",
    description="Automated server-authoritative duty assignment for JMD TD running sets, PRO, and TGTP OR slots.",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {
        "system": "BMRCL PYIDCC Roster API",
        "status": "OPERATIONAL",
        "docs_url": "/docs"
    }


@app.get("/api/v1/roster/plan", response_model=DayPlanResponse, tags=["Roster Plan"])
def get_roster_plan(
    date: DateType = Query(..., description="Target date in YYYY-MM-DD format"),
    is_public_holiday: bool = Query(False, description="Whether the date is designated as a Public Holiday")
):
    """
    Returns the server-authoritative day type, JMD TD running duty ids, PRO slots,
    and TGTP OR slots (with exact day-fraction times).
    """
    try:
        return duties_for_date(date, is_public_holiday=is_public_holiday)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to generate day plan for {date}: {str(e)}"
        )


@app.post("/api/v1/roster/assign", response_model=AssignmentResponse, tags=["Roster Assignment"])
def post_roster_assign(
    request: AssignRosterRequest,
    db: Session = Depends(get_db)
):
    """
    Performs server-authoritative, deterministic assignment of JMD TD running duties,
    PRO slots, and TGTP OR slots for the given date.
    Records audit log in database.
    """
    try:
        result = assign_day(
            target_date=request.target_date,
            operators=request.operators,
            is_public_holiday=request.is_public_holiday,
            assigned_by=request.assigned_by
        )

        # JSON-safe audit logging
        log_entry = RosterAssignmentLogDB(
            target_date=result.target_date,
            day_type=result.day_type,
            assigned_by=result.assigned_by,
            assigned_at=result.assigned_at,
            is_publishable=result.is_publishable,
            assigned_pairs=json.loads(json.dumps([p.model_dump() for p in result.assigned_pairs], default=str)),
            unfilled_running=json.loads(json.dumps([u.model_dump() for u in result.unfilled_running_duties], default=str)),
            unfilled_pro_or=json.loads(json.dumps([u.model_dump() for u in result.unfilled_pro_or_slots], default=str)),
            spare_operators=json.loads(json.dumps([s.model_dump() for s in result.spare_operators], default=str)),
            warnings=result.warnings
        )
        db.add(log_entry)
        db.commit()

        return result
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Roster assignment failed for date {request.target_date}: {str(e)}"
        )
