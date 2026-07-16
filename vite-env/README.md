# Vite envDir target — intentionally empty.
#
# The project-root `.env` holds backend secrets (consumed by
# scripts/start-server.mjs) and has no VITE_* vars. Pointing Vite's envDir at
# this empty dir keeps `npm run dev:react` / preview from reading the secrets
# file at all; VITE_TARGET still flows in via process.env, so nothing is lost.
