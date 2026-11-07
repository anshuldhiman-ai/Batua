/**
 * Keyboard shortcuts hook for productivity
 * Adds common keyboard shortcuts throughout the application
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface Shortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  description: string;
  action: () => void;
}

export function useKeyboardShortcuts() {
  const navigate = useNavigate();

  const shortcuts: Shortcut[] = [
    // Navigation
    {
      key: 'g',
      description: 'Go to Dashboard',
      action: () => navigate('/dashboard'),
    },
    {
      key: 't',
      description: 'Go to Transactions',
      action: () => navigate('/transactions'),
    },
    {
      key: 'a',
      description: 'Go to Analytics',
      action: () => navigate('/analytics'),
    },
    {
      key: 'b',
      description: 'Go to Budgets',
      action: () => navigate('/budgets'),
    },
    {
      key: 's',
      shift: true,
      description: 'Go to Settings',
      action: () => navigate('/settings'),
    },
    // Quick actions
    {
      key: 'n',
      description: 'New transaction',
      action: () => {
        // This would trigger the add transaction dialog
        const event = new CustomEvent('shortcut:new-transaction');
        window.dispatchEvent(event);
      },
    },
    {
      key: 'k',
      ctrl: true,
      description: 'Open Universal Command Palette',
      action: () => {
        window.dispatchEvent(new CustomEvent('command-palette:open'));
      },
    },
    {
      key: '?',
      shift: true,
      description: 'Show keyboard shortcuts',
      action: () => {
        const event = new CustomEvent('shortcut:show-help');
        window.dispatchEvent(event);
      },
    },
  ];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K / Ctrl+K always opens command palette from anywhere
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('command-palette:open'));
        return;
      }

      // Don't trigger shortcuts when typing in inputs or select dropdowns
      const target = e.target as HTMLElement;
      if (
        !target ||
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.contentEditable === 'true' ||
        (target as any).isContentEditable
      ) {
        return;
      }

      const key = e.key.toLowerCase();
      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;
      const alt = e.altKey;

      const shortcut = shortcuts.find(
        (s) =>
          s.key.toLowerCase() === key &&
          !!s.ctrl === ctrl &&
          !!s.shift === shift &&
          !!s.alt === alt
      );

      if (shortcut) {
        e.preventDefault();
        shortcut.action();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  return shortcuts;
}

/**
 * Component to display keyboard shortcuts help
 */
export function KeyboardShortcutsHelp() {
  const shortcuts = useKeyboardShortcuts();

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold mb-3">Keyboard Shortcuts</h3>
      <div className="grid gap-2 text-sm">
        {shortcuts.map((shortcut, index) => (
          <div key={index} className="flex items-center justify-between">
            <span className="text-muted-foreground">{shortcut.description}</span>
            <kbd className="px-2 py-1 text-xs bg-muted rounded border border-border/50">
              {shortcut.ctrl && 'Ctrl+'}
              {shortcut.shift && 'Shift+'}
              {shortcut.alt && 'Alt+'}
              {shortcut.key.toUpperCase()}
            </kbd>
          </div>
        ))}
      </div>
    </div>
  );
}
