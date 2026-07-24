-- request_logs: high-volume, partitioned by day.
--
-- Partitioning by day makes retention a fast DROP of an old partition instead
-- of a slow DELETE, and keeps queries scanning only the days they need. For now
-- a DEFAULT partition catches every row so inserts never fail; the next step
-- adds daily partitions plus a maintenance job that pre-creates them.

CREATE TABLE IF NOT EXISTS request_logs (
  req_id      uuid        NOT NULL,
  ts          timestamptz NOT NULL,
  client_ip   inet,
  method      text        NOT NULL,
  path        text        NOT NULL,
  upstream    text,
  status      smallint    NOT NULL,
  duration_ms integer     NOT NULL,
  decision    text        NOT NULL,      -- allow | block | ratelimit
  rule_id     text,
  category    text,                      -- sqli | xss | traversal | cmdi | ssrf
  anomaly     smallint    NOT NULL DEFAULT 0,
  PRIMARY KEY (req_id, ts)               -- ts is the partition key, so it's in the PK
) PARTITION BY RANGE (ts);

CREATE TABLE IF NOT EXISTS request_logs_default PARTITION OF request_logs DEFAULT;

CREATE INDEX IF NOT EXISTS idx_request_logs_ts ON request_logs (ts DESC);
CREATE INDEX IF NOT EXISTS idx_request_logs_block
  ON request_logs (category, ts DESC) WHERE decision = 'block';   -- partial: tiny + hot
CREATE INDEX IF NOT EXISTS idx_request_logs_ip ON request_logs (client_ip, ts DESC);
