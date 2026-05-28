-- =====================================================
-- NOTIFICATION TRIGGERS
-- =====================================================
-- Database triggers to send push notifications on events
-- Uses pg_net extension to call Edge Functions

-- Enable pg_net extension for HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- =====================================================
-- HELPER FUNCTION: Call send-notification Edge Function
-- =====================================================
CREATE OR REPLACE FUNCTION call_notification_function(payload JSONB)
RETURNS void AS $$
DECLARE
  supabase_url TEXT := current_setting('app.settings.supabase_url', true);
  service_key TEXT := current_setting('app.settings.service_role_key', true);
BEGIN
  -- Only proceed if settings are configured
  IF supabase_url IS NOT NULL AND service_key IS NOT NULL THEN
    PERFORM extensions.http_post(
      url := supabase_url || '/functions/v1/send-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key
      ),
      body := payload
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Log error but don't fail the transaction
  RAISE WARNING 'Failed to send notification: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- TRIGGER: Notify on game move (Your Turn)
-- =====================================================
CREATE OR REPLACE FUNCTION notify_your_turn()
RETURNS TRIGGER AS $$
DECLARE
  game_record RECORD;
  opponent_id UUID;
  opponent_name TEXT;
BEGIN
  -- Get game details
  SELECT g.*,
         pw.username as white_username,
         pb.username as black_username
  INTO game_record
  FROM games g
  JOIN profiles pw ON g.white_player_id = pw.id
  JOIN profiles pb ON g.black_player_id = pb.id
  WHERE g.id = NEW.game_id;

  -- Determine opponent
  IF NEW.player_id = game_record.white_player_id THEN
    opponent_id := game_record.black_player_id;
    opponent_name := game_record.white_username;
  ELSE
    opponent_id := game_record.white_player_id;
    opponent_name := game_record.black_username;
  END IF;

  -- Send notification to opponent
  PERFORM call_notification_function(jsonb_build_object(
    'userId', opponent_id,
    'type', 'your_turn',
    'title', 'Your Turn!',
    'body', opponent_name || ' made a move. It''s your turn to play.',
    'data', jsonb_build_object(
      'gameId', NEW.game_id,
      'opponentName', opponent_name
    )
  ));

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_notify_your_turn
  AFTER INSERT ON game_moves
  FOR EACH ROW
  EXECUTE FUNCTION notify_your_turn();

-- =====================================================
-- TRIGGER: Notify on match found
-- =====================================================
CREATE OR REPLACE FUNCTION notify_match_found()
RETURNS TRIGGER AS $$
DECLARE
  white_name TEXT;
  black_name TEXT;
BEGIN
  -- Only trigger when game becomes active
  IF NEW.status = 'active' AND (OLD IS NULL OR OLD.status != 'active') THEN
    -- Get player names
    SELECT username INTO white_name FROM profiles WHERE id = NEW.white_player_id;
    SELECT username INTO black_name FROM profiles WHERE id = NEW.black_player_id;

    -- Notify white player
    PERFORM call_notification_function(jsonb_build_object(
      'userId', NEW.white_player_id,
      'type', 'match_found',
      'title', 'Match Found!',
      'body', CASE
        WHEN NEW.wager_tct > 0 THEN 'Matched with ' || black_name || ' for $' || ROUND(NEW.wager_tct::numeric, 2)
        ELSE 'Matched with ' || black_name
      END,
      'data', jsonb_build_object(
        'gameId', NEW.id,
        'opponentName', black_name,
        'amount', NEW.wager_tct
      )
    ));

    -- Notify black player
    PERFORM call_notification_function(jsonb_build_object(
      'userId', NEW.black_player_id,
      'type', 'match_found',
      'title', 'Match Found!',
      'body', CASE
        WHEN NEW.wager_tct > 0 THEN 'Matched with ' || white_name || ' for $' || ROUND(NEW.wager_tct::numeric, 2)
        ELSE 'Matched with ' || white_name
      END,
      'data', jsonb_build_object(
        'gameId', NEW.id,
        'opponentName', white_name,
        'amount', NEW.wager_tct
      )
    ));
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_notify_match_found
  AFTER INSERT OR UPDATE ON games
  FOR EACH ROW
  EXECUTE FUNCTION notify_match_found();

-- =====================================================
-- TRIGGER: Notify on challenge received
-- =====================================================
CREATE OR REPLACE FUNCTION notify_challenge_received()
RETURNS TRIGGER AS $$
DECLARE
  creator_name TEXT;
BEGIN
  -- Only notify if there's a specific opponent
  IF NEW.opponent_id IS NOT NULL THEN
    SELECT username INTO creator_name FROM profiles WHERE id = NEW.creator_id;

    PERFORM call_notification_function(jsonb_build_object(
      'userId', NEW.opponent_id,
      'type', 'challenge_received',
      'title', 'New Challenge!',
      'body', creator_name || ' challenged you for $' || ROUND(NEW.wager_tct::numeric, 2),
      'data', jsonb_build_object(
        'challengeId', NEW.id,
        'opponentName', creator_name,
        'amount', NEW.wager_tct
      )
    ));
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_notify_challenge_received
  AFTER INSERT ON challenges
  FOR EACH ROW
  EXECUTE FUNCTION notify_challenge_received();

-- =====================================================
-- TRIGGER: Notify on challenge accepted
-- =====================================================
CREATE OR REPLACE FUNCTION notify_challenge_accepted()
RETURNS TRIGGER AS $$
DECLARE
  opponent_name TEXT;
BEGIN
  -- Trigger when status changes to 'accepted'
  IF NEW.status = 'accepted' AND OLD.status = 'pending' THEN
    SELECT username INTO opponent_name FROM profiles WHERE id = NEW.opponent_id;

    PERFORM call_notification_function(jsonb_build_object(
      'userId', NEW.creator_id,
      'type', 'challenge_accepted',
      'title', 'Challenge Accepted!',
      'body', opponent_name || ' accepted your challenge. Game is starting!',
      'data', jsonb_build_object(
        'challengeId', NEW.id,
        'gameId', NEW.game_id,
        'opponentName', opponent_name
      )
    ));
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_notify_challenge_accepted
  AFTER UPDATE ON challenges
  FOR EACH ROW
  EXECUTE FUNCTION notify_challenge_accepted();

-- =====================================================
-- TRIGGER: Notify on game ended
-- =====================================================
CREATE OR REPLACE FUNCTION notify_game_ended()
RETURNS TRIGGER AS $$
DECLARE
  white_name TEXT;
  black_name TEXT;
  winner_payout NUMERIC;
BEGIN
  -- Only trigger when game becomes completed
  IF NEW.status = 'completed' AND OLD.status = 'active' THEN
    SELECT username INTO white_name FROM profiles WHERE id = NEW.white_player_id;
    SELECT username INTO black_name FROM profiles WHERE id = NEW.black_player_id;

    -- Get payout amount from escrow if exists
    SELECT winner_payout_tct INTO winner_payout
    FROM game_escrows
    WHERE game_id = NEW.id;

    -- Handle different results
    CASE NEW.result
      WHEN 'white_wins' THEN
        -- Notify winner
        PERFORM call_notification_function(jsonb_build_object(
          'userId', NEW.white_player_id,
          'type', 'game_ended',
          'title', 'Victory!',
          'body', CASE
            WHEN winner_payout > 0 THEN 'You beat ' || black_name || ' and won $' || ROUND(winner_payout::numeric, 2) || '!'
            ELSE 'You beat ' || black_name || '!'
          END,
          'data', jsonb_build_object(
            'gameId', NEW.id,
            'opponentName', black_name,
            'result', 'win',
            'amount', winner_payout
          )
        ));
        -- Notify loser
        PERFORM call_notification_function(jsonb_build_object(
          'userId', NEW.black_player_id,
          'type', 'game_ended',
          'title', 'Game Over',
          'body', white_name || ' won the game.',
          'data', jsonb_build_object(
            'gameId', NEW.id,
            'opponentName', white_name,
            'result', 'lose'
          )
        ));

      WHEN 'black_wins' THEN
        -- Notify winner
        PERFORM call_notification_function(jsonb_build_object(
          'userId', NEW.black_player_id,
          'type', 'game_ended',
          'title', 'Victory!',
          'body', CASE
            WHEN winner_payout > 0 THEN 'You beat ' || white_name || ' and won $' || ROUND(winner_payout::numeric, 2) || '!'
            ELSE 'You beat ' || white_name || '!'
          END,
          'data', jsonb_build_object(
            'gameId', NEW.id,
            'opponentName', white_name,
            'result', 'win',
            'amount', winner_payout
          )
        ));
        -- Notify loser
        PERFORM call_notification_function(jsonb_build_object(
          'userId', NEW.white_player_id,
          'type', 'game_ended',
          'title', 'Game Over',
          'body', black_name || ' won the game.',
          'data', jsonb_build_object(
            'gameId', NEW.id,
            'opponentName', black_name,
            'result', 'lose'
          )
        ));

      WHEN 'draw' THEN
        -- Notify both players
        PERFORM call_notification_function(jsonb_build_object(
          'userId', NEW.white_player_id,
          'type', 'game_ended',
          'title', 'Draw',
          'body', 'Your game with ' || black_name || ' ended in a draw.',
          'data', jsonb_build_object(
            'gameId', NEW.id,
            'opponentName', black_name,
            'result', 'draw'
          )
        ));
        PERFORM call_notification_function(jsonb_build_object(
          'userId', NEW.black_player_id,
          'type', 'game_ended',
          'title', 'Draw',
          'body', 'Your game with ' || white_name || ' ended in a draw.',
          'data', jsonb_build_object(
            'gameId', NEW.id,
            'opponentName', white_name,
            'result', 'draw'
          )
        ));
      ELSE
        -- Do nothing for other results
    END CASE;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_notify_game_ended
  AFTER UPDATE ON games
  FOR EACH ROW
  EXECUTE FUNCTION notify_game_ended();

-- =====================================================
-- TRIGGER: Notify on deposit confirmed
-- =====================================================
CREATE OR REPLACE FUNCTION notify_deposit_confirmed()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.type = 'deposit' THEN
    PERFORM call_notification_function(jsonb_build_object(
      'userId', NEW.user_id,
      'type', 'deposit_confirmed',
      'title', 'Deposit Confirmed',
      'body', '$' || ROUND(NEW.amount_tct::numeric, 2) || ' has been added to your wallet.',
      'data', jsonb_build_object(
        'amount', NEW.amount_tct,
        'txHash', NEW.tx_hash
      )
    ));
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_notify_deposit_confirmed
  AFTER INSERT ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION notify_deposit_confirmed();

-- =====================================================
-- TRIGGER: Notify on withdrawal complete
-- =====================================================
CREATE OR REPLACE FUNCTION notify_withdrawal_complete()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.type = 'withdraw' THEN
    PERFORM call_notification_function(jsonb_build_object(
      'userId', NEW.user_id,
      'type', 'withdrawal_complete',
      'title', 'Withdrawal Complete',
      'body', '$' || ROUND(NEW.amount_tct::numeric, 2) || ' has been sent to your wallet.',
      'data', jsonb_build_object(
        'amount', NEW.amount_tct,
        'txHash', NEW.tx_hash
      )
    ));
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_notify_withdrawal_complete
  AFTER INSERT ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION notify_withdrawal_complete();

-- =====================================================
-- INDEX: Improve push token lookups
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_profiles_push_token ON profiles(push_token) WHERE push_token IS NOT NULL;
