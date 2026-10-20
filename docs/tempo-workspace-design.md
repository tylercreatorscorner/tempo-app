# Tempo workspace design

The signed-in workspace uses one visual system for brand operations and agency finance. Its shared shell is `src/components/layout/admin-shell.tsx`; `workspace-theme.module.css` owns the theme for its descendants and portalled menus. Public reports, the Creator Hub, client portals, and marketing pages keep their own theme boundaries.

## Foundation

- Use a pale slate canvas, white surfaces, dark slate text, and one violet action/selection accent. Dark appearance uses the same hierarchy and semantic roles. Brand logos and categorical data series retain meaningful color; decorative competing palettes do not.
- Shared spacing comes from `--workspace-page-gap` and `--workspace-page-padding`. The shell supplies outer page padding and a 1600px maximum content width. Pages should not add a second full-width padding/background wrapper.
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

## Verification

Run TypeScript validation and targeted ESLint for touched TSX files. Check the shared shell with both themes, expanded/collapsed navigation, phone widths, and portalled controls. Verify brand query preservation, matching child routes, permission-filtered groups, and navigation loading feedback. Inspect representative dashboard, creators, reporting, communications, earnings, and agency finance pages before release.
