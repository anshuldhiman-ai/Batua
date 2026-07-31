# Batua - Personal Finance Application

## Project Overview

Batua is a modern, privacy-first personal finance application built with a FastAPI backend and React frontend. It helps users track transactions, manage budgets, analyze spending patterns, and achieve savings goals through an intuitive web interface.

## Tech Stack

### Backend
- **Framework**: FastAPI (Python)
- **Database**: SQLite with SQLModel ORM
- **ML/NLP**: spaCy for natural language transaction parsing, custom keyword-based classifier
- **Caching**: In-memory TTL-based cache for analytics
- **File Processing**: OpenPyXL for Excel/CSV imports

### Frontend
- **Framework**: React with Vite
- **UI Components**: shadcn/ui (Radix UI primitives)
- **Styling**: TailwindCSS with custom theme system
- **State Management**: React Query (TanStack Query) for API state, localStorage for UI preferences
- **Charts**: Recharts for data visualization
- **Animations**: Framer Motion
- **Routing**: React Router v6
- **Notifications**: Sonner (toast library)

## Key Features

### Core Features
1. **Transaction Management**
   - Manual transaction entry with natural language parsing
   - Bulk import from Excel/CSV with column mapping preview
   - Edit, delete transactions with undo support
   - Price/unit price tracking for quantity-based purchases

2. **Budget Management**
   - Monthly budgets by category
   - Budget progress tracking with visual indicators
   - Budget status alerts (safe, warning, critical)

3. **Analytics & Insights**
   - Multi-view analytics (daily, weekly, monthly, yearly)
   - Income vs expense trends with period comparison
   - Category breakdown with donut charts
   - Spending pattern analysis
   - Cash flow forecasting
   - Anomaly detection for unusual spending
   - ML-powered spending insights

4. **Custom Categories**
   - Add, rename, delete custom categories
   - Automatic transaction reassignment on category deletion
   - Category-based budgeting

5. **Savings Goals**
   - Create savings goals with target amounts and deadlines
   - Track progress with visual progress bars
   - Calculate required monthly savings
   - Days remaining countdown

6. **AI Features**
   - Natural language transaction parsing (e.g., "₹500 for groceries yesterday")
   - Smart transaction categorization using ML
   - AI-powered spending pattern analysis
   - Budget optimization recommendations
   - Goal completion predictions
   - RAG-based Q&A about finances

7. **Data Management**
   - Full backup/restore as JSON
   - Export to Excel
   - Analytics cache invalidation on data changes

## Project Structure

```
batua/
├── backend/
│   ├── app/
│   │   ├── routes/          # API endpoints
│   │   │   ├── analytics.py
│   │   │   ├── backup.py
│   │   │   ├── budgets.py
│   │   │   ├── categories.py
│   │   │   ├── dashboard.py
│   │   │   ├── excel.py
│   │   │   ├── export.py
│   │   │   ├── insights.py
│   │   │   ├── ml_features.py
│   │   │   ├── nl_parse.py
│   │   │   ├── recurring.py
│   │   │   ├── transactions.py
│   │   │   └── transcribe.py
│   │   ├── dependencies.py  # Dependency injection
│   │   ├── cache.py         # Caching logic
│   │   └── models.py        # Pydantic models
│   ├── storage.py           # SQLite storage abstraction
│   ├── ml_nlp.py            # NLP parsing & classification
│   ├── ml_analytics.py      # ML analytics features
│   ├── ml_goals.py          # Savings goals ML
│   ├── ml_rag.py            # RAG Q&A system
│   ├── chat_engine.py       # Chat session management
│   └── tests/               # Backend tests
├── frontend/
│   ├── src/
│   │   ├── pages/           # Page components
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Transactions.tsx
│   │   │   ├── Analytics.tsx
│   │   │   ├── Budgets.tsx
│   │   │   ├── Goals.tsx
│   │   │   ├── MLInsights.tsx
│   │   │   └── Settings.tsx
│   │   ├── components/      # Reusable components
│   │   ├── hooks/           # Custom React hooks
│   │   ├── lib/             # Utility functions
│   │   └── App.tsx
│   └── public/              # Static assets
└── scripts/                 # Utility scripts
```

## API Architecture

### Main Endpoints
- `/api/transactions/` - CRUD operations for transactions
- `/api/budgets/` - Budget management
- `/api/categories/` - Custom category management
- `/api/analytics/*` - Analytics endpoints
- `/api/ml/*` - ML features (parsing, classification, insights)
- `/api/upload-excel/` - Excel/CSV import
- `/api/backup` - Backup/restore
- `/api/export/excel` - Export to Excel

## Design Philosophy

1. **Privacy-First**: All data stored locally, no external dependencies for core features
2. **Progressive Enhancement**: Works without ML, enhanced with ML when available
3. **Mobile-First**: Responsive design with mobile polish
4. **Type Safety**: TypeScript on frontend, Pydantic on backend
5. **Performance**: Client-side caching, server-side aggregation for large datasets

## Current State

### Completed Features
- ✅ Transaction CRUD with undo support
- ✅ Price/unit price tracking
- ✅ Backup/restore functionality
- ✅ Anomaly detection surfaced on Dashboard
- ✅ Server-side analytics aggregation
- ✅ Custom categories (add/rename/reassign)
- ✅ Import column-mapping UI
- ✅ Period comparison in Analytics
- ✅ PWA + mobile polish (theme-aware favicons, meta tags)
- ✅ Savings goals page (frontend UI)

### Pending Improvements
- ⏳ Receipt photo import (OCR/image processing)
- ⏳ Frontend tests (test coverage for React components)
- ⏳ Fix TypeScript lint errors (type errors in Goals.tsx and other files)
- ⏳ Persist goals to backend storage (currently using localStorage)
- ⏳ Add PWA manifest to git (currently gitignored)
- ⏳ Backend goals API integration with ML predictions

## Known Issues

1. **TypeScript Lint Errors**: Several components have type errors related to UI component props (Button, Card, Input, etc.) - these appear to be related to shadcn/ui component type definitions
2. **Goals Storage**: Goals are currently stored in localStorage instead of backend storage
3. **PWA Manifest**: The manifest.json file is gitignored and needs to be added to version control

## Development Notes

- The project uses a custom storage abstraction layer (`storage.py`) that handles SQLite operations with automatic migrations
- Analytics data is cached with a 60-second TTL to improve performance
- The ML features are designed to work in a "fallback" mode - if spaCy models aren't available, it uses rule-based parsing
- The frontend uses React Query for server state and localStorage for UI preferences (theme, filters, etc.)
- The app supports both light and dark themes with automatic theme detection

## How to Run

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

The backend runs on port 8001, frontend on port 5173 (or as configured in VITE_API_BASE_URL).
