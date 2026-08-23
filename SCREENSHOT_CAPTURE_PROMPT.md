# Screenshot Capture Prompt for Batua Application

## Objective
Capture comprehensive, high-quality screenshots of the Batua personal finance application for documentation and README enhancement. Screenshots should showcase the application's features, UI polish, and functionality in a professional manner.

## Technical Requirements

### Screen Capture Settings
- **Resolution**: 1920x1080 (Full HD) minimum
- **Format**: PNG (lossless compression)
- **Quality**: 100% (no compression artifacts)
- **Browser**: Chrome or Firefox (latest version)
- **Zoom Level**: 100% (default browser zoom)
- **Theme**: Capture both Light and Dark modes where applicable

### File Naming Convention
```
screenshots/
├── dashboard-light.png
├── dashboard-dark.png
├── transactions-input.png
├── analytics-charts.png
├── budgets-progress.png
├── goals-tracking.png
├── people-management.png
├── ml-insights-chat.png
├── tour-welcome.png
├── tour-demo.png
├── settings-theme.png
└── mobile-responsive.png
```

## Screenshots to Capture

### 1. Dashboard (Primary Overview)
**File**: `dashboard-light.png` and `dashboard-dark.png`
**Route**: `/dashboard`
**What to Capture**:
- Full dashboard layout with sidebar navigation
- KPI rail showing income, expense, net, savings rate
- Timeline chart with spending trends
- Recent transactions list
- Ensure all cards and charts are visible
- Show month-over-month deltas if data available

**Tips**:
- Use sample data that shows meaningful trends
- Ensure charts are fully rendered
- Show both positive (green) and negative (red) indicators

### 2. Natural Language Input (Flagship Feature)
**File**: `transactions-input.png`
**Route**: `/transactions`
**What to Capture**:
- The NL input bar with animated comet border
- Example text in input: "zomato 450 yesterday upi"
- Parsed preview card showing all extracted fields
- Split payment indicator if applicable
- Parse button clearly visible

**Tips**:
- Show the input with the example text pre-filled
- Ensure the parsed preview is visible below the input
- Highlight the intelligent parsing with category detection

### 3. Analytics Suite
**File**: `analytics-charts.png`
**Route**: `/analytics`
**What to Capture**:
- Category breakdown chart (pie/bar chart)
- Spending trends over time
- Top merchants section
- Payment method distribution
- Treemap visualization if available
- Calendar heatmap

**Tips**:
- Show multiple chart types in one view if possible
- Ensure charts have meaningful data
- Show color-coded categories (semantic colors)

### 4. Budgets & Progress
**File**: `budgets-progress.png`
**Route**: `/budgets`
**What to Capture**:
- Budget cards with progress bars
- Health indicators (green/red status)
- Category-specific budget limits
- Overspending warnings if applicable
- Add budget button

**Tips**:
- Show budgets at different progress levels (some full, some partial)
- Include both healthy (green) and warning (red) states
- Show the budget health score if available

### 5. Goals Tracking
**File**: `goals-tracking.png`
**Route**: `/goals`
**What to Capture**:
- Goal cards with progress indicators
- Savings targets with current progress
- Visual progress bars or circular indicators
- Add goal button
- Goal completion status

**Tips**:
- Show goals at various completion stages
- Include different goal types (vacation, emergency, etc.)
- Show positive progress toward goals

### 6. People Management
**File**: `people-management.png`
**Route**: `/people`
**What to Capture**:
- People list with avatars/names
- Balance indicators (owed/owing)
- Settlement tracking
- Add person button
- Transaction history per person

**Tips**:
- Show people with different balance states
- Include both positive and negative balances
- Show the settlement interface if possible

### 7. ML Insights / AI Chat
**File**: `ml-insights-chat.png`
**Route**: `/ml-insights`
**What to Capture**:
- Chat interface with conversation
- Example question: "What did I spend on food last month?"
- AI response with data visualization
- Chat input field
- Floating action button (FAB) for chat

**Tips**:
- Show a meaningful conversation with actual data
- Include the AI's natural language response
- Show data-driven insights in the response

### 8. Interactive Tour
**File**: `tour-welcome.png` and `tour-demo.png`
**Route**: Any page during tour
**What to Capture**:
- **Welcome screen**: Hero card with logo, "Meet Batua" title, start button
- **Demo screen**: Tour panel with spotlight effect, connector line, highlighted element
- Show the live demo with auto-typed text
- Parse button interaction during tour
- Tour progress indicator

**Tips**:
- Capture the spotlight effect and connector line
- Show the glass-panel design of tour cards
- Include the breathing glow effect around highlighted elements

### 9. Settings & Customization
**File**: `settings-theme.png`
**Route**: `/settings`
**What to Capture**:
- Theme switcher (light/dark mode)
- Accent color options
- Backup/restore options
- AI assistant settings
- Voice input settings

**Tips**:
- Show theme switching in action
- Include multiple accent color options
- Show the polished settings UI

### 10. Responsive Design (Mobile)
**File**: `mobile-responsive.png`
**Viewport**: Mobile size (375x812 or similar)
**Route**: `/dashboard` or `/transactions`
**What to Capture**:
- Mobile navigation bar (hamburger menu)
- Collapsed sidebar behavior
- Touch-friendly interface elements
- Safe area insets for notched devices
- Mobile-optimized layout

**Tips**:
- Use browser DevTools to simulate mobile viewport
- Show mobile menu drawer if open
- Demonstrate touch-friendly button sizes

## Capture Guidelines

### Before Capturing
1. **Clear browser cache** to ensure clean state
2. **Disable browser extensions** that might interfere
3. **Use sample data** that looks realistic and meaningful
4. **Ensure all charts are fully loaded** before capturing
5. **Check for loading states** - wait for everything to render

### During Capture
1. **Hide scrollbars** if possible for cleaner look
2. **Ensure consistent zoom level** (100%)
3. **Capture full viewport** including sidebar navigation
4. **Wait for animations to complete** before capturing
5. **Check for any UI glitches** or rendering issues

### After Capture
1. **Review each screenshot** for quality and clarity
2. **Ensure text is readable** and not pixelated
3. **Check that important elements are visible**
4. **Verify file size** is reasonable (PNG compression)
5. **Organize files** according to naming convention

## Quality Checklist

For each screenshot, verify:
- [ ] Resolution is at least 1920x1080
- [ ] All text is crisp and readable
- [ ] Colors are accurate and not washed out
- [ ] No loading spinners or incomplete states
- [ ] Charts are fully rendered with data
- [ ] UI elements are properly aligned
- [ ] No browser UI elements (address bar, tabs) visible
- [ ] Consistent styling across screenshots
- [ ] Meaningful sample data is displayed
- [ ] File follows naming convention

## Additional Tips

### Data Preparation
- Use realistic transaction data (food, transport, entertainment)
- Include various categories to show diversity
- Show both income and expense transactions
- Include different payment methods (UPI, cash, card)
- Add some recurring transactions for variety

### Theme Consistency
- Capture light mode screenshots first
- Then capture dark mode equivalents
- Ensure accent colors are consistent
- Show theme switching capability

### Feature Highlighting
- Focus on unique features (NL parsing, AI chat, local-first)
- Show the "wow" moments (auto-parsing, instant insights)
- Demonstrate the privacy-first aspect (local processing)
- Highlight the responsive design

## Post-Processing (Optional)

If needed, you can:
- Add subtle shadows or borders for presentation
- Include device frames for mobile screenshots
- Add annotations or callouts for key features
- Optimize file size while maintaining quality
- Create composite images showing before/after states

## Delivery Format

Organize screenshots in a `screenshots/` directory at the project root:
```
batua/
├── screenshots/
│   ├── dashboard-light.png
│   ├── dashboard-dark.png
│   ├── transactions-input.png
│   └── ... (all other screenshots)
├── README.md
└── ...
```

Each screenshot should be ready to be embedded in the README with:
```markdown
<p align="center">
  <img src="screenshots/dashboard-light.png" width="100%" style="max-width: 820px; border-radius: 12px;" />
</p>
```

## Success Criteria

The screenshot set is complete when:
- All 10+ required screenshots are captured
- Both light and dark modes are shown where applicable
- Mobile responsive design is demonstrated
- All major features are visually represented
- Screenshots are high quality and professional
- Files are properly named and organized
- README can be updated with these screenshots
