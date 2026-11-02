import type { RosterStudioData } from '@/lib/roster/studio-types';

export type CreatorHealth = 'healthy' | 'behind' | 'silent' | 'churned' | 'affiliate' | 'no_data' | 'not_assessed';

/** The existing roster API shape, shared by the table and overview drawer. */
export interface Creator {
  id: string;
  real_name: string | null;
  brand: string | null;
  status: string | null;
  retainer: number | null;
  monthly_post_requirement: number | null;
  discord_name: string | null;
  discord_avatar: string | null;
  notes: string | null;
  created_at: string | null;
  creator_id: string | null;
  handles: string[];
  account_1: string | null;
  account_2: string | null;
  account_3: string | null;
  account_4: string | null;
  account_5: string | null;
  gmv_period: number;
  gmv_by_store: Record<string, number>;
  posts_period: number;
  posts_7d: number;
  last_post_date: string | null;
  joined: string | null;
  health: CreatorHealth;
  roi_period: number | null;
  spark?: number[];
  spark_posts?: number[];
  gmv_delta?: number | null;
  posts_delta?: number | null;
  level?: number | null;
  last_message_at: string | null;
  unread_count: number;
  is_managed: boolean;
  product_tags: { key: string; name: string }[];
  creator_tags?: string[];
  grouped?: boolean;
  brands?: BrandChild[];
  /** Optional until the source can supply distinct orders and units. */
  orders_period?: number | null;
  units_period?: number | null;
  studio?: RosterStudioData;
}

/** One real brand contract beneath a collapsed All Brands creator row. */
export interface BrandChild {
  brand: string | null;
  row_id: string;
  gmv_period: number;
  posts_period: number;
  retainer: number | null;
  roi_period: number | null;
  last_post_date: string | null;
  health: CreatorHealth;
  studio?: RosterStudioData;
}
