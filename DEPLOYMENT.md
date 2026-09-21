# Static prototype deployment

Run commands from `prototype/`. The Astro 7 application builds static files in
`dist/`. The Docker builder uses Node 22 Alpine, `npm ci`, and `npm run build`;
the runtime is Caddy 2 Alpine serving only the generated files. A committed
`package-lock.json` matching `package.json` is required. No Node server or data
editing API runs in the deployed container.

All records are fictional demonstration material. Keep the site's fictional-data
banner and illustrative labels visible. See [DEMO.md](DEMO.md) for the walkthrough.

## Local development and checks

Use Node 22.19+ (the latest Node 22 LTS is recommended; `.nvmrc` and Docker use Node 22):

```sh
npm ci
npm run dev
```

Browse `http://localhost:4321`. Keep the development server local; never expose it
as the public demo. Before publishing, run the project's individual checks:

```sh
npm run check
npm run build
npm run test:unit
npx playwright install chromium
npm run test:e2e
```

On a Linux test host missing browser system libraries, use
`npx playwright install --with-deps chromium` with appropriate system privileges.
`npm run verify` runs these project checks together once browser dependencies are
installed. Docker builds do not run tests.

## Local Docker preview over HTTP

Install Docker Engine/Desktop and the Compose v2 plugin. Copy `.env.example` to
`.env`, then set:

```dotenv
DEMO_HOST=http://localhost
HTTP_PORT=8080
HTTPS_PORT=8443
BIND_ADDRESS=127.0.0.1
DEMO_IMAGE=evidence-hub-demo:local
```

```sh
docker compose config --quiet
docker compose build web
docker compose up -d
docker compose logs --tail=100 web
```

Browse **http://localhost:8080**. `HTTP_PORT` maps host port 8080 to Caddy's
container port 80. Do **not** use `DEMO_HOST=http://localhost:8080`: that would
make Caddy listen on container port 8080, which this Compose file does not map.
`DEMO_HOST=localhost` (the default) instead enables Caddy's local HTTPS CA;
browsers will not trust it unless its root certificate is separately installed.
Use the HTTP settings above for the simplest local preview.

## Public Azure VM / DNS deployment

1. Provision a Linux VM with Docker Engine and Compose v2, a stable public IP,
   and enough disk/RAM for an npm build. Use an SSH key. Limit inbound SSH TCP 22
   in the Azure Network Security Group (NSG) to your administrator's current
   public IP/CIDR, rather than all internet sources.
2. Assign the public IP an Azure DNS name such as
   `your-demo.uksouth.cloudapp.azure.com`, or create a custom DNS A record pointing
   to it. Publish an AAAA record only if IPv6 routing actually works. Ensure the
   chosen hostname resolves to this VM before requesting certificates.
3. Allow inbound TCP **80 and 443** in the NSG and any host firewall. Caddy uses
   these for HTTP redirects, certificate validation and HTTPS. Leave outbound
   DNS/HTTPS available. HTTP/3 is optional: uncomment the UDP mapping in
   `compose.yaml` and allow UDP 443 as well. TCP HTTPS works without it.
4. Upload the source as below, and configure `.env` on the VM:

   ```dotenv
   DEMO_HOST=your-demo.uksouth.cloudapp.azure.com
   HTTP_PORT=80
   HTTPS_PORT=443
   BIND_ADDRESS=0.0.0.0
   DEMO_IMAGE=evidence-hub-demo:local
   ```

   Use the actual hostname, without a scheme, path or port, for public automatic
   TLS. Caddy obtains and renews its public certificate automatically. No Azure
   credentials belong in this file.
5. Run `docker compose config --quiet`, `docker compose build web`, then
   `docker compose up -d`. Inspect `docker compose logs --tail=100 web` and open
   `https://your-demo.uksouth.cloudapp.azure.com`. Diagnose DNS, NSG and port
   conflicts if certificate issuance fails.

### Upload source and build on the VM

From the local `prototype/` directory, substitute your SSH user and VM hostname:

```sh
ssh azureuser@YOUR_VM 'mkdir -p ~/evidence-hub-demo'
rsync -av \
  --exclude=node_modules/ --exclude=dist/ --exclude=.astro/ \
  --exclude=.git/ --exclude=.env --exclude='.env.*' \
  --exclude=coverage/ --exclude=playwright-report/ \
  --exclude=test-results/ --exclude=blob-report/ \
  --exclude='.cache/' --exclude='*.log' --exclude='*.tar*' \
  ./ azureuser@YOUR_VM:~/evidence-hub-demo/
```

Create `.env` manually on the VM using the values above; the transfer deliberately
excludes environment files. Run deployment commands from `~/evidence-hub-demo` on
the VM. This transfer uses no `--delete`. Caddy state is in named Docker volumes,
not in the uploaded source tree. If you have enabled reviewer authentication,
preserve the VM's locally edited Caddyfile before another source upload or add
`--exclude=Caddyfile` to subsequent transfers.

### Alternative: build locally and upload a prebuilt image

Use a build platform matching the VM (`linux/amd64` below; use `linux/arm64` for an
ARM VM). Docker Buildx and cross-platform emulation may be needed on the build
machine. Choose a unique release tag:

```sh
docker buildx build --platform linux/amd64 --load -t evidence-hub-demo:demo-001 .
docker save -o /tmp/evidence-hub-demo-demo-001.tar evidence-hub-demo:demo-001
ssh azureuser@YOUR_VM 'mkdir -p ~/evidence-hub-demo'
scp /tmp/evidence-hub-demo-demo-001.tar azureuser@YOUR_VM:~/
scp compose.yaml Caddyfile azureuser@YOUR_VM:~/evidence-hub-demo/
```

On the VM, load with `docker load -i ~/evidence-hub-demo-demo-001.tar`. Create `.env`
in `~/evidence-hub-demo` with the public settings and
`DEMO_IMAGE=evidence-hub-demo:demo-001`. From that directory run:

```sh
docker compose config --quiet
docker compose up -d --no-build
```

The `--no-build` option is essential when only an image and runtime configuration
were uploaded. Source and npm are unnecessary on this runtime host. The mounted
`Caddyfile` is required even though the image also contains a default copy.

## Routing, headers and smoke checks

Caddy uses `try_files {path} {path}/index.html =404`: real files and generated
directory-index routes resolve; unknown paths return **404**, never a homepage
SPA fallback. The error handler serves the generated `404.html` while preserving
the 404 status.

Responses use gzip/zstd negotiation, `X-Content-Type-Options: nosniff`, and
`Referrer-Policy: strict-origin-when-cross-origin`. The CSP allows same-origin
bundled assets, with no third-party origins (data images are permitted). Build
configuration keeps styles external and sets Vite's asset inline limit to zero,
so even small browser scripts remain external bundled assets.
The non-executable JSON data blocks remain usable. There is no `unsafe-inline`
or `unsafe-eval`. Recheck browser console errors and interactions whenever
changing this policy or adding third-party widgets.

```sh
curl -I http://localhost:8080/
curl -I http://localhost:8080/this-route-does-not-exist
```

Expect 200 and 404 respectively; use your HTTPS hostname for public checks.
Follow [DEMO.md](DEMO.md), refresh a record's direct URL, follow its source link,
and confirm filters and map work with no CSP errors. A successful Compose
configuration check alone does not validate a built site or DNS/TLS.

## Optional reviewer password protection

Enable this only on HTTPS; Basic authentication sends reusable credentials and
must not be used on a public HTTP endpoint. There is no default password and no
password environment variable. Generate a bcrypt hash interactively on a trusted
terminal (the command prompts for the password; do not put it in shell history):

```sh
docker compose exec web caddy hash-password --algorithm bcrypt
```

Inside the existing site block in the host `Caddyfile`, add this block, replacing
the placeholder with the full generated hash:

```caddyfile
basic_auth {
    reviewer REPLACE_WITH_GENERATED_BCRYPT_HASH
}
```

The placeholder is deliberately not a working credential. Keep the hash in the
Caddyfile, not Compose YAML or `.env` (bcrypt contains `$` characters). Treat it
as sensitive configuration, keep the modified file out of public version control,
and share the password separately. The block protects all paths, including
assets and illustrative sources; it does not create individual user accounts.

Validate, then reload the mounted configuration:

```sh
docker compose exec web caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker compose exec web caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
```

Confirm an unauthenticated HTTPS request returns 401 and a browser prompts before
showing content. If your editor atomically replaces the bind-mounted file and the
container sees an old copy, recreate the service with
`docker compose up -d --no-build --force-recreate web` and recheck. Preserve the
local authentication block when uploading a new Caddyfile.

## Updates, rollback and persistence

Edit `src/data/records.json` in the source workspace, run checks, rebuild and
redeploy. `releaseApproved` controls build-time publication; setting it to false
does not withdraw an already deployed page until the new build is deployed.
Neither the browser nor the runtime container edits the register. Keep the raw
register outside `public/`; only approved, generated content should reach `dist/`.

For source deployments: upload changes, then run `docker compose build web` and
`docker compose up -d`. For image deployments: load a newly tagged image, change
`DEMO_IMAGE`, then run `docker compose up -d --no-build`. Retain the previous
image tag and matching runtime configuration to roll back by restoring them and
running the same command. Recreating this single container can briefly interrupt
service; this is not a zero-downtime cluster.

Keep the same Compose project directory/name so its `caddy_data` and
`caddy_config` volumes are reused. They persist certificates and Caddy state
across rebuilds/restarts. `docker compose stop` pauses the demo;
`docker compose down` removes its containers/network but retains named volumes.
Do not use `docker compose down -v` or prune these volumes as part of deployment.
Back up certificate state and the runtime configuration using your normal VM
backup process. This guide performs no actual VM provisioning or deployment.
