# Employee Management System - Quick Start Guide

## 🚀 How to Use

### Accessing the Feature
1. Login to the Master System Control dashboard
2. Navigate to the **CREW** tab in the main navigation
3. You'll see the **CREW DIRECTORY** with all employees

---

## ✨ Key Features

### 1️⃣ **View All Employees**
- Browse complete employee directory
- Each row shows: ID, Name, Contact, Email, Designation
- Real-time count of displayed vs. total employees

### 2️⃣ **Search & Filter**
```
- Type employee name in the search box
- Type employee ID to find specific person
- Results update instantly
```

### 3️⃣ **Add New Employee** (Admin Only)
```
Click "ADD EMPLOYEE" button
├── Emp ID: Enter unique identifier (e.g., EMP001)
├── Name: Enter full name
├── Contact: Enter phone number
├── Email: Enter email address (optional)
├── Designation: Select from dropdown
└── Click "Create" to save
```

### 4️⃣ **Edit Employee Details** (Admin Only)
```
Click Edit (✏️) icon on any employee row
├── Fields become editable (green border)
├── Modify any field as needed
├── Click Save (✓) to update
└── Or Click Cancel (✗) to discard
```

### 5️⃣ **Delete Employee** (Admin Only)
```
Click Delete (🗑️) icon on any employee row
├── Confirm deletion in popup
└── Employee is permanently removed
```

### 6️⃣ **Quick Contact Options**
```
Phone Icon (☎️) → Initiates phone call
Email Icon (✉️) → Opens email client
```

---

## 📊 Data Fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Employee ID | Text | ✅ | Must be unique |
| Name | Text | ✅ | Full name of employee |
| Contact | Phone | ✅ | Phone number for communication |
| Email | Email | ❌ | Optional email address |
| Designation | Dropdown | ✅ | Station Superintendent or Station Controller/Train Operator |

---

## 🔐 Access Control

| Role | Permissions |
|------|------------|
| **ADMIN** | ✅ Add, Edit, Delete, View |
| **CREW_CONTROLLER** | ✅ Add, Edit, Delete, View |
| **TRAIN_OPERATOR** | 👁️ View only |
| **VIEWER** | 👁️ View only |

---

## ⚙️ Technical Details

### Backend Storage
- **Database**: Firebase Firestore
- **Collection**: `employees`
- **Auto-sync**: Real-time updates across all sessions

### API Operations
```javascript
// Add Employee
POST /employees → Creates new employee

// View Employees  
GET /employees → Fetches all employees sorted by ID

// Update Employee
PUT /employees/{id} → Updates specific employee details

// Delete Employee
DELETE /employees/{id} → Removes employee permanently
```

---

## ✅ Validation Rules

- ✓ Employee ID must be unique
- ✓ Name and Contact are mandatory
- ✓ Contact must be a valid phone number
- ✓ Email must be in valid format (if provided)
- ✓ Designation must be selected from available options

---

## 🎯 Common Workflows

### Adding a New Operator
1. Click "ADD EMPLOYEE"
2. Enter: `EMP002`, `Rajesh Kumar`, `9876543210`, `rajesh@email.com`
3. Select: `Station Controller / Train Operator`
4. Click Create ✅

### Finding an Employee
1. Type employee name in search box
2. Results filter automatically
3. Click phone icon to call, or email to send message

### Updating Employee Contact
1. Find employee in list
2. Click Edit icon
3. Update Contact field
4. Click Save ✅

---

## 🔍 Troubleshooting

### Issue: "Employee ID already exists!"
**Solution**: Use a unique ID for the new employee

### Issue: "Please fill in required fields"
**Solution**: Ensure all mandatory fields (ID, Name, Contact) are filled

### Issue: Employee not appearing after adding
**Solution**: Wait for page to sync with Firebase (loading indicator)

### Issue: Edit button disabled
**Solution**: You don't have admin privileges. Contact your administrator

---

## 📞 Support

For issues or questions:
1. Check that you have proper admin access
2. Verify internet connection for Firebase sync
3. Try refreshing the page
4. Contact system administrator if problems persist

---

## 🎨 UI Elements Reference

| Icon | Function | Access |
|------|----------|--------|
| ☎️ | Call employee | All users |
| ✉️ | Email employee | All users |
| ✏️ | Edit details | Admin only |
| 🗑️ | Delete employee | Admin only |
| 🔍 | Search | All users |
| ➕ | Add employee | Admin only |

---

**Last Updated**: June 6, 2026  
**Version**: 1.0.0  
**Status**: ✅ Production Ready
