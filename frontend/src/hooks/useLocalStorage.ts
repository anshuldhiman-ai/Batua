import { useState } from 'react';

/** Setter returned by {@link useLocalStorage}: accepts a value or an updater fn. */
export type SetLocalStorageValue<T> = (value: T | ((prev: T) => T)) => void;

/**
 * Custom hook for managing localStorage with React state.
 * @param key - The localStorage key
 * @param initialValue - The initial value if no value exists in localStorage
 * @returns `[value, setValue]` tuple
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, SetLocalStorageValue<T>] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === 'undefined') {
      return initialValue;
    }
    try {
      const item = window.localStorage.getItem(key);
      if (item === null) return initialValue;
      // Handle both JSON-parsed values and legacy string values
      try {
        return JSON.parse(item) as T;
      } catch {
        // If JSON.parse fails, return the raw string value
        return item as T;
      }
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  const setValue: SetLocalStorageValue<T> = (value) => {
    try {
      const valueToStore =
        value instanceof Function
          ? (value as (prev: T) => T)(storedValue)
          : value;
      setStoredValue(valueToStore);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
      }
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error);
    }
  };

  return [storedValue, setValue];
}
