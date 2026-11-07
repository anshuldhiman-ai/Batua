/**
 * Input validation and sanitization utilities
 * Prevents XSS, injection attacks, and ensures data integrity
 */

/**
 * Sanitize a string to prevent XSS attacks
 * Removes HTML tags and special characters
 */
export function sanitizeString(input: string): string {
  if (!input) return '';
  return input
    .replace(/[<>]/g, '') // Remove < and >
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove event handlers like onclick=
    .trim();
}

/**
 * Validate and sanitize username
 * Must be 3-20 characters, alphanumeric + underscore only
 */
export function validateUsername(username: string): { valid: boolean; error?: string } {
  if (!username || username.trim().length === 0) {
    return { valid: false, error: 'Username is required' };
  }
  
  const sanitized = sanitizeString(username);
  if (sanitized !== username) {
    return { valid: false, error: 'Username contains invalid characters' };
  }
  
  if (sanitized.length < 3) {
    return { valid: false, error: 'Username must be at least 3 characters' };
  }
  
  if (sanitized.length > 20) {
    return { valid: false, error: 'Username must be at most 20 characters' };
  }
  
  if (!/^[a-zA-Z0-9_]+$/.test(sanitized)) {
    return { valid: false, error: 'Username can only contain letters, numbers, and underscores' };
  }
  
  return { valid: true };
}

/**
 * Validate email address
 */
export function validateEmail(email: string): { valid: boolean; error?: string } {
  if (!email || email.trim().length === 0) {
    return { valid: false, error: 'Email is required' };
  }
  
  const sanitized = sanitizeString(email);
  if (sanitized !== email) {
    return { valid: false, error: 'Email contains invalid characters' };
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(sanitized)) {
    return { valid: false, error: 'Please enter a valid email address' };
  }
  
  return { valid: true };
}

/**
 * Validate password strength
 * Must be at least 4 characters
 */
export function validatePassword(password: string): { valid: boolean; error?: string } {
  if (!password || password.length === 0) {
    return { valid: false, error: 'Password is required' };
  }
  
  if (password.length < 4) {
    return { valid: false, error: 'Password must be at least 4 characters' };
  }
  
  if (password.length > 128) {
    return { valid: false, error: 'Password is too long' };
  }
  
  return { valid: true };
}

/**
 * Validate category name
 * Must be 1-50 characters, no special characters
 */
export function validateCategoryName(name: string): { valid: boolean; error?: string } {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: 'Category name is required' };
  }
  
  const sanitized = sanitizeString(name);
  if (sanitized !== name) {
    return { valid: false, error: 'Category name contains invalid characters' };
  }
  
  if (sanitized.length < 1) {
    return { valid: false, error: 'Category name is too short' };
  }
  
  if (sanitized.length > 50) {
    return { valid: false, error: 'Category name must be at most 50 characters' };
  }
  
  return { valid: true };
}

/**
 * Validate transaction amount
 * Must be a positive number
 */
export function validateAmount(amount: string | number): { valid: boolean; error?: string; value?: number } {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  if (isNaN(num)) {
    return { valid: false, error: 'Please enter a valid amount' };
  }
  
  if (num === 0) {
    return { valid: false, error: 'Amount cannot be zero' };
  }
  
  if (Math.abs(num) > 1000000000) {
    return { valid: false, error: 'Amount is too large' };
  }
  
  return { valid: true, value: num };
}

/**
 * Validate date string (YYYY-MM-DD format)
 */
export function validateDate(dateStr: string): { valid: boolean; error?: string } {
  if (!dateStr || dateStr.trim().length === 0) {
    return { valid: false, error: 'Date is required' };
  }
  
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateStr)) {
    return { valid: false, error: 'Date must be in YYYY-MM-DD format' };
  }
  
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    return { valid: false, error: 'Invalid date' };
  }
  
  // Don't allow dates before year 2000 or after year 2100
  const year = date.getFullYear();
  if (year < 2000 || year > 2100) {
    return { valid: false, error: 'Date is out of valid range' };
  }
  
  return { valid: true };
}

/**
 * Sanitize search query to prevent injection
 */
export function sanitizeSearchQuery(query: string): string {
  if (!query) return '';
  return sanitizeString(query).toLowerCase();
}

/**
 * Validate goal amount
 */
export function validateGoalAmount(amount: string | number): { valid: boolean; error?: string; value?: number } {
  const result = validateAmount(amount);
  if (!result.valid) return result;
  
  if (result.value && result.value < 0) {
    return { valid: false, error: 'Goal amount must be positive' };
  }
  
  return result;
}
