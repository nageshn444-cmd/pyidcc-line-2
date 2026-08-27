import { useState, useEffect } from 'react';
import { getCurrentISTDateString, getCurrentISTTimeString, TIMEZONE_IST } from './timeHelpers';
import { resolveDayType } from '../data/dayTypeProfiles';

/**
 * Centralized Hook for Asia/Kolkata (IST) Live Clock & Operational Day-Type.
 * Eliminates uncoordinated clocks across multiple components.
 */
export function useCurrentDateTime() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const currentDate = getCurrentISTDateString();
  const currentTime = getCurrentISTTimeString(now);
  
  const dayOfWeek = now.toLocaleDateString('en-IN', {
    timeZone: TIMEZONE_IST,
    weekday: 'long'
  });

  const dayType = resolveDayType(currentDate);

  const formattedDisplay = now.toLocaleDateString('en-IN', {
    timeZone: TIMEZONE_IST,
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  return {
    now,
    currentDate,
    currentTime,
    dayOfWeek,
    dayType,
    formattedDisplay,
    timezone: TIMEZONE_IST
  };
}

export default useCurrentDateTime;
