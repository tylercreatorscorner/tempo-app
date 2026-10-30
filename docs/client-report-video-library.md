# Published-video evidence in client reports

Reports link to a complete library of the recorded videos published by managed creators during that report's dates. Each video ID appears once, including videos with no sales. All qualifying aliases are retained for creator filtering. Publications differ from contractual deliverables, which may include approved credits from prior periods.

New reports save minimal video evidence alongside their existing frozen snapshot: identity, qualifying creator handles, publication date, safe TikTok watch URL and optional title. The managed published headline derives from that exact evidence set. The library and CSV read the saved packet; later uploads and roster changes cannot alter it. Copy revisions retain their original packet, while explicitly rebuilt revisions capture a new one. No existing snapshots are rewritten by this feature.

Older reports lack a saved video list. Where they preserved a full creator roster, Tempo reconstructs links from current source records for those frozen handles, the report's original dates, and its tenant-owned brand scope. The library labels this basis and shows the original reported count separately from the available evidence count. Missing or malformed historical scope fails closed rather than broadening to the current roster or all brands. A reconstructed list does not identify unrecorded prior-period credit video IDs.

The existing opaque report token authorizes the page and CSV. Revoked and unknown tokens are unavailable. Public query parameters change only search, creator filtering, sorting and pagination, never tenant, brands or dates. No contact information, compensation, source files or financial fields are included in evidence. The database function is service-only, security invoker and explicitly tenant-scoped.

The server keeps the full packet and sends only 25 visible rows to the page. The complete filtered CSV uses the same creator/search predicate. Unknown links remain explicit rows; they do not silently lower the count. Video IDs remain strings, and CSV cells are guarded against formula execution. A capture over 250,000 unique IDs fails before freezing a partial report.

Checks:

```
node scripts/test-published-video-evidence.mjs
node scripts/test-report-video-library.mjs
node scripts/test-report-video-ui.mjs
```
