
const {onRequest} = require("firebase-functions/v2/https");
const {setGlobalOptions, logger} = require("firebase-functions/v2");
const {defineSecret} = require("firebase-functions/params");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const {getStorage} = require("firebase-admin/storage");
const crypto = require("crypto");

initializeApp();
const db = getFirestore();
const rosterBucket = getStorage().bucket();
setGlobalOptions({maxInstances: 10, region: "asia-south1"});

const ROSTER_AGENT_TOKEN = defineSecret("PYIDCC_ROSTER_AGENT_TOKEN");
const ALLOWED_ROOT = "E:\\1) Rosters\\";
const MAX_FILE_BYTES = 7 * 1024 * 1024;

const normalizeDutyId = (value) => {
  const s = String(value ?? "").trim();
  return /^[1-9]$/.test(s) ? "0" + s : s;
};

const scheduleTypeForDate = (dateString) => {
  const d = new Date(dateString + "T00:00:00Z");
  const day = d.getUTCDay();
  if (day === 0) return "SUNDAY";
  if (day === 1) return "MONDAY";
  if (day === 6) return "SATURDAY";
  return "WEEKDAY";
};

const safeTokenEqual = (a, b) => {
  if (!a || !b) return false;
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
};

const allowedExtension = (name) => /\.(xlsb|xlsx|xls|csv)$/i.test(String(name || ""));

const chunk = (items, size) => {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

exports.apiHealthCheck = onRequest((req, res) => {
  res.status(200).json({
    status: "ok",
    service: "pyidcc-cloud-functions",
    system: "BMRCL Line 2 Peenya Industry Depot Crew Control",
    timestamp: new Date().toISOString(),
  });
});

exports.syncRosterFromAgent = onRequest(
  {
    cors: false,
    invoker: "public",
    secrets: [ROSTER_AGENT_TOKEN],
    timeoutSeconds: 120,
    memory: "512MiB",
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ok: false, error: "POST required"});
      return;
    }

    if (!safeTokenEqual(req.get("x-pyidcc-agent-token"), ROSTER_AGENT_TOKEN.value())) {
      res.status(401).json({ok: false, error: "Unauthorized roster agent"});
      return;
    }

    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch (_) {
        res.status(400).json({ok: false, error: "Invalid JSON body"});
        return;
      }
    }

    const metadata = body?.metadata || {};
    const duties = Array.isArray(body?.duties) ? body.duties : [];
    const originalFile = body?.originalFile || {};
    const selectedDate = String(metadata.selectedDate || "").trim();
    const sourcePath = String(metadata.sourcePath || "").trim();
    const fileName = String(originalFile.name || metadata.fileName || "").trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) {
      res.status(400).json({ok: false, error: "Invalid selectedDate"});
      return;
    }

    const expectedSchedule = scheduleTypeForDate(selectedDate);
    const scheduleType = String(metadata.scheduleType || expectedSchedule).toUpperCase();

    if (scheduleType !== expectedSchedule) {
      res.status(400).json({
        ok: false,
        error: "Schedule mismatch: expected " + expectedSchedule + ", received " + scheduleType,
      });
      return;
    }

    if (!sourcePath.toLowerCase().startsWith(ALLOWED_ROOT.toLowerCase())) {
      res.status(400).json({ok: false, error: "Source must be under " + ALLOWED_ROOT});
      return;
    }

    if (!allowedExtension(fileName)) {
      res.status(400).json({ok: false, error: "Roster file must be XLSB/XLSX/XLS/CSV"});
      return;
    }

    if (!duties.length || duties.length > 1000) {
      res.status(400).json({ok: false, error: "Roster duty count is invalid"});
      return;
    }

    const cleanDuties = duties
      .map((row) => ({
        dutyNo: normalizeDutyId(row.dutyNo || row.dutyId),
        employeeId: String(row.employeeId || row.empId || "").trim(),
        name: String(row.name || row.empName || "").trim(),
        isShortLoop: Boolean(row.isShortLoop),
        trainId: Number.isFinite(Number(row.trainId)) ? Number(row.trainId) : null,
      }))
      .filter((row) => row.dutyNo && (row.employeeId || row.name));

    if (!cleanDuties.length) {
      res.status(400).json({ok: false, error: "No usable duty records"});
      return;
    }

    let fileBuffer = null;
    let sha256 = String(metadata.sha256 || "").trim();

    if (originalFile.base64) {
      fileBuffer = Buffer.from(String(originalFile.base64), "base64");

      if (fileBuffer.length > MAX_FILE_BYTES) {
        res.status(413).json({ok: false, error: "Roster file exceeds 7 MB limit"});
        return;
      }

      const calculatedHash = crypto.createHash("sha256").update(fileBuffer).digest("hex");

      if (sha256 && sha256 !== calculatedHash) {
        res.status(400).json({ok: false, error: "Roster file SHA-256 mismatch"});
        return;
      }

      sha256 = calculatedHash;
    }

    if (!sha256) {
      sha256 = crypto
        .createHash("sha256")
        .update(JSON.stringify({selectedDate, scheduleType, cleanDuties}))
        .digest("hex");
    }

    const historyId = selectedDate + "_" + sha256.slice(0, 32);
    const historyRef = db.collection("roster_deployment_history").doc(historyId);
    const existing = await historyRef.get();

    if (existing.exists && existing.data()?.status === "DEPLOYED") {
      await db.collection("roster_automation_status").doc("gcc").set({
        status: "ALREADY_DEPLOYED",
        selectedDate,
        scheduleType,
        sourcePath,
        fileName,
        sha256,
        dutyCount: cleanDuties.length,
        lastSyncAt: FieldValue.serverTimestamp(),
        agentId: String(metadata.agentId || "GCC-PC"),
      }, {merge: true});

      res.status(200).json({
        ok: true,
        status: "ALREADY_DEPLOYED",
        selectedDate,
        scheduleType,
        dutyCount: cleanDuties.length,
      });
      return;
    }

    await db.collection("roster_automation_status").doc("gcc").set({
      status: "PROCESSING",
      selectedDate,
      scheduleType,
      sourcePath,
      fileName,
      sha256,
      dutyCount: cleanDuties.length,
      startedAt: FieldValue.serverTimestamp(),
      agentId: String(metadata.agentId || "GCC-PC"),
    }, {merge: true});

    try {
      const linksSnapshot = await db.collection("crew_final_links")
        .where("scheduleType", "==", scheduleType)
        .get();

      const linksMap = {};

      linksSnapshot.docs.forEach((snap) => {
        const data = snap.data();
        const dutyId = normalizeDutyId(data.dutyId);
        const trains = [
          data.trainId,
          data.leg2TrainNo,
          data.leg3TrainNo,
          data.leg4TrainNo,
        ]
          .map((v) => Number(v))
          .filter((v) => Number.isFinite(v) && v >= 201 && v <= 250);

        linksMap[dutyId] = [...new Set(trains)];
      });

      const operations = [];

      for (const row of cleanDuties) {
        const deploymentId =
          "gcc_deploy_" + scheduleType.toLowerCase() + "_duty_" + row.dutyNo;

        operations.push({
          ref: db.collection("crew_daily_deployment").doc(deploymentId),
          data: {
            scheduleType,
            dutyId: row.dutyNo,
            empId: row.employeeId,
            empName: row.name,
            remarks: "GCC Automatic E-Drive Roster",
            rosterDate: selectedDate,
            rosterSourceFile: fileName,
            rosterSha256: sha256,
            source: "GCC_ROSTER_AGENT",
            lastUpdated: FieldValue.serverTimestamp(),
          },
        });

        let targetTrains = [];

        if (row.trainId && row.trainId >= 201 && row.trainId <= 250) {
          targetTrains = [row.trainId];
        } else {
          targetTrains = linksMap[row.dutyNo] || [];
        }

        for (const trainId of [...new Set(targetTrains)]) {
          operations.push({
            ref: db.collection("daily_crew_tracks").doc(selectedDate + "_" + trainId),
            data: {
              date: selectedDate,
              trainId,
              isShortLoopActive: row.isShortLoop,
              currentOperator: {
                employeeId: row.employeeId,
                name: row.name,
                dutyNumber: row.dutyNo,
              },
              rosterSource: "GCC_ROSTER_AGENT",
              rosterFile: fileName,
              rosterSha256: sha256,
              lastUpdated: FieldValue.serverTimestamp(),
            },
          });
        }
      }

      for (const group of chunk(operations, 450)) {
        const batch = db.batch();
        for (const operation of group) {
          batch.set(operation.ref, operation.data, {merge: true});
        }
        await batch.commit();
      }

      if (fileBuffer) {
        const storagePath =
          "rosters/" +
          selectedDate.slice(0, 4) + "/" +
          selectedDate.slice(5, 7) + "/" +
          selectedDate.slice(8, 10) + "/" +
          fileName.replace(/[^a-zA-Z0-9._ -]/g, "_");

        await rosterBucket.file(storagePath).save(fileBuffer, {
          resumable: false,
          metadata: {
            contentType: fileName.toLowerCase().endsWith(".xlsb")
              ? "application/vnd.ms-excel.sheet.binary.macroEnabled.12"
              : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            metadata: {
              rosterDate: selectedDate,
              scheduleType,
              sha256,
              sourcePath,
              agentId: String(metadata.agentId || "GCC-PC"),
            },
          },
        });
      }

      const deploymentWrites = operations.filter((x) =>
        x.ref.path.startsWith("crew_daily_deployment/")
      ).length;

      const trackWrites = operations.filter((x) =>
        x.ref.path.startsWith("daily_crew_tracks/")
      ).length;

      await historyRef.set({
        status: "DEPLOYED",
        selectedDate,
        scheduleType,
        sourcePath,
        fileName,
        sha256,
        dutyCount: cleanDuties.length,
        deploymentWrites,
        trackWrites,
        agentId: String(metadata.agentId || "GCC-PC"),
        machineName: String(metadata.machineName || ""),
        deployedAt: FieldValue.serverTimestamp(),
      });

      await db.collection("roster_automation_status").doc("gcc").set({
        status: "DEPLOYED",
        selectedDate,
        scheduleType,
        sourcePath,
        fileName,
        sha256,
        dutyCount: cleanDuties.length,
        deploymentWrites,
        trackWrites,
        lastSyncAt: FieldValue.serverTimestamp(),
        agentId: String(metadata.agentId || "GCC-PC"),
        machineName: String(metadata.machineName || ""),
      }, {merge: true});

      res.status(200).json({
        ok: true,
        status: "DEPLOYED",
        selectedDate,
        scheduleType,
        dutyCount: cleanDuties.length,
        deploymentWrites,
        trackWrites,
      });
    } catch (error) {
      logger.error("Automatic roster deployment failed", error);

      await db.collection("roster_automation_status").doc("gcc").set({
        status: "ERROR",
        selectedDate,
        scheduleType,
        sourcePath,
        fileName,
        sha256,
        error: String(error?.message || error),
        lastErrorAt: FieldValue.serverTimestamp(),
      }, {merge: true});

      res.status(500).json({
        ok: false,
        status: "ERROR",
        error: String(error?.message || error),
      });
    }
  }
);
