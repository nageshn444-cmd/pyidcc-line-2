# Employee Management Feature Documentation

## Overview
This feature provides a comprehensive employee (crew) management system integrated with Firebase Firestore, allowing administrators to add, edit, delete, and view employee details with persistent storage.

## Features

### 1. **Add Employee**
- Click the "ADD EMPLOYEE" button (only visible for admins)
- Fill in required fields:
  - **Employee ID** (unique identifier)
  - **Name** (employee name)
  - **Contact** (phone number)
  - **Email** (email address)
  - **Designation** (dropdown: Station Superintendent or Station Controller/Train Operator)
- Click "Create" to add the employee to Firebase
- Data is automatically saved and persisted

### 2. **View Employee Directory**
- Access the CREW tab in the Dashboard
- See all employees in a searchable table
- Filter by employee name or ID using the search box
- View count of filtered vs. total employees

### 3. **Edit Employee Details**
- Click the **Edit** icon (pencil icon) for any employee
- Fields become editable with green borders
- Modify any field:
  - Employee ID
  - Name
  - Contact
  - Email
  - Designation
- Click **Save** (checkmark icon) to update in Firebase
- Click **Cancel** (X icon) to discard changes

### 4. **Delete Employee**
- Click the **Delete** icon (trash icon) for any employee
- Confirm the deletion in the popup dialog
- Employee is permanently removed from Firebase

### 5. **Contact Integration**
- Click the **Phone** icon to trigger a phone call to the employee
- Click the **Email** icon to send an email to the employee

## Technical Implementation

### Database Schema (Firebase Firestore)
Collection: `employees`
```
{
  id: string (Employee ID)
  name: string (Employee Name)
  contact: string (Phone Number)
  email: string (Email Address)
  designation: string (Job Title)
  createdAt: timestamp
  updatedAt: timestamp
}
```

### Components Modified

#### 1. **CrewDirectory.jsx** (Enhanced)
- Added Firebase integration using `collection`, `getDocs`, `addDoc`, `updateDoc`, `deleteDoc` from `firebase/firestore`
- New states:
  - `loading`: Tracks async operations
- New functions:
  - `loadCrewFromFirebase()`: Fetches employees from Firebase on component mount
  - `handleAddEmployee()`: Saves new employee to Firebase
  - `handleSave()`: Updates existing employee in Firebase
  - `handleDelete()`: Removes employee from Firebase
- UI improvements:
  - Loading spinner in header
  - Disabled state for buttons during operations
  - Better error handling with alerts
  - Automatic data refresh after operations

#### 2. **Dashboard.jsx** (Updated)
- Added CREW tab rendering with CrewDirectory component
- Integrated with existing admin role system (`hasAdminRights()`)
- Passes `isAdmin` prop to control edit/delete permissions

### Firebase Collections
```
pyidline2crew-41022 (Project)
├── employees (Collection)
    ├── Document 1
    │   ├── id: "EMP001"
    │   ├── name: "John Doe"
    │   ├── contact: "+919876543210"
    │   ├── email: "john@example.com"
    │   ├── designation: "Station Controller / Train Operator"
    │   ├── createdAt: 2026-06-06T...
    │   └── updatedAt: 2026-06-06T...
    └── Document 2
        └── ...
```

## Permission Model
- **ADMIN & CREW_CONTROLLER**: Full access (add, edit, delete, view)
- **TRAIN_OPERATOR & VIEWER**: Read-only access (view only)

## User Interface

### Header Section
- Employee count badge showing filtered/total records
- Search box for filtering by name or employee ID
- Add Employee button (admin only)
- Loading indicator during operations

### Main Table
Columns:
- **EMP ID**: Employee identifier (cyan text)
- **NAME**: Employee name (bold white text)
- **CONTACT**: Phone number (amber text)
- **EMAIL**: Email address (gray text, truncated)
- **DESIGNATION**: Job title (gray text)
- **ACTIONS**: Phone, Email, Edit, Delete buttons

### Row Actions
- **Phone Icon** (green): Initiates phone call
- **Email Icon** (blue): Opens email client
- **Edit Icon** (gray, admin only): Enables inline editing
- **Delete Icon** (red, admin only): Removes employee

## Error Handling
- Input validation for required fields (ID, Name, Contact)
- Duplicate employee ID detection
- Firebase error messages with user-friendly alerts
- Loading states prevent double-submission

## Accessibility Features
- Icons with descriptive titles (hover tooltips)
- Keyboard support (Enter to save, Escape to cancel)
- Clear visual feedback for active/editing states
- High contrast color scheme

## Performance
- Lazy loading of employee data on component mount
- Cached local state for instant UI updates
- Async Firebase operations don't block UI
- Efficient filtering algorithm

## Future Enhancements
- Batch import from Excel
- Department/designation management
- Employee photo upload
- Audit logs for changes
- Advanced search filters
- Export to Excel/PDF
- Email notifications on add/delete
- Salary/compensation management

## Testing Checklist
- ✅ Add new employee with all fields
- ✅ Edit existing employee details
- ✅ Delete employee with confirmation
- ✅ Search/filter functionality
- ✅ Permission-based visibility
- ✅ Firebase persistence
- ✅ Error handling
- ✅ Loading states

## Deployment Notes
- Firebase configuration already set up in `firebase.js`
- Firestore database must be initialized
- Security rules should restrict employee collection to authenticated admin users
- No additional environment variables required

## Files Modified
1. `src/components/CrewDirectory.jsx` - Enhanced with Firebase integration
2. `src/components/Dashboard.jsx` - Added CREW tab rendering

## Version
- Feature Version: 1.0.0
- Last Updated: 2026-06-06
- Firebase SDK: ^12.14.0
