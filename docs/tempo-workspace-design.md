# Tempo workspace design

The signed-in workspace uses one visual system for brand operations and agency finance. Its shared shell is `src/components/layout/admin-shell.tsx`; `workspace-theme.module.css` owns the theme for its descendants and portalled menus. Creator, brand, manager, and onboarding surfaces now use the same visual vocabulary through the isolated `portal-workspace.module.css` theme. Public reports, printed documents, and marketing pages retain their own theme boundaries.

## Foundation

- Use a pale slate canvas, white surfaces, dark slate text, and one violet action/selection accent. Dark appearance uses the same hierarchy and semantic roles. Brand logos and categorical data series retain meaningful color; decorative competing palettes do not.
- Shared spacing comes from `--workspace-page-gap` (16px) and `--workspace-page-padding` (20px desktop, 14px phone). The shell uses the available content width. Pages should not add a second full-width padding/background wrapper or an arbitrary maximum-width cap.
- Use `--workspace-surface-radius` (14px), `--workspace-control-radius` (8px), and `--workspace-control-height` (38px) for shared panels and controls. Coarse pointers receive at least 44px action targets.
- Cards use `--workspace-surface-shadow`; menus and overlays use `--workspace-surface-raised-shadow`. Prefer fine borders to stacked shadows or glow effects.
- Existing semantic colors and legacy Pulse tokens map to the same workspace palette. Success, warning, and failure always retain visible labels; color alone does not communicate a state.
- Keep metric values tabular and preserve their definitions. A visual change must not turn missing data into zero, remove partial-data warnings, expose compensation, or alter financial calculations.

## Navigation and layout

The expanded desktop sidebar is 232px wide, with a 72px collapsed rail. Brand navigation groups related destinations under Workspace, Engagement, and Finance. Agency navigation groups Agency, Finance, and Insights. Empty groups disappear under existing permission filters. The Brands/Agency switch remains governed by agency access.

The header remains 56px high so the shared section tab bar keeps its existing sticky offset. Its breadcrumb shows the current route, including creator/brand detail overrides. The tenant switcher, account menu, theme control, and mobile drawer remain accessible. On narrow screens the tenant/page labels truncate rather than forcing horizontal page scrolling.

The mobile drawer uses the same Sidebar component as desktop, including permission filtering and active-route matching. Pending link spinners remain inside each Next.js Link, preserving the existing navigation feedback. Collapsing desktop navigation continues to persist the `sidebar_collapsed` cookie.

The first keyboard stop is a skip link to the main page content. Navigation links, workspace switching, and shell buttons have visible focus states. Motion is restrained and disabled when reduced motion is requested. Use SVG icons for directional navigation when needed; never append text arrows to labels.

## Page and component contract

Use PageHeader, Button, Card, ChoiceMenu, SearchInput, shared date controls, and shared loading primitives. New routes inherit the workspace palette; do not set body-level colors or create local copies of the theme. Tables scroll within their own panels on narrow screens. Page actions wrap in a predictable toolbar rather than overflowing the viewport.

Signed contract suggestions stay reviewable before they change client agreements. Financial print views keep their explicit document colors and dimensions; workspace screen styling must not override their printable content.

## Operational page composition

Dashboard uses a single compact metric strip and a slim creator-commitment row. Its main column holds performance analysis, brand performance, manager portfolios, and ranked leaderboards. A separate review column holds movement/coverage signals, managed share, optional video posting-date filters and drilldowns, and the creators driving GMV changes. Daily and monthly performance share one chart panel, with explicit controls for both views, rather than adding two full-width chart sections to every visit.

Brands uses a comparable portfolio list instead of large two-column tiles. The selected date window follows a brand into its detail view. Brand detail places the trend beside the client portal note and period context; creator/product tables stay accessible through keyboard-operable tabs. Loading views mirror these layouts. Panels should group related work instead of nesting multiple decorated cards, and supporting explanations should stay close to the data or control they explain.

## Remaining page composition

| Area | Layout and workflow |
| --- | --- |
| Earnings, month and year | One control bar and compact metric strip; earnings trend beside brand contribution; dense brand/month ledgers. |
| Finance setup | Billing identity rail beside individual compensation arrangements. |
| Invoicing | Independent lifecycle lanes with a stage filter; unified ledger controls, selectable aging buckets, and responsive detail/create/payment dialogs. |
| Payments | Retainer ledger as the main work area, with brand commitments and payment activity in a supporting column. |
| Communications | Daily queue and conversation list/detail; compact context, community drafts, broadcast and template views. |
| Automations and connections | Searchable directories, explicit status filters, configuration beside operational context. |
| Coaching and Elite | Saved-record work area, compact submission/evidence summaries, review controls and supporting context; weekly drafts remain mounted when collapsed. |
| Weekly reporting | Submission list beside the editable weekly review and calculated metric context. Agency weekly brief keeps its portfolio table beside manager context. |
| Products | Performance ledger beside product leaders, compact metric strip and consolidated brand controls. Product rows have keyboard-operable creator expansion. |
| Catalog | Brand controls, labelled counts, product directory and mapping context. Counts and editing rows belong to the successfully loaded brand; failed or superseded reads cannot show another brand's catalog. |
| Settings and team | Account facts beside workspace tools; searchable brand setup; compact access summary and member filters for unaccepted invites or missing brand assignments. |
| Data and imports | Coverage remains primary; upload queue and recent history sit together below it. Source recovery places available sources beside captured results. |
| Creator invitations | Join-link workspace beside onboarding guidance; personal portal invitation tools beside test/batch tools, preserving dry-run and send controls. |
| Segments and retention | Lifecycle and saved audiences side by side; cohort heatmap beside re-engagement context; compact comparison summaries. |
| Contests | Searchable lifecycle groups with explicit counts and status controls; existing standings, settlement and builder actions remain intact. |
| Discord groups and identity review | Membership review beside configuration; compact status summaries, consolidated filters, dense identity rows and wrapping actions. |
| Video review | Persistent video rail beside performance, trends and editable review; team feedback stays with the review workspace. |
| Creator portal | Home combines actions/videos with standing, goals and exact deliverable progress; Performance, Brands, Rankings, Inspiration and Settings each use compact page-specific compositions. |
| Client portal | Overview places performance and ranked details beside account context; Creators/Videos use compact metrics and filters; Reports places selections beside export guidance; Settings and creator details have separate context areas. |
| Manager and onboarding | Compact manager brand overview and unified account/join/setup forms, without changing sign-in or onboarding decisions. |

Redirect-only routes (`/analytics`, `/ytd`, `/discord-posts`, `/invites`, `/creators`) retain their existing destinations and query handling. Discover remains an explicitly unavailable feature rather than showing invented results. Frozen public report documents and print/PDF templates keep their document layout.

Shared layout grids must use `minmax(0, 1fr)` for implicit main/stack columns as well as multi-column tracks. This prevents long audience names from widening a phone page. Catalog product names wrap on phones, with monetary context below the identity and editing actions kept in a separate column.

## Verification

Run TypeScript validation and targeted ESLint for touched TSX files. Check the shared shell with both themes, expanded/collapsed navigation, phone widths, and portalled controls. Verify brand query preservation, matching child routes, permission-filtered groups, and navigation loading feedback. Inspect representative dashboard, creators, reporting, communications, earnings, and agency finance pages before release.
