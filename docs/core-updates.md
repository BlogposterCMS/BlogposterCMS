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
- `blogposter-update.bundle.json`: GitHub/Sigstore attestation bundle for the
  update manifest;
- `blogposter-image.bundle.json`: the signed OCI image provenance, verified
  with `gh attestation verify --bundle` without GitHub API credentials;
- `runtime-integrity-manifest.json` and its `.bundle.json`: the externally
  signed SHA-256 baseline for application code, modules and production
  dependencies;
- `blogposter-update`: pull-only host updater;
- `runtime-integrity-trusted-root.jsonl`: public trust roots exported by the
  release runner after GitHub CLI's normal TUF verification;
- `blogposter-updater.conf.example`: non-secret updater configuration;
- `SHA256SUMS`: release-asset transport checksums;
- `blogposter_cms_build.zip`: browser-build artifact retained for development
  consumers. It is not a complete server update.

`deploy/update-policy.json` is a release gate. Automatic publication fails when
the release is not explicitly marked database-rollback-compatible. Destructive
or one-way migrations need a separate manual migration and recovery plan; they
must not be relabelled as compatible merely to pass the workflow.

## Installation layout

### In-app control (Linux systemd hosts)

The existing `/admin/settings/updates` now contains Blogposter core updates
alongside module updates. The core Updater module checks at startup and every six hours;
the Notification Center displays one current release notice to administrators
with `settings.core.edit`. Checks do not install or restart automatically.
The UI submits the exact reviewed version/digest, follows host progress across
the CMS restart, and reports success, rollback or required operator recovery.

Use the [combined server installation](server-installation.md) for a new server
or to connect an existing host. End users need no shell commands for subsequent CMS updates. The host
needs Node.js 24+ at `/usr/bin/node`, systemd and the existing updater prerequisites.
Download a single release's `install-update-agent`, `update-agent.js`,
`blogposter-update`, `blogposter-update-agent.service`,
`blogposter-updates.compose.yml` and `update-control.bundle.json` together.
Before running the provisioning script, verify it:

```sh
gh attestation verify install-update-agent --bundle update-control.bundle.json \
  --repo BlogposterCMS/BlogposterCMS \
  --signer-workflow BlogposterCMS/BlogposterCMS/.github/workflows/release.yml
sudo bash install-update-agent
```

The installer verifies the remaining control assets, installs a dedicated
systemd service and group, records the Compose overlay in the existing updater
configuration, records its supplementary GID in the Compose environment and
recreates the CMS container once to mount the socket. Existing updater setup
must already be at `/opt/blogposter/updater.conf`. Both installation and rollback
keep the overlay. Never add untrusted host users to `blogposter-updater`.

Without the agent the UI reports hosting setup is required. If the connection
fails it reports unavailable, not up to date. Existing releases without embedded
notes retain the official release-notes link. Host-agent state under
`/var/lib/blogposter-update-agent` is separate from backed-up CMS volumes.
`CORE_UPDATE_AGENT_INTERRUPTED` blocks further jobs: the operator must inspect
the running image, updater lock, volume backup and recovery outcome before
reinitializing agent state. Do not clear it to bypass an unresolved recovery.

The ordinary CMS image update does not replace the host agent. Future changes
to the local control protocol need an explicit host-agent compatibility and
upgrade plan. Non-systemd hosts retain the existing CLI updater until an
equivalent supervised host adapter is provisioned.

### Persistent application layout

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
`docker`, `flock`, `jq`, `sha256sum` and GitHub CLI (`gh`). Verification uses
the public release attestation bundle, so no private signing key belongs on the
host. Production remains pull-only: do not install dependencies, build source,
sign files or create images on the host.

Host updater 1.2.0 (CMS release 0.10.1) fixes a verified first-install/update
failure: CLI 2.96.0 requires authentication for its default image-attestation
API lookup, including with `--bundle-from-oci`. The detached `--bundle` path
does not require that login. The updater downloads the exact release's image
proof with a 90-second/2-MiB bound and keeps all signature/source restrictions.
It never falls back to digest-only trust when the proof is missing or invalid.
Public GHCR images need no persistent registry credential; private packages
still require an independently provisioned read-only registry credential.
Rerun the verified combined installer to upgrade an existing host executor
before applying a release requiring updater 1.2.0. Older releases without the
image-bundle asset are not installable with this new anonymous verification path.

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

The check and apply commands first verify the detached update-manifest
attestation against the fixed repository, release workflow and exact release
tag. Apply then fails closed unless the running image and candidate are both
digest-pinned. It verifies the configured trust mode, pulls the new image, runs
the native SQLite/bcrypt/Express smoke, stops the single SQLite writer, archives
the named `/app/data` and `/app/library` volumes with SHA-256 checksums, starts
the new image and waits for `/health/ready`. It then verifies that the packaged
version matches the release manifest. Any failure after shutdown automatically
restores the recorded volumes and previous image.

Before replacing an older container, the updater seeds its notification
integration registry into `/app/data/notificationManager` only when no
persistent registry exists yet. This one-time compatibility step preserves
existing settings; it never overwrites the data-volume copy. Subsequent release
defaults remain read-only inside the signed application tree.

The updater intentionally supports named volumes only. A bind-mounted database
could resolve to an unexpectedly broad host path and is therefore rejected with
`CORE_UPDATE_VOLUME_TYPE_UNSUPPORTED` instead of being modified.

## Host-agent restarts

Host bundle 1.2.3 corrects a separate image-verification failure in 1.2.0-1.2.2:
GitHub CLI requires `.json` or `.jsonl` on the downloaded bundle's local path.
An extensionless temporary file produces `CORE_UPDATE_ATTESTATION_INVALID`
even when its bytes are valid. The updater now retains `.json`; exact digest,
source, workflow and signature restrictions are unchanged. Release CI runs
the real image-proof helper with isolated credentials and checks both a valid
release and a wrong source commit. Install the signed 0.10.4 host bundle before
retrying an affected host. Ordinary CMS image updates do not replace that tool.

Host bundle 1.2.2 bounds release metadata downloads to a 15-second connection
timeout, 45 seconds per attempt, at most three retries and a 120-second retry
window (the final attempt can finish after that window). The declared-size
limit is 2 MiB. Signed bytes are still untrusted until provenance verification.
The verifier gets at most three 60-second attempts with a five-second forced
termination grace. Only recognizable transport failures retry; invalid
signatures or identities fail immediately. Persistent network errors use
`CORE_UPDATE_ATTESTATION_NETWORK_FAILED` or
`CORE_UPDATE_MANIFEST_ATTESTATION_NETWORK_FAILED`, without exposing raw output.
This improves intermittent connectivity; it cannot make blocked registries or
permanently unavailable GitHub endpoints reachable.

Host-agent lifecycle note: installer assets from 0.10.2 preserve
`/run/blogposter-updater` across systemd stop/start and reconnect the CMS mount
even when Compose configuration is unchanged. This prevents
`CORE_UPDATE_SETUP_CONTAINER_ACCESS_FAILED` on repeated installation. The
socket remains restricted to the dedicated group; the CMS still has no Docker
socket or writable host directory. Reboot clears `/run` normally.
The release requires host executor 1.2.1 so older installations are prompted
to install the corrected host bundle instead of silently retaining the old unit.

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

## Runtime self-verification

Every production image contains the integrity manifest and detached bundle
created externally for its exact packaged version. The bundled `gh` verifier
uses the image-owned `runtime-integrity-trusted-root.jsonl` with
`--custom-trusted-root`. A detached bundle alone is insufficient: GitHub CLI
otherwise refreshes its TUF roots over the network. Release CI exercises the
final non-root image with `--network none` before publishing release assets.
The verifier checks the GitHub/Sigstore signature offline against the same fixed repository,
release workflow and source commit used by the host updater before Blogposter
loads its event bus or any
module. It then hashes the application code, community modules and production
dependencies.

A core or dependency deviation stops startup with
`RUNTIME_INTEGRITY_CORE_MISMATCH`. A changed community module is recorded with
`RUNTIME_INTEGRITY_MODULE_BLOCKED`, excluded before event registration and
hashed once more immediately before each isolated module process starts. These
events are emitted as structured audit log records. Read-only
`data/module-overrides` remain outside the signed executable tree; their policy
continues to deny backend entries and manifests.

There is intentionally no local resign command. A new trusted baseline can be
created only by the tag-triggered GitHub release workflow. Production also
rejects `BLOGPOSTER_RUNTIME_INTEGRITY=off`; unavailable or invalid integrity
artifacts therefore stop startup instead of silently weakening verification.
Packaged manifests without their trust roots fail with
`RUNTIME_INTEGRITY_TRUST_ROOT_MISSING`; no runtime configuration can replace
those image-owned anchors. Source installations without packaged artifacts
retain GitHub CLI's normal online TUF verification. Refresh anchors through a
new externally verified release image, not writable runtime state.
