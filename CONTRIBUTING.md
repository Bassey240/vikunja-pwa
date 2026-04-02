# Contributing to Vikunja Mobile PWA

Thanks for your interest in contributing! This project is maintained by a solo
developer, so these guidelines help keep things manageable.

## Before you start

1. **Open an issue first.** Before writing code, open an issue describing what
   you want to change and why. This avoids wasted effort if the change doesn't
   fit the project direction.
2. **Wait for a response.** I'll try to reply within a few days. If the change
   makes sense, I'll give you a go-ahead.

## Submitting changes

1. **Fork the repo** and create a branch from `main`.
2. **Keep PRs small and focused.** One feature or fix per pull request.
3. **Follow the existing code style.** Look at the surrounding code and match
   its patterns.
4. **Test your changes.** Run `npm run ci` before submitting. If you add new
   functionality, add or update the relevant smoke tests.
5. **Write a clear PR description.** Explain what you changed and why.
6. **Mention release-note-worthy changes.** If your PR changes user-visible
   behavior, deployment, or contributor workflow, call that out clearly so it
   can be added to `docs/next-release-notes.md`.

Maintainer note: this project keeps full day-to-day development history on
Forgejo and uses GitHub as a curated public release mirror. That means accepted
PRs may be rebased, rewritten, squashed, or manually reapplied before they are
included in a public GitHub release snapshot. The maintained workflow is
documented in [docs/public-release-workflow.md](docs/public-release-workflow.md).

## What gets merged

This project follows a Benevolent Dictator governance model. The maintainer has
final say on what gets merged. A PR may be declined if it doesn't align with the
project's direction, even if the code is good. Don't take it personally.

## Copyright and licensing

This project is licensed under AGPL-3.0-only. By submitting a pull request, you
agree that your contributions are licensed under the same terms.

You retain copyright over your own contributions. The project copyright is held
by Sebastiaan ten Broek (the original author). There is no CLA (Contributor
License Agreement) required.

## Code of conduct

Be respectful and constructive. Harassment, trolling, or disruptive behavior
will result in being blocked from the project.

## Questions?

Open a Discussion on the GitHub repo if you have questions that aren't bug
reports or feature requests.
