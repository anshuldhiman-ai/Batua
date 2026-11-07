/**
 * User Guide Component
 * Provides comprehensive help documentation for the application
 */

import React, { useState } from 'react';
import { BookOpen, X, Search, ChevronDown, ChevronRight } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { KeyboardShortcutsHelp } from '@/hooks/useKeyboardShortcuts';

interface GuideSection {
  id: string;
  title: string;
  icon: React.ElementType;
  content: React.ReactNode;
}

const guideSections: GuideSection[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    icon: BookOpen,
    content: (
      <div className="space-y-3 text-sm">
        <p>Welcome to Batua, your personal finance manager! Here's how to get started:</p>
        <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
          <li>Add your first transaction from the Transactions page</li>
          <li>Set up budgets to track your spending goals</li>
          <li>Review your spending patterns in Analytics</li>
          <li>Use AI Insights to get personalized recommendations</li>
        </ol>
      </div>
    ),
  },
  {
    id: 'transactions',
    title: 'Managing Transactions',
    icon: BookOpen,
    content: (
      <div className="space-y-3 text-sm">
        <p>Add transactions to track your income and expenses:</p>
        <ul className="list-disc list-inside space-y-2 text-muted-foreground">
          <li>Click "Add Transaction" to manually add a transaction</li>
          <li>Use natural language to add transactions (e.g., "spent 500 on groceries")</li>
          <li>Import transactions from CSV files</li>
          <li>Edit or delete transactions from the list</li>
          <li>Use filters to find specific transactions</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'budgets',
    title: 'Budget Management',
    icon: BookOpen,
    content: (
      <div className="space-y-3 text-sm">
        <p>Create budgets to control your spending:</p>
        <ul className="list-disc list-inside space-y-2 text-muted-foreground">
          <li>Set monthly budgets for different categories</li>
          <li>Track progress with visual indicators</li>
          <li>Get alerts when you're near your budget limit</li>
          <li>Adjust budgets as needed</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'analytics',
    title: 'Analytics & Insights',
    icon: BookOpen,
    content: (
      <div className="space-y-3 text-sm">
        <p>Understand your spending patterns:</p>
        <ul className="list-disc list-inside space-y-2 text-muted-foreground">
          <li>View category breakdown charts</li>
          <li>Track spending trends over time</li>
          <li>Identify recurring expenses</li>
          <li>Use AI-powered insights for recommendations</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'backup',
    title: 'Backup & Restore',
    icon: BookOpen,
    content: (
      <div className="space-y-3 text-sm">
        <p>Keep your data safe:</p>
        <ul className="list-disc list-inside space-y-2 text-muted-foreground">
          <li>Download backups regularly (Settings → Data → Backup)</li>
          <li>Store backups in a safe location</li>
          <li>Restore from backup if needed</li>
          <li>Backup includes all transactions, budgets, and goals</li>
        </ul>
      </div>
    ),
  },
];

export default function UserGuide({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSection, setExpandedSection] = useState<string | null>('getting-started');

  const filteredSections = guideSections.filter((section) =>
    section.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    section.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            User Guide
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search guide..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-input bg-background pl-10 pr-4 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {/* Keyboard Shortcuts */}
          <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
            <KeyboardShortcutsHelp />
          </div>

          {/* Guide Sections */}
          <div className="space-y-2">
            {filteredSections.map((section) => {
              const Icon = section.icon;
              const isExpanded = expandedSection === section.id;
              
              return (
                <div
                  key={section.id}
                  className="rounded-xl border border-border/60 bg-card overflow-hidden"
                >
                  <button
                    onClick={() => setExpandedSection(isExpanded ? null : section.id)}
                    className="w-full flex items-center justify-between p-4 text-left hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="h-5 w-5 text-primary" />
                      <span className="font-medium">{section.title}</span>
                    </div>
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-2 border-t border-border/50">
                      {section.content}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Tips */}
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
            <h4 className="font-medium text-sm mb-2">Pro Tips</h4>
            <ul className="space-y-1 text-xs text-muted-foreground">
              <li>• Use natural language for quick transaction entry</li>
              <li>• Set up budgets to avoid overspending</li>
              <li>• Review AI Insights weekly for personalized recommendations</li>
              <li>• Backup your data regularly</li>
              <li>• Use keyboard shortcuts for faster navigation</li>
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
