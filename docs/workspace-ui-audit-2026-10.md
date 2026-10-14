# Tempo workspace UI audit, October 2026

The approved Creators palette is now owned by the signed-in app shell. Previously, visiting Creators or Dashboard changed body-level variables; other routes fell back to the older lavender theme. All authenticated workspaces now share neutral canvas/surfaces, restrained purple accents, compact typography and controls. Public portals and report snapshots retain their own theme ownership.

## Page inventory and changes

| Surface | Audit decision / cleanup |
| --- | --- |
| Dashboard, manager reviews | Retain approved charts and portfolio layout. Rename all-brand context to Brand portfolio, including its loading view; agency finances remain a separate permission-controlled workspace. |
| Creators, creator profile | Preserve the approved layout and chart interactions. Remove page-owned body colors. Replace remaining brand/status menus in add/edit dialogs with ChoiceMenu. |
| Onboarding | Preserve current invite flow. Add a dedicated loading view so navigation no longer temporarily claims to be the creator roster. |
| Discord group review | Preserve additive imports and identity review. Add its own loading view rather than inheriting the roster skeleton. |
| Content, video review | Retain approved filters, charts and video drawer. Rebuild the loading layout to match the current overview/filter/table structure, including phone widths. |
| Coaching, Elite creator performance | Preserve assigned-brand scope and weekly semantics. Theme consistently; replace submission-history native menu with ChoiceMenu, including the empty/latest selection. |
| Reporting, weekly reports | Preserve preparation/library organization and frozen reports. Replace the preparation brand picker. Align shared headers, cards, typography and loading spacing. |
| Communications | Use the shared page header. Replace broadcast audience/template dropdowns without changing audience resolution or sending behavior. |
| Discord posts | Move brand selection onto the compact shared menu; retain previews, copying and posting controls. Correct its breadcrumb label. |
| Earnings, year view | Compact toolbars and KPI cards; shared month/payee/year menus. Keep payee compensation distinct from agency revenue. |
| Invoicing | Shared brand/payee/paid-month filters and invoice month/payee/payment-method menus. No invoice or payment writes during verification. |
| Payments | Compact shared brand/search controls and KPI cards. Preserve retainer book, collections and audit-log definitions. |
| Agency overview, clients, revenue, reports | Remove local palette resets, retain owner-only access. Reports use the shared header and no longer add a second page-padding layer. |
| General settings, People & access | Shared theme, headers and inputs; team role menus use ChoiceMenu. Keep role restrictions and confirmation flows intact. |
| Brand settings | Shared header/buttons, compact spacing, responsive summary cards, standard loading feedback. |
| Finance setup | Themed compensation-model menu; retain billing identities and arrangements. |
| Data & Imports | Themed file-type and brand controls, preserving disabled/editable states and coverage warnings. |
| Automations | Shared header/action/loading treatment, theme-aware row dividers, compact layout. Preserve triggers and actions. |
| Connections | Shared header, readable status explanation, theme-aware dividers, quieter catalog interaction. Configuration remains distinct from successful delivery. |
| Brands, brand detail | Shared headers and stored brand portraits in place of colored initial boxes. Remove scale-on-hover cards. |
| Discord link review, scanner | Remove nested full-screen backgrounds/padding; shared headings and brand filter. Keep identity decisions manual. |
| Products/catalog, retention, affiliates, segments, contests | Hidden legacy destinations retain existing behavior and permissions; inherit the same foundation. Catalog gets a themed brand selector. Update route skeleton spacing/radii. |
| Discover | Replace nonfunctional placeholder controls with an honest unavailable state and working Content destination. |
| Redirect-only routes | Analytics, creators index, invites, outreach, Discord-posts alias and YTD retain existing destinations. |

## Verification

- TypeScript validation and date-control regression suite passed locally.
- Temporary local UI fixture used actual shared components with dummy configuration and sample values, then was removed before commit.
- Browser verified menu selection and return to empty/latest, disabled option, keyboard selection, search filtering/clear, light/dark themes and 320/390px widths.
- Narrow-phone check caught large currency wrapping at the decimal; long values now use a smaller responsive size.
- No production records, permissions, messages, invoices or payments were changed by the visual audit.
- Existing lint errors in roster, legacy Discord scanner and mark-paid modal were compared against the base revision; they predate this visual patch. New/changed component code is checked separately; release CI remains required.

## Maintenance contract

Use PageHeader, ChoiceMenu, SearchInput, Button, Card and the shared loading primitives on new workspace pages. Do not create route-specific body theme overrides. Keep tables horizontally scrollable inside their panels, keep mobile controls operable, and preserve explicit missing/partial/error states. Do not use layout cleanup to change data definitions or access control.
