import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
} from "firebase/firestore";
import { db } from "../firebase.js";

/**
 * Creates an in-memory mock store for automated unit testing (deployment.test.js)
 */
export function createMockFirestore() {
  const collections = new Map();

  const getCollectionMap = (colName) => {
    if (!collections.has(colName)) {
      collections.set(colName, new Map());
    }
    return collections.get(colName);
  };

  return {
    __isMock: true,
    _collections: collections,
    getDoc: async (docRef) => {
      const colMap = getCollectionMap(docRef.collection);
      const data = colMap.get(docRef.id);
      return {
        exists: () => data !== undefined,
        data: () => (data ? JSON.parse(JSON.stringify(data)) : null),
        id: docRef.id,
      };
    },
    setDoc: async (docRef, data, options = {}) => {
      const colMap = getCollectionMap(docRef.collection);
      if (options.merge && colMap.has(docRef.id)) {
        colMap.set(docRef.id, {
          ...colMap.get(docRef.id),
          ...JSON.parse(JSON.stringify(data)),
        });
      } else {
        colMap.set(docRef.id, JSON.parse(JSON.stringify(data)));
      }
    },
    addDoc: async (colRef, data) => {
      const colMap = getCollectionMap(colRef.collection);
      const autoId = "mock_" + Math.random().toString(36).substring(2, 9);
      colMap.set(autoId, JSON.parse(JSON.stringify(data)));
      return { id: autoId };
    },
    getDocs: async (colRef) => {
      const colMap = getCollectionMap(colRef.collection);
      const docs = Array.from(colMap.entries()).map(([id, data]) => ({
        id,
        data: () => JSON.parse(JSON.stringify(data)),
      }));
      return { docs };
    },
  };
}

function getDocRef(customDb, colName, docId) {
  if (customDb?.__isMock) {
    return { __isMock: true, collection: colName, id: docId };
  }
  return doc(customDb, colName, docId);
}

function getColRef(customDb, colName) {
  if (customDb?.__isMock) {
    return { __isMock: true, collection: colName };
  }
  return collection(customDb, colName);
}

async function safeGetDoc(docRef, customDb) {
  if (customDb?.__isMock || docRef?.__isMock) {
    return customDb.getDoc(docRef);
  }
  return await getDoc(docRef);
}

async function safeSetDoc(docRef, payload, options, customDb) {
  if (customDb?.__isMock || docRef?.__isMock) {
    return customDb.setDoc(docRef, payload, options);
  }
  return await setDoc(docRef, payload, options);
}

async function safeAddDoc(colRef, payload, customDb) {
  if (customDb?.__isMock || colRef?.__isMock) {
    return customDb.addDoc(colRef, payload);
  }
  return await addDoc(colRef, payload);
}

async function safeGetDocs(colRef, customDb) {
  if (customDb?.__isMock || colRef?.__isMock) {
    return customDb.getDocs(colRef);
  }
  return await getDocs(colRef);
}

/**
 * Normalizes date to YYYY-MM-DD in Asia/Kolkata timezone
 * Properly handles YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY, and Date objects
 */
export function formatOperationalDate(dateInput) {
  if (!dateInput) {
    const d = new Date();
    return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  }
  if (typeof dateInput === "string") {
    const trimmed = dateInput.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    // Handle DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY
    const ddmmyyyyMatch = trimmed.match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{4})$/);
    if (ddmmyyyyMatch) {
      const day = ddmmyyyyMatch[1].padStart(2, "0");
      const month = ddmmyyyyMatch[2].padStart(2, "0");
      const year = ddmmyyyyMatch[3];
      return `${year}-${month}-${day}`;
    }
  }
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) {
    return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  }
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); // Canadian format gives YYYY-MM-DD reliably
}

/**
 * Converts date to DD-MM-YYYY format (BMRCL standard)
 */
export function toIndianDateStr(dateInput) {
  const iso = formatOperationalDate(dateInput);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-");
    return `${d}-${m}-${y}`;
  }
  return iso;
}


/**
 * Automatically computes BMRCL day type based on calendar date rules
 */
export function calculateDefaultDayType(dateInput) {
  const normDate = formatOperationalDate(dateInput);
  const d = new Date(normDate + "T00:00:00+05:30");
  const dayOfWeek = isNaN(d.getTime()) ? new Date().getDay() : d.getDay();
  if (dayOfWeek === 0) return "SUNDAY";
  if (dayOfWeek === 1) return "MONDAY";
  if (dayOfWeek === 6) return "SATURDAY";
  return "WEEKDAY";
}

/**
 * Generates unique deployment ID: {deploymentDate}_{dayType}
 */
export function getDeploymentId(deploymentDate, dayType) {
  const normDate = formatOperationalDate(deploymentDate);
  let normDayType = String(dayType || "WEEKDAY").trim().toUpperCase();
  if (
    normDayType === "SATURDAY_GH" ||
    normDayType === "SATURDAY & GH" ||
    normDayType === "SAT & GH" ||
    normDayType === "GH"
  ) {
    normDayType = "SATURDAY";
  }
  return `${normDate}_${normDayType}`;
}

/**
 * Checks if a deployment exists for the given date and day type across all candidate document keys
 */
export async function checkDeploymentExists(
  deploymentDate,
  dayType,
  customDb = db
) {
  const normDate = formatOperationalDate(deploymentDate);
  const normDayType = String(dayType || "WEEKDAY").trim().toUpperCase();
  const deploymentId = getDeploymentId(normDate, normDayType);
  const indDate = toIndianDateStr(normDate);

  const candidateKeys = [
    deploymentId,
    indDate ? `${indDate}_${normDayType}` : null,
  ].filter(Boolean);

  for (const key of candidateKeys) {
    try {
      const docRef = getDocRef(customDb, "dispatch_deployments", key);
      const docSnap = await safeGetDoc(docRef, customDb);
      if (docSnap.exists() && docSnap.data()) {
        return {
          exists: true,
          data: docSnap.data(),
        };
      }
    } catch (_e) {
      /* continue checking other candidates */
    }
  }

  return { exists: false, data: null };
}

/**
 * Deploys or redeploys a roster for a specific date and day type.
 * Ensures universal synchronization across ALL Firebase systems and devices in real-time.
 */
export async function executeDeployment(
  {
    deploymentDate,
    dayType,
    rosterData,
    sourceFile,
    user = "CrewController_01",
    metadata = {},
    forceReplace = false,
  },
  customDb = db
) {
  const normDate = formatOperationalDate(deploymentDate);
  const normDayType = String(dayType || "WEEKDAY").trim().toUpperCase();
  const deploymentId = getDeploymentId(normDate, normDayType);
  const indDate = toIndianDateStr(normDate);

  const existing = await checkDeploymentExists(normDate, normDayType, customDb);
  let version = 1;
  let action = "DEPLOY";

  if (existing.exists) {
    if (!forceReplace) {
      throw new Error(
        `DEPLOYMENT_EXISTS_CONFIRMATION_REQUIRED:${normDate}:${normDayType}`
      );
    }
    version = (existing.data?.version || 1) + 1;
    action = "REDEPLOY";
  }

  const nowIso = new Date().toISOString();
  const totalDutiesCount = Array.isArray(rosterData?.duties)
    ? rosterData.duties.length
    : Array.isArray(rosterData)
      ? rosterData.length
      : metadata.totalDuties || 45;

  const payload = {
    deploymentId,
    deploymentDate: normDate,
    dateStr: normDate,
    date: normDate,
    targetDate: normDate,
    indianDate: indDate,
    dayType: normDayType,
    scheduleType: normDayType,
    status: "DEPLOYED",
    version,
    createdAt:
      existing.exists && existing.data?.createdAt
        ? existing.data.createdAt
        : nowIso,
    updatedAt: nowIso,
    deployedAt: nowIso,
    source: "UI_DEPLOY",
    sourceFile: sourceFile || "Unknown",
    rosterData: rosterData || {},
    metadata: {
      line: "Green Line",
      totalDuties: totalDutiesCount,
      totalTrainCrew: metadata.totalTrainCrew || totalDutiesCount * 2,
      ...metadata,
    },
  };

  // 1. Save date-specific deployment under canonical deploymentId and latest sync pointer
  const keysToSave = [
    deploymentId,
    "latest",
  ];

  await Promise.all(
    keysToSave.map(async (key) => {
      try {
        const ref = getDocRef(customDb, "dispatch_deployments", key);
        await safeSetDoc(ref, payload, { merge: true }, customDb);
      } catch (err) {
        console.warn(`dispatch_deployments write warning for key ${key}:`, err);
      }
    })
  );

  // 2. Unconditionally update active deployment pointer so EVERY connected Firebase system syncs immediately
  try {
    const activeConfigRef = getDocRef(
      customDb,
      "system_settings",
      "active_roster_config"
    );
    await safeSetDoc(
      activeConfigRef,
      {
        activeDeploymentId: deploymentId,
        activeDeploymentDate: normDate,
        activeDayType: normDayType,
        deployedDate: normDate,
        indianDate: indDate,
        totalDuties: totalDutiesCount,
        sourceFile: sourceFile || "Unknown",
        version,
        updatedAt: nowIso,
        deployedAt: nowIso,
        updatedBy: user || "CrewController_01",
      },
      { merge: true },
      customDb
    );
  } catch (err) {
    console.warn("active_roster_config update warning:", err);
  }

  // 3. Write immutable audit log
  try {
    const auditLogsCol = getColRef(customDb, "deployment_audit_logs");
    await safeAddDoc(
      auditLogsCol,
      {
        deploymentId,
        deploymentDate: normDate,
        dayType: normDayType,
        action,
        timestamp: nowIso,
        version,
        totalDuties: totalDutiesCount,
        user: user || "CrewController_01",
      },
      customDb
    );
  } catch (err) {
    console.warn("audit log write warning:", err);
  }

  return { success: true, deploymentId, version };
}

/**
 * Retrieves roster data explicitly by date and day type across all candidate document keys
 */
export async function getDeploymentRoster(
  { deploymentDate, dayType },
  customDb = db
) {
  const normDate = formatOperationalDate(deploymentDate);
  const normDayType = String(dayType || "WEEKDAY").trim().toUpperCase();
  const deploymentId = getDeploymentId(normDate, normDayType);
  const indDate = toIndianDateStr(normDate);

  const candidateKeys = [
    deploymentId,
    indDate ? `${indDate}_${normDayType}` : null,
  ].filter(Boolean);

  for (const cId of candidateKeys) {
    try {
      const docRef = getDocRef(customDb, "dispatch_deployments", cId);
      const docSnap = await safeGetDoc(docRef, customDb);
      if (docSnap.exists() && docSnap.data()?.rosterData) {
        return docSnap.data();
      }
    } catch (_e) {
      /* continue checking other candidates */
    }
  }

  throw new Error(
    `No deployment found for date ${normDate} and day type ${normDayType}.`
  );
}

/**
 * Retrieves list of recent deployments for history view
 */
export async function getDeploymentHistory(limitCount = 30, customDb = db) {
  try {
    const colRef = getColRef(customDb, "dispatch_deployments");
    const snap = await safeGetDocs(colRef, customDb);
    const deployments = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    // Sort descending by deploymentDate and updatedAt
    deployments.sort((a, b) => {
      const dateA = a.deploymentDate || a.createdAt || "";
      const dateB = b.deploymentDate || b.createdAt || "";
      return dateB.localeCompare(dateA);
    });
    return deployments.slice(0, limitCount);
  } catch (err) {
    console.error("Failed to fetch deployment history:", err);
    return [];
  }
}

/**
 * Validate deployment context before changeover / downstream tasks
 */
export function validateDeploymentContext(selectedDate, loadedRosterData) {
  const normDate = formatOperationalDate(selectedDate);
  const rosterDate = loadedRosterData?.deploymentDate
    ? formatOperationalDate(loadedRosterData.deploymentDate)
    : loadedRosterData?.date
      ? formatOperationalDate(loadedRosterData.date)
      : "NONE";

  if (!loadedRosterData || rosterDate !== normDate) {
    throw new Error(
      `DEPLOYMENT DATE MISMATCH\n\nSelected deployment: ${normDate}\nLoaded roster: ${rosterDate}\n\nPlease load the roster for the selected deployment date.`
    );
  }
  return true;
}

/**
 * Execute changeover strictly against dated deployment ID
 */
export async function executeChangeoverWorkflow(
  selectedDate,
  dayType,
  options = {},
  customDb = db
) {
  const normDate = formatOperationalDate(selectedDate);
  const normDayType = String(dayType || "WEEKDAY").trim().toUpperCase();
  const deploymentId = getDeploymentId(normDate, normDayType);

  if (typeof options.showConfirmationModal === "function") {
    const confirmed = await options.showConfirmationModal({
      date: normDate,
      dayType: normDayType,
      deploymentId: deploymentId,
    });
    if (!confirmed) return { cancelled: true };
  }

  // Fetch specific dated deployment
  const roster = await getDeploymentRoster(
    { deploymentDate: normDate, dayType: normDayType },
    customDb
  );

  // Validate context before execution
  validateDeploymentContext(normDate, roster);

  console.log(`Executing changeover strictly against ID: ${deploymentId}`);
  return {
    success: true,
    deploymentId,
    deploymentDate: normDate,
    dayType: normDayType,
    roster,
  };
}

/**
 * Backward-compatible migration helper:
 * Maps legacy un-dated deployment to target date or current operational date
 */
export async function migrateLegacyDeploymentIfNeeded(
  legacyKey = "WEEKDAY",
  targetDate = null,
  customDb = db
) {
  const normDate = formatOperationalDate(targetDate || new Date());
  const normDayType = String(legacyKey || "WEEKDAY").trim().toUpperCase();
  const deploymentId = getDeploymentId(normDate, normDayType);

  // Check if target already exists
  const existing = await checkDeploymentExists(normDate, normDayType, customDb);
  if (existing.exists) return existing.data;

  // Check legacy doc in system_settings or dispatch_deployments
  const legacyRef = getDocRef(customDb, "dispatch_deployments", legacyKey);
  const legacySnap = await safeGetDoc(legacyRef, customDb);
  if (legacySnap.exists()) {
    const legacyData = legacySnap.data();
    await executeDeployment(
      {
        deploymentDate: normDate,
        dayType: normDayType,
        rosterData: legacyData.rosterData || legacyData,
        sourceFile: legacyData.sourceFile || "Legacy Migration",
        forceReplace: false,
      },
      customDb
    );
    return { migrated: true, deploymentId };
  }
  return null;
}
