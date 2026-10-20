# Tempo mobile workflow pass

## Implemented

- Dashboard, creator/product rankings, video GMV, Earnings, invoices, retainers, Agency Finance, client and creator portal ledgers reflow into labeled phone records. Desktop comparison views remain available at wider sizes.
- Phone sort and period controls use the existing sort functions or server URLs. GMV dates, posting dates, search and pagination keep their existing meanings. Blank posting dates remain unrestricted.
- Team permissions and upload coverage have readable phone views. Coverage preserves complete, partial, missing, awaiting, unverified and not-expected states, including reasons and report-detail actions.
- Navigation drawers, date controls, menus, editable text fields and important actions have larger targets. Native text fields use 16px on phones. Forms use dynamic viewport sizing; supporting browsers can resize content for the keyboard.
- The communications inbox can show a conversation separately from its queue and return without clearing its remembered draft.
- Creator inspiration thumbnails defer oEmbed requests until near the viewport. Video playback remains an explicit action.

## Validation boundary

TypeScript, changed-file lint against the existing baseline, offline regression tests and source review cover this change. Fictional component fixtures are kept outside version control. They do not authenticate to production or permit real writes.

Fresh visual and browser interaction verification could not run because the browser origin approval gate declined the local preview. No physical iPhone/Safari or Android/Chrome certification is claimed. The existing 320px/390px checks from the earlier layout pass do not validate these new changes.

## Remaining acceptance checks

Run on iPhone Safari and Android Chrome at narrow and wide phone sizes, plus desktop:

1. Open navigation, change pages, close with Escape when a keyboard is available, and rotate with the drawer open. Verify focus returns sensibly and the background scroll unlocks.
2. Change GMV and optional posting dates, open overall and creator-specific video GMV, sort, and return. Confirm filters and amounts agree.
3. Expand a long-named team member's brand access; verify every action and brand label is reachable. Cancel invitation/profile forms without sending or saving.
4. Read financial cards, totals, invoice statuses and selected bulk actions. Open and cancel a financial editor. Verify comparison tables and invoice print output on desktop.
5. Pick a coverage day and each report type, including missing and awaiting examples. Verify the detail drawer describes the same brand, date and state.
6. Type into login, dates, messages and billing fields with the on-screen keyboard. Check the focused field and primary action stay reachable and zoom remains usable.
7. Select a disposable local CSV/PDF in a non-production fixture; inspect filename, validation and cancel behavior. Test a failed request and retry on a slow connection.
8. Compare inspiration loading and scrolling on a real cellular connection. Measure before making a cellular-performance claim.
