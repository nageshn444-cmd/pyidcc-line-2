import React from 'react';
import ActiveCrewRegistry from './ActiveCrewRegistry';
import { useAuth } from '../context/AuthContext';

export default function CrewDirectory() {
  const { currentUser, userProfile } = useAuth();
  
  // Format currentUser object to match ActiveCrewRegistry expectation
  const formattedUser = {
    displayName: currentUser?.displayName || currentUser?.email || 'Administrator',
    email: currentUser?.email || 'admin@bmrc.co.in'
  };

  return (
    <ActiveCrewRegistry 
      userRole={userProfile?.role || 'VIEWER'} 
      currentUser={formattedUser} 
    />
  );
}