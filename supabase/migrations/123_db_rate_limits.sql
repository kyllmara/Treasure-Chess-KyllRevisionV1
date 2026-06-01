BEGIN;

CREATE TABLE IF NOT EXISTS relay_rate_limits (
  address TEXT NOT NULL,
  window_minute TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (address, window_minute)
);

-- Auto-cleanup: delete entries older than 1 hour
CREATE INDEX IF NOT EXISTS idx_relay_rate_limits_window ON relay_rate_limits (window_minute);

-- Atomic increment and return new count (used by edge function)
CREATE OR REPLACE FUNCTION check_and_increment_relay_rate(
  p_address TEXT,
  p_limit INTEGER DEFAULT 10
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_window TIMESTAMPTZ;
  v_count INTEGER;
BEGIN
  v_window := date_trunc('minute', NOW());

  INSERT INTO relay_rate_limits (address, window_minute, request_count)
  VALUES (lower(p_address), v_window, 1)
  ON CONFLICT (address, window_minute) DO UPDATE
    SET request_count = relay_rate_limits.request_count + 1
  RETURNING request_count INTO v_count;

  -- Clean up entries older than 2 minutes (lightweight housekeeping)
  DELETE FROM relay_rate_limits WHERE window_minute < NOW() - INTERVAL '2 minutes';

  RETURN v_count <= p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION check_and_increment_relay_rate(TEXT, INTEGER) TO service_role;

COMMIT;
