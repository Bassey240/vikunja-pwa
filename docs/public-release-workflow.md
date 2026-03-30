# Public Release Workflow

This project intentionally uses two different histories:

- `forgejo/main` is the full working history.
- `github/main` is the curated public release history.

That split is deliberate. Forgejo keeps the real development timeline, while
GitHub stays clean and easy to read for public releases.

## Repository roles

### Forgejo

Use Forgejo as the source of truth for active development.

- Commit normal work there.
- Keep the real commit history there.
- Push checkpoints there whenever a feature or release candidate is verified.
- Review, integrate, and preserve technical history there.

### GitHub

Use GitHub as the public release mirror.

- Do not treat `github/main` as the place for day-to-day development history.
- Publish only deliberate public snapshots there.
- Prefer one release commit per public version unless there is a good reason not to.
- Keep the public history understandable for outside users and contributors.

## Normal development workflow

1. Work on local branches or directly on Forgejo-tracked branches.
2. Run the required checks, typically `npm run ci`.
3. Commit verified work normally.
4. Push verified history to Forgejo.
5. Keep GitHub untouched until you are ready to publish a clean public snapshot.

## Public release workflow

When preparing a public release for GitHub:

1. Finish and verify the release candidate on Forgejo first.
2. Commit and push the verified release candidate to `forgejo/main`.
3. Start from the latest `github/main` baseline in a clean temporary worktree or clone.
4. Copy in the current release snapshot from the verified Forgejo state.
5. Review the copied tree for:
   - private data
   - runtime-only files
   - local `.env` values
   - internal-only notes you do not want in the public mirror
6. Create one new release commit in that clean GitHub worktree.
7. Push that single release commit to `github/main`.

Result:

- Forgejo keeps the detailed history.
- GitHub gets one clean new public release commit.

## Pull request policy

External pull requests should not be merged blindly into the curated GitHub
history.

Treat a PR as proposed source material, not as something that must be merged
verbatim.

Recommended process:

1. Review the PR for technical quality, scope, and project fit.
2. Rebase, rewrite, or manually reapply the useful parts onto the latest
   `forgejo/main` if needed.
3. Run the normal verification steps on the cleaned result.
4. Commit the accepted result into Forgejo history in the shape you actually
   want to keep.
5. Include that accepted work in the next curated GitHub release snapshot.

This means:

- you may accept the contribution without preserving the contributor branch
  history in the public release mirror
- you should prefer clean maintained history over literal PR history
- you should not merge stale or messy PR branches directly into `github/main`

## Rule for incoming PRs

Before accepting an external PR, make sure the accepted code is clean against
the latest `forgejo/main`.

In practice, that usually means one of these:

- ask the contributor to rebase and clean up the PR
- locally rework the changes onto a fresh branch from current `forgejo/main`
- cherry-pick or manually reapply only the parts you want

Do not merge an outdated PR branch just because the final code is useful.

## Release checklist

Before pushing a public GitHub snapshot:

- `forgejo/main` contains the verified release candidate
- `npm run ci` passes on the exact release state
- README and env docs match the release behavior
- version numbers and build identifiers are updated
- tracked files do not contain private data or local runtime secrets
- the release snapshot was assembled from a clean GitHub baseline
- GitHub will receive one intentional new release commit

## Why this workflow exists

This project moves quickly and often includes exploratory work, internal
planning, and multi-step refactors. That development style is useful internally,
but it is not the best public release history for an open-source mirror.

This workflow keeps both benefits:

- honest development history in Forgejo
- curated public releases on GitHub
