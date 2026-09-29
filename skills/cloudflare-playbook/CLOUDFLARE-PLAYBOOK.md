# Cloudflare + Astro Playbook

A project-agnostic reference distilled from building real sites on this
stack — the patterns and gotchas that would apply to any small
Astro-on-Cloudflare project. It lives in one place and projects
*reference* it rather than copying it (as the `cloudflare-playbook` Claude
Code skill, or by link), so a fix made here reaches every project. When a
project hits a gotcha that would apply to any project on this stack, add
it here in project-agnostic terms.

## Security checklist for a new project

Each line links to the section with the reasoning — most of these were
learned the hard way on the project this came from, including a live
admin bypass.

**Access & admin**
- [ ] Every mutating route under one admin prefix, covered by an Access
      Application with both `admin` and `admin/*` destinations
      ([Cloudflare Access](#cloudflare-access))
- [ ] App also verifies Access's JWT, keyed on the *matched route*, fails
      closed ([Cloudflare Access](#cloudflare-access))
- [ ] `workers_dev: false` and `preview_urls: false` — one public hostname
      ([wrangler.jsonc patterns](#wranglerjsonc-patterns),
      [Cloudflare Access](#cloudflare-access))
- [ ] Access policy Include = specific emails, never "Login Method: OTP"
      ([Cloudflare Access](#cloudflare-access))

**Browser**
- [ ] Astro `security.csp` on; no inline handlers/styles; middleware
      *merges* `frame-ancestors` into the SSR CSP header; `public/_headers`
      covers static assets
      ([Security headers & CSP](#security-headers--csp-astro-on-workers))
- [ ] URLs from data in `href`/`src` are scheme-checked (`https:` only)
- [ ] Browser-tested against a production build, asserting each page
      actually *has* a CSP before trusting "zero violations"

**Data & photos**
- [ ] Secrets as Worker secrets, never `vars`
      ([wrangler.jsonc patterns](#wranglerjsonc-patterns))
- [ ] Uploads re-encoded before storage; served only via a re-encoding
      route as WebP; R2 public access off; metadata stripping *tested*
      ([Photo/image pipeline](#photoimage-pipeline-if-the-project-has-user-uploaded-photos))
- [ ] Image delivery accepts only a fixed set of widths, with a canonical
      cache key (free-tier quota abuse otherwise)
- [ ] Query remote D1 before any destructive migration
      ([D1 + Drizzle migration safety](#d1--drizzle-migration-safety))

**Supply chain & CI**
- [ ] `.npmrc`: `strict-allow-scripts=true`, `min-release-age`,
      `allow-git=none`, `allow-remote=none`; install scripts reviewed
      ([Supply chain](#supply-chain-npm-ci-and-ai-assisted-development))
- [ ] CI: Node pinned to a version whose npm enforces that policy (plus a
      guard step), actions pinned to SHAs, `npm audit signatures` after
      `npm ci`, deploy token scoped to the steps that need it
      ([CI/CD & branching](#cicd--branching))
- [ ] Deploy token: Account API Token with separate account- and
      zone-scoped policies
- [ ] Dependabot: version updates to a non-deploying branch with a
      cooldown; alerts, malware alerts, (grouped) security updates on
      ([GitHub repository security settings](#github-repository-security-settings-dependabot))
- [ ] AI agents need approval to `npx`/`npm install`; routine commands via
      `npm run`; local `wrangler` logged out when not in use
      ([Supply chain](#supply-chain-npm-ci-and-ai-assisted-development))

## Stack

- **Astro** with the official `@astrojs/cloudflare` adapter, targeting
  Workers-with-assets — not Cloudflare Pages. Pages is being folded toward
  parity with Workers, not the other way around; Workers-with-assets (a
  Worker that serves a built static-assets folder alongside server code) is
  the native, forward-looking target and gets you the full binding set
  (D1, R2, KV, Images) in one `wrangler.jsonc`.
- **D1** (SQLite) + **Drizzle ORM** for the database.
- **R2** for object storage (photos, etc.) — S3-compatible, zero egress fees.
- **Cloudflare Images** (the `IMAGES` binding, auto-provisioned by the
  adapter) for resizing/format-converting images at request time or upload
  time — see the photo pipeline section below.
- **Cloudflare Access** to gate admin routes (or the whole site pre-launch)
  without building any app-level auth.
- **Resend** for transactional email (order confirmations, notifications),
  called via `fetch` from an API route.
- **Cloudflare Email Routing** for real inbox forwarding on the domain
  (e.g. `contact@yourdomain.com` → a Gmail inbox) — fully scriptable via
  `wrangler email routing`, no dashboard needed.
- **GitHub Actions** for CI/CD, triggered on push to `main`.

## Cost / free tier

This whole stack was chosen for "no separate backend needed" convenience,
but as a side effect, every piece of it (Workers, D1, R2, KV, the Images
binding, Access, Turnstile, Email Routing) has a free tier generous enough
that a small/personal-scale project (low thousands of page views/month,
not viral traffic) can realistically run at **$0/month**, aside from
whatever's not Cloudflare (domain registration, and an email provider like
Resend — which also has its own free tier at that scale). Two things worth
carrying into a new project:

- **Verify current numbers before relying on them** — pricing/free-tier
  limits do change, and they're worth re-checking against each product's
  official pricing page at the time, not assumed from a prior project's
  docs. Cite the check date when you write it down (the `new-project`
  template's `docs/ARCHITECTURE.md` has the pattern: a small table of
  service → free-tier limit → expected usage, with the date checked).
- **The Images binding's free tier is bundled with the Workers free
  plan** — a commonly-missed point, since "Cloudflare Images" the
  standalone storage/delivery *product* is paid, and it's easy to assume
  the binding is too. It isn't (at least not up to a real, usable
  transform volume per month) — confirm this is still true, since it's
  the one item in this stack most likely to have a non-obvious cost model.
- If a project's traffic ever did outgrow a free tier, treat the next
  paid tier as cheap insurance rather than a signal to re-architect —
  e.g. Workers Paid is a few dollars a month for a large jump in request
  volume, not a different pricing model to design around from day one.

## wrangler.jsonc patterns

**Secrets vs. vars — the #1 gotcha.** A `vars` entry gets re-pushed as
plaintext on *every* `wrangler deploy`. If a secret (set via
`wrangler secret put NAME`) shares a name with a `vars` entry, the `vars`
value silently overwrites the secret on the next deploy — including a
deploy that has nothing to do with that value. Symptom: a secret that
"worked yesterday" mysteriously reads empty after an unrelated deploy.

Fix: never put a real secret's name in `vars`. Use the `secrets` config
block instead, which keeps it typed on `Env` (via `wrangler types`) and
warns locally if it's unset, without ever pushing a value:

```jsonc
// NOT in vars — a vars entry would clobber the secret on every deploy
"secrets": {
  "required": ["RESEND_API_KEY"]
}
```

**`routes` and `workers_dev` interact.** Adding a `routes` block (to attach
a custom domain) disables the `<name>.<subdomain>.workers.dev` test URL by
default. If you want to keep both the custom domain and the workers.dev URL
live (useful as a fallback / for testing), set `"workers_dev": true`
explicitly. Re-enabling it after it's been disabled has a real
reprovisioning delay (observed several minutes) — set it explicitly from
the start rather than toggling later.

**Custom domain attachment is a real, semi-permanent action.** Setting
`"custom_domain": true` on a route provisions a real public SSL cert, which
gets permanently logged in public Certificate Transparency logs. Comment
the `routes` block out until you actually mean to attach the domain (with
a comment explaining why), rather than attaching it for a quick test.

**A `Custom Domain` route auto-creates its own DNS + cert; a plain `route`
does not.** A plain (non-custom-domain) `route` requires an existing
proxied DNS record on that hostname to work at all — if the zone has no
records yet, traffic never reaches Cloudflare's edge to be routed. Use
`custom_domain: true` for a domain's primary Worker attachment (it
provisions the DNS record for you); reserve plain `routes` for path-scoped
rules on a domain that's already resolving.

**Kill switches as plain `vars`, not secrets.** A boolean feature flag
(e.g. "are we accepting real orders yet") is a great fit for a plain `vars`
entry — non-secret, easy to flip and redeploy, and the "clobber on deploy"
behavior that's a footgun for secrets is exactly what you want here (the
file is the single source of truth, so a stray dashboard edit can't drift
from what's committed).

## TypeScript: worker-configuration.d.ts collides with DOM lib types

`wrangler types` generates `worker-configuration.d.ts` with its own
ambient globals for Cloudflare-specific APIs — notably an `Element`
(for the HTMLRewriter HTML-rewriting API) and a `CacheStorage` (with no
`.default`). These are *ambient*, so they merge into the same global
scope as the DOM lib's types of the same name, in every `.ts` file in
the project — including a plain client `<script>` in a component, not
just server-side code.

This doesn't break every use of `Element`/`CacheStorage` — most DOM
calls still resolve fine. It breaks specifically when you call a
*method name* that exists on both the DOM type and the Cloudflare
ambient type, with an incompatible signature, so the two-line error
messages don't obviously point at the real cause:

- `querySelectorAll<HTMLSelectElement>(...)` can fail with "does not
  satisfy the constraint 'Element'" — call `querySelectorAll` with no
  generic and narrow each result with `instanceof` instead.
- `someElement.before(newNode)` can fail with something like "not
  assignable to string | ReadableStream | Response" — that's
  HTMLRewriter's `Element.before(content)` signature bleeding in, not
  `ChildNode.before()`'s. Use `el.parentElement?.insertBefore(newNode,
  el)` instead.
- `caches.default` can fail to type-check server-side, since the
  ambient `CacheStorage` has no `.default` — cast through a minimal
  local interface (`{ readonly default: { match(...): ...; put(...):
  ...} }`) rather than `any`.

When a plain DOM call fails to type-check with a confusing, seemingly
unrelated error message in a project that has `worker-configuration.d.ts`,
suspect this collision before assuming the code itself is wrong — search
for whether the failing method name also happens to exist on
HTMLRewriter's `Element` or on `CacheStorage`.

## D1 + Drizzle migration safety

- **Never assume a remote/production D1 database only has test data
  before running a destructive migration** (a table drop, a column
  removal, anything SQLite has to implement as recreate-and-copy). Query
  the remote database directly first — even on a small or
  single-developer project, "it's probably still empty" is exactly the
  assumption that lets a migration silently drop real rows nobody
  planned to lose. If it turns out not to be empty, trace the exact
  relationship the migration would touch and write a precise backfill to
  preserve that data *before* running the migration, not after something
  breaks.
- **A generated migration can order `DROP TABLE` before the
  `PRAGMA foreign_keys=OFF` / table-recreate steps that still reference
  it.** SQLite migrations that change column constraints require
  recreating the table; if another not-yet-recreated table still holds an
  FK reference to the one being dropped, the error is misleading — "no
  such table: X" on a drop that should have worked, when the real problem
  is FK resolution on a *different* table. Check generated SQL by eye
  whenever a migration mixes a table drop with other tables' FK
  references to it; `PRAGMA foreign_keys=OFF` needs to run first, and the
  drop needs to run *last*, after anything that referenced it has already
  been recreated without that reference.
- **drizzle-kit's rename-detection prompt needs a TTY**, which a scripted
  or CI migration flow doesn't have. A schema edit that both drops one
  column/table and adds a similarly-shaped one in the same `generate` run
  reads as an ambiguous rename and throws "Interactive prompts require a
  TTY terminal" instead of generating SQL. Split the edit into two
  separate `generate` calls (pure drop, then pure add) to sidestep the
  ambiguity entirely rather than trying to force a non-interactive
  answer.
- **Wrap `drizzle-kit generate` in a script that requires an explicit
  `--name`.** Left to its own defaults, it silently falls back to a
  random adjective+surname filename (e.g. `0000_gifted_luckman.sql`)
  instead of one that says what the migration actually does — a small
  thing that gets annoying fast once there are a dozen migrations and
  half of them have meaningless names.
- **`wrangler d1 execute --command` with a multi-statement string can
  fail** ("Missing required option --command or --file") depending on
  how the shell passes multi-line input through. Write the SQL to a
  `.sql` file and use `--file=<path>` instead whenever running more than
  one statement by hand.

## CI/CD & branching

- GitHub Actions workflow: install → build → `wrangler d1 migrations apply
  <db> --remote` (before deploy, so schema changes land before the code
  that depends on them) → `wrangler deploy`. Auth via a
  `CLOUDFLARE_API_TOKEN` repo secret; the account ID isn't secret, fine to
  inline in the workflow.
- **Prefer an Account API Token over a personal one for this secret** —
  create it from *inside* the Cloudflare account (Manage Account → API
  Tokens), not from your personal profile. It's scoped to exactly that
  one account by construction (a personal token requires remembering to
  manually restrict "Account Resources," easy to leave too broad if you
  belong to more than one account), and it isn't tied to your own account
  membership lifecycle.
- **The token needs two separate policies, not one** — a single
  Cloudflare API token can hold multiple policy rows, each with its own
  resource scope, and permission groups only take effect under the right
  scope:
  - **Entire account**: `Workers Scripts Edit` (to deploy the Worker) and
    `D1 Edit` (to run migrations). Attaching `Workers Scripts Edit` to a
    *zone*-scoped policy instead silently does nothing — Workers Scripts
    is an account-level resource, not a zone-level one.
  - **Specified zone** (the project's domain): `Workers Routes Edit` —
    needed for a `routes`/`custom_domain` entry in `wrangler.jsonc` to
    reconcile on deploy.
  - **D1 has no per-database resource scoping in the token UI at all** —
    only "entire account." If more than one D1-backed project shares a
    Cloudflare account, a token scoped for one project's CI can edit
    every D1 database on that account, with no tighter option available.
    The only real isolation is a separate Cloudflare account per project
    (one login can own several) — not a narrower token.
- **Pin actions to full commit SHAs, not tags** (`uses:
  actions/checkout@<40-char sha> # v7`) — a tag can be moved to different
  code after you've reviewed it (how the 2025 tj-actions/changed-files
  compromise spread). Get the SHA with `git ls-remote
  https://github.com/actions/checkout refs/tags/v7`; Dependabot's
  `github-actions` ecosystem keeps SHA pins current, comment included.
  Stay on a major version that runs on GitHub's current action runtime.
- **Pin the exact Node version in CI when `.npmrc` carries security
  policy** (see "Supply chain" below). The npm bundled with Node decides
  whether the policy is enforced at all — Node 22's npm 10 silently
  ignores npm 11's `strict-allow-scripts`/`min-release-age` keys — so pin
  `node-version: '24.19.0'`-style and add a step that fails if `npm
  --version` is below the version you verified.
- **Run `npm audit signatures` right after `npm ci`** — fails the build if
  any installed package lacks a valid registry signature or has an
  invalid provenance attestation.
- **Scope the Cloudflare token to the steps that need it** (`env:` on the
  migrate/deploy steps, not the job) so install scripts and build plugins
  never see it — with the caveat that an earlier step can still tamper
  with `node_modules` on disk, so the lockfile/script controls do most of
  the protecting.
- Branching: since a `master` push triggers a real deploy, do day-to-day
  work on `develop` and merge into `master` (direct merge is fine for a
  single-developer project, no PR needed) only when ready to ship. No
  branch protection needed at that scale.

## Cloudflare Access

- **Admin routes**: put every admin-only route — both the UI pages *and*
  their API/form-submission endpoints — under one path prefix (e.g.
  `/admin/*`, with API routes at `/admin/api/*` rather than the more
  "RESTful"-looking `/api/admin/*`). It's not about the destination count
  so much as how many places have to agree:
  - **Access**: one prefix needs two destinations (`admin` exact +
    `admin/*`). Adding `/api/admin/*` makes it three (four if a bare
    `/api/admin` ever exists) — `/admin` + `/api/admin/*` alone would
    *not* do, since `admin` without a wildcard matches only the bare
    path and leaves every `/admin/...` UI page ungated.
  - **The in-app check** (the JWT middleware below) keys on the same
    prefix. With one prefix, a new admin endpoint is covered by both locks
    automatically; with two, it's covered only if *both* the Access app and
    the middleware were updated to know about the second one. Forgetting
    either leaves the actual mutating endpoints less protected than the UI
    that calls them — exactly the failure that's easy to miss, because the
    admin pages still *look* gated.

  `/api/admin/*` isn't wrong if you prefer it — it's a convention, not a
  technical requirement — it just costs you keeping two prefixes in sync,
  in two places, forever.
- **Wildcard behavior**: a path of `admin` (no wildcard) matches only that
  exact URL. `admin/*` matches everything nested under it but *not* the
  bare path itself. You need both destinations for full coverage of a
  section — there's no single pattern that covers both cleanly.
- **One-Time PIN login needs no Cloudflare account** from the person
  logging in — they just get emailed a code. Make sure the policy's
  Include rule is **specific emails** (or an email domain you own), not
  "Login Method: One-Time PIN" as the rule itself — the latter would let
  literally anyone who can receive email in.
- **Multiple hostnames, one Access Application**: you can add several
  "Public hostnames" (e.g. the custom domain and the workers.dev URL) to
  the same Self-hosted Access Application, reusing one policy — including
  a `workers.dev` hostname, despite it not being a zone you administer
  DNS for in the normal sense.
- **Don't make the Access path rule the *only* lock — verify Access's JWT
  in the app too, keyed on the route that matched, not the raw URL.**
  Access and your framework's router can decode paths differently: on
  this project a double-encoded `/%2561dmin` passed Access (it decoded
  once to `/%61dmin`, no match for `admin`) while Astro decoded twice and
  served the admin pages — including their POST handlers — to anyone.
  Access attaches a signed `Cf-Access-Jwt-Assertion` header to every
  request it lets through; verify it in middleware (RS256 against
  `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`, check `iss`
  = that origin, `aud` contains the application's AUD tag, `exp`) for any
  request whose *matched route* is admin (Astro: `context.routePattern`),
  so no encoding or case trick can dodge it. ~60 lines of WebCrypto, no
  JWT library needed. Fail closed if the config is missing; skip only in
  local dev. The team domain and AUD tag are both in Access's public login
  redirect (`https://<team>.cloudflareaccess.com/cdn-cgi/access/login/<host>?kid=<AUD>…`)
  — no dashboard/API access needed to find them, and neither is secret.
  To test: request `/%2561<prefix>`, `/%61<prefix>`, a forged token, and a
  POST through the encoded path against a *production build* (dev mode
  skips the check).
- **Set `preview_urls: false` alongside `workers_dev: false`** — a
  `<version>-<name>.<subdomain>.workers.dev` preview hostname would sit
  outside a hostname-scoped Access policy just like `workers.dev` would.
- **"Protect this Worker" (the Worker-level Access toggle in Workers &
  Pages → your Worker → Access) is all-or-nothing** — it gates every route
  on the Worker, with no path scoping. Good for "hide the entire site
  temporarily, pre-launch." Not a substitute for a path-scoped Access
  Application if you need the public site open while just `/admin` stays
  gated. Also: it can spin up its own separate login setup (a different
  auto-generated team domain, defaulting to "sign in with a Cloudflare
  account" rather than One-Time PIN) rather than automatically reusing an
  existing Access policy — check the login screen actually offers OTP,
  and add it explicitly if not.

## Photo/image pipeline (if the project has user-uploaded photos)

Pattern that worked well: **D1 for metadata, R2 for bytes, Cloudflare
Images as the transform layer** — don't try to make R2 do double duty as a
database (it can't hold captions, alt text, or a deliberate display order;
listing a prefix only gives back keys, alphabetically).

- **Upload time**: run the file through `env.IMAGES.input(stream)
  .transform({ width: N }).output({ format: "image/jpeg", quality: 85 })`
  before writing to R2 — never store the raw upload. Do this server-side;
  never rely on the client having stripped anything.
- **Metadata (EXIF — GPS location, device, description, copyright — and
  XMP) must not survive** into anything stored or served: a phone photo
  can pin down a restaurant table or someone's home. Facts worth knowing:
  - The **Images binding has no metadata option.** The `metadata: "keep"
    | "copyright" | "none"` setting belongs to the separate `cf.image`
    fetch-resizing API, where the JPEG default is `"copyright"` (keeps the
    copyright tag, drops the rest, GPS included). In testing, the
    binding's JPEG output dropped *all* EXIF/XMP.
  - **WebP and PNG output always discard metadata** — so serve WebP.
  - **Never serve stored originals directly.** R2 buckets are private by
    default; keep them that way — on the bucket's page in the dashboard,
    **Custom Domains** should list none and **Public Development URL**
    (the `r2.dev` link) should be disabled — so the only path to an image
    is the re-encoding delivery route. (The **S3 API** endpoint shown on
    the same page isn't public; it needs R2 access keys.)
  - **Verify it rather than trusting it**, and re-verify whenever the
    upload path changes: prepend an EXIF APP1 segment (`FF E1` + `Exif\0\0`
    + a TIFF block with a GPS IFD and a unique marker string) to a small
    JPEG, upload it through the real pipeline, then scan the stored object
    (`wrangler r2 object get … --local`) and each served size for the
    `Exif\0\0` / `EXIF` signature, the XMP namespace, and the marker. Also
    scan a few real served images in production — real phone photos are
    the best test input. Local dev simulates the Images binding, so do
    both.
- **Delivery time**: a Worker route (e.g. `GET /api/photos/[key]?w=400`)
  reads the object from R2 and re-transforms via the same `IMAGES` binding
  to the requested size/format (e.g. WebP), **explicitly cached via the
  Cache API** (`caches.default`) keyed on the full URL including the width
  param. Without that explicit caching, repeat requests for the same
  image re-invoke the transform every time — Cloudflare doesn't
  automatically edge-cache a Worker-computed response the way it does for
  its own `/cdn-cgi/image/` resizing proxy.
- **Free tier**: Cloudflare Images' free plan includes 5,000 unique
  transformations/month, and this applies to images that live in R2 (not
  just Images' own storage) — but "unique" means unique
  size/format/source combinations; that's exactly what the Cache API step
  above protects, so repeat views of the same photo at the same size don't
  recount.
- **Allowlist the widths the delivery route accepts, and build the cache
  key yourself.** If `?w=` takes any value (even clamped to a max), anyone
  can loop `w=1..1600` across your photos and mint thousands of unique
  transforms, exhausting the free allowance — and if the cache key is the
  full request URL, junk query params (`?w=400&x=<random>`) bypass the
  cache on every hit. Snap the requested width up to the next size the app
  actually renders (e.g. thumbnail / card / lightbox) and key the cache on
  `path + ?w=<snapped width>` only.
- **Display**: prefer small cropped thumbnails (`object-cover`, fixed
  size) for a browsing grid, with a click-to-fullscreen lightbox
  (`object-contain`, full resolution, no crop) for the actual full view.
  This reconciles "consistent grid look" with "never cut off a portrait
  photo" — trying to pick one crop that satisfies both at one size doesn't
  work well when photos have mixed aspect ratios.
- If you do use a fixed-height `object-cover` crop somewhere (e.g. a
  homepage hero), and the default center-crop cuts off the wrong part of a
  photo, fix it with `object-position` (e.g. `object-[50%_65%]" `) rather
  than manually cropping the source file — non-destructive, and the
  original framing stays available if you want to adjust later or reuse
  the photo elsewhere at a different aspect ratio.

## Security headers & CSP (Astro on Workers)

- **Use Astro's built-in `security.csp`** (stable since Astro 6): it
  computes sha256 hashes of every script and style Astro renders, so no
  `'unsafe-inline'`. **It's a `<meta>` tag only on prerendered pages — on
  server-rendered pages it's a `Content-Security-Policy` response
  header.** Any middleware that adds CSP directives (e.g.
  `frame-ancestors`) must merge into that header, never `set` over it:
  doing so silently deletes the whole script/style policy from every SSR
  page, and nothing errors. Add `directives` (`default-src
  'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action`, …) and
  `scriptDirective.resources` for any third-party script origins
  (e.g. Turnstile's `https://challenges.cloudflare.com`, plus `frame-src`
  for its iframe).
- **Consequences to design for**: inline event handlers (`onsubmit="…"`)
  and `style="…"` attributes are blocked — move them into `data-`
  attributes handled by the component's `<script>`.
- **`form-action` also governs redirect targets of a form POST.** Behind
  Cloudflare Access, an expired session redirects a POST to
  `https://<team>.cloudflareaccess.com` — allow that origin, or saves fail
  silently instead of prompting a re-login.
- **A meta CSP ignores `frame-ancestors`** (and `report-uri`, `sandbox`),
  so framing protection has to be a real header. Two places, kept in sync:
  middleware for SSR responses (merged into Astro's CSP header, above),
  and `public/_headers` for static assets
  (prerendered pages, `/_astro/*`), which Workers serves without running
  your code. The Cloudflare adapter appends its own `/_astro/*`
  Cache-Control rule to that file; all matching rules apply.
- **Setting headers in middleware: copy, don't mutate** — `new
  Response(response.body, response)` then `.headers.set(...)`. Responses
  that came from the Cache API (`caches.default.match`) have immutable
  headers and throw if you set on them directly.
- **The CSP only exists in production builds** (not `astro dev`), so test
  with build + preview in a real browser and watch the console for
  "Refused to…" — plus assert a few computed styles actually applied.
  **Assert first that each page under test actually has a `script-src`
  policy** (header or meta): a page with no CSP also shows zero
  violations, which is exactly how the overwritten-header bug above
  passed a browser test here. A browser test needs no npm packages:
  launch any installed Chromium with `--headless=new
  --remote-debugging-port=N` and drive it over the DevTools Protocol with
  Node's built-in `fetch` + `WebSocket` (`Log.entryAdded` and
  `Audits.issueAdded` surface CSP violations).
  Pages you can't browse in preview (e.g. auth-gated admin) can be
  checked statically: the build's server manifest holds each page
  script's exact text (`inlinedScripts`) and the allowlisted
  `scriptHashes`; every script's sha256 must be in the list.

## Supply chain (npm, CI, and AI-assisted development)

Projects built with AI assistants have a sharper version of the usual
npm risk: an assistant can suggest a package name that doesn't exist
(someone registers it — "slopsquatting") or run `npx --yes <typo>`, and
whatever's registered under that name executes with the developer's
credentials in reach. Layers that worked here:

- **Verify what you have**: `npm audit signatures` (registry signatures +
  provenance attestations), scan the lockfile for any `resolved` URL not
  on `registry.npmjs.org` or any entry without an `integrity` hash, list
  every `hasInstallScript` package, and `npm view <pkg> repository.url
  maintainers` for each direct dependency to confirm it's the real
  project. Check each direct dependency is actually imported/used —
  remove the ones that aren't.
- **Make the install-script allowlist real.** npm 11's `allowScripts` in
  package.json is **advisory by default** — unlisted install scripts still
  run with only a notice. Commit an `.npmrc` with
  `strict-allow-scripts=true` to make it a hard failure. Turning it on
  surfaces every never-reviewed install script (here: `fsevents`'
  `node-gyp rebuild`). `npm deny-scripts` only works on packages installed
  on your platform — for platform-specific ones add `"pkg": false` to
  `allowScripts` by hand. Pinned entries (`workerd@1.2026…`) mean each
  upgrade fails `npm ci` until re-approved — that's the review gate. The
  new version can't be approved with `npm approve-scripts` (it can't
  install until approved, and that command only acts on installed
  packages) — compare `npm view <pkg>@<new> scripts repository.url
  _npmUser` against the approved version, then edit the pin by hand.
- **Delay new versions**: `min-release-age=N` in `.npmrc` refuses versions
  published less than N days ago — hijacked-maintainer releases are
  usually pulled within hours to days. 7 is a reasonable floor; this
  project uses 14 (no need to be that current, and it still leaves time
  for fixes to roll out). Pair with Dependabot's `cooldown: default-days:
  N` (and point its PRs at a non-deploying branch). **It only applies when
  npm resolves a new version** (`npm install <pkg>`, `update`, `npx`) —
  `npm ci` installs whatever the lockfile says regardless of age
  (verified), so tightening N never breaks CI on an existing lockfile, and
  a security-fix PR whose lockfile holds a days-old version still
  installs. For a hand-installed emergency fix, `--min-release-age=0` on
  that one command.
- **Astro + Cloudflare: a wrangler bump alone leaves two wranglers.**
  `@cloudflare/vite-plugin` (pulled in by `@astrojs/cloudflare`) pins an
  *exact* wrangler version, so a Dependabot PR that bumps only your
  direct `wrangler` dependency produces two copies (build on the old,
  deploy on the new, plus two `workerd` binaries). Follow up with `npm
  update @cloudflare/vite-plugin` to the release pinning the same
  wrangler, and confirm `npm ls wrangler --all` shows one version.
  Dependabot can't do this itself — the plugin isn't a direct dependency.
- **Test a Dependabot PR on top of the current branch, not the PR branch
  as-is** — it's cut from the target branch when the bot ran and can be
  missing later commits, which makes unrelated regressions look like the
  upgrade's fault.
- **Block non-registry sources**: `allow-git=none`, `allow-remote=none`,
  once you've confirmed the lockfile has none.
- **Keep `npx` out of routine use.** `npm run <script>` only executes
  locally installed binaries; `npx` falls back to downloading from the
  registry if the local copy is missing or the name is mistyped. Give
  every routine command an npm script (including a `"wrangler":
  "wrangler"` passthrough), and have helper scripts invoke local bins
  directly (`node node_modules/<pkg>/bin.js`) rather than spawning `npx`.
  Then gate the fetch-and-run commands for AI agents — e.g. Claude Code
  project permission `ask` rules for `npx`, `npm install|i|add|exec|x|
  update|init|create`, `pnpm dlx`, `yarn dlx`, `bunx` (Bash and
  PowerShell) — without everyday commands prompting constantly. Also set
  `min-release-age` in the user-level `~/.npmrc` so `npx` outside the
  project is covered.
- **Mind the local credential blast radius.** A logged-in `wrangler`
  stores a long-lived OAuth token with broad account-wide scopes in the
  user profile, readable by any install script or `npx`'d package you run.
  Once CI deploys with its own scoped token, `wrangler logout` locally and
  log in only when you need a manual remote operation.
- **Don't reach for `npm audit fix --force` reflexively** — its "fix" can
  be a multi-year downgrade of the package (here it proposed drizzle-kit
  0.18.1 to fix a dev-only transitive advisory). Check whether the
  vulnerable code path is even reachable first.

## GitHub repository security settings (Dependabot)

GitHub's Dependabot is three separate features, and only one of them is
configured by a file:

| Feature | Configured by | What it does |
|---|---|---|
| **Version updates** | `.github/dependabot.yml` (the settings page's "Configure" button just opens that file) | Scheduled "newer version exists" PRs |
| **Alerts** (+ malware alerts) | Settings → Advanced Security | Flags lockfile versions with known vulnerabilities / known-malicious packages |
| **Security updates** (+ grouped) | Settings → Advanced Security | Auto-opens a PR bumping a vulnerable dependency to its fixed version |

Recommended setup, all free on private repos:

- **Turn on** dependency graph (alerts need it), Dependabot alerts,
  malware alerts, security updates, and grouped security updates (one PR
  per batch of fixes instead of one per package). Self-hosted runners
  only if you actually use them.
- **Consider the "Dependabot rules" preset** that auto-dismisses
  low-impact alerts in development-only dependencies — otherwise
  unreachable dev-tool advisories (e.g. an old esbuild dev server inside a
  CLI tool you never serve with) sit open forever.
- **`dependabot.yml`**: point `target-branch` at a non-deploying branch
  (e.g. `develop`); `cooldown: default-days:` matching your npm
  `min-release-age`; a `groups:` entry for minor + patch updates so they
  arrive as one PR while majors stay separate; and a second entry for the
  `github-actions` ecosystem so SHA-pinned actions stay current.
- **Security-update PRs ignore `target-branch` and always target the
  repo's default branch.** If merging to the default branch deploys, those
  PRs deploy on merge — either make the non-deploying branch the default,
  or review them as carefully as any deploy.
- **Nothing tests a Dependabot PR unless you add it** — a deploy workflow
  triggered on pushes to the deploy branch never runs on PRs. A small
  `pull_request` workflow (install + type-check + build, no secrets)
  catches breakage early; otherwise test locally before merging.
- **Code scanning (CodeQL)** is free for public repos, but on private
  repos needs GitHub Advanced Security (organization-owned only). A
  `SECURITY.md` reporting policy matters for public repos, not private ones.
- **Handy PR comments**: `@dependabot rebase`, `@dependabot recreate`,
  `@dependabot ignore this major version`, `@dependabot ignore this
  dependency`. Run history and a manual "Check for updates" button live
  under Insights → Dependency graph → Dependabot.

## Email

- **Resend** (or similar) for transactional/automated email sent by the
  app — order confirmations, admin notifications. Needs its sending domain
  verified (DNS records) before it'll actually deliver from
  `you@yourdomain.com`.
- **Cloudflare Email Routing** for a real human inbox at the domain,
  forwarding to an existing mailbox (e.g. Gmail) rather than paying for a
  full Workspace subscription. Fully scriptable:
  `wrangler email routing enable <domain>` (adds MX/SPF/DKIM),
  `wrangler email routing addresses create <email>` (triggers a
  verification email the destination owner must click),
  `wrangler email routing rules create <domain> --match-type literal
  --match-field to --match-value contact@yourdomain.com --action-type
  forward --action-value you@gmail.com` (fails until the destination is
  verified). These are two genuinely different email systems serving
  different purposes — don't conflate "the app can send email" with
  "there's an inbox at this address."

## Frontend styling patterns

Recurring CSS/UX mistakes worth checking for on any new project, found by
actually screenshotting a "finished" site (desktop + real mobile widths,
local dev + production) rather than just reading the code:

- **Header/nav flex layouts need an explicit mobile breakpoint.** A plain
  `display: flex; justify-content: space-between` on a header row looks
  fine at desktop widths and silently overflows horizontally on real phone
  viewports (~390px) once the nav has more than 2-3 links — flexbox
  doesn't wrap onto a new line by default without `flex-wrap: wrap`, and
  even with wrap, cramming both the wordmark/logo and a multi-item nav
  onto one row rarely reads well that narrow. Add both: `flex-wrap: wrap`
  on the row as a safety net, plus a `@media (max-width: 640px)` block
  that switches to `flex-direction: column` (stack logo above nav) with
  the nav itself also wrapping (`flex-wrap: wrap; width: 100%`). Verify
  with an actual screenshot at ~390px width, not just a browser resize —
  it's easy to miss on a desktop monitor where the devtools mobile
  emulator defaults to a wider "mobile" width than real small phones.

- **Don't hardcode a lookup table keyed by data that lives in the
  database.** A `Record<string, string>` mapping category/type slugs to
  icons (or colors, labels, etc.) works fine at launch with 4 categories,
  then silently degrades to a generic fallback every time a new one gets
  added through the admin UI — the code and the data drift apart with no
  error, just steadily-worse UI. If the value is something an admin can
  create more of, store the icon/color/label as a column on that table
  and let every caller read it off the row instead of re-deriving it from
  the slug.

- **A plain server-rendered admin form shouldn't force every field onto
  its own full-width row.** It's the easy default (one `.admin-field`
  div per row), but a form with a mix of short fields (name, city, a
  2-digit score) and genuinely long ones (a summary textarea, a URL)
  ends up much longer and more scroll-heavy than the data needs. A CSS
  Grid variant — `display: grid; grid-template-columns: repeat(auto-fill,
  minmax(13rem, 1fr))` on the form, plus a `grid-column: 1 / -1` modifier
  class for the fields that should still span full width — fixes this
  with no JS and no change to the form's server-side handling, since
  the grid is purely a container-level style change.

- **Native `<input type="file">` needs its own theming pass — it doesn't
  inherit the rest of the form's look.** Every other input picks up
  `border`/`background`/`font` styles fine, but the file input's button
  half is a distinct pseudo-element (`::file-selector-button`, the
  standard name — `::-webkit-file-upload-button` is the older WebKit-only
  alias) that ignores the input's own `border`/`background`. Style that
  pseudo-element directly to match the site's other buttons rather than
  hiding the input and building a fake trigger button with JS.

- **Give the admin section its own visual identity, separate from
  "reminding the user Access is protecting this page."** Those are two
  different concerns that are easy to conflate into one banner and then
  delete together once Access is actually configured. A shared layout
  can take a `variant: 'public' | 'admin'` prop and use it purely for a
  cosmetic cue (a small badge, an accent-colored border, a tinted
  background) — this has nothing to do with auth working or not, it's
  just "which part of the site am I looking at," and it's worth keeping
  even after the security messaging is gone.

- **Don't reuse a ranked-list component for results that aren't ranked.**
  A numbered leaderboard row (`1`, `2`, `3`…) and a plain "here's what
  matched" list look similar enough that it's tempting to share one
  component, but the number itself carries meaning a search/filter result
  doesn't actually have. Give the shared component an opt-out prop (e.g.
  `showRank`) that also swaps the wrapping element from `<ol>` to `<ul>` —
  the semantic order claim and the visual number should come from the
  same flag, not just the visual one, since assistive tech reads them as
  a promise about order.

- **A comfortable reading width (~40rem) on a wide viewport leaves a lot
  of empty space next to it — that's expected, not automatically a bug,
  but it's worth deciding on purpose rather than by default.** Don't
  "fix" it by just widening the text column past a comfortable line
  length. If the page has no other data to fill the space, a purely
  decorative sticky aside (a pull-quote, a brand-color panel, an
  illustration) balances the layout without adding a real second content
  stream — keep it `aria-hidden` and hide it below the width where the
  text alone already fills the viewport, so it never fights the reading
  column on tablet/mobile.

## Docs structure

Keeping a small `docs/` folder alongside the usual `README.md` paid off
for staying oriented across a long build. The `new-project` skill's
template has skeletons for all of these:

- `AGENTS.md` (+ a one-line `CLAUDE.md` that imports it) — rules for AI
  agents, loaded every session: cost goal, dev commands, branching,
  security guidelines for new code, project gotchas. Keep it to what an
  agent needs *every* time; point to the docs below for the rest.
- `docs/PLAN.md` — what the project is, current status, resolved
  decisions (with the *why*), open questions. The one file to re-read to
  get oriented after time away.
- `docs/ARCHITECTURE.md` — stack choices and why, the dated free-tier cost
  table, data model.
- `docs/FEATURES.md` — actual pages/flows for v1, plus a "parked ideas"
  section for anything explicitly deferred rather than forgotten.
- `docs/DESIGN.md` — visual direction, brand tone, layout, admin UX.
- `docs/SECURITY-MODEL.md` — how the project is defended, the dashboard/
  GitHub settings it depends on, review and verification procedures,
  incident history. Deliberately **not** `SECURITY.md`: GitHub treats a
  file with that name in the root, `docs/` or `.github/` as the repo's
  vulnerability-reporting policy.

Two conventions that mattered more than expected:

- **Label "parked idea, not committed" content explicitly** rather than
  either building it prematurely or losing track of it.
- **Date only what git can't.** Observations of state outside the repo
  (dashboard settings, pricing, third-party support — "as of <date>") and
  tested-vs-assumed claims ("tested <date>") carry a date, because they go
  stale and the date says when to re-check. Never "added <date>" or
  "deployed <date>" — git history already has that.
