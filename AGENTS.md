# Gym Cycle Tracker — project context

## Project
An existing mobile strength-training tracker. Continue developing this project in place; do not create a replacement project.

## Stack
- React Native, Expo, TypeScript
- Functional React components and hooks
- AsyncStorage for local persistence

## Product purpose
Track strength workouts and sets, guide load progression, and analyze training results. The main interface language is Russian.

## Existing features
- Training splits: Synergists (chest/triceps, back/biceps, legs/shoulders); Full Body (three workouts); Push/Pull/Legs; Antagonists (chest/back, biceps/triceps, legs).
- Four-week cycle: week 1 RIR 3–4; week 2 RIR 2–3; week 3 RIR 1–2; week 4 deload RIR 4–5 with reduced volume.
- Per-set weight, reps, and RIR logging; completed-set and target checks; load recommendations; Epley estimated 1RM adjusted for RIR; workout history.
- AsyncStorage persistence, exercise alternatives, knee/elbow load filters, separate history for substituted exercises, and persisted split/restrictions.

## Requirements and constraints
- Do not add barbell deadlifts or barbell squats.
- Workouts should take about 60 minutes.
- Preserve existing design and behavior unless a requested change requires otherwise.
- Preserve user data across app updates. Any storage format change must include a migration that keeps existing workout history.
- Use TypeScript.

## Workflow
1. Inspect the current project structure, the entire `App.tsx`, `package.json`, and `README.md` before making changes.
2. Run `pnpm typecheck` and inspect existing errors.
3. Do not rewrite the app without need; make small, focused steps.
4. After changes, check TypeScript and verify runtime behavior when applicable.
5. Do not change persisted data shape without a backwards-compatible migration.
6. Keep documentation and dependency versions aligned with the current project. Expo SDK dependencies must use compatible versions.

## Current architecture
- `App.tsx`: app state, persistence, workout and progress screens, styles.
- `src/types/index.ts`: shared domain types.
- `src/data/programs.ts`: workout program definitions.
- `src/utils/training.ts`: storage key and training utility values/functions.

## Current package baseline
Expo SDK 58 (`expo ~58.0.0`), React Native 0.88.1, React 19.3.0, Expo Status Bar 58.0.5, AsyncStorage 2.2.0. Use pnpm and the lockfile for dependency management.
