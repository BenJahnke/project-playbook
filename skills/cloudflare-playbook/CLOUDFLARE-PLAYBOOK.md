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
- [ ] Astro `security.csp` on; no inline handlers/styles or `define:vars`
      scripts; middleware
      *merges* `frame-ancestors` into the SSR CSP header; `public/_headers`
      covers static assets
      ([Security headers & CSP](#security-headers--csp-astro-on-workers))
- [ ] Browser-tested against a production build, asserting each page
      actually *has* a CSP before trusting "zero violations"

**Injection & input** ([Injection & input handling](#injection--input-handling))
- [ ] No `set:html`, and no `innerHTML`-family call with data; client
      scripts build DOM with `textContent`
- [ ] HTML built outside a template (emails) goes through an
      auto-escaping tagged template, enforced by a branded type the sender
      requires; CR/LF stripped from header values like subjects
- [ ] Query builder only; nothing user-supplied in `sql.raw()` or spliced
      into a `sql` template outside its `${}` parameters
- [ ] Every route parses input through an explicit schema: enums, real
      date formats, length caps on public free text; server-owned fields
      set explicitly, never spread from the request
- [ ] No `Location` built from raw input; any client-supplied redirect
      target allowlisted to a same-site path pattern (not just
      `startsWith("/")`)
- [ ] URLs from data in `href`/`src` are built from IDs/slugs, or
      scheme-checked (`https:` only)
- [ ] Query-string messages shown only on same-origin navigations
      (`Sec-Fetch-Site`)
- [ ] `security.checkOrigin` left on; JSON endpoints require
      `Content-Type: application/json`
- [ ] Public file routes serve only the key shape the app writes, with
      `nosniff`
- [ ] A public form that emails the submitted address or reserves
      inventory has Turnstile (verified server-side, fails closed) and a
      rate limit before launch
- [ ] Workflows never put `${{ github.event.* }}` straight into `run:`

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

Two side effects of the `secrets` block worth knowing:
- **`wrangler deploy` fails until every required secret is set on the
  Worker.** Useful as a guard: add a new secret's name before the code
  that depends on it, and a deploy can't ship that code without it.
- **Only the listed names load from `.dev.vars`; anything else in it is
  silently ignored.** So `.dev.vars` can't override a `vars` value
  locally once the block exists. If local dev needs a different
  non-secret value (e.g. a test site key), choose it in code under
  `import.meta.env.DEV`.

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
- **Renaming the Access team changes the JWT issuer** (the team domain,
  `https://<team>.cloudflareaccess.com`). Update the app's team-domain
  config (the `iss` it expects and the certs URL) and any CSP `form-action`
  that allows the login domain, and deploy right away — until then the
  in-app check rejects every login. The application's AUD tag and the
  signing keys stay the same. **Existing browser sessions still fail
  afterwards**: their tokens carry the *old* issuer, Access keeps honoring
  them at the edge, so the app answers "Forbidden" even with the new
  config deployed — and `/cdn-cgi/access/logout` breaks for them too
  ("Unable to find your Access organization"), because it looks up the
  old team. Clearing the site's cookies (or a private window) and logging
  in again fixes it; otherwise it lasts until the session expires.
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
- **Buffer the transformed output before `R2.put()`**: `await new
  Response(transformed.image()).arrayBuffer()`, not the stream itself.
  R2 rejects a `ReadableStream` with no known length ("Provided readable
  stream must have a known length"), and the Images output stream doesn't
  have one. Passing the stream straight through worked for a while on one
  project, then started failing after a routine workerd bump (2026-10-03),
  so every upload 500'd. Don't rely on it working.
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
- **Validate the key, too.** A public `GET /api/photos/[...key]` that
  hands its path straight to `R2.get()` serves *anything* in the bucket to
  anyone who can guess or learn a key — fine today, but not once something
  private lands there. Match the exact shape the upload route generates
  (e.g. `^photos/[a-z0-9-]+/[0-9a-f-]{36}\.jpg$`) and 404 everything else
  before touching R2 or the cache. Check the upload route's history first,
  so the pattern covers every key ever written. Send
  `X-Content-Type-Options: nosniff` on the response too.
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

## Injection & input handling

Treat every value that crosses a trust boundary as hostile: form fields,
JSON bodies, query strings, route params, headers, uploaded files, and
anything read back out of the database that a user originally wrote.
The framework closes most of these by default; the holes are the places
you step outside it. A CSP is a backstop for some of these, not a
substitute for any of them.

**HTML**
- **Astro templates escape `{expr}` output** in both text and attribute
  positions, so the default path is safe. The ways out are `set:html`,
  `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`document.write` in client
  scripts, and `is:inline` scripts with interpolated data. Never feed any
  of them data; build DOM with `createElement` + `textContent`. Clearing
  with `el.innerHTML = ""` is fine.
- **JSON in a `<script>` tag** (`<script type="application/ld+json"
  set:html={JSON.stringify(data)} />`) is a breakout: `JSON.stringify`
  doesn't escape `</script>`. Replace `<` with `<` in the output.
- **HTML built as a string outside a template gets no escaping at all.**
  Email bodies are the usual case: `` `<p>Hi ${customerName}</p>` `` puts
  a customer's markup, links, and tracking pixels into your inbox, or
  into the customer-facing email itself. Make escaping structural rather
  than remembered. Write an `html` tagged template that escapes every
  interpolated value, returning a branded type, and have the send
  function accept only that type:

  ```ts
  declare const brand: unique symbol;
  export type SafeHtml = string & { readonly [brand]: true };
  export const escapeHtml = (v: unknown) =>
    String(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  export function html(s: TemplateStringsArray, ...v: unknown[]): SafeHtml {
    let out = s[0];
    v.forEach((x, i) => (out += escapeHtml(x) + s[i + 1]));
    return out as SafeHtml;
  }
  // sendEmail({ …, html: SafeHtml }) — a plain template string fails type-check.
  ```

  Now a raw string is a type error that `astro check` (and so CI) catches.
- **Header values**: strip `\r`/`\n` from anything user-derived that goes
  into an email subject, a `from` display name, or another header. JSON
  email APIs aren't header-parsed, but stripping keeps a provider change
  from reopening classic header injection. The Fetch `Headers` API itself
  throws on CR/LF, so a `Location` can't be split — it 500s instead.

**SQL (D1 + Drizzle)**
- The query builder (`eq`, `inArray`, `.values()`, `.set()`) always binds
  parameters. So does the `sql` template's `${}`. The holes are
  `sql.raw()` and any string concatenation into SQL. A dynamic column or
  `ORDER BY` from the request maps through an allowlist object
  (`{ name: table.name, date: table.date }[param]`); it's never
  interpolated. `db.prepare()` on raw D1 uses `.bind()`, never template
  literals.

**Input validation**
- **One explicit schema (zod) per route, for every input**, not just the
  public ones. Use enums for fixed sets (status, contact method), real
  formats (`z.iso.date()`, not `z.string().min(1)`: a garbage date breaks
  every later string comparison), integer checks on IDs (route params
  too), and **length caps on public free text** that match the form's
  `maxlength`. That bounds what lands in the DB and in emails, and bounds
  regex cost (ReDoS).
- **Set server-owned fields explicitly** (`status`, `source`, timestamps,
  prices) and never spread parsed or raw request data into an insert or
  update. Zod strips unknown keys by default, which is what stops a
  forged `status=paid` field. A side effect: a form field you forgot to
  add to the schema is silently dropped. When adding a field, check it
  actually reaches the DB.
- `Object.fromEntries(formData)` is safe from prototype pollution (it
  creates an own `__proto__` property rather than setting the prototype),
  but don't hand-roll deep merges of request JSON into objects.

**Redirects and URLs**
- **Never build `Location` from raw input.** A client-supplied "return
  to" target needs an allowlist pattern, e.g. `^/admin(/[\w\-/]*)?$`.
  `startsWith("/")` is not enough: `//evil.com` and `/\evil.com` are
  both off-site in browsers. On an invalid route param, redirect to the
  list page instead of echoing the param back.
- **`href`/`src` built from data**: prefer a fixed path prefix plus an ID
  or slug (`/stories/${slug}`). For a URL that's genuinely user-supplied
  (a link field), parse with `new URL()` and require `protocol ===
  "https:"`, which blocks `javascript:`/`data:`. Never build absolute
  links in emails from the request's `Host` header; use a configured site
  URL.

**Reflected messages (content spoofing)**
- A `?error=…` banner rendered as escaped text can't inject markup, but a
  crafted link can still put a convincing fake message ("session expired,
  call …") on a real page. Render it only when `Sec-Fetch-Site` is
  `same-origin` (the redirect after your own form POST) or absent (old
  browsers). A link from an email or another site arrives as `none` or
  `cross-site`. The alternative is a one-shot flash cookie set on the
  redirect.
- **Map an error code to a fixed message with a `Map`, not an object
  literal.** `MESSAGES[searchParams.get("error")]` on a plain object finds
  `Object.prototype`'s members, so `?error=constructor` prints
  `function Object() { [native code] }` on the page. Use `new Map(...)`
  (or `Object.hasOwn`) for any lookup keyed by user input.

**CSRF (form injection from other sites)**
- **Astro's `security.checkOrigin` is on by default** and rejects
  cross-origin POST/PUT/PATCH/DELETE whose `Content-Type` is form-like
  (`application/x-www-form-urlencoded`, `multipart/form-data`,
  `text/plain`), but **only on on-demand (SSR) routes**, never
  prerendered ones. Leave it on.
- `request.json()` parses any body, whatever its declared type. So a JSON
  endpoint should **require `Content-Type: application/json`** (415
  otherwise): a cross-site page can't send that without a CORS preflight
  the server never approves, which holds even if `checkOrigin` were off.
  Never mutate on GET.

**Uploads and file-serving routes**
- Re-encode uploads server-side and serve only the re-encoded output with
  a content type you set. An uploaded SVG or HTML served with its own
  type is stored XSS. Add `X-Content-Type-Options: nosniff`, and validate
  keys on public file routes
  ([Photo/image pipeline](#photoimage-pipeline-if-the-project-has-user-uploaded-photos)).

**Abuse of public forms (bots)**
- A public form that emails a confirmation to *the submitted address*,
  with *the submitted name* in it, is a spam relay with your domain's
  reputation attached. Escaping doesn't help: mail clients auto-link a
  bare `evil.com` in plain text. Validate a single address (zod's
  `.email()` rejects `a@x.com,b@y.com`) and cap name length.
- **A form that reserves capacity on submit is a griefing target too.**
  If each request counts against limited inventory before anyone
  confirms it, a few scripted submissions make everything look sold out
  to real buyers. That's often a bigger risk than the email.
- **Before going public, add Turnstile and a rate limit**, both checked
  before anything is saved or emailed. As of 2026-10-03 both are free:
  Turnstile's free plan has unlimited verifications, and the Workers Rate
  Limiting binding has no separate charge (calls count as ordinary Worker
  usage).
  - **Turnstile**: verify the token server-side at
    `https://challenges.cloudflare.com/turnstile/v0/siteverify` and fail
    closed on a missing secret or token, a network error, a timeout, or
    anything but `success: true`. Also require the response's `action` to
    match the widget's `data-action` and its `hostname` to match the
    request's, so a token solved for another form or page can't be
    replayed. Test-key responses come back with hostname `example.com`
    and no `action` (checked against siteverify 2026-10-03), so skip
    those two checks under `astro dev`, where the test keys are used. CSP needs
    `https://challenges.cloudflare.com` in `script-src` and `frame-src`
    (tested on Astro 7: `scriptDirective.resources` plus a `frame-src`
    directive, and `<script is:inline src="…/api.js" async defer>` on the
    page; an external `src` needs no hash).
  - **Tokens are single-use**, so a double-clicked submit sends a second
    request that fails verification, and the person sees an error for a
    request that went through. In the page's script, hold the submit
    until the hidden `cf-turnstile-response` input has a value, then
    disable the button.
  - **Test keys**: site key `1x00000000000000000000AA` always passes,
    paired with secret `1x0000000000000000000000000000000AA`; secret
    `2x0000000000000000000000000000000AA` always fails. Use the
    always-fail secret to test that rejection is actually enforced: the
    always-pass secret accepts any token, so it can't prove that.
  - **Rate Limiting binding**: `ratelimits` in `wrangler.jsonc`, keyed on
    `CF-Connecting-IP`; `period` must be 10 or 60. `namespace_id` is
    unique per *account*, not per Worker, so don't reuse the docs'
    example `"1001"` if another project on the account might. Local dev
    (miniflare) enforces it with windows aligned to the clock minute, and
    the count survives a restart. Start a test in a fresh minute, or it
    measures leftover requests rather than the limit.

**Less obvious classes to check, even if they don't apply yet**
- **Command injection** in build/dev scripts: `spawn`/`spawnSync` with an
  argv array, never `exec` or `shell: true` with interpolated input.
- **SSRF**: never `fetch()` a user-supplied URL. If unavoidable,
  allowlist hosts.
- **CSV/formula injection**: any export that opens in a spreadsheet
  prefixes cells starting with `=`, `+`, `-`, `@` with `'`.
- **GitHub Actions script injection**: `run: echo "${{
  github.event.pull_request.title }}"` executes attacker-controlled text.
  Pass such values through `env:` and reference `"$TITLE"`, and don't
  check out PR code in a `pull_request_target` workflow.
- **Open redirect Workers**: a domain-redirect Worker should hard-code
  its target host (`url.hostname = "example.com"`), never read it from
  the request.

**Auditing a project for all of the above**: list every file that reads
`formData`, `request.json()`, `searchParams`, `params`, or request
headers, and every one that calls `redirect`, and read each one. Then grep
for `set:html|innerHTML|outerHTML|insertAdjacentHTML|document.write|eval\(|new
Function|sql\.raw|is:inline|define:vars` and for attribute expressions
built from data (`(href|src|action)=\{`). Test the fixes with real requests:
`curl` with an `Origin` header matching the server. In Git Bash on
Windows, `export MSYS_NO_PATHCONV=1` first — otherwise it silently
rewrites arguments like `x=/admin/y` into Windows paths, and the test
measures the wrong input.

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
- **Never use `define:vars` on a script.** It makes Astro treat the script
  as `is:inline`, and `is:inline` scripts get no hash in the policy — the
  browser blocks them with nothing visible on the page, and any form the
  script was intercepting quietly falls back to a full-page POST (tested
  on Astro 7, 2026-09-29: a fetch-based reorder UI started reloading and
  jumping to the top). Pass server values through a `data-` attribute to
  a normal processed `<script>` instead. The static manifest check below
  catches this on pages a preview can't reach.
- **`scriptDirective.resources` / `styleDirective.resources` replace the
  defaults rather than adding to them** — listing only an external origin
  (e.g. a font stylesheet host) drops `'self'` and blocks the site's own
  bundled CSS/JS under `/_astro/`. List `'self'` explicitly alongside it.
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
- **Merge Dependabot PRs one at a time, not combined locally.** Merging
  two that both change the lockfile forces npm to re-resolve the tree, and
  `min-release-age` hides a security PR's too-new versions from that
  resolution — it surfaces as a misleading `ERESOLVE` ("Found:
  <pkg>@undefined") or `ETARGET`. Merge one and let Dependabot rebase the
  other; each PR's own lockfile installs fine, since `npm ci` ignores
  `min-release-age`.
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
- **Commit with your GitHub noreply email, everywhere.** Every commit's
  author and committer email is visible to anyone in a public repo's
  history, and removing it later means rewriting history. Set it once,
  globally: `git config --global user.email
  "<id>+<username>@users.noreply.github.com"` (find the address under
  GitHub → Settings → Emails, or copy it from the initial commit GitHub
  makes when creating a repo). Commits still link to your account. Then
  turn on "Keep my email addresses private" and "Block command line pushes
  that expose my email" on the same settings page, so GitHub rejects any
  push that would leak your real address. **That block applies to every
  repo, private ones included**, which is why a per-repo override isn't
  enough on its own: any repo still on your real email gets its pushes
  rejected ("push declined due to email privacy restrictions"). Already
  pushed history isn't affected; only new commits are checked. If a
  rejected commit isn't pushed yet, `git commit --amend --no-edit
  --reset-author` re-authors it with the current setting; check with
  `git log -1 --format='%ae %ce'`.
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
  agent needs *every* time; point to the docs below for the rest. It
  describes what's built; it doesn't track to-dos.
- `docs/PLAN.md` — what the project is, current status, resolved
  decisions (with the *why*), and **the one list of everything open**:
  next steps (decided, still to do) and open questions (waiting on a
  decision), each a short entry. The one file to re-read to get oriented
  after time away.
- `docs/proposals/<topic>.md` — one self-contained doc per idea that
  needs a decision: status at the top, then the idea, the options, a
  recommendation, the questions to answer, and technical notes for
  whoever builds it. PLAN.md's open questions link to it in one line.
  Once decided, its status line records the outcome and why, and
  whatever gets built is documented in FEATURES.md and AGENTS.md.
- `docs/ARCHITECTURE.md` — stack choices and why, the dated free-tier cost
  table, data model.
- `docs/FEATURES.md` — actual pages/flows, plus a "parked ideas" section
  for anything explicitly deferred rather than forgotten: one line each,
  linking to a proposal if there is one.
- `docs/DESIGN.md` — visual direction, brand tone, layout, admin UX.
- `docs/SECURITY-MODEL.md` — how the project is defended, the dashboard/
  GitHub settings it depends on, review and verification procedures,
  incident history. Deliberately **not** `SECURITY.md`: GitHub treats a
  file with that name in the root, `docs/` or `.github/` as the repo's
  vulnerability-reporting policy.

Conventions that mattered more than expected:

- **One home per item.** Each open question, to-do, decision or fact
  lives in exactly one doc, and the others link to it instead of
  restating it. Without this rule, items drift into several places: the
  same "is the domain verified yet?" question ended up listed three times
  in one PLAN.md, and a security risk got written up in both PLAN.md and
  AGENTS.md. The copies go stale at different rates. Splitting a proposal
  from its questions also makes it hard to hand to someone outside the
  code (a co-owner, a client) for review, which is why a proposal keeps
  everything in one file.
- **Label "parked idea, not committed" content explicitly** rather than
  either building it prematurely or losing track of it, and move an idea
  out of the parked list once it's built. A built feature still listed
  as parked misleads the next reader.
- **Date only what git can't.** Observations of state outside the repo
  (dashboard settings, pricing, third-party support — "as of <date>") and
  tested-vs-assumed claims ("tested <date>") carry a date, because they go
  stale and the date says when to re-check. Never "added <date>" or
  "deployed <date>" — git history already has that.
