# Safe core updates

BlogposterCMS core releases are replaced as complete immutable container images.
The updater never patches the running application folder. `/app/data`,
`/app/library` and the separately mounted module overrides remain outside the
image and are restored together with the previous digest if cutover fails.

## Release contract

An exact `vX.Y.Z` tag matching `package.json` runs the full audit, build, test
and CodeQL gates. The release workflow then publishes the complete server image
to `ghcr.io/blogpostercms/blogpostercms`, records its immutable digest, creates
a GitHub build-provenance attestation and attaches these assets to the release:

- `blogposter-update.json`: source commit, version, image digest and rollback
  policy consumed by the updater;
- `blogposter-update`: pull-only host updater;
- `blogposter-updater.conf.example`: non-secret updater configuration;
- `SHA256SUMS`: release-asset transport checksums;
- `blogposter_cms_build.zip`: browser-build artifact retained for development
  consumers. It is not a complete server update.

`deploy/update-policy.json` is a release gate. Automatic publication fails when
the release is not explicitly marked database-rollback-compatible. Destructive
or one-way migrations need a separate manual migration and recovery plan; they
must not be relabelled as compatible merely to pass the workflow.

## Installation layout

Use `deploy/blogposter.compose.yml` with three separate environment files:

1. a protected CMS runtime environment referenced by `BLOGPOSTER_ENV_FILE`;
2. a non-secret Compose interpolation file based on `deployment.env.example`;
3. a dedicated `release.env` containing only the updater-owned
   `BLOGPOSTER_IMAGE=registry/repository@sha256:...` value.

Keep customizations in their own Git repository and mount only its
`module-overrides/` directory read-only at `/app/data/module-overrides`.
Never commit the complete CMS `data/` directory; it contains databases,
installation state and other mutable private data.

## Host prerequisites

The updater targets Linux Docker Compose hosts and requires `bash`, `curl`,
`docker`, `flock`, `jq` and `sha256sum`. GitHub provenance mode additionally
requires an authenticated GitHub CLI (`gh`). Production remains pull-only: do
not install dependencies, build source or create images on the host.

Create the deployment, release and updater files under a protected host
directory, then validate the Compose configuration before the first update:

```sh
docker compose \
  --project-directory /opt/blogposter \
  --env-file /opt/blogposter/deployment.env \
  --env-file /opt/blogposter/release.env \
  -f /opt/blogposter/blogposter.compose.yml config --quiet
```

Check and apply an available stable update:

```sh
install -m 0755 blogposter-update /opt/blogposter/bin/blogposter-update
/opt/blogposter/bin/blogposter-update check --config /opt/blogposter/updater.conf
/opt/blogposter/bin/blogposter-update apply --config /opt/blogposter/updater.conf
```

The apply command fails closed unless the running image and candidate are both
digest-pinned. It verifies the configured trust mode, pulls the new image, runs
the native SQLite/bcrypt/Express smoke, stops the single SQLite writer, archives
the named `/app/data` and `/app/library` volumes with SHA-256 checksums, starts
the new image and waits for `/health/ready`. It then verifies that the packaged
version matches the release manifest. Any failure after shutdown automatically
restores the recorded volumes and previous image.

The updater intentionally supports named volumes only. A bind-mounted database
could resolve to an unexpectedly broad host path and is therefore rejected with
`CORE_UPDATE_VOLUME_TYPE_UNSUPPORTED` instead of being modified.

## Manual rollback

Manual rollback restores the pre-update backup and can discard content written
after a successful update. It therefore requires explicit acknowledgement:

```sh
/opt/blogposter/bin/blogposter-update rollback \
  --config /opt/blogposter/updater.conf \
  --confirm-data-loss
```

Keep the previous image, the backup directory and `updater-state/last-success.json`
until the authenticated save/read/reload, public pages, nested routes and media
checks pass. Container readiness proves startup and packaged version; it does
not replace those application-level acceptance checks.

## Trusted registry mirrors

Installations that cannot pull GHCR may use an independently reviewed mirror.
Set an exact mirror reference including its digest, choose
`BLOGPOSTER_ATTESTATION_MODE=registry-digest`, and constrain it with
`BLOGPOSTER_TRUSTED_REGISTRY_PREFIX`. This mode trusts that registry and the
operator's external source-build verification; it does not claim GitHub's
attestation applies to a separately rebuilt image.
