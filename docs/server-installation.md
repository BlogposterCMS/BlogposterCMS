# Server installation

The supported integrated setup is Linux with systemd, Docker Compose, Node.js
24+ at `/usr/bin/node`, GitHub CLI (`gh`), `jq`, `curl` and `flock`. Run behind an
HTTPS reverse proxy. The installer checks prerequisites before changing the host;
it does not replace the server's package manager or proxy configuration.

Download one reviewed release into an empty directory, verify its installer,
then run the combined installation. Use the same exact tag for all assets:

```sh
gh release download v0.10.0-rc.2 --repo BlogposterCMS/BlogposterCMS --dir blogposter-release
cd blogposter-release
gh attestation verify install-blogposter --bundle update-control.bundle.json \
  --repo BlogposterCMS/BlogposterCMS \
  --signer-workflow BlogposterCMS/BlogposterCMS/.github/workflows/release.yml \
  --source-ref refs/tags/v0.10.0-rc.2 --deny-self-hosted-runners
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
