# Changesets

This folder is managed by [changesets](https://github.com/changesets/changesets).

When a PR changes published behavior, run `bun run changeset` and commit the generated file. On
merge to `main`, the release workflow opens (or updates) a "chore: release" PR that bumps the
version and CHANGELOG. Merging that PR builds and checks the plugin, verifies that the package
and manifest versions match, and attests the three release assets before publishing a GitHub
release with that version's CHANGELOG entry as its notes. The release tag and title both use
the exact version without a `v` prefix. Missing or empty release notes stop publication.
The workflow does not publish to npm.
