/** A frozen commercial revision; imported sales metrics remain separate. */
export interface ReportReconciliation {
  version: 1;
  sourceReportId: string;
  revisedAt: string;
  summary: string;
  rows: {
    name: string;
    handle: string;
    agreement: string;
    augustPosts: number;
    creditedPosts: string;
    invoice: number | null;
    resolution: string;
  }[];
}
