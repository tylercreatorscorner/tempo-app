/**
 * TikTok Shop types.
 *
 * Deliberately thin. The ONLY response shape modelled here is the token
 * exchange, because it is the only one this phase has a contract for.
 *
 * Analytics / report response types MUST be generated from captured real
 * responses in a later phase, never hand-written. Hand-written interfaces are
 * exactly what hid the previous module's bugs from tsc: it declared
 * `data.shop_videos`, a `pagination` wrapper, `gmv: number` and
 * `video_post_time: number` — all four wrong, and every file still compiled.
 */

/**
 * The envelope every TikTok Shop endpoint replies with. `data` is
 * endpoint-specific and stays unmodelled on purpose; cast it at the call site.
 * `code === 0` means success — see the client, which treats a non-zero code on
 * an HTTP 200 as a failure.
 */
export interface TikTokEnvelope<T = unknown> {
  code: number;
  message: string;
  request_id?: string;
  data: T;
}

/** Raw `data` payload of /api/v2/token/get and /api/v2/token/refresh. */
export interface TikTokTokenResponseData {
  access_token: string;
  refresh_token: string;
  /** ABSOLUTE unix seconds, not a TTL. Converted in the client. */
  access_token_expire_in: number;
  /** ABSOLUTE unix seconds, not a TTL. Converted in the client. */
  refresh_token_expire_in: number;
  open_id?: string;
  seller_name?: string;
}

/** Parsed token pair, with the expiries already resolved to real dates. */
export interface TikTokTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
  openId: string | null;
  sellerName: string | null;
}
