# Agency permissions redesign

**Status:** design / plan (not yet built) · **Author:** drafted 2026-06-25 · **Decision driver:** product direction is **multi-agency SaaS** (sell Tempo to other agencies), and the permission model must support agency staff scoped to clients, agency-wide back-office (Finance/HR), and limited client-side access.

---

## 1. Why

Today's model assumes "internal user = sees the whole tenant," with a single `role` string per user and a one-dimensional brand scope (`user_brand_access`). That breaks for what we actually need:

- An **agency staffer** assigned to **some** clients, seeing **everything** for those clients.
- The same person can be assigned to **multiple** clients (M:N).
- **Back-office** staff (Finance, HR, Ops) who span **all** clients but only **one domain** (Finance sees billing, not HR; HR sees the team, not client performance).
- **Client-side** staff given **limited** access to **their** client only.
- Multiple **agencies** as separate tenants, with **hard** cross-agency isolation.

The tenancy *spine* (Agency → Clients → People) is already correct. What's too flat is the **permission layer**: one role string can't express "Finance agency-wide **and** manager on clients A+B."

## 2. Core idea: permissions are two axes

| Axis | Question | Today | Target |
|---|---|---|---|
| **Brand scope** | which clients can you see? | `user_brand_access` (M:N) ✅ | `brand_assignments` (M:N + access level) |
| **Functional scope** | which domains can you act in? | encoded in the flat `role` ❌ | `departments` / capability set |

Effective permission = **union** of:
- **agency role** (owner/admin ⇒ everything in the agency),
- **brand assignments** (which clients), and
- **departments** (which domains, agency-wide or — optionally — per client).

The keystone resolver `getWorkspaceScope()` evolves to return **both** a brand scope and a functional scope; every data surface consumes it.

## 3. Target data model

```
agencies            (= rename of `tenants`)                     the SaaS customer
agency_members      (user_id, agency_id, agency_role,           membership in an agency
                     status)                                    agency_role: owner | admin | member | external
brand_assignments   (user_id, agency_id, brand_id,              M:N people↔clients (replaces user_brand_access)
                     access_level)                              access_level: manager(edit) | viewer(read) | client(limited)
departments         (user_id, agency_id, department,            functional/back-office access
                     brand_id NULL)                             department: finance | hr | talent | ops | …
                                                                brand_id NULL = agency-wide; set = per-client (see §8)
```

Notes:
- **Role moves off `user_profiles`** onto membership/assignment rows — a person can hold several at once (e.g. `departments: finance (agency-wide)` + `brand_assignments: manager on brand X`).
- `brand_assignments.access_level = client` is how an **external** client staffer gets limited access (paired with `agency_members.agency_role = external`).
- `brands_v2` stays as the **clients** table (already tenant-scoped).
- `user_profiles` keeps identity (name/email/auth) but **sheds `role`** as the single source of capability.

## 4. Role consolidation

Today: `owner, admin, manager, viewer, brand, creator, brand_contact` (7, overlapping). Target collapses capability into the two axes:

| Old | New |
|---|---|
| owner / admin | `agency_members.agency_role = owner / admin` |
| manager | `agency_role = member` + `brand_assignments(access_level=manager)` |
| viewer | `brand_assignments(access_level=viewer)` (or agency-wide read dept) |
| brand / brand_contact | `agency_role = external` + `brand_assignments(access_level=client)` |
| (new) Finance/HR/Ops | `departments(department=…)` |
| creator | unchanged — creator portal, separate surface |

## 5. Effective-permission resolution (the keystone)

`getWorkspaceScope()` returns:
```ts
{
  userId, email, name, agencyId, agencyRole,            // identity + agency role
  brandScope: { kind: 'all' } | { kind: 'scoped', brandIds, brandSlugs },
  functionalScope: { kind: 'all' } | { kind: 'departments', departments: string[] },
  impersonating?: { userId, name }                       // super-admin "view as" (see §7)
}
```
- owner/admin ⇒ `brandScope: all`, `functionalScope: all`.
- member ⇒ brandScope from `brand_assignments`; functionalScope from `departments` (all-domains for the clients they manage, but back-office domains only if they hold that department).
- external/client ⇒ brandScope = their one client, limited capability set.
- Every page/API/RPC resolves through this; **no per-surface role string checks**.

## 6. Phasing (sequence matters)

### Phase 0 — Tenant isolation (FOUNDATION, blocking) 🚧
Before a second agency exists, **every** data surface must constrain by tenant; service-role queries bypass RLS, so this is application-enforced. This is the current "manager isolation go-live blocker," now elevated to a **cross-customer security** requirement.

**Audit inventory** (automated scan, 93 data surfaces: ~8 critical · 12 high · 15 medium). Tiered by real-world urgency. ⚠️ Core fact: most data access uses the **service-role** client, which **bypasses RLS** — so application filtering is the *only* line of defense on those paths; "relies on RLS" is NOT protection where the admin client is used.

**Tier A — leaking NOW (unauthenticated, even at one tenant) — fix regardless of the redesign:**
- `/api/system/health`, `/api/system/pipeline` — public GET, no auth, no tenant filter → pipeline/alerts/sessions for all brands.
- `/api/tiktok/status` — public, no auth → sync status for all brands.
- `/api/brand-client-pdf`, `/api/brand-client-summary` — no auth → full client report by slug if the URL is known.
- `/api/feedback` — trusts `tenant_id`/`user_id` from the request body (spoofable cross-tenant write).

**Tier B — spoofable / weak input trust:**
- `/api/invites/generate` — caller-supplied `tenant_id`, no membership check (could invite into another tenant).
- `/api/tiktok/cron`, `/api/tiktok/sync` — `tenant_id`/brand from body behind a shared secret only.

**Tier C — missing tenant scope (latent cross-tenant once agency #2 exists):**
- API: `/api/crm/tags`, `/api/crm/tags/[creatorId]`, `/api/crm/timeline/[creatorId]` (no scope at all; `creatorId` unvalidated), `/api/reporting/freshness`, `/api/upload/{matrix,freshness,history,check,run}`, `/api/team-members{,/[id]}`, `/api/onboarding/*`.
- Data layer: `getCreatorRetainers` (all `creator_brands`, no filter), `getRenewals` (no tenant), `listIntegrations` (all brands), `products.getProducts` (no tenant), `creator-aggregate` (caller must scope).

**Tier D — brand-scope gaps (intra-agency: a manager could see other brands):**
- `rpc.ts` wrappers (`getBrandSummary`/`getCreatorRankings`/`getAnalytics*`), `analytics.ts`, `creator-aggregate.ts` take caller-supplied brands with **no internal validation** — correct only if every caller pre-filters. Error-prone by design.

**Structural fix (stop relying on per-caller discipline):** (1) a **tenant-scoped data client** or a required `scope`/`tenantId` argument on every data fn, so *omitting* scope is a type error rather than a silent leak; (2) tighten **RLS as genuine defense-in-depth** (or move hot reads to the user-scoped client) so the DB is a second wall, not the only-on-paper one. Then re-run this audit to zero. Approach for each offender: thread `getWorkspaceScope().agencyId` (+ active-tenant for platform-admin) + brand scope through the query.

### Phase 1 — Membership model
- New tables (§3) + the two-axis `getWorkspaceScope` (§5).
- **Migration:** backfill `agency_members` from `user_profiles.role` (owner/admin→same; manager→member); `brand_assignments` from `user_brand_access` (access_level=manager; brand/brand_contact→client); seed `departments` as needed. Keep `user_profiles.role` readable during transition; cut over once all surfaces read the new resolver.

### Phase 2 — Management UX
- **Clients + Members** admin: per-client member list; add/assign/remove; invite external client users (least-privilege default); department assignment.
- **"View as" switcher** (the manager-view plan, folded in as the UX layer): super-admin/agency-admin previews a member's view, **read-only** while impersonating, with a prominent banner. See `[[project_manager_view_switcher_plan]]`.
- Invite flows + audit log for access changes.

### Phase 3 — Multi-agency
- Agency self-signup (create agency + owner), per-agency billing/seats, agency-scoped super-admin (platform admin sees all; agency owner sees one).

## 7. "View as" (impersonation) — read-only
Folds the previously-planned manager-view switcher in here: a cookie + impersonation-aware `getWorkspaceScope`, gated to platform/agency admins, **read-only** (block mutating methods while the impersonation cookie is set), with a "Viewing as X" banner + exit. Only trustworthy once Phase 0 closes the scope gaps.

## 8. Open decisions
1. **Departments: agency-wide vs per-client?** Designed flexible (`departments.brand_id` nullable: NULL = agency-wide, set = scoped to one client). **Recommendation:** ship agency-wide first (matches "Finance/HR for the whole agency"); the nullable column means per-client department people are an additive future option, no migration.
2. **Billing unit** — per agency / per seat / per client? Decide before membership tables harden (affects whether assignments are billable).
3. **External user invites** — email-based, least-privilege default, expiry? Security-reviewed surface.
4. **Capability granularity** — coarse departments vs fine capability flags. Start coarse (departments); add flags only if a real case needs it.

## 9. Risks
- **Blast radius:** touches auth, middleware, RLS, ~100 API routes, every role check → do Phase 0 + Phase 1 behind the existing roles (dual-read) and cut over once green; never a big-bang.
- **Cross-tenant leak is now a security incident, not a bug** — Phase 0 is non-negotiable before onboarding agency #2.
- **Migration correctness** — backfill must preserve every current user's effective access exactly; verify per-user before/after.
- **Don't let the role refactor displace enforcement** — the satisfying part is the model; the load-bearing part is Phase 0.
