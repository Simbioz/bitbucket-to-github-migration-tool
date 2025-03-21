# bitbucket-to-github-migration

This repo contains scripts to batch-migrate repos from Bitbucket to Github.
It could easily be adapted to migrate between two other git cloud providers.

Can safely be interrupted and resumed later as progress is tracked in "working"
files during the whole process, ensuring nothing falls between cracks.

## Usage

1. Copy `info.template.json` as `info.json` and fill the blanks.
2. Run `node get-repos.js` to fetch a list of all repos on the source provider (creates `repos.json`).
3. Run `node migrate-repos.js` to batch-migrate repos.

The `migrate-repos.js` script only uses `repos.json` on the first run to create its 3 "working"
JSON files in the `repos` subdirectory:

- `unmigrated.json` contains all repos that remain to be migrated (initially taken from `repos.json`)
- `migrated.json` contains all repos that have successfully been migrated
- `failed.json` contains all repos that failed to migrate for any reason

This means that you can start the migration and let it run without thinking about it,
then after the first pass is done you can see if any repos failed to migrate (in `failed.json`)
and retry them by moving them to the `unmigrated.json` file manually once the issue(s)
have been corrected.

The script will not delete anything from the source provider.

## CLI Flags

- `--lfs='*.mp4,*.mov'` to specify patterns to import into Git LFS (will rewrite history) before pushing
  the updated repo to the new remote.

- `--confirm-before-push` pauses execution before push, allowing things such as setting up Git LFS
  for repos that contain files too large to push directly.

- `--confirm-before-next` asks before proceeding with the next repo. Useful if you want to try to
  figure out why one repo's migration fails or to perform manual verifications after each repo migration.

- `--ignore-failed` does not move a repo from `unmigrated.json` to `failed.json` on failure. Useful with
  to avoid having to manipulate files when you have to retry migrating the same repo multiple times.
