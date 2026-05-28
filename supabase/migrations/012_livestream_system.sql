-- ============================================================================
-- Migration: 012_livestream_system.sql
-- Description: Livestream integration for RTMP streaming to TikTok, Twitch, Kick
-- ============================================================================

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

-- Stream platforms
CREATE TYPE stream_platform AS ENUM ('twitch', 'tiktok', 'kick', 'custom');

-- Stream connection states
CREATE TYPE stream_connection_state AS ENUM (
  'idle',
  'initializing',
  'connecting',
  'connected',
  'streaming',
  'reconnecting',
  'paused',
  'stopping',
  'stopped',
  'error'
);

-- Stream quality levels
CREATE TYPE stream_resolution AS ENUM ('480p', '720p', '1080p');

-- Camera positions for PiP overlay
CREATE TYPE camera_position AS ENUM ('top-left', 'top-right', 'bottom-left', 'bottom-right');

-- Camera size options
CREATE TYPE camera_size AS ENUM ('small', 'medium', 'large');

-- Stream health quality
CREATE TYPE stream_quality AS ENUM ('excellent', 'good', 'fair', 'poor');

-- ============================================================================
-- PLATFORM CONNECTIONS TABLE
-- ============================================================================
-- Stores OAuth connections to streaming platforms (Twitch, TikTok)

CREATE TABLE platform_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  platform stream_platform NOT NULL,
  platform_user_id varchar(255) NOT NULL,
  username varchar(255) NOT NULL,
  display_name varchar(255),
  channel_url varchar(500),
  profile_image_url varchar(500),
  -- Encrypted tokens (use pgcrypto or application-level encryption)
  access_token_encrypted text NOT NULL,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  -- Platform-specific metadata
  broadcaster_type varchar(50), -- For Twitch: partner, affiliate, ''
  is_live_enabled boolean DEFAULT true, -- For TikTok: whether user can go live
  -- Status
  is_active boolean DEFAULT true,
  last_refreshed_at timestamptz,
  connected_at timestamptz DEFAULT now(),
  disconnected_at timestamptz,
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- Constraints
  CONSTRAINT unique_user_platform UNIQUE (user_id, platform),
  CONSTRAINT valid_platform_user_id CHECK (length(platform_user_id) > 0)
);

-- ============================================================================
-- STREAM SETTINGS TABLE
-- ============================================================================
-- User's default stream configuration preferences

CREATE TABLE stream_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  -- Default platform
  default_platform stream_platform,
  default_resolution stream_resolution DEFAULT '720p',
  -- Camera settings
  camera_enabled boolean DEFAULT true,
  camera_position camera_position DEFAULT 'bottom-right',
  camera_size camera_size DEFAULT 'medium',
  use_front_camera boolean DEFAULT true,
  -- Audio settings
  audio_enabled boolean DEFAULT true,
  audio_bitrate integer DEFAULT 128 CHECK (audio_bitrate BETWEEN 64 AND 320),
  -- Overlay settings
  show_player_names boolean DEFAULT true,
  show_ratings boolean DEFAULT true,
  show_timer boolean DEFAULT true,
  show_move_history boolean DEFAULT false,
  show_stakes boolean DEFAULT true,
  overlay_position varchar(20) DEFAULT 'top',
  -- Recording
  auto_save_vod boolean DEFAULT false,
  -- Custom RTMP (for manual key input)
  custom_rtmp_url varchar(500),
  custom_stream_key_encrypted text,
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================================
-- STREAM SESSIONS TABLE
-- ============================================================================
-- Records of actual streaming sessions

CREATE TABLE stream_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  game_id uuid REFERENCES games(id) ON DELETE SET NULL,
  -- Platform info
  platform stream_platform NOT NULL,
  platform_connection_id uuid REFERENCES platform_connections(id) ON DELETE SET NULL,
  rtmp_url varchar(500) NOT NULL,
  stream_key_encrypted text NOT NULL,
  -- Stream configuration (snapshot at start)
  resolution stream_resolution NOT NULL,
  video_bitrate integer NOT NULL,
  audio_bitrate integer DEFAULT 128,
  frame_rate integer DEFAULT 30,
  -- Stream info
  title varchar(255) NOT NULL,
  description text,
  tags text[], -- Array of tags
  -- State
  connection_state stream_connection_state DEFAULT 'idle',
  -- Metrics
  viewer_count integer DEFAULT 0,
  peak_viewer_count integer DEFAULT 0,
  total_unique_viewers integer DEFAULT 0,
  average_viewer_count numeric(10, 2) DEFAULT 0,
  -- Health metrics (last known)
  last_bitrate integer,
  last_fps numeric(5, 2),
  dropped_frames integer DEFAULT 0,
  total_frames bigint DEFAULT 0,
  last_latency_ms integer,
  health_quality stream_quality,
  -- Timing
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer DEFAULT 0,
  -- Error handling
  error_code varchar(100),
  error_message text,
  reconnect_attempts integer DEFAULT 0,
  -- VOD
  vod_url varchar(500),
  vod_thumbnail_url varchar(500),
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================================
-- STREAM EVENTS TABLE
-- ============================================================================
-- Logs important stream events for analytics and debugging

CREATE TABLE stream_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES stream_sessions(id) ON DELETE CASCADE,
  event_type varchar(50) NOT NULL,
  -- Event data
  previous_state stream_connection_state,
  current_state stream_connection_state,
  viewer_count integer,
  bitrate integer,
  fps numeric(5, 2),
  error_code varchar(100),
  error_message text,
  metadata jsonb,
  -- Timestamp
  created_at timestamptz DEFAULT now()
);

-- ============================================================================
-- STREAM CHAT MESSAGES TABLE (Optional - for chat overlay)
-- ============================================================================
-- Caches recent chat messages from the platform for overlay display

CREATE TABLE stream_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES stream_sessions(id) ON DELETE CASCADE,
  platform_message_id varchar(255),
  -- Sender info
  platform_user_id varchar(255) NOT NULL,
  username varchar(255) NOT NULL,
  display_name varchar(255),
  -- Message content
  message text NOT NULL,
  -- Platform-specific
  badges text[], -- User badges
  emotes jsonb, -- Emote data
  color varchar(7), -- Username color
  -- Metadata
  is_highlighted boolean DEFAULT false,
  is_subscriber boolean DEFAULT false,
  is_moderator boolean DEFAULT false,
  donation_amount numeric(10, 2),
  donation_currency varchar(10),
  -- Timestamp
  created_at timestamptz DEFAULT now()
);

-- ============================================================================
-- STREAM STATISTICS TABLE
-- ============================================================================
-- Aggregated statistics per user for dashboard display

CREATE TABLE stream_statistics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  -- Totals
  total_streams integer DEFAULT 0,
  total_duration_seconds bigint DEFAULT 0,
  total_viewers bigint DEFAULT 0,
  total_unique_viewers bigint DEFAULT 0,
  -- Averages
  average_duration_seconds integer DEFAULT 0,
  average_viewers numeric(10, 2) DEFAULT 0,
  -- Peaks
  peak_viewers integer DEFAULT 0,
  peak_concurrent_viewers integer DEFAULT 0,
  longest_stream_seconds integer DEFAULT 0,
  -- Platform breakdown
  twitch_streams integer DEFAULT 0,
  tiktok_streams integer DEFAULT 0,
  kick_streams integer DEFAULT 0,
  custom_streams integer DEFAULT 0,
  -- Last activity
  last_stream_at timestamptz,
  last_stream_platform stream_platform,
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Platform connections
CREATE INDEX idx_platform_connections_user ON platform_connections(user_id);
CREATE INDEX idx_platform_connections_platform ON platform_connections(platform);
CREATE INDEX idx_platform_connections_active ON platform_connections(user_id, platform) WHERE is_active = true;

-- Stream settings
CREATE INDEX idx_stream_settings_user ON stream_settings(user_id);

-- Stream sessions
CREATE INDEX idx_stream_sessions_user ON stream_sessions(user_id);
CREATE INDEX idx_stream_sessions_game ON stream_sessions(game_id) WHERE game_id IS NOT NULL;
CREATE INDEX idx_stream_sessions_platform ON stream_sessions(platform);
CREATE INDEX idx_stream_sessions_state ON stream_sessions(connection_state);
CREATE INDEX idx_stream_sessions_active ON stream_sessions(user_id)
  WHERE connection_state IN ('initializing', 'connecting', 'connected', 'streaming', 'reconnecting');
CREATE INDEX idx_stream_sessions_started ON stream_sessions(started_at DESC);

-- Stream events
CREATE INDEX idx_stream_events_session ON stream_events(session_id);
CREATE INDEX idx_stream_events_type ON stream_events(event_type);
CREATE INDEX idx_stream_events_created ON stream_events(created_at DESC);

-- Chat messages (TTL cleanup)
CREATE INDEX idx_stream_chat_session ON stream_chat_messages(session_id);
CREATE INDEX idx_stream_chat_created ON stream_chat_messages(created_at DESC);

-- Statistics
CREATE INDEX idx_stream_statistics_user ON stream_statistics(user_id);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE platform_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE stream_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE stream_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stream_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE stream_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE stream_statistics ENABLE ROW LEVEL SECURITY;

-- Platform connections: Users can manage their own
CREATE POLICY "Users can view own platform connections"
  ON platform_connections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own platform connections"
  ON platform_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own platform connections"
  ON platform_connections FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own platform connections"
  ON platform_connections FOR DELETE
  USING (auth.uid() = user_id);

-- Stream settings: Users manage their own
CREATE POLICY "Users can view own stream settings"
  ON stream_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own stream settings"
  ON stream_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own stream settings"
  ON stream_settings FOR UPDATE
  USING (auth.uid() = user_id);

-- Stream sessions: Public viewing (streams are public), user manages own
CREATE POLICY "Anyone can view stream sessions"
  ON stream_sessions FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own stream sessions"
  ON stream_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own stream sessions"
  ON stream_sessions FOR UPDATE
  USING (auth.uid() = user_id);

-- Stream events: User can view own session events
CREATE POLICY "Users can view own stream events"
  ON stream_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM stream_sessions s
      WHERE s.id = stream_events.session_id
      AND s.user_id = auth.uid()
    )
  );

-- Chat messages: Anyone can view (they're from public streams)
CREATE POLICY "Anyone can view chat messages"
  ON stream_chat_messages FOR SELECT
  USING (true);

-- Statistics: Public viewing
CREATE POLICY "Anyone can view stream statistics"
  ON stream_statistics FOR SELECT
  USING (true);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to create or get stream settings for a user
CREATE OR REPLACE FUNCTION get_or_create_stream_settings(p_user_id uuid)
RETURNS stream_settings
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_settings stream_settings;
BEGIN
  -- Try to get existing settings
  SELECT * INTO v_settings
  FROM stream_settings
  WHERE user_id = p_user_id;

  -- Create if not exists
  IF v_settings IS NULL THEN
    INSERT INTO stream_settings (user_id)
    VALUES (p_user_id)
    RETURNING * INTO v_settings;
  END IF;

  RETURN v_settings;
END;
$$;

-- Function to start a stream session
CREATE OR REPLACE FUNCTION start_stream_session(
  p_user_id uuid,
  p_platform stream_platform,
  p_rtmp_url varchar,
  p_stream_key_encrypted text,
  p_resolution stream_resolution,
  p_video_bitrate integer,
  p_title varchar,
  p_description text DEFAULT NULL,
  p_tags text[] DEFAULT NULL,
  p_game_id uuid DEFAULT NULL
)
RETURNS stream_sessions
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session stream_sessions;
  v_existing_active integer;
  v_connection_id uuid;
BEGIN
  -- Check for existing active stream
  SELECT COUNT(*) INTO v_existing_active
  FROM stream_sessions
  WHERE user_id = p_user_id
  AND connection_state IN ('initializing', 'connecting', 'connected', 'streaming', 'reconnecting');

  IF v_existing_active > 0 THEN
    RAISE EXCEPTION 'User already has an active stream session';
  END IF;

  -- Get platform connection if exists
  SELECT id INTO v_connection_id
  FROM platform_connections
  WHERE user_id = p_user_id
  AND platform = p_platform
  AND is_active = true
  LIMIT 1;

  -- Create session
  INSERT INTO stream_sessions (
    user_id,
    game_id,
    platform,
    platform_connection_id,
    rtmp_url,
    stream_key_encrypted,
    resolution,
    video_bitrate,
    title,
    description,
    tags,
    connection_state,
    started_at
  )
  VALUES (
    p_user_id,
    p_game_id,
    p_platform,
    v_connection_id,
    p_rtmp_url,
    p_stream_key_encrypted,
    p_resolution,
    p_video_bitrate,
    p_title,
    p_description,
    p_tags,
    'initializing',
    now()
  )
  RETURNING * INTO v_session;

  -- Log event
  INSERT INTO stream_events (session_id, event_type, current_state)
  VALUES (v_session.id, 'stream_started', 'initializing');

  -- Ensure statistics record exists
  INSERT INTO stream_statistics (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN v_session;
END;
$$;

-- Function to update stream connection state
CREATE OR REPLACE FUNCTION update_stream_state(
  p_session_id uuid,
  p_new_state stream_connection_state,
  p_error_code varchar DEFAULT NULL,
  p_error_message text DEFAULT NULL
)
RETURNS stream_sessions
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session stream_sessions;
  v_old_state stream_connection_state;
BEGIN
  -- Get current session
  SELECT * INTO v_session
  FROM stream_sessions
  WHERE id = p_session_id;

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Stream session not found';
  END IF;

  v_old_state := v_session.connection_state;

  -- Update session
  UPDATE stream_sessions
  SET
    connection_state = p_new_state,
    error_code = COALESCE(p_error_code, error_code),
    error_message = COALESCE(p_error_message, error_message),
    reconnect_attempts = CASE
      WHEN p_new_state = 'reconnecting' THEN reconnect_attempts + 1
      WHEN p_new_state = 'streaming' THEN 0
      ELSE reconnect_attempts
    END,
    updated_at = now()
  WHERE id = p_session_id
  RETURNING * INTO v_session;

  -- Log state change
  INSERT INTO stream_events (
    session_id,
    event_type,
    previous_state,
    current_state,
    error_code,
    error_message
  )
  VALUES (
    p_session_id,
    'connection_state_changed',
    v_old_state,
    p_new_state,
    p_error_code,
    p_error_message
  );

  RETURN v_session;
END;
$$;

-- Function to update viewer count
CREATE OR REPLACE FUNCTION update_viewer_count(
  p_session_id uuid,
  p_viewer_count integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE stream_sessions
  SET
    viewer_count = p_viewer_count,
    peak_viewer_count = GREATEST(peak_viewer_count, p_viewer_count),
    updated_at = now()
  WHERE id = p_session_id;

  -- Log if significant change (every 10 viewers or peak)
  IF p_viewer_count % 10 = 0 OR p_viewer_count > (
    SELECT peak_viewer_count FROM stream_sessions WHERE id = p_session_id
  ) THEN
    INSERT INTO stream_events (session_id, event_type, viewer_count)
    VALUES (p_session_id, 'viewer_count_updated', p_viewer_count);
  END IF;
END;
$$;

-- Function to update stream health metrics
CREATE OR REPLACE FUNCTION update_stream_health(
  p_session_id uuid,
  p_bitrate integer,
  p_fps numeric,
  p_dropped_frames integer,
  p_total_frames bigint,
  p_latency_ms integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_quality stream_quality;
  v_drop_rate numeric;
BEGIN
  -- Calculate quality based on metrics
  v_drop_rate := CASE
    WHEN p_total_frames > 0 THEN (p_dropped_frames::numeric / p_total_frames) * 100
    ELSE 0
  END;

  v_quality := CASE
    WHEN v_drop_rate < 0.1 AND p_latency_ms < 1000 AND p_fps >= 29 THEN 'excellent'
    WHEN v_drop_rate < 0.5 AND p_latency_ms < 2000 AND p_fps >= 25 THEN 'good'
    WHEN v_drop_rate < 2.0 AND p_latency_ms < 5000 AND p_fps >= 20 THEN 'fair'
    ELSE 'poor'
  END;

  UPDATE stream_sessions
  SET
    last_bitrate = p_bitrate,
    last_fps = p_fps,
    dropped_frames = p_dropped_frames,
    total_frames = p_total_frames,
    last_latency_ms = p_latency_ms,
    health_quality = v_quality,
    updated_at = now()
  WHERE id = p_session_id;
END;
$$;

-- Function to end a stream session
CREATE OR REPLACE FUNCTION end_stream_session(p_session_id uuid)
RETURNS stream_sessions
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session stream_sessions;
  v_duration integer;
BEGIN
  -- Get session
  SELECT * INTO v_session
  FROM stream_sessions
  WHERE id = p_session_id;

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Stream session not found';
  END IF;

  -- Calculate duration
  v_duration := EXTRACT(EPOCH FROM (now() - v_session.started_at))::integer;

  -- Update session
  UPDATE stream_sessions
  SET
    connection_state = 'stopped',
    ended_at = now(),
    duration_seconds = v_duration,
    updated_at = now()
  WHERE id = p_session_id
  RETURNING * INTO v_session;

  -- Log event
  INSERT INTO stream_events (session_id, event_type, current_state)
  VALUES (p_session_id, 'stream_stopped', 'stopped');

  -- Update user statistics
  UPDATE stream_statistics
  SET
    total_streams = total_streams + 1,
    total_duration_seconds = total_duration_seconds + v_duration,
    total_viewers = total_viewers + v_session.peak_viewer_count,
    average_duration_seconds = (total_duration_seconds + v_duration) / (total_streams + 1),
    peak_viewers = GREATEST(peak_viewers, v_session.peak_viewer_count),
    longest_stream_seconds = GREATEST(longest_stream_seconds, v_duration),
    last_stream_at = now(),
    last_stream_platform = v_session.platform,
    -- Update platform-specific counts
    twitch_streams = CASE WHEN v_session.platform = 'twitch' THEN twitch_streams + 1 ELSE twitch_streams END,
    tiktok_streams = CASE WHEN v_session.platform = 'tiktok' THEN tiktok_streams + 1 ELSE tiktok_streams END,
    kick_streams = CASE WHEN v_session.platform = 'kick' THEN kick_streams + 1 ELSE kick_streams END,
    custom_streams = CASE WHEN v_session.platform = 'custom' THEN custom_streams + 1 ELSE custom_streams END,
    updated_at = now()
  WHERE user_id = v_session.user_id;

  RETURN v_session;
END;
$$;

-- Function to connect a platform
CREATE OR REPLACE FUNCTION connect_streaming_platform(
  p_user_id uuid,
  p_platform stream_platform,
  p_platform_user_id varchar,
  p_username varchar,
  p_display_name varchar,
  p_access_token_encrypted text,
  p_refresh_token_encrypted text DEFAULT NULL,
  p_token_expires_at timestamptz DEFAULT NULL,
  p_channel_url varchar DEFAULT NULL,
  p_profile_image_url varchar DEFAULT NULL,
  p_broadcaster_type varchar DEFAULT NULL,
  p_is_live_enabled boolean DEFAULT true
)
RETURNS platform_connections
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_connection platform_connections;
BEGIN
  -- Upsert connection
  INSERT INTO platform_connections (
    user_id,
    platform,
    platform_user_id,
    username,
    display_name,
    access_token_encrypted,
    refresh_token_encrypted,
    token_expires_at,
    channel_url,
    profile_image_url,
    broadcaster_type,
    is_live_enabled,
    is_active,
    connected_at,
    last_refreshed_at
  )
  VALUES (
    p_user_id,
    p_platform,
    p_platform_user_id,
    p_username,
    p_display_name,
    p_access_token_encrypted,
    p_refresh_token_encrypted,
    p_token_expires_at,
    p_channel_url,
    p_profile_image_url,
    p_broadcaster_type,
    p_is_live_enabled,
    true,
    now(),
    now()
  )
  ON CONFLICT (user_id, platform) DO UPDATE SET
    platform_user_id = EXCLUDED.platform_user_id,
    username = EXCLUDED.username,
    display_name = EXCLUDED.display_name,
    access_token_encrypted = EXCLUDED.access_token_encrypted,
    refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
    token_expires_at = EXCLUDED.token_expires_at,
    channel_url = EXCLUDED.channel_url,
    profile_image_url = EXCLUDED.profile_image_url,
    broadcaster_type = EXCLUDED.broadcaster_type,
    is_live_enabled = EXCLUDED.is_live_enabled,
    is_active = true,
    disconnected_at = NULL,
    last_refreshed_at = now(),
    updated_at = now()
  RETURNING * INTO v_connection;

  RETURN v_connection;
END;
$$;

-- Function to disconnect a platform
CREATE OR REPLACE FUNCTION disconnect_streaming_platform(
  p_user_id uuid,
  p_platform stream_platform
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE platform_connections
  SET
    is_active = false,
    disconnected_at = now(),
    -- Clear sensitive tokens
    access_token_encrypted = 'REVOKED',
    refresh_token_encrypted = NULL,
    updated_at = now()
  WHERE user_id = p_user_id
  AND platform = p_platform;
END;
$$;

-- Function to refresh platform token
CREATE OR REPLACE FUNCTION refresh_platform_token(
  p_user_id uuid,
  p_platform stream_platform,
  p_access_token_encrypted text,
  p_refresh_token_encrypted text DEFAULT NULL,
  p_token_expires_at timestamptz DEFAULT NULL
)
RETURNS platform_connections
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_connection platform_connections;
BEGIN
  UPDATE platform_connections
  SET
    access_token_encrypted = p_access_token_encrypted,
    refresh_token_encrypted = COALESCE(p_refresh_token_encrypted, refresh_token_encrypted),
    token_expires_at = p_token_expires_at,
    last_refreshed_at = now(),
    updated_at = now()
  WHERE user_id = p_user_id
  AND platform = p_platform
  AND is_active = true
  RETURNING * INTO v_connection;

  IF v_connection IS NULL THEN
    RAISE EXCEPTION 'Platform connection not found or inactive';
  END IF;

  RETURN v_connection;
END;
$$;

-- Function to get user's active platform connections
CREATE OR REPLACE FUNCTION get_user_platform_connections(p_user_id uuid)
RETURNS SETOF platform_connections
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM platform_connections
  WHERE user_id = p_user_id
  AND is_active = true
  ORDER BY connected_at DESC;
END;
$$;

-- Function to get user's stream statistics
CREATE OR REPLACE FUNCTION get_stream_statistics(p_user_id uuid)
RETURNS stream_statistics
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_stats stream_statistics;
BEGIN
  SELECT * INTO v_stats
  FROM stream_statistics
  WHERE user_id = p_user_id;

  -- Create if not exists
  IF v_stats IS NULL THEN
    INSERT INTO stream_statistics (user_id)
    VALUES (p_user_id)
    RETURNING * INTO v_stats;
  END IF;

  RETURN v_stats;
END;
$$;

-- Function to get recent streams
CREATE OR REPLACE FUNCTION get_recent_streams(
  p_user_id uuid DEFAULT NULL,
  p_platform stream_platform DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_include_live boolean DEFAULT true
)
RETURNS SETOF stream_sessions
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM stream_sessions
  WHERE (p_user_id IS NULL OR user_id = p_user_id)
  AND (p_platform IS NULL OR platform = p_platform)
  AND (p_include_live OR connection_state = 'stopped')
  ORDER BY
    CASE WHEN connection_state IN ('streaming', 'connected') THEN 0 ELSE 1 END,
    started_at DESC
  LIMIT p_limit;
END;
$$;

-- Function to get currently live streams
CREATE OR REPLACE FUNCTION get_live_streams(
  p_platform stream_platform DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  session_id uuid,
  user_id uuid,
  username varchar,
  profile_image_url varchar,
  platform stream_platform,
  title varchar,
  viewer_count integer,
  game_id uuid,
  started_at timestamptz,
  duration_seconds integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id as session_id,
    s.user_id,
    p.username,
    p.avatar_url as profile_image_url,
    s.platform,
    s.title,
    s.viewer_count,
    s.game_id,
    s.started_at,
    EXTRACT(EPOCH FROM (now() - s.started_at))::integer as duration_seconds
  FROM stream_sessions s
  JOIN profiles p ON s.user_id = p.id
  WHERE s.connection_state IN ('streaming', 'connected')
  AND (p_platform IS NULL OR s.platform = p_platform)
  ORDER BY s.viewer_count DESC, s.started_at DESC
  LIMIT p_limit;
END;
$$;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_platform_connections_updated_at
  BEFORE UPDATE ON platform_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_stream_settings_updated_at
  BEFORE UPDATE ON stream_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_stream_sessions_updated_at
  BEFORE UPDATE ON stream_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_stream_statistics_updated_at
  BEFORE UPDATE ON stream_statistics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- CLEANUP FUNCTION (for old chat messages)
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_old_chat_messages()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Delete chat messages older than 24 hours from ended streams
  DELETE FROM stream_chat_messages
  WHERE created_at < now() - interval '24 hours'
  AND session_id IN (
    SELECT id FROM stream_sessions WHERE connection_state = 'stopped'
  );
END;
$$;

-- ============================================================================
-- GRANTS
-- ============================================================================

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION get_or_create_stream_settings(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION start_stream_session(uuid, stream_platform, varchar, text, stream_resolution, integer, varchar, text, text[], uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION update_stream_state(uuid, stream_connection_state, varchar, text) TO authenticated;
GRANT EXECUTE ON FUNCTION update_viewer_count(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION update_stream_health(uuid, integer, numeric, integer, bigint, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION end_stream_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION connect_streaming_platform(uuid, stream_platform, varchar, varchar, varchar, text, text, timestamptz, varchar, varchar, varchar, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION disconnect_streaming_platform(uuid, stream_platform) TO authenticated;
GRANT EXECUTE ON FUNCTION refresh_platform_token(uuid, stream_platform, text, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_platform_connections(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_stream_statistics(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_recent_streams(uuid, stream_platform, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION get_live_streams(stream_platform, integer) TO authenticated, anon;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE platform_connections IS 'OAuth connections to streaming platforms (Twitch, TikTok)';
COMMENT ON TABLE stream_settings IS 'User default stream configuration preferences';
COMMENT ON TABLE stream_sessions IS 'Individual streaming sessions with metrics';
COMMENT ON TABLE stream_events IS 'Log of stream events for analytics';
COMMENT ON TABLE stream_chat_messages IS 'Cached chat messages for overlay display';
COMMENT ON TABLE stream_statistics IS 'Aggregated streaming statistics per user';
