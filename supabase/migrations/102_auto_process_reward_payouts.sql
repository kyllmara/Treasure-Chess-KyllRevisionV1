-- ============================================================================
-- Migration 102: Auto-process reward payouts via pg_net
--
-- Uses pg_net to automatically call the process-reward-payout edge function
-- when a new payout record is inserted. This ensures payouts are processed
-- immediately without relying on the client.
-- ============================================================================

-- Enable pg_net extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Function to trigger payout processing via HTTP
CREATE OR REPLACE FUNCTION trigger_reward_payout_processing()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_supabase_url TEXT;
  v_service_key TEXT;
BEGIN
  -- Get Supabase URL from environment or use default
  v_supabase_url := current_setting('app.settings.supabase_url', true);
  IF v_supabase_url IS NULL THEN
    v_supabase_url := 'https://jgjhmivnlvruzvztepqa.supabase.co';
  END IF;

  -- Queue HTTP request to process-reward-payout edge function
  -- Using pg_net for async HTTP calls
  PERFORM net.http_post(
    url := v_supabase_url || '/functions/v1/process-reward-payout',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('supabase.anon_key', true)
    ),
    body := jsonb_build_object('payout_id', NEW.id)
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the transaction
    RAISE WARNING 'Failed to trigger payout processing: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Create trigger on reward_payouts insert
DROP TRIGGER IF EXISTS trigger_process_reward_payout ON reward_payouts;
CREATE TRIGGER trigger_process_reward_payout
  AFTER INSERT ON reward_payouts
  FOR EACH ROW
  EXECUTE FUNCTION trigger_reward_payout_processing();

-- Grant execute permission
GRANT EXECUTE ON FUNCTION trigger_reward_payout_processing() TO authenticated;
GRANT EXECUTE ON FUNCTION trigger_reward_payout_processing() TO service_role;
