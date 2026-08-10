# Documentation and Structure Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the current application straightforward to hand over by documenting its real behavior and separating runtime code, tests, scripts, generated output, and legacy assets without changing application behavior.

**Architecture:** Keep the Flask modules and legacy HTML pages in `templates`, keep Vue source in `web`, and keep generated Vue output in `templates/dist`. Normalize only the repository boundaries around those runtime roots: root-level tests, project scripts, structured documentation, and archived unused assets.

**Tech Stack:** Python 3.12, Flask 3.1.3, SQLite, pytest 9.1.1, Node.js 22, npm 10, Vue 3, TypeScript 5.9, Vite 8.

## Global Constraints

- Preserve the current Flask application entry point `templates/server.py` and Gunicorn target `server:app`.
- Preserve `templates/start_venv_server.bat` as a compatible startup path.
- Do not rewrite the Flask modules into a new Python package.
- Do not edit generated files in `templates/dist` by hand.
- Do not introduce new frameworks, services, or runtime dependencies.
- Do not overwrite or revert unrelated uncommitted changes from the security refactor.

---

### Task 1: Normalize backend test discovery

**Files:**
- Move: `templates/tests/test_app.py` to `tests/backend/test_app.py`
- Create: `pytest.ini`
- Modify: `tests/backend/test_app.py`

**Interfaces:**
- Consumes: Flask modules importable from the `templates` directory.
- Produces: root command `templates\.venv\Scripts\python.exe -m pytest` that discovers all backend tests.

- [ ] **Step 1: Move the test and remove its in-file `sys.path` mutation**

  Move the existing regression test unchanged except for deleting the `sys`/`Path` imports and `sys.path.insert(...)` statement.

- [ ] **Step 2: Run the moved test to verify discovery/import fails before configuration**

  Run: `templates\.venv\Scripts\python.exe -m pytest tests\backend -q`

  Expected: collection fails with `ModuleNotFoundError: No module named 'app'`.

- [ ] **Step 3: Add root pytest configuration**

  Create `pytest.ini` with:

  ```ini
  [pytest]
  testpaths = tests
  pythonpath = templates
  addopts = --basetemp=templates/.pytest_tmp
  ```

- [ ] **Step 4: Verify all backend tests pass from the repository root**

  Run: `templates\.venv\Scripts\python.exe -m pytest -q`

  Expected: all existing tests pass.

### Task 2: Separate runtime assets from historical material

**Files:**
- Keep: `templates/assets/chat-api.js`
- Move: unreferenced root/template image files to `artifacts/legacy-assets/`
- Create: `artifacts/README.md`
- Create: `artifacts/legacy-assets/README.md`

**Interfaces:**
- Consumes: repository-wide `rg` results showing no runtime reference to the moved images.
- Produces: a runtime tree containing only assets used by the current application and an explicitly non-runtime archive.

- [ ] **Step 1: Confirm every candidate image has zero source references**

  Search all files except dependencies and generated output for each candidate filename. Do not move `web/public` or `templates/dist` PWA icons.

- [ ] **Step 2: Move the confirmed unreferenced images**

  Move `assets/lion-avatar.png`, root `favicon.ico`, and the loose `.jpg`/`.png` files directly under `templates` into `artifacts/legacy-assets`, preserving unique names.

- [ ] **Step 3: Document the artifact boundary**

  State that `artifacts` is not served by Flask, is not a source directory, and may be deleted only after product/design confirmation.

- [ ] **Step 4: Re-run the reference scan**

  Expected: no source file refers to the old paths and all actual PWA/static references still resolve to `web/public`, `templates/dist`, or `templates/assets`.

### Task 3: Normalize startup scripts while preserving compatibility

**Files:**
- Create: `scripts/start-backend.bat`
- Modify: `templates/start_venv_server.bat`
- Create: `scripts/README.md`

**Interfaces:**
- Consumes: `templates/.venv`, `templates/.env`, and `templates/server.py`.
- Produces: canonical root command `scripts\start-backend.bat` and compatible old command `templates\start_venv_server.bat`.

- [ ] **Step 1: Add the canonical project-level script**

  Resolve the repository from `%~dp0`, enter `templates`, validate `.venv` and `.env`, run `.venv\Scripts\python.exe server.py`, and preserve the process exit code.

- [ ] **Step 2: Turn the old script into a compatibility wrapper**

  Delegate to `..\scripts\start-backend.bat` using a path based on `%~dp0`, not the caller's current directory.

- [ ] **Step 3: Verify both scripts have valid path targets**

  Check that every referenced file exists and that neither script installs dependencies or embeds secrets.

### Task 4: Build the handover documentation set

**Files:**
- Rewrite: `README.md`
- Create: `docs/README.md`
- Create: `docs/architecture.md`
- Create: `docs/development.md`
- Create: `docs/api.md`
- Create: `docs/database.md`
- Create: `docs/handover.md`
- Rewrite: `docs/operations/deployment.md`
- Rename/rewrite: `docs/operations/dependency-troubleshooting.md` to `docs/operations/troubleshooting.md`
- Rewrite: `docs/security/API_SECURITY_GUIDE.md`
- Expand: `docs/user-guide/README.md`
- Replace: `docs/reference/system-prompt.txt` with `docs/reference/ai-behavior.md`

**Interfaces:**
- Consumes: routes/configuration from `templates/app.py`, schema/migration behavior from `templates/db.py`, AI behavior from `templates/ai_service.py`, build configuration from `web/vite.config.ts`, and dependency manifests.
- Produces: one documentation index and role-specific paths for developers, operators, users, and maintainers.

- [ ] **Step 1: Rewrite the root README as a navigation and quick-start page**

  Include the real architecture, prerequisites, Windows commands, route summary, verification commands, and links to detailed documents.

- [ ] **Step 2: Document architecture and data flow**

  Explain Vue/legacy-page routing, Session authentication, SQLite ownership, controlled DeepSeek calls, SSE flow, crisis bypass, and build artifact ownership.

- [ ] **Step 3: Document development and APIs**

  Include environment variables, directory responsibilities, local workflow, authentication, request/response contracts, status codes, and SSE event shapes.

- [ ] **Step 4: Document database and operations**

  Include schema, indexes, migration stop conditions, backup/restore commands, development startup, Gunicorn deployment, reverse proxy considerations, and rollback principles.

- [ ] **Step 5: Document security, troubleshooting, user flow, and handover**

  Include privilege management, secret rotation, privacy boundaries, common startup/login/build failures, operational checks, known constraints, and a release checklist.

- [ ] **Step 6: Remove the stale prompt reference**

  Make `templates/ai_service.py` the documented source of truth and explicitly describe which browser-supplied parameters are rejected.

### Task 5: Verify the normalized repository

**Files:**
- Verify all changed files; do not create generated reports containing secrets or chat content.

**Interfaces:**
- Consumes: normalized repository.
- Produces: evidence that the handover structure matches the current working application.

- [ ] **Step 1: Run backend tests**

  Run: `templates\.venv\Scripts\python.exe -m pytest -q`

- [ ] **Step 2: Run TypeScript validation**

  Run from `web`: `npx.cmd tsc --noEmit`

- [ ] **Step 3: Build the Vue frontend**

  Run from `web`: `npm.cmd run build`. If the active development process causes the known local Rolldown native-binding mismatch, run an isolated Vite 8.1.5 build without force-upgrading dependencies and record the limitation.

- [ ] **Step 4: Audit frontend dependencies**

  Run from `web`: `npm.cmd audit --audit-level=high`

- [ ] **Step 5: Validate documentation and repository hygiene**

  Check internal Markdown links, scan for old paths and known secret patterns, run `git diff --check`, and inspect `git status --short` to ensure only intended changes remain.

## Execution outcome

Completed on 2026-08-10 in the existing working tree because the current security refactor was not committed and therefore could not be represented safely in a separate worktree.

- Backend: 8 tests passed; Python dependency check passed.
- Frontend: TypeScript passed; npm audit reported 0 vulnerabilities.
- Build: the already-running local dev server held a stale Vite 8.2.1 install, so the normal local command reproduced the Rolldown binding/config error. An isolated Vite 8.1.5 production build passed, and both `package.json` and `package-lock.json` are now pinned to exact 8.1.5 for the next clean `npm ci`.
- Repository: Markdown links, legacy-path scans, credential-pattern scans, runtime asset references, and `git diff --check` passed.
