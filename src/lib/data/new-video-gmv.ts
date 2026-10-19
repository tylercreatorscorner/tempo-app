export interface NewVideoGmv {
  gmv30d: number;
  videos30d: number;
  totalGmv: number;
  unknownPostDateGmv: number;
  factCount: number;
  brands: number;
  recordedBrandDays: number;
  expectedBrandDays: number;
  start: string;
  end: string;
  postStart?: string | null;
  postEnd?: string | null;
  creators: { id: number; creatorId: string | null; name: string; brand: string; brandName: string; gmv30d: number; totalGmv: number; videos30d: number }[];
}

export function validVideoRange(start: string, end: string): boolean {
  const valid = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s))
    && new Date(s).toISOString().slice(0, 10) === s;
  return valid(start) && valid(end) && start <= end && (Date.parse(end)-Date.parse(start))/86400000 <= 400;
}
