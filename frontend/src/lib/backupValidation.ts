/**
 * Backup validation utilities
 * Ensures backup files are valid before restore
 */

export interface BackupValidationResult {
  valid: boolean;
  error?: string;
  warnings?: string[];
  data?: any;
  stats?: {
    transactions: number;
    budgets: number;
    goals: number;
    categories: number;
  };
}

/**
 * Validate a backup file structure
 */
export function validateBackupFile(data: any): BackupValidationResult {
  const warnings: string[] = [];
  
  // Check if data is an object
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Invalid backup file: not an object' };
  }
  
  if (data.app && data.app !== 'batua') {
    return { valid: false, error: 'Not a recognized Batua backup file' };
  }

  const collections = ['transactions', 'budgets', 'goals', 'people', 'custom_categories'];
  const hasAnyCollection = collections.some(c => Array.isArray(data[c]) && data[c].length > 0);
  if (!hasAnyCollection && !Array.isArray(data.transactions)) {
    return { valid: false, error: 'Backup contains no recognized data collections' };
  }
  
  // Validate transactions if present
  if (data.transactions && !Array.isArray(data.transactions)) {
    return { valid: false, error: 'Invalid transactions: must be an array' };
  }
  
  // Validate transaction structure
  if (Array.isArray(data.transactions)) {
    for (let i = 0; i < Math.min(data.transactions.length, 10); i++) {
      const txn = data.transactions[i];
      if (!txn || typeof txn !== 'object') {
        return { valid: false, error: `Invalid transaction at index ${i}` };
      }
      
      if (!('amount' in txn) || !('date' in txn)) {
        return { valid: false, error: `Transaction at index ${i} missing required fields (amount, date)` };
      }
      
      // Validate amount is a number
      if (typeof txn.amount !== 'number' || isNaN(txn.amount)) {
        return { valid: false, error: `Transaction at index ${i} has invalid amount` };
      }
    }
  }
  
  // Validate version
  if (data.version && typeof data.version !== 'string' && typeof data.version !== 'number') {
    warnings.push('Invalid version format');
  }
  
  // Count stats
  const stats = {
    transactions: data.transactions?.length || 0,
    budgets: data.budgets?.length || 0,
    goals: data.goals?.length || 0,
    categories: data.categories?.length || 0,
  };
  
  // Add warnings for empty data
  if (stats.transactions === 0) {
    warnings.push('Backup contains no transactions');
  }
  
  return {
    valid: true,
    warnings: warnings.length > 0 ? warnings : undefined,
    stats,
  };
}

/**
 * Check if backup file is too large
 */
export function checkBackupSize(file: File): { valid: boolean; error?: string } {
  const maxSize = 50 * 1024 * 1024; // 50MB
  if (file.size > maxSize) {
    return { valid: false, error: 'Backup file is too large (max 50MB)' };
  }
  return { valid: true };
}

/**
 * Parse and validate backup file
 */
export async function parseBackupFile(file: File): Promise<BackupValidationResult> {
  try {
    // Check file size
    const sizeCheck = checkBackupSize(file);
    if (!sizeCheck.valid) {
      return sizeCheck;
    }
    
    // Read file
    const text = await file.text();
    
    // Parse JSON
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return { valid: false, error: 'Invalid JSON format' };
    }
    
    // Validate structure
    const result = validateBackupFile(data);
    if (result.valid) {
      result.data = data;
    }
    return result;
  } catch (e) {
    return { valid: false, error: 'Failed to read backup file' };
  }
}

/**
 * Generate backup summary
 */
export function generateBackupSummary(data: any): string {
  const validation = validateBackupFile(data);
  if (!validation.valid) {
    return 'Invalid backup file';
  }
  
  const stats = validation.stats!;
  const parts = [
    `${stats.transactions} transactions`,
    stats.budgets > 0 ? `${stats.budgets} budgets` : null,
    stats.goals > 0 ? `${stats.goals} goals` : null,
    stats.categories > 0 ? `${stats.categories} categories` : null,
  ].filter(Boolean);
  
  return `Backup contains: ${parts.join(', ')}`;
}
