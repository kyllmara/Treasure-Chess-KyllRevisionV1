-- ============================================================================
-- Fix tournament notification triggers to use call_notification_function()
-- instead of inserting into non-existent 'notifications' table.
-- The existing notification pattern (from 006_notification_triggers.sql) uses
-- call_notification_function() which calls the send-notification Edge Function.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Fix: notify_tournament_registration
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION notify_tournament_registration()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tournament RECORD;
BEGIN
  SELECT * INTO v_tournament FROM tournaments WHERE id = NEW.tournament_id;

  PERFORM call_notification_function(jsonb_build_object(
    'userId', NEW.user_id,
    'type', 'tournament_registration',
    'title', 'Tournament Registration Confirmed',
    'body', 'You are registered for ' || v_tournament.name,
    'data', jsonb_build_object(
      'tournament_id', NEW.tournament_id,
      'tournament_name', v_tournament.name,
      'start_time', v_tournament.start_time
    )
  ));

  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- Fix: notify_tournament_match_ready
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION notify_tournament_match_ready()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tournament RECORD;
BEGIN
  -- Only notify when both players are assigned
  IF NEW.player1_id IS NOT NULL AND NEW.player2_id IS NOT NULL
     AND NEW.status = 'pending'
     AND (OLD.player1_id IS NULL OR OLD.player2_id IS NULL) THEN

    SELECT * INTO v_tournament FROM tournaments WHERE id = NEW.tournament_id;

    -- Notify player 1
    PERFORM call_notification_function(jsonb_build_object(
      'userId', NEW.player1_id,
      'type', 'tournament_match_ready',
      'title', 'Your Tournament Match is Ready!',
      'body', 'Your match in ' || v_tournament.name || ' is ready to play',
      'data', jsonb_build_object(
        'tournament_id', NEW.tournament_id,
        'match_id', NEW.id,
        'opponent_id', NEW.player2_id,
        'round', NEW.round
      )
    ));

    -- Notify player 2
    PERFORM call_notification_function(jsonb_build_object(
      'userId', NEW.player2_id,
      'type', 'tournament_match_ready',
      'title', 'Your Tournament Match is Ready!',
      'body', 'Your match in ' || v_tournament.name || ' is ready to play',
      'data', jsonb_build_object(
        'tournament_id', NEW.tournament_id,
        'match_id', NEW.id,
        'opponent_id', NEW.player1_id,
        'round', NEW.round
      )
    ));
  END IF;

  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- Fix: notify_tournament_prize
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION notify_tournament_prize()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tournament RECORD;
BEGIN
  IF NEW.paid_at IS NOT NULL AND OLD.paid_at IS NULL AND NEW.user_id IS NOT NULL THEN
    SELECT * INTO v_tournament FROM tournaments WHERE id = NEW.tournament_id;

    PERFORM call_notification_function(jsonb_build_object(
      'userId', NEW.user_id,
      'type', 'tournament_prize',
      'title', 'Tournament Prize Won!',
      'body', 'You finished ' ||
        CASE NEW.place
          WHEN 1 THEN '1st'
          WHEN 2 THEN '2nd'
          WHEN 3 THEN '3rd'
          ELSE NEW.place || 'th'
        END ||
        ' place in ' || v_tournament.name || ' and won ' || NEW.amount_tct || ' TCT!',
      'data', jsonb_build_object(
        'tournament_id', NEW.tournament_id,
        'tournament_name', v_tournament.name,
        'place', NEW.place,
        'amount_tct', NEW.amount_tct
      )
    ));
  END IF;

  RETURN NEW;
END;
$$;
