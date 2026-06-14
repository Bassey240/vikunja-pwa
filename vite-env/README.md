# Vite envDir target — intentionally empty.
#
# The project-root `.env` is a symlink to a file outside the repo
# (private-local backend secrets, consumed by scripts/start-server.mjs).
# Sandboxed runners (e.g. the Claude preview server) cannot follow that
# symlink out of the project dir and Vite 's loadEnv() throws EPERM.
# Pointing Vite at this dir keeps `npm run dev:react` / preview working;
# VITE_TARGET still flows in via process.env, so nothing is lost.
