/**
 * User-friendly error messages
 * Provides clear, actionable error messages for common scenarios
 */

export const ERROR_MESSAGES = {
  // Network errors
  NETWORK_ERROR: 'Unable to connect to the server. Please check your internet connection.',
  TIMEOUT_ERROR: 'Request timed out. Please try again.',
  SERVER_UNREACHABLE: 'Server is not responding. Please ensure the backend is running.',
  
  // Authentication errors
  UNAUTHORIZED: 'Please sign in to continue.',
  SESSION_EXPIRED: 'Your session has expired. Please sign in again.',
  INVALID_CREDENTIALS: 'Invalid username or password.',
  TOKEN_MISSING: 'Authentication token not found. Please sign in again.',
  
  // Validation errors
  INVALID_INPUT: 'Please check your input and try again.',
  REQUIRED_FIELD: 'This field is required.',
  INVALID_FORMAT: 'Invalid format. Please check and try again.',
  
  // Transaction errors
  TRANSACTION_CREATE_FAILED: 'Failed to create transaction. Please try again.',
  TRANSACTION_UPDATE_FAILED: 'Failed to update transaction. Please try again.',
  TRANSACTION_DELETE_FAILED: 'Failed to delete transaction. Please try again.',
  
  // Budget errors
  BUDGET_CREATE_FAILED: 'Failed to create budget. Please try again.',
  BUDGET_UPDATE_FAILED: 'Failed to update budget. Please try again.',
  BUDGET_DELETE_FAILED: 'Failed to delete budget. Please try again.',
  
  // Category errors
  CATEGORY_EXISTS: 'This category already exists.',
  CATEGORY_NOT_FOUND: 'Category not found.',
  CATEGORY_IN_USE: 'Cannot delete category that is in use.',
  
  // Backup errors
  BACKUP_CREATE_FAILED: 'Failed to create backup. Please try again.',
  BACKUP_RESTORE_FAILED: 'Failed to restore backup. Please check the file format.',
  BACKUP_INVALID: 'Invalid backup file. Please select a valid backup file.',
  
  // API errors
  API_ERROR: 'An error occurred. Please try again.',
  RATE_LIMITED: 'Too many requests. Please wait a moment.',
  
  // ML errors
  ML_UNAVAILABLE: 'AI features are currently unavailable. Please try again later.',
  GEMINI_KEY_INVALID: 'Invalid Gemini API key. Please check your key.',
  GEMINI_QUOTA_EXCEEDED: 'Gemini API quota exceeded. Please check your usage.',
  
  // General errors
  UNKNOWN_ERROR: 'An unexpected error occurred. Please try again.',
};

/**
 * Get a user-friendly error message from an error object
 */
export function getErrorMessage(error: any): string {
  if (!error) return ERROR_MESSAGES.UNKNOWN_ERROR;
  
  // Handle error responses from backend
  if (error.response?.data?.detail) {
    const detail = error.response.data.detail;
    
    // If detail is a string, use it directly
    if (typeof detail === 'string') {
      return detail;
    }
    
    // If detail is an object with a message
    if (detail.message) {
      return detail.message;
    }
    
    // If detail is an object with a reason
    if (detail.reason) {
      return ERROR_MESSAGES[detail.reason] || detail.reason;
    }
  }
  
  // Handle network errors
  if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
    return ERROR_MESSAGES.TIMEOUT_ERROR;
  }
  
  if (error.code === 'ERR_NETWORK' || !error.response) {
    return ERROR_MESSAGES.NETWORK_ERROR;
  }
  
  // Handle status codes
  if (error.response?.status === 401) {
    return ERROR_MESSAGES.UNAUTHORIZED;
  }
  
  if (error.response?.status === 403) {
    return ERROR_MESSAGES.UNAUTHORIZED;
  }
  
  if (error.response?.status === 404) {
    return 'Resource not found.';
  }
  
  if (error.response?.status === 429) {
    return ERROR_MESSAGES.RATE_LIMITED;
  }
  
  if (error.response?.status >= 500) {
    return ERROR_MESSAGES.SERVER_UNREACHABLE;
  }
  
  // Use error message if available
  if (error.message) {
    return error.message;
  }
  
  return ERROR_MESSAGES.UNKNOWN_ERROR;
}

/**
 * Check if an error is recoverable (should show retry option)
 */
export function isRecoverableError(error: any): boolean {
  if (!error) return false;
  
  // Network errors are recoverable
  if (error.code === 'ECONNABORTED' || error.code === 'ERR_NETWORK' || !error.response) {
    return true;
  }
  
  // Server errors (5xx) are recoverable
  if (error.response?.status >= 500) {
    return true;
  }
  
  // Rate limit is recoverable
  if (error.response?.status === 429) {
    return true;
  }
  
  return false;
}
