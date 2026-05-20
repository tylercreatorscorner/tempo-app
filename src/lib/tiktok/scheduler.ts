import { createAdminClient } from '@/lib/supabase/server';
import { TikTokClient } from './client';
import {
  ingestVideoPerformance,
  ingestCreatorPerformance,
  ingestProductPerformance,
} from './ingest';
import type {
  BrandShopIdentifier,
  DateRangeOptions,
  SyncResult,
  TikTokShopConnection,
} from './types';

/**
 * Get yesterday's date as YYYY-MM-DD string.
 */
function getYesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

/**
 * Refresh the access token for a shop connection if it's expired or expiring soon.
 * Returns the (possibly refreshed) access token.
 */
async function ensureFreshToken(
  connection: TikTokShopConnection
): Promise<string> {
  const expiresAt = new Date(connection.token_expires_at).getTime();
  const now = Date.now();
  // Refresh if expiring within 30 minutes
  const REFRESH_BUFFER_MS = 30 * 60 * 1000;

  if (expiresAt - now > REFRESH_BUFFER_MS) {
    return connection.access_token;
  }

  console.log(
    `[Scheduler] Refreshing token for ${connection.brand} (shop ${connection.shop_id})`
  );

  const tokenData = await TikTokClient.refreshAccessToken(
    connection.refresh_token
  );

  const supabase = await createAdminClient();
  const newExpiresAt = new Date(
    Date.now() + tokenData.access_token_expire_in * 1000
  ).toISOString();

  await supabase
    .from('tiktok_shop_connections')
    .update({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', connection.id);

  return tokenData.access_token;
}

/**
 * Run a full data sync for a single brand/shop.
 * Pulls video, creator, and product performance data.
 */
export async function syncBrand(
  connection: TikTokShopConnection,
  dateRange?: DateRangeOptions
): Promise<SyncResult> {
  const startedAt = new Date().toISOString();
  const errors: string[] = [];

  const range: DateRangeOptions = dateRange || {
    start_date: getYesterday(),
    end_date: getYesterday(),
  };

  let accessToken: string;
  try {
    accessToken = await ensureFreshToken(connection);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      brand: connection.brand,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      video_performance: null,
      creator_performance: null,
      product_performance: null,
      errors: [`Token refresh failed: ${msg}`],
    };
  }

  const shop: BrandShopIdentifier = {
    brand: connection.brand,
    shop_id: connection.shop_id,
    tenant_id: connection.tenant_id,
    access_token: accessToken,
  };

  // Run all three ingestion functions
  let videoSummary = null;
  let creatorSummary = null;
  let productSummary = null;

  try {
    videoSummary = await ingestVideoPerformance(shop, range);
    if (videoSummary.errors.length > 0) {
      errors.push(...videoSummary.errors);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Video ingestion failed: ${msg}`);
  }

  try {
    creatorSummary = await ingestCreatorPerformance(shop, range);
    if (creatorSummary.errors.length > 0) {
      errors.push(...creatorSummary.errors);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Creator ingestion failed: ${msg}`);
  }

  try {
    productSummary = await ingestProductPerformance(shop, range);
    if (productSummary.errors.length > 0) {
      errors.push(...productSummary.errors);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Product ingestion failed: ${msg}`);
  }

  // Update connection status. tiktok_shop_connections has last_api_call +
  // last_error (no separate status column); status is derived downstream
  // from whether last_error is null.
  const supabase = await createAdminClient();
  await supabase
    .from('tiktok_shop_connections')
    .update({
      last_api_call: new Date().toISOString(),
      last_error: errors.length > 0 ? errors.join('; ') : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', connection.id);

  return {
    brand: connection.brand,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    video_performance: videoSummary,
    creator_performance: creatorSummary,
    product_performance: productSummary,
    errors,
  };
}

/**
 * Sync all connected brands for a given tenant.
 * Designed to be called from the cron API route.
 */
export async function syncAllBrands(
  tenantId?: string,
  dateRange?: DateRangeOptions
): Promise<SyncResult[]> {
  const supabase = await createAdminClient();

  let query = supabase.from('tiktok_shop_connections').select('*');
  if (tenantId) {
    query = query.eq('tenant_id', tenantId);
  }

  const { data: connections, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch shop connections: ${error.message}`);
  }

  if (!connections || connections.length === 0) {
    console.log('[Scheduler] No shop connections found');
    return [];
  }

  const results: SyncResult[] = [];

  for (const connection of connections as TikTokShopConnection[]) {
    console.log(
      `[Scheduler] Syncing brand: ${connection.brand} (shop ${connection.shop_id})`
    );
    const result = await syncBrand(connection, dateRange);
    results.push(result);
  }

  return results;
}
