# Batua - Removable Files and Cleanup Guide

## Summary
This document identifies files and directories that can be safely removed from the Batua project to reduce clutter and improve maintainability.

## ✅ Safe to Remove Immediately

### 1. Empty Directories
- `scratch/` - Empty temporary directory (already gitignored)

### 2. Python Cache Files (104 files)
- `backend/__pycache__/` and subdirectories
- All `*.pyc` files throughout the project
- **Action**: Run `find . -type d -name '__pycache__' -exec rm -rf {} + 2>/dev/null`
- **Action**: Run `find . -name '*.pyc' -delete`

### 3. Build Artifacts (already gitignored, but can be cleaned)
- `frontend/dist/` - Vite build output
- `frontend/node_modules/` - npm dependencies (can be reinstalled)
- **Action**: `cd frontend && rm -rf dist node_modules` (reinstall: `yarn install`)

### 4. Duplicate Documentation
- **Issue**: Content overlaps between multiple markdown files
- Current files: `README.md` (21KB), `CLAUDE.md` (empty after cleanup), `AGENTS.md` (319B), `SKILLS.md` (9.5KB), `DEPLOYMENT.md` (5KB)
- `docs/API.md` and `docs/DEVELOPMENT.md` - overlaps with README sections
- **Recommendation**: 
  - Keep `README.md` as the primary documentation
  - Keep `DEPLOYMENT.md` for deployment specifics
  - Remove or consolidate: `AGENTS.md`, `SKILLS.md`
  - Merge `docs/API.md` content into README or keep separate for API reference
  - `docs/DEVELOPMENT.md` can be removed (covered in README)

## ⚠️ Review Before Removing

### 1. Unused Backend Scripts
- `backend/scripts/build_training_data.py` - Used to generate training data
- `backend/scripts/evaluate_nlp.py` - Used to evaluate ML model
- `backend/scripts/train_classifier.py` - Used to train ML classifier
- **Status**: These are utility scripts, keep them for ML model iteration

### 2. Test Fixtures
- Review `backend/tests/` for unused test data files
- Check if all test files have corresponding functionality

### 3. Frontend Components
- Check for unused React components (use `eslint-plugin-unused-imports`)
- Review `frontend/src/components/` for dead code

## 🔴 Do NOT Remove

### Critical Files
- `.gitignore` - Essential for git
- `.gitattributes` - Line ending normalization
- `.env.example` - Template for environment variables
- `requirements.txt` / `requirements-mobile.txt` - Python dependencies
- `package.json` / `yarn.lock` - Node dependencies
- All source code in `backend/` and `frontend/src/`
- Database schema files
- Configuration files (`vite.config.js`, `tsconfig.json`, etc.)

## 📝 Dependency Issues Found

### Python Dependencies
1. **Invalid distribution**: `~ydantic-core` - appears to be a corrupted pydantic-core install
   - **Fix**: `pip uninstall pydantic-core && pip install pydantic-core`

2. **Missing TensorFlow** (not critical - only needed for optional face recognition features):
   - `deepface 0.0.99` requires tensorflow
   - `retina-face 0.0.17` requires tensorflow
   - `tf-keras 2.21.0` requires tensorflow
   - **Status**: These are optional dependencies, likely unused

3. **Protobuf version conflict**:
   - `mediapipe 0.10.14` requires `protobuf<5,>=4.25.3`
   - Current version: `protobuf 5.29.6`
   - **Fix**: `pip install 'protobuf<5,>=4.25.3'`

## 🧹 Cleanup Commands

```bash
# Clean Python cache files
find . -type d -name '__pycache__' -exec rm -rf {} + 2>/dev/null
find . -name '*.pyc' -delete

# Clean frontend build artifacts (optional - will need reinstall)
cd frontend
rm -rf dist node_modules
yarn install  # Reinstall dependencies

# Remove empty scratch directory
rm -rf scratch/

# Fix Python dependency issues
cd backend
pip uninstall pydantic-core -y && pip install pydantic-core
pip install 'protobuf<5,>=4.25.3'
```

## 📊 Expected Space Savings

- Python cache files: ~10-20 MB
- Frontend node_modules: ~500 MB (can be reinstalled)
- Frontend dist: ~5-10 MB (regenerated on build)
- Empty directories: negligible

## ✨ Post-Cleanup Verification

```bash
# Verify backend
cd backend
ruff check .  # Should pass
pip check     # Should show no critical errors
pytest tests/ -v  # All tests should pass

# Verify frontend
cd frontend
yarn build    # Should build successfully
yarn test     # Tests should pass
```

## 🎯 Recommendations

1. **Consolidate documentation** - Too many markdown files with overlapping content
2. **Add `.gitignore` entry** for `scratch/` if it's meant to be temporary
3. **Fix protobuf dependency** to avoid mediapipe warnings
4. **Consider removing unused ML dependencies** (tensorflow, deepface, retina-face) if not used
5. **Add pre-commit hook** to auto-clean `__pycache__` directories
6. **Document which scripts are utility vs production** in README

---

**Last Updated**: 2026-09-17
**Status**: Review pending before deletion
