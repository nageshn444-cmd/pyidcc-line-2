\# Project: PYIDCC (Peenya Industry Depot Crew Control)



\## Core Context



This application manages crew control, roster tracking, leave operations, attendance monitoring, and operational reporting for Peenya Industry Depot (BMRCL Line 2).



The system handles sensitive operational data including:



\* Staff attendance

\* Leave management

\* Crew deployment

\* Operational incident tracking

\* Train operator relief tracking

\* Handover tracking

\* Crew roster management



\## Technical Stack



\* Frontend: React (Functional Components)

\* Styling: Tailwind CSS

\* Backend: Firebase

\* Database: Firestore

\* Authentication: Firebase Auth

\* State Management: AuthContext

\* Roles:



&#x20; \* Admin

&#x20; \* Controller

&#x20; \* Supervisor

&#x20; \* Staff



\## Development Rules



\### Code Quality



\* Never use placeholder code.

\* Always output complete, ready-to-run files.

\* Always provide production-ready code.

\* Never return partial implementations.

\* Preserve existing functionality unless explicitly requested.



\### Security



\* Security first.

\* All new Firestore collections must have matching rules in firestore.rules.

\* Never bypass authentication checks.

\* Never expose Firebase secrets.

\* Preserve role-based access controls.



\### Role Enforcement



Ensure all Firestore write operations respect:



\* isAdminOrController()

\* isSupervisor()



Never remove or weaken role validation.



\### Architecture



\* Use React Functional Components only.

\* Follow the existing folder structure.

\* Reuse existing components whenever possible.

\* Avoid creating duplicate functionality.

\* Read related files before modifying code.



Project structure:



\* /src/components

\* /src/context

\* /src/services

\* /src/pages

\* /src/firebase.js



\### PYIDCC Business Rules



\* Always refer to the project as PYIDCC.

\* Preserve BMRCL operational logic.

\* Preserve attendance calculations.

\* Preserve leave workflows.

\* Preserve roster calculations.

\* Preserve train operator relief tracking logic.

\* Preserve handover tracking logic.

\* Preserve audit/history records.



\### Before Making Changes



Always:



1\. Analyze affected files.

2\. List impacted components.

3\. Explain implementation plan.

4\. Wait for approval before major refactoring.



\### Refactoring Rules



\* Never remove data without confirmation.

\* Never change Firestore collection names without approval.

\* Never change document schema without approval.

\* Never break backward compatibility.



\### Output Rules



When modifying code:



\* Return complete files.

\* Include file paths.

\* Explain changes.

\* Highlight Firestore impacts.

\* Highlight routing impacts.

\* Highlight authentication impacts.



