# PYIDCC GCC Roster Auto Agent

Windows PowerShell + Microsoft Excel based local agent for automatic roster deployment.

Source root: E:\\1) Rosters\\

The year is detected from the Windows date, so 2026 automatically becomes 2027 and later years without code changes. The agent recursively finds roster workbooks, opens them read-only, finds today's date sheet (18.9, 18-9, 18_9, etc.), extracts duty/name/employee fields, and sends the validated roster to Firebase.

Fail-safe: no valid date sheet means no deployment; recently modified files are delayed; successful cloud response is required before local state becomes DEPLOYED; SHA-256 prevents duplicate deployment; the source workbook is archived in Firebase Storage.

Setup: deploy the Firebase function, create PYIDCC_ROSTER_AGENT_TOKEN, create %LOCALAPPDATA%\\PYIDCC-RosterAgent\\config.json from config.example.json, run run-once.ps1 for the first controlled test, then install-autostart.ps1.

No Firebase service-account private key is stored on the GCC PC.
