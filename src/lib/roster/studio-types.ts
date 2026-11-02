/** Read-only roster context. These types are safe to import in client components. */
export interface RosterStudioData {
  asOf: string;
  month: string;
  agreement: {
    source: 'ledger' | 'current' | 'unavailable';
    status: 'active' | 'affiliate' | 'ended' | 'awaiting_renewal' | 'unverified';
    partnershipType: 'retainer' | 'affiliate' | null;
    retainer: number | null;
    requiredPosts: number | null;
    periodStart: string | null;
    periodEnd: string | null;
    /** Only true for one confirmed, full-calendar-month ledger segment. */
    comparable: boolean;
  };
  delivery: {
    month: string;
    start: string;
    through: string;
    /** Distinct recorded video IDs published this month, not approved deliverables. */
    published: number | null;
    qualifying: null;
    pace: null;
    basis: 'recorded_publications';
    reason: 'qualification_unverified' | 'unavailable' | 'not_required';
  };
  /** Existing brand assignment, not an invented per-creator coaching assignment. */
  owner: { id: string; name: string; avatar: string | null; role: 'Brand manager' } | null;
  ownerStatus: 'assigned' | 'unassigned' | 'unavailable';
}

export interface RosterStudioResponse {
  asOf: string;
  rows: { id: string; studio: RosterStudioData }[];
}
