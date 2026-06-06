# Employee Management - Troubleshooting Guide

## ❌ Error: "Error loading employee data"

### Possible Causes & Solutions

---

## 🔧 Issue 1: Firebase Connection Problem

### Symptoms:
- Error appears immediately when opening CREW tab
- Console shows connection errors

### Solutions:
1. **Check Internet Connection**
   - Verify WiFi/Network connection is active
   - Try refreshing the page (F5 or Ctrl+R)

2. **Verify Firebase Configuration**
   - Open Browser Console (F12)
   - Check `src/firebase.js` is properly configured
   - Ensure Firebase SDK is loaded

3. **Check Firebase Project Status**
   - Go to: https://console.firebase.google.com/
   - Select project: `pyidline2crew-41022`
   - Verify Firestore database is running

---

## 🔧 Issue 2: Firestore Security Rules

### Symptoms:
- No specific error, but data won't load
- Other users can't see employees

### Solutions:
1. **Set Firestore Security Rules**
   
   Go to Firebase Console → Firestore → Rules
   
   Replace with:
   ```javascript
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       // Allow authenticated users to read employees
       match /employees/{document=**} {
         allow read: if request.auth != null;
         allow write: if request.auth != null && 
           (request.auth.token.role == "ADMIN" || 
            request.auth.token.role == "CREW_CONTROLLER");
       }
     }
   }
   ```

2. **Publish the Rules**
   - Click "Publish" button in Firebase Console

---

## 🔧 Issue 3: Empty Employees Collection

### Symptoms:
- "No crew members found" message appears
- This is actually NORMAL behavior

### Solutions:
1. **Add First Employee**
   - Click "ADD EMPLOYEE" button (if you have admin access)
   - Fill in: ID, Name, Contact, Email, Designation
   - Click "Create"

2. **Seed Initial Data**
   
   If you have backend access, run:
   ```bash
   node functions/migrateMasterData.js
   ```

---

## 🔧 Issue 4: Permission Denied

### Symptoms:
- "ADD EMPLOYEE" button is grayed out or hidden
- Can view but can't edit/delete

### Solutions:
1. **Verify Your Role**
   - Check top-right corner shows your role
   - Only ADMIN and CREW_CONTROLLER can edit/delete

2. **Contact Administrator**
   - Ask admin to upgrade your role if needed

---

## 🔧 Issue 5: Employee Data Not Persisting

### Symptoms:
- Employee added but disappears after refresh
- Changes not saved

### Solutions:
1. **Check Browser Console**
   - Open F12 → Console tab
   - Look for error messages
   - Copy-paste error to administrator

2. **Verify Firebase Write Permissions**
   - Check security rules above
   - Ensure user is authenticated

3. **Check Firestore Quota**
   - Go to Firebase Console → Usage
   - Verify you haven't exceeded quota limits

---

## 📋 Browser Console Debugging

### How to Check Console Errors:

1. **Open Developer Tools**
   - Press `F12` or `Ctrl+Shift+I`

2. **Go to Console Tab**
   - Look for red error messages

3. **Common Errors & Meanings:**

   | Error | Meaning |
   |-------|---------|
   | `Missing or insufficient permissions` | Firebase security rules blocking access |
   | `PERMISSION_DENIED` | User not authenticated |
   | `FAILED_PRECONDITION` | Firebase indexes needed |
   | `UNAUTHENTICATED` | Need to login first |

4. **Share Error Details**
   - Right-click error → Copy as JSON
   - Send to administrator for diagnosis

---

## ✅ Verification Checklist

Before reporting an issue, verify:

- [ ] You are logged in to the system
- [ ] You have internet connection
- [ ] Your role is visible in top-right corner
- [ ] Firebase project is accessible: https://console.firebase.google.com/
- [ ] Firestore database shows in Firebase Console
- [ ] Browser console (F12) has no red error messages
- [ ] You tried refreshing the page
- [ ] You waited 5+ seconds for data to load

---

## 🆘 Still Having Issues?

### Provide This Information:

1. **Screenshot of Error**
   - Include any error message
   - Show your role in top-right

2. **Browser Console Output**
   - Press F12 → Console
   - Copy any red error messages

3. **Your Role**
   - ADMIN / CREW_CONTROLLER / TRAIN_OPERATOR / VIEWER

4. **What You Were Trying to Do**
   - Adding? Editing? Deleting? Viewing?

5. **When It Started**
   - Immediately? After specific action?

---

## 🔄 Quick Fix Procedure

If experiencing errors, try in this order:

1. **Close the tab** (or entire browser if possible)
2. **Wait 10 seconds**
3. **Open new tab** and navigate to application
4. **Clear browser cache** (Ctrl+Shift+Delete)
5. **Try again**

If still not working, contact system administrator with console output.

---

## 📞 Contacting Support

Include:
- Your username
- Error message from F12 Console
- Steps to reproduce the issue
- Your user role
- Browser and OS information

---

**Version**: 1.0.0  
**Last Updated**: June 6, 2026
