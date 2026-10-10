import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatOperationalDate,
  calculateDefaultDayType,
  getDeploymentId,
  checkDeploymentExists,
  executeDeployment,
  getDeploymentRoster,
  getDeploymentHistory,
  validateDeploymentContext,
  executeChangeoverWorkflow,
  createMockFirestore,
} from "./src/services/deploymentService.js";

describe("DISPATCH GATEWAY CORE — Date-Wise Deployment Architecture Test Suite", () => {
  const mockDb = createMockFirestore();

  // Test data rosters
  const roster29Sep = {
    date: "2026-09-29",
    dayType: "WEEKDAY",
    duties: [
      { dutyId: "01", empId: "BMRCL-101", empName: "Ramesh Kumar" },
      { dutyId: "02", empId: "BMRCL-102", empName: "Suresh Gowda" },
    ],
    metadata: { totalDuties: 2, totalTrainCrew: 4 },
  };

  const roster30Sep = {
    date: "2026-09-30",
    dayType: "WEEKDAY",
    duties: [
      { dutyId: "01", empId: "BMRCL-201", empName: "Anil Patil" },
      { dutyId: "02", empId: "BMRCL-202", empName: "Sunil Rao" },
    ],
    metadata: { totalDuties: 2, totalTrainCrew: 4 },
  };

  const roster01Oct = {
    date: "2026-10-01",
    dayType: "WEEKDAY",
    duties: [
      { dutyId: "01", empId: "BMRCL-301", empName: "Vijay Hegde" },
      { dutyId: "02", empId: "BMRCL-302", empName: "Kiran Nayak" },
    ],
    metadata: { totalDuties: 2, totalTrainCrew: 4 },
  };

  it("TEST 1: Deploy 29-09-2026 as WEEKDAY. Verify 2026-09-29_WEEKDAY exists.", async () => {
    const result = await executeDeployment(
      {
        deploymentDate: "2026-09-29",
        dayType: "WEEKDAY",
        rosterData: roster29Sep,
        sourceFile: "Green_Line_Roster_29_Sep_2026.xlsx",
        user: "CrewController_01",
      },
      mockDb
    );

    assert.equal(result.success, true);
    assert.equal(result.deploymentId, "2026-09-29_WEEKDAY");
    assert.equal(result.version, 1);

    const check = await checkDeploymentExists("2026-09-29", "WEEKDAY", mockDb);
    assert.equal(check.exists, true);
    assert.equal(check.data.deploymentId, "2026-09-29_WEEKDAY");
    assert.equal(check.data.version, 1);
    assert.equal(check.data.rosterData.duties[0].empName, "Ramesh Kumar");
  });

  it("TEST 2: Deploy 30-09-2026 as WEEKDAY. Verify 2026-09-30_WEEKDAY exists and 2026-09-29_WEEKDAY remains completely unchanged.", async () => {
    const original29 = await getDeploymentRoster(
      { deploymentDate: "2026-09-29", dayType: "WEEKDAY" },
      mockDb
    );

    const result = await executeDeployment(
      {
        deploymentDate: "2026-09-30",
        dayType: "WEEKDAY",
        rosterData: roster30Sep,
        sourceFile: "Green_Line_Roster_30_Sep_2026.xlsx",
        user: "CrewController_01",
      },
      mockDb
    );

    assert.equal(result.success, true);
    assert.equal(result.deploymentId, "2026-09-30_WEEKDAY");
    assert.equal(result.version, 1);

    // Verify 30-09-2026 exists
    const check30 = await checkDeploymentExists("2026-09-30", "WEEKDAY", mockDb);
    assert.equal(check30.exists, true);
    assert.equal(check30.data.deploymentId, "2026-09-30_WEEKDAY");
    assert.equal(check30.data.rosterData.duties[0].empName, "Anil Patil");

    // Verify 29-09-2026 is completely unchanged
    const current29 = await getDeploymentRoster(
      { deploymentDate: "2026-09-29", dayType: "WEEKDAY" },
      mockDb
    );
    assert.equal(current29.deploymentId, "2026-09-29_WEEKDAY");
    assert.equal(current29.version, 1);
    assert.equal(current29.rosterData.duties[0].empName, "Ramesh Kumar");
    assert.deepEqual(current29.rosterData, original29.rosterData);
  });

  it("TEST 3: Deploy 01-10-2026 as WEEKDAY. Verify all three (2026-09-29_WEEKDAY, 2026-09-30_WEEKDAY, 2026-10-01_WEEKDAY) coexist independently.", async () => {
    const result = await executeDeployment(
      {
        deploymentDate: "2026-10-01",
        dayType: "WEEKDAY",
        rosterData: roster01Oct,
        sourceFile: "Green_Line_Roster_01_Oct_2026.xlsx",
        user: "CrewController_01",
      },
      mockDb
    );

    assert.equal(result.success, true);
    assert.equal(result.deploymentId, "2026-10-01_WEEKDAY");

    // Verify all 3 coexist
    const d29 = await getDeploymentRoster({ deploymentDate: "2026-09-29", dayType: "WEEKDAY" }, mockDb);
    const d30 = await getDeploymentRoster({ deploymentDate: "2026-09-30", dayType: "WEEKDAY" }, mockDb);
    const d01 = await getDeploymentRoster({ deploymentDate: "2026-10-01", dayType: "WEEKDAY" }, mockDb);

    assert.equal(d29.deploymentId, "2026-09-29_WEEKDAY");
    assert.equal(d30.deploymentId, "2026-09-30_WEEKDAY");
    assert.equal(d01.deploymentId, "2026-10-01_WEEKDAY");

    assert.equal(d29.rosterData.duties[0].empName, "Ramesh Kumar");
    assert.equal(d30.rosterData.duties[0].empName, "Anil Patil");
    assert.equal(d01.rosterData.duties[0].empName, "Vijay Hegde");
  });

  it("TEST 4: Redeploy 30-09-2026 WEEKDAY. Verify version increments (version: 2) while 2026-09-29_WEEKDAY is untouched.", async () => {
    // Attempting redeploy without forceReplace should throw confirmation error
    await assert.rejects(
      async () => {
        await executeDeployment(
          {
            deploymentDate: "2026-09-30",
            dayType: "WEEKDAY",
            rosterData: roster30Sep,
            forceReplace: false,
          },
          mockDb
        );
      },
      /DEPLOYMENT_EXISTS_CONFIRMATION_REQUIRED:2026-09-30:WEEKDAY/
    );

    // Redeploy with forceReplace: true
    const updatedRoster30 = {
      ...roster30Sep,
      duties: [
        { dutyId: "01", empId: "BMRCL-201", empName: "Anil Patil (Updated Shift)" },
        { dutyId: "02", empId: "BMRCL-202", empName: "Sunil Rao" },
      ],
    };

    const result = await executeDeployment(
      {
        deploymentDate: "2026-09-30",
        dayType: "WEEKDAY",
        rosterData: updatedRoster30,
        sourceFile: "Green_Line_Roster_30_Sep_2026_Rev2.xlsx",
        forceReplace: true,
      },
      mockDb
    );

    assert.equal(result.success, true);
    assert.equal(result.version, 2);

    const d30 = await getDeploymentRoster({ deploymentDate: "2026-09-30", dayType: "WEEKDAY" }, mockDb);
    assert.equal(d30.version, 2);
    assert.equal(d30.rosterData.duties[0].empName, "Anil Patil (Updated Shift)");

    // Verify 29-09-2026 remains untouched with version 1
    const d29 = await getDeploymentRoster({ deploymentDate: "2026-09-29", dayType: "WEEKDAY" }, mockDb);
    assert.equal(d29.version, 1);
    assert.equal(d29.rosterData.duties[0].empName, "Ramesh Kumar");
  });

  it("TEST 5 & 6: Select 29-09-2026 and 30-09-2026 alternately. Verify each date loads its own unique roster data.", async () => {
    // Select 29-09-2026
    const selection1 = await getDeploymentRoster({ deploymentDate: "2026-09-29", dayType: "WEEKDAY" }, mockDb);
    assert.equal(selection1.deploymentDate, "2026-09-29");
    assert.equal(selection1.deploymentId, "2026-09-29_WEEKDAY");
    assert.equal(selection1.rosterData.duties[0].empName, "Ramesh Kumar");

    // Select 30-09-2026
    const selection2 = await getDeploymentRoster({ deploymentDate: "2026-09-30", dayType: "WEEKDAY" }, mockDb);
    assert.equal(selection2.deploymentDate, "2026-09-30");
    assert.equal(selection2.deploymentId, "2026-09-30_WEEKDAY");
    assert.equal(selection2.rosterData.duties[0].empName, "Anil Patil (Updated Shift)");

    // Alternate back to 29-09-2026
    const selection3 = await getDeploymentRoster({ deploymentDate: "2026-09-29", dayType: "WEEKDAY" }, mockDb);
    assert.equal(selection3.deploymentDate, "2026-09-29");
    assert.equal(selection3.rosterData.duties[0].empName, "Ramesh Kumar");

    // Alternate back to 30-09-2026
    const selection4 = await getDeploymentRoster({ deploymentDate: "2026-09-30", dayType: "WEEKDAY" }, mockDb);
    assert.equal(selection4.deploymentDate, "2026-09-30");
    assert.equal(selection4.rosterData.duties[0].empName, "Anil Patil (Updated Shift)");

    // Verify neither overwrote the other
    assert.notEqual(selection3.deploymentId, selection4.deploymentId);
    assert.notDeepEqual(selection3.rosterData, selection4.rosterData);
  });

  it("TEST 7 & 8: Execute changeover for 30-09-2026 and verify it operates exclusively against 2026-09-30_WEEKDAY without falling back to any other date.", async () => {
    // TEST 7: Valid changeover for 2026-09-30
    const changeoverResult = await executeChangeoverWorkflow("2026-09-30", "WEEKDAY", {}, mockDb);
    assert.equal(changeoverResult.success, true);
    assert.equal(changeoverResult.deploymentId, "2026-09-30_WEEKDAY");
    assert.equal(changeoverResult.roster.deploymentDate, "2026-09-30");
    assert.equal(changeoverResult.roster.rosterData.duties[0].empName, "Anil Patil (Updated Shift)");

    // TEST 8: Mismatch prevention guard verifies loaded roster matches target date
    const roster29 = await getDeploymentRoster({ deploymentDate: "2026-09-29", dayType: "WEEKDAY" }, mockDb);

    // Attempting to validate context for 2026-09-30 with 2026-09-29 roster must throw mismatch error
    assert.throws(
      () => {
        validateDeploymentContext("2026-09-30", roster29);
      },
      (err) => {
        return (
          err.message.includes("DEPLOYMENT DATE MISMATCH") &&
          err.message.includes("Selected deployment: 2026-09-30") &&
          err.message.includes("Loaded roster: 2026-09-29")
        );
      }
    );

    // Validating context with matching roster passes
    const roster30 = await getDeploymentRoster({ deploymentDate: "2026-09-30", dayType: "WEEKDAY" }, mockDb);
    assert.equal(validateDeploymentContext("2026-09-30", roster30), true);
  });

  it("TEST 9: Day type computation accurately identifies MONDAY and SUNDAY.", () => {
    // 2026-09-28 is Monday
    assert.equal(calculateDefaultDayType("2026-09-28"), "MONDAY");
    // 2026-09-27 is Sunday
    assert.equal(calculateDefaultDayType("2026-09-27"), "SUNDAY");
    // 2026-10-03 is Saturday
    assert.equal(calculateDefaultDayType("2026-10-03"), "SATURDAY");
    // 2026-09-29 is Tuesday (Weekday)
    assert.equal(calculateDefaultDayType("2026-09-29"), "WEEKDAY");
  });

  it("TEST 10: Verify date-isolated deletion preserves other deployment dates.", async () => {
    // Both 29-Sep and 30-Sep deployments exist in mockDb
    const dep29 = await getDeploymentRoster({ deploymentDate: "2026-09-29", dayType: "WEEKDAY" }, mockDb);
    const dep30 = await getDeploymentRoster({ deploymentDate: "2026-09-30", dayType: "WEEKDAY" }, mockDb);
    assert.ok(dep29.rosterData);
    assert.ok(dep30.rosterData);

    // Simulate date-specific deletion of 2026-09-30_WEEKDAY
    const depMap = mockDb._collections.get("dispatch_deployments");
    depMap.delete("2026-09-30_WEEKDAY");

    // 2026-09-29_WEEKDAY is untouched and still exists
    const check29 = await checkDeploymentExists("2026-09-29", "WEEKDAY", mockDb);
    assert.equal(check29.exists, true);
    assert.equal(check29.data.rosterData.duties[0].empName, "Ramesh Kumar");

    // 2026-09-30_WEEKDAY is gone
    const check30 = await checkDeploymentExists("2026-09-30", "WEEKDAY", mockDb);
    assert.equal(check30.exists, false);
  });

  it("TEST 11: Independent views & change isolation for 30-09-2026 vs 01-10-2026 rosters", async () => {
    // 1. Deploy 30-09-2026 (Wednesday): Duty 1 = Harsha SG, Duty 2 = Vinod Biebavi
    await executeDeployment(
      {
        deploymentDate: "2026-09-30",
        dayType: "WEEKDAY",
        rosterData: {
          date: "2026-09-30",
          dayType: "WEEKDAY",
          duties: [
            { dutyId: "01", empId: "88000118", empName: "Harsha SG", status: "ACTIVE" },
            { dutyId: "02", empId: "88000116", empName: "Vinod Biebavi", status: "ACTIVE" },
          ],
        },
        sourceFile: "30 September 2026 Wednesday.xlsx",
        forceReplace: true,
      },
      mockDb
    );

    // 2. Deploy 01-10-2026 (Thursday): Duty 1 = Mahesh S, Duty 2 = Baskar S
    await executeDeployment(
      {
        deploymentDate: "2026-10-01",
        dayType: "WEEKDAY",
        rosterData: {
          date: "2026-10-01",
          dayType: "WEEKDAY",
          duties: [
            { dutyId: "01", empId: "88000110", empName: "Mahesh S", status: "ACTIVE" },
            { dutyId: "02", empId: "20787", empName: "Baskar S", status: "ACTIVE" },
          ],
        },
        sourceFile: "01 October 2026 Thursday.xlsx",
        forceReplace: true,
      },
      mockDb
    );

    // Verify 30-09-2026 has its own data
    const view30 = await getDeploymentRoster({ deploymentDate: "2026-09-30", dayType: "WEEKDAY" }, mockDb);
    assert.equal(view30.rosterData.duties[0].empName, "Harsha SG");
    assert.equal(view30.rosterData.duties[1].empName, "Vinod Biebavi");

    // Verify 01-10-2026 has its own data
    const view01 = await getDeploymentRoster({ deploymentDate: "2026-10-01", dayType: "WEEKDAY" }, mockDb);
    assert.equal(view01.rosterData.duties[0].empName, "Mahesh S");
    assert.equal(view01.rosterData.duties[1].empName, "Baskar S");

    // 3. Make a change on 01-10-2026: Swap Duty 1 and Duty 2 on 01-Oct
    await executeDeployment(
      {
        deploymentDate: "2026-10-01",
        dayType: "WEEKDAY",
        rosterData: {
          date: "2026-10-01",
          dayType: "WEEKDAY",
          duties: [
            { dutyId: "01", empId: "20787", empName: "Baskar S", status: "SWAPPED_BY_CC" },
            { dutyId: "02", empId: "88000110", empName: "Mahesh S", status: "SWAPPED_BY_CC" },
          ],
        },
        sourceFile: "01 October 2026 Thursday.xlsx",
        forceReplace: true,
      },
      mockDb
    );

    // Verify 01-10-2026 reflects the swap
    const updated01 = await getDeploymentRoster({ deploymentDate: "2026-10-01", dayType: "WEEKDAY" }, mockDb);
    assert.equal(updated01.rosterData.duties[0].empName, "Baskar S");
    assert.equal(updated01.rosterData.duties[1].empName, "Mahesh S");

    // CRITICAL: Verify 30-09-2026 is completely UNTOUCHED
    const untouched30 = await getDeploymentRoster({ deploymentDate: "2026-09-30", dayType: "WEEKDAY" }, mockDb);
    assert.equal(untouched30.rosterData.duties[0].empName, "Harsha SG");
    assert.equal(untouched30.rosterData.duties[1].empName, "Vinod Biebavi");
  });

  it("TEST 12: Reset/Clear 01-10-2026 roster. Verify 30-09-2026 (same dayType WEEKDAY) is completely preserved.", async () => {
    // 1. Perform clear on 01-10-2026
    const targetDate = "2026-10-01";
    const targetSched = "WEEKDAY";

    // Simulate date-isolated deletion
    const depMap = mockDb._collections.get("dispatch_deployments");
    if (depMap) {
      depMap.delete(`${targetDate}_${targetSched}`);
    }

    // Verify 01-10-2026 is gone
    const check01 = await checkDeploymentExists(targetDate, targetSched, mockDb);
    assert.equal(check01.exists, false, "01-10-2026 should be cleared");

    // Verify 30-09-2026 STILL exists and is intact
    const check30 = await checkDeploymentExists("2026-09-30", "WEEKDAY", mockDb);
    assert.equal(check30.exists, true, "30-09-2026 must remain completely intact despite same WEEKDAY dayType");

    const roster30 = await getDeploymentRoster({ deploymentDate: "2026-09-30", dayType: "WEEKDAY" }, mockDb);
    assert.equal(roster30.rosterData.duties[0].empName, "Harsha SG");
    assert.equal(roster30.rosterData.duties[1].empName, "Vinod Biebavi");
  });
});

