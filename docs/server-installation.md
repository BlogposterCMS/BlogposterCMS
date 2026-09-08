# Server installation

The supported integrated setup is Linux with systemd, Docker Compose, Node.js
24+ at `/usr/bin/node`, GitHub CLI (`gh`), `jq`, `curl`, `flock` and GNU `timeout`. Run behind an
HTTPS reverse proxy. The installer checks prerequisites before changing the host;
it does not replace the server's package manager or proxy configuration.

The official container package is public. Starting with release 0.10.1, signed
image provenance is also included as `blogposter-image.bundle.json`, so normal
installation/update verification needs no stored GitHub login. Verify the
downloaded control bundle before running it; do not disable signature checks.
Existing installations need the signed host bundle 1.2.2 installed once;
it includes socket-lifecycle and bounded network-retry corrections.

Download one reviewed release into an empty directory, verify its installer,
then run the combined installation. Use the same exact tag for all assets:

```sh
mkdir blogposter-release
cd blogposter-release
release_url=https://github.com/BlogposterCMS/BlogposterCMS/releases/download/v0.10.3
# Public HTTPS downloads avoid the login required by gh release download.
for asset in install-blogposter install-update-agent create-install-config.js \
  update-agent.js blogposter-update blogposter-update-agent.service \
  blogposter-updates.compose.yml blogposter.compose.yml \
  blogposter-updater.conf.example blogposter-update.json \
  blogposter-update.bundle.json update-control.bundle.json; do
  curl --fail --location --proto '=https' --tlsv1.2 --connect-timeout 15 \
    --max-time 90 --output "$asset" "$release_url/$asset" || exit 1
done
gh attestation verify install-blogposter --bundle update-control.bundle.json \
  --repo BlogposterCMS/BlogposterCMS \
  --signer-workflow BlogposterCMS/BlogposterCMS/.github/workflows/release.yml \
  --source-ref refs/tags/v0.10.3 --deny-self-hosted-runners
sudo bash install-blogposter --origin https://cms.example.com
```

The installer verifies its remaining assets and image, generates independent
secrets and an RSA key pair, creates the canonical `/opt/blogposter` configuration,
creates the Docker proxy network, provisions the restricted host executor and
starts the CMS. It checks container readiness, running version and Unix-socket
access as the container user. Configuration and secrets are never printed.

Connect your HTTPS proxy to `blogposter:3000` on `blogposter-proxy` (or pass an
existing network with `--proxy-network NAME`), then open the origin's `/install`
wizard to create your administrator and site. Port 3000 is not published to the
internet. DNS, HTTPS certificates and proxy ownership remain with the host.

## Existing installations

On hosts with `/opt/blogposter/updater.conf`, run the same verified bundle:

```sh
sudo bash install-blogposter
```

This preserves existing runtime configuration, secrets, image selection and
data. It installs/restarts the host executor and recreates the existing CMS
service once to connect the socket. A currently running update blocks this step
with `CORE_UPDATE_SETUP_BUSY`. Custom deployment paths stay in the existing
updater config; the entry point remains `/opt/blogposter/updater.conf`.

Use installer assets from 0.10.2 or newer when reconnecting an existing host.
Older service units removed their runtime directory on restart, leaving the
running CMS bound to an orphaned directory. The current unit preserves that
directory across stop/start, and the installer forces one CMS-only recreation
to repair an existing stale mount. This does not replace or clear named volumes.

The CMS must contain the Updater module to own background discovery. Update older
images through the existing verified updater after connecting the host. An
ordinary CMS image update never changes root-owned executor code automatically;
rerun the reviewed installer for future executor upgrades.

## Recovery and acceptance

Generated fresh-install files use exclusive creation: retrying never rotates
credentials. If setup fails after configuration creation, resolve the reported
error and rerun without `--origin`; inspect partial configuration instead of
deleting it or replacing secrets. Existing hosts are never reinstalled as new.

`CORE_UPDATE_SETUP_SOCKET_MISSING`, `CORE_UPDATE_SETUP_READINESS_FAILED` and
`CORE_UPDATE_SETUP_CONTAINER_ACCESS_FAILED` distinguish host service, CMS startup
and container group/mount failures. A failed setup is not reported as complete.

This preview has module, configuration and executor regression tests. Real
Linux provisioning, container replacement and rollback remain required before
stable OTA promotion. Windows/source development can run the CMS without the
host executor; the Update Center then reports hosting setup is required.

## UI-installed extension persistence

The official Compose contract also mounts named volumes at `/app/modules` and
`/app/widgets`. Include both paths in `BLOGPOSTER_DATA_DESTINATIONS` alongside
`/app/data,/app/library` so the host updater backs up and restores package bytes
with their registry, settings and integrity receipts. Existing installations must
migrate their current extension directories before replacing a container; never
attach empty volumes over an existing customized tree without preserving it.

Release-owned files copied into those volumes remain subject to the signed
baseline. If a later release changes such bundled files, synchronize those exact
files from the verified release image during the deployment migration; a stale
or modified baseline fails closed. Locally approved packages may not replace a
release-owned extension. This change does not deploy or migrate an existing host.
