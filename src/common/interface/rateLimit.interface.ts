export type RateLimitConfig = {
  TTL: number;
  LIMIT: number;
  BLOCK_DURATION: number;
  MAX_HTTP_BODY_SIZE: string;
  MAX_URL_BYTES: number;
  MAX_WS_MESSAGE_BYTES: number;
};
