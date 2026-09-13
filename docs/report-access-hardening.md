# Report export access

The reporting API checked sign-in and manager brand selection, but did not check reporting permission or constrain full-scope users to their tenant. The generator used the global brand registry, so All brands could combine workspaces.

The generator now requires the verified workspace scope and builds an explicit tenant registry. Named/store reports use the same ownership, parent/child and slug-ambiguity checks as scheduled reports. Full-scope All brands remains available with tenant-only UUID targets. The individual generator functions are private so callers cannot bypass this boundary. Cron passes its current owner's scope after its existing write check. Authorization denials return 403; failed registry reads fail closed.

Changed paths: reporting API, reports data helper, report-access helper, schedule cron caller, test-report-access.mjs and package scripts. A pre-existing explicit-any annotation in the touched report helper was replaced with its row shape for the required lint gate.

Actual route/generator fixtures verify denied capability, foreign tenant, scoped All brands, duplicate slugs, failed/truncated reads, foreign parent, legitimate single-store and tenant-only aggregate RPC targets. Typecheck, scoped lint and full isolated release suite passed. Independent review found no concrete remaining bypass. No real report delivery or financial mutation was used for verification.

Finance browser CSV/XLSX exports serialize already-authorized data. Public invoice JSON, PDF and CSV intentionally use the exact invoice bearer token; clearing it revokes the link. This review established no additional disclosure requiring a change to those existing sharing semantics. Real-provider delivery and a complete database-wide security certification are outside this release.
