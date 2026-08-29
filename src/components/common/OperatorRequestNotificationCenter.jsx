import { collection, onSnapshot, query } from "firebase/firestore";
import {
  ArrowRightLeft,
  Bell,
  Calendar,
  CheckCircle,
  Clock,
  ExternalLink,
  KeyRound,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useOperationalEngine } from "../../context/OperationalEngine";
import { db } from "../../firebase";

// Web Audio API Synthesizer - Crisp, Harmonic 3-Tone Control Room Chime
const playRequestNotificationSound = (type = "DEFAULT") => {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();

    if (ctx.state === "suspended") {
      ctx.resume();
    }

    const now = ctx.currentTime;

    // Harmonious frequencies based on request type
    let tones = [587.33, 880.0, 1174.66]; // D5, A5, D6 (Default chime)
    if (type === "SHIFT_EXCHANGE") {
      tones = [523.25, 659.25, 783.99]; // C5, E5, G5 (Major triad)
    } else if (type === "LEAVE_REQUEST") {
      tones = [440.0, 554.37, 659.25]; // A4, C#5, E5 (Warm triad)
    } else if (type === "LOGIN_REQUEST") {
      tones = [659.25, 880.0, 1318.51]; // E5, A5, E6 (High alert)
    }

    tones.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + index * 0.11);

      // Smooth attack and exponential decay
      gain.gain.setValueAtTime(0.001, now + index * 0.11);
      gain.gain.exponentialRampToValueAtTime(0.18, now + index * 0.11 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.11 + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + index * 0.11);
      osc.stop(now + index * 0.11 + 0.36);
    });
  } catch (err) {
    console.warn("Notification audio alert error:", err);
  }
};

export default function OperatorRequestNotificationCenter() {
  const { currentUser, userProfile } = useAuth();
  const { setActiveTab } = useOperationalEngine() || {};

  // Check if current user is an authorized reviewer (Admin, SS, Crew Controller, Super Admin)
  const isSupervisorOrAdmin = useMemo(() => {
    if (!currentUser) return false;
    const role = (userProfile?.role || "").toUpperCase();
    const email = currentUser.email || "";
    return (
      role === "SUPER_ADMIN" ||
      role === "ADMIN" ||
      role === "ADMIN_SS" ||
      role === "ADMIN_STATION_SUPERINTENDENT" ||
      role === "CREW_CONTROLLER" ||
      role === "STATION_CONTROLLER" ||
      role === "ALS" ||
      role === "COORDINATOR" ||
      email.includes("20726") ||
      email.includes("nageshn444")
    );
  }, [currentUser, userProfile]);

  // Audio mute preference stored in localStorage
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try {
      return localStorage.getItem("pyidcc_notification_sound") !== "false";
    } catch {
      return true;
    }
  });

  const toggleSound = () => {
    setSoundEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("pyidcc_notification_sound", String(next));
      } catch {}
      if (next) {
        playRequestNotificationSound("DEFAULT");
      }
      return next;
    });
  };

  // State for all live pending requests
  const [pendingShiftExchanges, setPendingShiftExchanges] = useState([]);
  const [pendingLeaveRequests, setPendingLeaveRequests] = useState([]);
  const [pendingLoginRequests, setPendingLoginRequests] = useState([]);

  // Active popup notification (slides in when new request arrives)
  const [activePopup, setActivePopup] = useState(null);
  const [showNotificationDrawer, setShowNotificationDrawer] = useState(false);

  // Set of already seen request IDs to ensure sound only chimes for NEW arrivals
  const seenRequestIdsRef = useRef(new Set());
  const initialSyncCompletedRef = useRef(false);

  // 1. Shift Exchanges Listener (status: Pending / PENDING)
  useEffect(() => {
    if (!isSupervisorOrAdmin) return;

    const q = query(collection(db, "shift_exchanges"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const pending = [];
        snap.docs.forEach((doc) => {
          const data = doc.data();
          const status = String(data.status || "").toUpperCase();
          if (
            status === "PENDING" ||
            status === "SUBMITTED" ||
            status === "WAITING_APPROVAL"
          ) {
            pending.push({
              id: doc.id,
              requestType: "SHIFT_EXCHANGE",
              title: "Shift Exchange Request",
              operatorName:
                data.applicantName ||
                data.requestingOperatorName ||
                data.empName ||
                "Train Operator",
              employeeId:
                data.applicantId ||
                data.requestingOperatorId ||
                data.empId ||
                "--",
              dutyNo:
                data.applicantDuty || data.dutyId || data.originalDuty || "--",
              targetOperatorName:
                data.relieverName ||
                data.targetOperatorName ||
                data.exchangeWith ||
                "--",
              targetDutyNo: data.relieverDuty || data.targetDuty || "--",
              date: data.exchangeDate || data.date || "--",
              timestamp: data.timestamp?.toDate
                ? data.timestamp.toDate()
                : new Date(),
              data,
            });
          }
        });

        // Check for brand new requests to chime
        if (initialSyncCompletedRef.current) {
          pending.forEach((req) => {
            if (!seenRequestIdsRef.current.has(req.id)) {
              seenRequestIdsRef.current.add(req.id);
              if (soundEnabled) playRequestNotificationSound("SHIFT_EXCHANGE");
              setActivePopup(req);
            }
          });
        } else {
          pending.forEach((req) => seenRequestIdsRef.current.add(req.id));
        }

        setPendingShiftExchanges(pending);
      },
      (err) => console.warn("Shift exchange notification listener:", err),
    );

    return () => unsub();
  }, [isSupervisorOrAdmin, soundEnabled]);

  // 2. Leave Requests Listener (status: Pending / PENDING)
  useEffect(() => {
    if (!isSupervisorOrAdmin) return;

    const q = query(collection(db, "leave_requests"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const pending = [];
        snap.docs.forEach((doc) => {
          const data = doc.data();
          const status = String(
            data.status || data.leaveStatus || "",
          ).toUpperCase();
          if (
            status === "PENDING" ||
            status === "SUBMITTED" ||
            status === "REQUESTED"
          ) {
            pending.push({
              id: doc.id,
              requestType: "LEAVE_REQUEST",
              title: "Leave Application",
              operatorName:
                data.employeeName ||
                data.empName ||
                data.name ||
                "Train Operator",
              employeeId: data.employeeId || data.empId || "--",
              leaveType: data.leaveType || "Casual Leave",
              startDate:
                data.startDate || data.leaveStartDate || data.fromDate || "--",
              endDate: data.endDate || data.leaveEndDate || data.toDate || "--",
              reason: data.reason || data.leaveReason || "--",
              timestamp: data.requestDate?.toDate
                ? data.requestDate.toDate()
                : data.createdAt?.toDate
                  ? data.createdAt.toDate()
                  : new Date(),
              data,
            });
          }
        });

        if (initialSyncCompletedRef.current) {
          pending.forEach((req) => {
            if (!seenRequestIdsRef.current.has(req.id)) {
              seenRequestIdsRef.current.add(req.id);
              if (soundEnabled) playRequestNotificationSound("LEAVE_REQUEST");
              setActivePopup(req);
            }
          });
        } else {
          pending.forEach((req) => seenRequestIdsRef.current.add(req.id));
        }

        setPendingLeaveRequests(pending);
      },
      (err) => console.warn("Leave requests notification listener:", err),
    );

    return () => unsub();
  }, [isSupervisorOrAdmin, soundEnabled]);

  // 3. Login Requests Listener (requestStatus: Pending)
  useEffect(() => {
    if (!isSupervisorOrAdmin) return;

    const q = query(collection(db, "login_requests"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const pending = [];
        snap.docs.forEach((doc) => {
          const data = doc.data();
          const status = String(
            data.requestStatus || data.status || "",
          ).toUpperCase();
          if (status === "PENDING" || status === "NEW") {
            pending.push({
              id: doc.id,
              requestType: "LOGIN_REQUEST",
              title: "New Account / Login Access",
              operatorName: data.employeeName || data.name || "Train Operator",
              employeeId: data.employeeId || data.empId || "--",
              email: data.email || "--",
              designation: data.designation || "Train Operator",
              timestamp: data.requestedAt?.toDate
                ? data.requestedAt.toDate()
                : new Date(),
              data,
            });
          }
        });

        if (initialSyncCompletedRef.current) {
          pending.forEach((req) => {
            if (!seenRequestIdsRef.current.has(req.id)) {
              seenRequestIdsRef.current.add(req.id);
              if (soundEnabled) playRequestNotificationSound("LOGIN_REQUEST");
              setActivePopup(req);
            }
          });
        } else {
          pending.forEach((req) => seenRequestIdsRef.current.add(req.id));
        }

        setPendingLoginRequests(pending);
      },
      (err) => console.warn("Login requests notification listener:", err),
    );

    // Mark initial sync complete after first batch is registered
    const timer = setTimeout(() => {
      initialSyncCompletedRef.current = true;
    }, 1500);

    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, [isSupervisorOrAdmin, soundEnabled]);

  // Combined pending list
  const allPendingRequests = useMemo(() => {
    return [
      ...pendingShiftExchanges,
      ...pendingLeaveRequests,
      ...pendingLoginRequests,
    ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [pendingShiftExchanges, pendingLeaveRequests, pendingLoginRequests]);

  const totalPendingCount = allPendingRequests.length;

  // Auto-dismiss popup after 12 seconds
  useEffect(() => {
    if (!activePopup) return;
    const timer = setTimeout(() => {
      setActivePopup(null);
    }, 12000);
    return () => clearTimeout(timer);
  }, [activePopup]);

  // Navigate to appropriate module
  const handleReview = (req) => {
    setActivePopup(null);
    setShowNotificationDrawer(false);
    if (!setActiveTab) return;

    if (req.requestType === "SHIFT_EXCHANGE") {
      setActiveTab("SHIFT_EXCHANGE");
    } else if (req.requestType === "LEAVE_REQUEST") {
      setActiveTab("LEAVE_MANAGEMENT");
    } else if (req.requestType === "LOGIN_REQUEST") {
      setActiveTab("USER_MANAGEMENT");
    }
  };

  // Only render for authorized staff
  if (!isSupervisorOrAdmin) return null;

  return (
    <>
      {/* ── Fixed Bottom-Right Quick Notification Hub Badge ── */}
      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 font-mono">
        {/* Sound Toggle Button */}
        <button
          onClick={toggleSound}
          title={
            soundEnabled
              ? "Notification Sound Enabled (Click to Mute)"
              : "Notification Sound Muted (Click to Enable)"
          }
          className={`p-2.5 rounded-full shadow-xl border backdrop-blur-md transition-all duration-200 ${
            soundEnabled
              ? "bg-slate-900/90 text-emerald-400 border-emerald-500/40 hover:bg-emerald-950/40 hover:border-emerald-500/70"
              : "bg-slate-900/90 text-slate-500 border-slate-700 hover:text-slate-300"
          }`}
        >
          {soundEnabled ? (
            <Volume2 className="w-4 h-4 animate-pulse" />
          ) : (
            <VolumeX className="w-4 h-4" />
          )}
        </button>

        {/* Requests Bell Counter Button */}
        <button
          onClick={() => setShowNotificationDrawer((prev) => !prev)}
          className={`px-3 py-2 rounded-xl shadow-2xl border flex items-center gap-2 backdrop-blur-md transition-all duration-200 ${
            totalPendingCount > 0
              ? "bg-amber-500/20 text-amber-300 border-amber-500/50 hover:bg-amber-500/30"
              : "bg-slate-900/90 text-slate-400 border-slate-800 hover:border-slate-700"
          }`}
        >
          <Bell
            className={`w-4 h-4 ${totalPendingCount > 0 ? "text-amber-400 animate-bounce" : "text-slate-400"}`}
          />
          <span className="text-xs font-bold font-mono tracking-wider">
            {totalPendingCount > 0
              ? `${totalPendingCount} PENDING REQUESTS`
              : "REQUESTS"}
          </span>
          {totalPendingCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-slate-950 text-[10px] font-black">
              {totalPendingCount}
            </span>
          )}
        </button>
      </div>

      {/* ── Slide-in Floating Toast / Alert on New Incoming Request ── */}
      {activePopup && (
        <div className="fixed top-5 right-5 z-[60] max-w-md w-full animate-in slide-in-from-top-4 duration-300">
          <div
            className={`p-4 rounded-2xl shadow-2xl border backdrop-blur-xl transition-all ${
              activePopup.requestType === "SHIFT_EXCHANGE"
                ? "bg-slate-900/95 border-emerald-500/60 shadow-emerald-950/50"
                : activePopup.requestType === "LEAVE_REQUEST"
                  ? "bg-slate-900/95 border-amber-500/60 shadow-amber-950/50"
                  : "bg-slate-900/95 border-blue-500/60 shadow-blue-950/50"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <div
                  className={`p-2 rounded-xl border ${
                    activePopup.requestType === "SHIFT_EXCHANGE"
                      ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
                      : activePopup.requestType === "LEAVE_REQUEST"
                        ? "bg-amber-500/20 border-amber-500/40 text-amber-400"
                        : "bg-blue-500/20 border-blue-500/40 text-blue-400"
                  }`}
                >
                  {activePopup.requestType === "SHIFT_EXCHANGE" && (
                    <ArrowRightLeft className="w-5 h-5" />
                  )}
                  {activePopup.requestType === "LEAVE_REQUEST" && (
                    <Calendar className="w-5 h-5" />
                  )}
                  {activePopup.requestType === "LOGIN_REQUEST" && (
                    <KeyRound className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest font-mono text-cyan-400">
                      🔔 NEW REQUEST RECEIVED
                    </span>
                    <span className="text-[9px] text-slate-500 font-mono">
                      Just now
                    </span>
                  </div>
                  <h4 className="text-sm font-black text-white font-mono">
                    {activePopup.title}
                  </h4>
                </div>
              </div>

              <button
                onClick={() => setActivePopup(null)}
                className="p-1 text-slate-500 hover:text-slate-300 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content Details */}
            <div className="mt-3 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs font-mono space-y-1">
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-500">Operator:</span>
                <span className="font-bold text-white">
                  {activePopup.operatorName} ({activePopup.employeeId})
                </span>
              </div>

              {activePopup.requestType === "SHIFT_EXCHANGE" && (
                <>
                  <div className="flex justify-between text-slate-300">
                    <span className="text-slate-500">Date:</span>
                    <span className="text-emerald-400 font-bold">
                      {activePopup.date}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span className="text-slate-500">Exchange With:</span>
                    <span className="text-slate-200">
                      {activePopup.targetOperatorName}
                    </span>
                  </div>
                </>
              )}

              {activePopup.requestType === "LEAVE_REQUEST" && (
                <>
                  <div className="flex justify-between text-slate-300">
                    <span className="text-slate-500">Type:</span>
                    <span className="text-amber-400 font-bold">
                      {activePopup.leaveType}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span className="text-slate-500">Duration:</span>
                    <span className="text-slate-200">
                      {activePopup.startDate} ➔ {activePopup.endDate}
                    </span>
                  </div>
                </>
              )}

              {activePopup.requestType === "LOGIN_REQUEST" && (
                <div className="flex justify-between text-slate-300">
                  <span className="text-slate-500">Email:</span>
                  <span className="text-blue-400">{activePopup.email}</span>
                </div>
              )}
            </div>

            {/* Action Bar */}
            <div className="mt-3 flex items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
              <button
                onClick={() =>
                  playRequestNotificationSound(activePopup.requestType)
                }
                className="text-[10px] text-slate-400 hover:text-slate-200 font-mono flex items-center gap-1"
              >
                <Volume2 className="w-3 h-3" /> Replay Sound
              </button>

              <div className="flex gap-2">
                <button
                  onClick={() => setActivePopup(null)}
                  className="px-2.5 py-1 text-xs text-slate-400 hover:text-slate-200 font-mono rounded"
                >
                  Dismiss
                </button>
                <button
                  onClick={() => handleReview(activePopup)}
                  className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold font-mono rounded-lg shadow flex items-center gap-1.5"
                >
                  <span>Review Now</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── All Pending Requests Drawer / Review Modal ── */}
      {showNotificationDrawer && (
        <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200 font-mono">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/60">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  <Bell className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-wider">
                    Train Operator Pending Requests Center
                  </h3>
                  <p className="text-[10px] text-slate-400">
                    Real-time sound alerted queue • Shift Exchanges, Leaves, and
                    Account Access
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => playRequestNotificationSound("DEFAULT")}
                  title="Test Alert Chime"
                  className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 text-[10px] flex items-center gap-1"
                >
                  <Volume2 className="w-3 h-3 text-cyan-400" /> Test Sound
                </button>
                <button
                  onClick={() => setShowNotificationDrawer(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* List Body */}
            <div className="p-4 overflow-y-auto space-y-3 flex-1">
              {allPendingRequests.length === 0 ? (
                <div className="text-center py-12 text-slate-500 space-y-2">
                  <CheckCircle className="w-12 h-12 text-emerald-500/40 mx-auto" />
                  <p className="text-sm font-bold text-slate-400">
                    All requests are cleared!
                  </p>
                  <p className="text-xs">
                    No pending shift exchanges, leave applications, or login
                    requests.
                  </p>
                </div>
              ) : (
                allPendingRequests.map((req) => (
                  <div
                    key={`${req.requestType}_${req.id}`}
                    className={`p-3.5 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-3 transition-all ${
                      req.requestType === "SHIFT_EXCHANGE"
                        ? "bg-emerald-950/15 border-emerald-500/30 text-emerald-200"
                        : req.requestType === "LEAVE_REQUEST"
                          ? "bg-amber-950/15 border-amber-500/30 text-amber-200"
                          : "bg-blue-950/15 border-blue-500/30 text-blue-200"
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[9px] px-2 py-0.5 rounded font-black uppercase tracking-wider border ${
                            req.requestType === "SHIFT_EXCHANGE"
                              ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                              : req.requestType === "LEAVE_REQUEST"
                                ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                                : "bg-blue-500/20 text-blue-300 border-blue-500/40"
                          }`}
                        >
                          {req.requestType.replace("_", " ")}
                        </span>
                        <span className="text-[10px] text-slate-400 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-500" />
                          {req.timestamp
                            ? new Date(req.timestamp).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "--"}
                        </span>
                      </div>

                      <div className="text-xs font-bold text-white">
                        {req.operatorName}{" "}
                        <span className="text-slate-400 font-normal">
                          ({req.employeeId})
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-300">
                        {req.requestType === "SHIFT_EXCHANGE" && (
                          <span>
                            Date:{" "}
                            <strong className="text-emerald-300">
                              {req.date}
                            </strong>{" "}
                            • Exchange With: {req.targetOperatorName}
                          </span>
                        )}
                        {req.requestType === "LEAVE_REQUEST" && (
                          <span>
                            Leave:{" "}
                            <strong className="text-amber-300">
                              {req.leaveType}
                            </strong>{" "}
                            ({req.startDate} to {req.endDate})
                          </span>
                        )}
                        {req.requestType === "LOGIN_REQUEST" && (
                          <span>
                            Access request for:{" "}
                            <strong className="text-blue-300">
                              {req.email}
                            </strong>
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => handleReview(req)}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 self-start md:self-auto"
                    >
                      <span>Open Review</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t border-slate-800 bg-slate-950/60 flex justify-between items-center text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Live synchronized to Firestore collections
              </span>
              <button
                onClick={() => setShowNotificationDrawer(false)}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded font-mono"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
