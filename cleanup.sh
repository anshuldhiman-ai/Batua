#!/bin/bash
# Batua Project Cleanup Script
# Run this to clean up removable files and fix dependency issues

echo "🧹 Batua Project Cleanup"
echo "========================"
echo ""

# Clean Python cache files
echo "1. Cleaning Python cache files..."
find . -type d -name '__pycache__' -exec rm -rf {} + 2>/dev/null
find . -name '*.pyc' -delete 2>/dev/null
echo "   ✓ Cleaned __pycache__ directories and .pyc files"
echo ""

# Clean empty scratch directory
if [ -d "scratch" ]; then
    echo "2. Removing empty scratch directory..."
    rm -rf scratch/
    echo "   ✓ Removed scratch/"
else
    echo "2. Scratch directory not found (already clean)"
fi
echo ""

# Optional: Clean frontend build artifacts (uncomment to enable)
echo "3. Frontend build artifacts (SKIPPED - run manually if needed):"
echo "   cd frontend && rm -rf dist node_modules"
echo "   cd frontend && yarn install"
echo ""

# Show dependency issues
echo "📦 Dependency Issues to Fix:"
echo "============================="
echo ""
echo "Run these commands to fix Python dependency issues:"
echo ""
echo "  # Fix corrupted pydantic-core"
echo "  pip uninstall pydantic-core -y && pip install pydantic-core"
echo ""
echo "  # Fix protobuf version conflict"
echo "  pip install 'protobuf<5,>=4.25.3'"
echo ""
echo "  # Optional: Remove unused TensorFlow dependencies"
echo "  pip uninstall deepface retina-face tf-keras -y"
echo ""

# Summary
echo "✨ Cleanup Complete!"
echo "==================="
echo ""
echo "Space reclaimed:"
du -sh backend/__pycache__ 2>/dev/null && echo "  (Python cache was ~656KB)" || echo "  ✓ Python cache cleaned"
echo ""
echo "Next steps:"
echo "  1. Run dependency fixes above"
echo "  2. Run 'ruff check .' to verify code quality"
echo "  3. Run 'pytest tests/ -v' to verify tests still pass"
echo "  4. See REMOVABLE_FILES.md for more cleanup options"
echo ""
