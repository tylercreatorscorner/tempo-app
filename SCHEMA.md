# Supabase Schema Reference

**Last verified: 2026-02-24**

This is the ACTUAL schema. Always reference this file when writing queries.

## managed_creators
The main creator roster table.
| Column | Notes |
|--------|-------|
| id | integer PK |
| real_name | can be null |
| brand | slug: jiyu, catakor, physicians_choice, toplux, yerba_magic, peach_slices |
| discord_id | Discord user ID (linked) |
| discord_user_id | same as discord_id (duplicate column) |
| discord_name | Discord username string |
| discord_avatar | avatar URL (already stored, no need to fetch from Discord API) |
| discord_channel_id | |
| retainer | numeric (NOT retainer_amount) |
| retainer_start_date | |
| monthly_post_requirement | default 30 |
| contract_length_days | default 30 |
| email | |
| phone | |
| status | Active, etc. |
| employment_status | active, etc. |
| role | e.g. "Creatives" |
| account_1 through account_10 | LEGACY TikTok handles. Use creator_accounts instead. |
| notes | |
| tags | |
| current_tier | bronze, etc. |
| lifetime_gmv | |
| weeks_in_top_5 | |
| weeks_in_top_10 | |
| first_top_10_date | |
| product_assignments | jsonb |
| product_retainers | |
| application_id | |
| applied_at | |
| joined_at | |
| added_at | |
| created_at | |
| updated_at | |
| created_by | |
| updated_by | |
| last_contact_date | |
| next_followup_date | |
| status_changed_at | |
| termination_reason | |
| tenant_id | UUID |

**IMPORTANT**: No `tiktok_handle` column. No `retainer_amount` column. Use `retainer` for retainer. Use `creator_accounts` table for TikTok usernames.

## creator_accounts
Maps creators to their TikTok usernames. One creator can have multiple accounts.
| Column | Notes |
|--------|-------|
| id | UUID PK |
| creator_id | FK → managed_creators.id |
| tiktok_username | the TikTok handle |
| brand | brand slug |
| is_primary | boolean |
| verified | boolean |
| verified_at | |
| tenant_id | UUID |
| created_at | |

## video_performance
Daily video-level performance data (from CSV uploads).
| Column | Notes |
|--------|-------|
| id | integer PK |
| report_date | DATE (NOT "date") — the date this data is for |
| brand | brand slug |
| video_id | TikTok video ID |
| video_title | |
| video_link | |
| creator_name | TikTok username (matches creator_accounts.tiktok_username) |
| product_name | |
| product_id | |
| gmv | numeric (NOT total_gmv) |
| orders | |
| aov | |
| avg_gmv_per_customer | |
| items_sold | |
| refunds | |
| items_refunded | |
| est_commission | |
| est_flat_fee | |
| period_type | 'daily' for daily rows |
| post_date | date video was originally posted |
| data_source | 'csv' or 'api' |
| week_start | |
| week_end | |
| created_at | |
| updated_at | |
| tenant_id | UUID |

**IMPORTANT**: No `creator_id` column. Uses `creator_name` (TikTok username) to identify creators. No `total_gmv` — use `gmv`. No `date` — use `report_date`.

## creator_performance
Daily creator-level aggregate performance data.
| Column | Notes |
|--------|-------|
| id | integer PK |
| report_date | DATE |
| brand | brand slug |
| creator_name | TikTok username |
| gmv | numeric |
| orders | |
| aov | |
| items_sold | |
| refunds | |
| items_refunded | |
| est_commission | |
| est_flat_fee | |
| videos | number of videos |
| live_streams | |
| samples_shipped | |
| managed_creator_id | FK → managed_creators.id (may be null) |
| period_type | |
| data_source | |
| week_start | |
| week_end | |
| created_at | |
| tenant_id | UUID |

## creator_messages
DM tracking between admin and creators.
| Column | Notes |
|--------|-------|
| id | UUID PK |
| creator_id | FK → managed_creators.id |
| discord_user_id | Discord user ID |
| direction | 'inbound' or 'outbound' |
| channel | 'dm', 'channel', 'bulk' |
| content | message text |
| status | 'sent', 'delivered', 'failed', 'blocked' |
| sent_by | who sent it |
| metadata | jsonb |
| sent_at | timestamp |
| tenant_id | UUID |

## brands
Brand reference table.
| Column | Notes |
|--------|-------|
| id | integer PK |
| name | brand slug |
| display_name | human-readable |
| tenant_id | UUID |

## videos
Legacy video table (daily snapshots).
| Column | Notes |
|--------|-------|
| id | integer PK |
| video_id | TikTok video ID |
| video_name | |
| video_link | |
| brand | |
| creator_name | |
| post_date | date video was posted |
| total_gmv | GMV for that day (daily snapshot) |
| orders | |
| items_sold | |
| est_commission | |
| impressions | |
| likes | |
| comments | |
| affiliate_gmv | |
| created_at | |
| updated_at | |
| tenant_id | UUID |

## discord_match_queue
Discord server scan results for creator matching.
| Column | Notes |
|--------|-------|
| id | UUID PK |
| guild_id | Discord server ID |
| discord_user_id | |
| discord_username | |
| discord_display_name | |
| discord_avatar_url | |
| matched_creator_id | FK → managed_creators.id |
| match_type | 'exact', 'fuzzy', 'none' |
| match_confidence | 0.00 to 1.00 |
| match_reason | explanation string |
| status | 'pending', 'approved', 'rejected', 'skipped' |
| reviewed_by | |
| reviewed_at | |
| scanned_at | |
| tenant_id | UUID |
