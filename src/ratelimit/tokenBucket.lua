-- Atomic token-bucket rate limit.
--
-- KEYS[1] = bucket key
-- ARGV[1] = capacity
-- ARGV[2] = refill tokens per second
-- ARGV[3] = now (ms since epoch)   -- passed in, never redis TIME (that would be
--                                     non-deterministic and break replication)
--
-- Returns: { allowed (1/0), remaining, retry_after_seconds }

local capacity = tonumber(ARGV[1])
local refill   = tonumber(ARGV[2])
local now      = tonumber(ARGV[3])

local bucket = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
local tokens = tonumber(bucket[1])
local ts     = tonumber(bucket[2])

if tokens == nil then
  tokens = capacity
  ts = now
end

-- refill by elapsed time
local elapsed = math.max(0, now - ts) / 1000.0
tokens = math.min(capacity, tokens + elapsed * refill)

local allowed = 0
local retry_after = 0
if tokens >= 1 then
  tokens = tokens - 1
  allowed = 1
else
  local deficit = 1 - tokens
  retry_after = 1
  if refill > 0 then
    retry_after = math.ceil(deficit / refill)
  end
end

redis.call('HSET', KEYS[1], 'tokens', tokens, 'ts', now)
-- self-evict idle buckets after roughly a full refill window
local ttl = 60
if refill > 0 then
  ttl = math.ceil(capacity / refill) + 1
end
redis.call('PEXPIRE', KEYS[1], ttl * 1000)

return { allowed, math.floor(tokens), retry_after }
