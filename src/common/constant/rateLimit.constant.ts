import { RateLimitConfig } from 'src/common/interface/rateLimit.interface';

export const RATE_LIMIT_CONFIG: RateLimitConfig = {
  TTL: 1000,
  LIMIT: 30,
  BLOCK_DURATION: 60000 * 60, // 1 giờ
  MAX_HTTP_BODY_SIZE: '100kb',
  MAX_URL_BYTES: 2048,
  MAX_WS_MESSAGE_BYTES: 4096,
};
