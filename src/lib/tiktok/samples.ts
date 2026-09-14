import type { TikTokClient } from './client';
import { record, rows, id, text, number, nextToken, type Rec } from './ingest-core';

// Verified in Partner Center 2026-09-14; both reads use seller authorization.
// Review/approve/reject is deliberately not implemented by this reader.
export const SAMPLE_SEARCH_PATH = '/affiliate_seller/202508/sample_applications/search';
export const SAMPLE_STATUSES = ['PENDING', 'AWAITING_SHIPMENT', 'SHIPPED', 'CONTENT_PENDING',
  'REJECT_CANCELLED', 'OVERDUE_CANCELLED', 'UNFULFILL_CANCELLED', 'DEL_OPEN_COLLAB',
  'SELLER_NOT_SHIP_CANCELLED', 'WITHDRAW_CANCELLED', 'UNFULFILLABLE_CANCELLED',
  'OPS_CANCELLED', 'OPS_FAILED', 'OPS_COMPLETED', 'COMPLETED'] as const;
export function sampleApplication(raw: Rec) {
  const creator = record(raw.creator), product = record(raw.product);
  return {
    id: id(raw.id), status: text(raw.status), creatorOpenId: text(creator.creator_open_id),
    creator: text(creator.username), productId: text(product.id), product: text(product.title),
    sku: text(product.sku_name), commissionRate: number(raw.commission_rate),
    orderId: text(raw.order_id), trackingNumber: text(raw.tracking_number),
    approvalDeadline: number(raw.approve_expiration_time),
    shipmentDeadline: number(raw.shipment_expiration_time),
    fulfillmentStatus: text(raw.fulfillment_status),
  };
}
export type SampleApplication = ReturnType<typeof sampleApplication>;
export interface SamplePage {
  applications: SampleApplication[]; nextPageToken: string | null; totalCount: number | null;
}
export async function searchSampleApplications(
  client: Pick<TikTokClient, 'post'>, options: { status?: string; username?: string; pageToken?: string } = {},
): Promise<SamplePage> {
  if (options.status && !(SAMPLE_STATUSES as readonly string[]).includes(options.status)) throw new Error('Invalid sample status');
  if ((options.username?.length ?? 0) > 100 || (options.pageToken?.length ?? 0) > 4096) throw new Error('Invalid sample filters');
  const { data } = await client.post<Rec>(SAMPLE_SEARCH_PATH, {
    query: { page_size: '50', ...(options.pageToken ? { page_token: options.pageToken } : {}) },
    body: { ...(options.status ? { status: options.status } : {}), ...(options.username ? { username: options.username } : {}) },
    idempotent: true,
  });
  const applications = rows(data, 'sample_applications').map(sampleApplication);
  const next = nextToken(data);
  if (next && next === options.pageToken) throw new Error('Repeated sample page token');
  return { applications, nextPageToken: next, totalCount: number(data.total_count) };
}
export function fulfillment(raw: Rec) {
  const content = record(raw.content);
  return { id: id(content.id), description: text(content.description),
    views: number(content.view_count), likes: number(content.like_count),
    comments: number(content.comment_count), paidOrders: number(content.paid_order_count),
    productLinkedAt: number(content.create_time), liveEndTime: number(content.live_end_time) };
}
export type SampleFulfillment = ReturnType<typeof fulfillment>;
export async function sampleFulfillments(client: Pick<TikTokClient, 'post'>, applicationId: string, format: 'VIDEO' | 'LIVE') {
  if (!/^\d{1,30}$/.test(applicationId)) throw new Error('Invalid application ID');
  const { data } = await client.post<Rec>(
    `/affiliate_seller/202409/sample_applications/${applicationId}/fulfillments/search`,
    { body: { content_format: format }, idempotent: true },
  );
  return rows(data, 'fulfillments').map(fulfillment);
}
