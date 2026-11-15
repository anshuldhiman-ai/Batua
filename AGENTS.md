# Agent Working Instructions

## Git Commit Guidelines

**DO NOT add Claude attribution trailers to commits:**
- No `Co-Authored-By: Claude <noreply@anthropic.com>`
- No `Generated with Claude Code` footers
- Keep commit messages clean and professional

All commits should be attributed to the project maintainer only.

## Design Guidelines

When designing, styling, or reviewing web UI, landing pages, or components:
- Consult `.agents/skills/landing-page-design/SKILL.md`.
- Adhere to the visual system: strict spacing tokens, mathematical nested radii (`inner = outer - gap`), `cubic-bezier(0.22, 1, 0.36, 1)` deceleration motion curves, full interactive button states (`active:scale-[0.98]`), and `text-wrap: balance` for headings.
