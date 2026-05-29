export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      achievements: {
        Row: {
          badge_color: string
          created_at: string
          criteria_type: Database["public"]["Enums"]["criteria_type"]
          criteria_value: number
          description: string
          icon: string
          id: string
          is_active: boolean
          name: string
          rarity: Database["public"]["Enums"]["achievement_rarity"]
          sort_order: number
          updated_at: string
        }
        Insert: {
          badge_color?: string
          created_at?: string
          criteria_type: Database["public"]["Enums"]["criteria_type"]
          criteria_value: number
          description: string
          icon?: string
          id?: string
          is_active?: boolean
          name: string
          rarity?: Database["public"]["Enums"]["achievement_rarity"]
          sort_order?: number
          updated_at?: string
        }
        Update: {
          badge_color?: string
          created_at?: string
          criteria_type?: Database["public"]["Enums"]["criteria_type"]
          criteria_value?: number
          description?: string
          icon?: string
          id?: string
          is_active?: boolean
          name?: string
          rarity?: Database["public"]["Enums"]["achievement_rarity"]
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      admin_audit_log: {
        Row: {
          action_severity: Database["public"]["Enums"]["admin_action_severity"]
          action_type: Database["public"]["Enums"]["admin_action_type"]
          admin_id: string
          admin_username: string
          created_at: string
          device_info: Json | null
          id: string
          ip_address: unknown
          is_super_admin: boolean
          new_values: Json | null
          notes: string | null
          old_values: Json | null
          reason: string | null
          request_id: string | null
          target_record_id: string | null
          target_table: string | null
          target_user_id: string | null
          target_user_username: string | null
          user_agent: string | null
          was_2fa_verified: boolean
        }
        Insert: {
          action_severity?: Database["public"]["Enums"]["admin_action_severity"]
          action_type: Database["public"]["Enums"]["admin_action_type"]
          admin_id: string
          admin_username: string
          created_at?: string
          device_info?: Json | null
          id?: string
          ip_address?: unknown
          is_super_admin?: boolean
          new_values?: Json | null
          notes?: string | null
          old_values?: Json | null
          reason?: string | null
          request_id?: string | null
          target_record_id?: string | null
          target_table?: string | null
          target_user_id?: string | null
          target_user_username?: string | null
          user_agent?: string | null
          was_2fa_verified?: boolean
        }
        Update: {
          action_severity?: Database["public"]["Enums"]["admin_action_severity"]
          action_type?: Database["public"]["Enums"]["admin_action_type"]
          admin_id?: string
          admin_username?: string
          created_at?: string
          device_info?: Json | null
          id?: string
          ip_address?: unknown
          is_super_admin?: boolean
          new_values?: Json | null
          notes?: string | null
          old_values?: Json | null
          reason?: string | null
          request_id?: string | null
          target_record_id?: string | null
          target_table?: string | null
          target_user_id?: string | null
          target_user_username?: string | null
          user_agent?: string | null
          was_2fa_verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_log_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_audit_log_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_sessions: {
        Row: {
          admin_id: string
          created_at: string
          device_id: string | null
          device_info: Json | null
          expires_at: string
          id: string
          ip_address: unknown
          is_2fa_verified: boolean
          last_activity_at: string
          revoked_at: string | null
          revoked_reason: string | null
          session_token: string
          user_agent: string | null
          verification_method: string | null
          verified_at: string | null
        }
        Insert: {
          admin_id: string
          created_at?: string
          device_id?: string | null
          device_info?: Json | null
          expires_at: string
          id?: string
          ip_address?: unknown
          is_2fa_verified?: boolean
          last_activity_at?: string
          revoked_at?: string | null
          revoked_reason?: string | null
          session_token: string
          user_agent?: string | null
          verification_method?: string | null
          verified_at?: string | null
        }
        Update: {
          admin_id?: string
          created_at?: string
          device_id?: string | null
          device_info?: Json | null
          expires_at?: string
          id?: string
          ip_address?: unknown
          is_2fa_verified?: boolean
          last_activity_at?: string
          revoked_at?: string | null
          revoked_reason?: string | null
          session_token?: string
          user_agent?: string | null
          verification_method?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_sessions_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          failure_reason: string | null
          id: string
          ip_address: unknown
          metadata: Json | null
          resource_id: string | null
          resource_type: string
          result: string
          session_id: string | null
          timestamp: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          failure_reason?: string | null
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          resource_id?: string | null
          resource_type: string
          result: string
          session_id?: string | null
          timestamp?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          failure_reason?: string | null
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          resource_id?: string | null
          resource_type?: string
          result?: string
          session_id?: string | null
          timestamp?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      balances: {
        Row: {
          available_tct: number
          id: string
          locked_tct: number
          total_commission_paid_tct: number
          total_deposited_tct: number
          total_lost_tct: number
          total_withdrawn_tct: number
          total_won_tct: number
          updated_at: string
          user_id: string
        }
        Insert: {
          available_tct?: number
          id?: string
          locked_tct?: number
          total_commission_paid_tct?: number
          total_deposited_tct?: number
          total_lost_tct?: number
          total_withdrawn_tct?: number
          total_won_tct?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          available_tct?: number
          id?: string
          locked_tct?: number
          total_commission_paid_tct?: number
          total_deposited_tct?: number
          total_lost_tct?: number
          total_withdrawn_tct?: number
          total_won_tct?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "balances_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      challenge_notifications: {
        Row: {
          body: string
          challenge_id: string | null
          created_at: string
          data: Json | null
          id: string
          is_push_sent: boolean
          is_read: boolean
          notification_type: string
          push_sent_at: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body: string
          challenge_id?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          is_push_sent?: boolean
          is_read?: boolean
          notification_type: string
          push_sent_at?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string
          challenge_id?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          is_push_sent?: boolean
          is_read?: boolean
          notification_type?: string
          push_sent_at?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "challenge_notifications_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenge_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      challenge_objectives: {
        Row: {
          challenge_id: string
          created_at: string
          description: string | null
          id: string
          is_required: boolean
          objective_type: Database["public"]["Enums"]["challenge_objective_type"]
          reward_multiplier: number
          target_value: string
        }
        Insert: {
          challenge_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_required?: boolean
          objective_type: Database["public"]["Enums"]["challenge_objective_type"]
          reward_multiplier?: number
          target_value: string
        }
        Update: {
          challenge_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_required?: boolean
          objective_type?: Database["public"]["Enums"]["challenge_objective_type"]
          reward_multiplier?: number
          target_value?: string
        }
        Relationships: [
          {
            foreignKeyName: "challenge_objectives_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
        ]
      }
      challenges: {
        Row: {
          accepted_at: string | null
          created_at: string
          creator_color_preference: string
          creator_id: string
          creator_ready: boolean | null
          escrow_status: string | null
          expires_at: string
          game_id: string | null
          id: string
          increment_seconds: number
          is_public: boolean
          is_rated: boolean
          max_elo: number | null
          min_elo: number | null
          on_chain_game_id: string | null
          opponent_id: string | null
          opponent_ready: boolean | null
          room_code: string
          status: Database["public"]["Enums"]["challenge_status"]
          time_control_seconds: number
          wager_tct: number
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          creator_color_preference?: string
          creator_id: string
          creator_ready?: boolean | null
          escrow_status?: string | null
          expires_at: string
          game_id?: string | null
          id?: string
          increment_seconds?: number
          is_public?: boolean
          is_rated?: boolean
          max_elo?: number | null
          min_elo?: number | null
          on_chain_game_id?: string | null
          opponent_id?: string | null
          opponent_ready?: boolean | null
          room_code: string
          status?: Database["public"]["Enums"]["challenge_status"]
          time_control_seconds: number
          wager_tct?: number
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          creator_color_preference?: string
          creator_id?: string
          creator_ready?: boolean | null
          escrow_status?: string | null
          expires_at?: string
          game_id?: string | null
          id?: string
          increment_seconds?: number
          is_public?: boolean
          is_rated?: boolean
          max_elo?: number | null
          min_elo?: number | null
          on_chain_game_id?: string | null
          opponent_id?: string | null
          opponent_ready?: boolean | null
          room_code?: string
          status?: Database["public"]["Enums"]["challenge_status"]
          time_control_seconds?: number
          wager_tct?: number
        }
        Relationships: [
          {
            foreignKeyName: "challenges_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenges_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenges_opponent_id_fkey"
            columns: ["opponent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      game_escrows: {
        Row: {
          cancellation_reason: string | null
          cancelled_at: string | null
          commission_rate: number
          commission_tct: number | null
          created_at: string
          game_id: string
          id: string
          locked_at: string | null
          loser_refund_tct: number
          on_chain_escrow_state: string
          platform_fee_tct: number | null
          player_black_id: string
          player_black_locked_tct: number
          player_white_id: string
          player_white_locked_tct: number
          released_at: string | null
          settled_at: string | null
          settled_reason: string | null
          settlement_tx_id: string | null
          status: Database["public"]["Enums"]["escrow_status"]
          total_pool_tct: number
          winner_id: string | null
          winner_payout_tct: number | null
        }
        Insert: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          commission_rate?: number
          commission_tct?: number | null
          created_at?: string
          game_id: string
          id?: string
          locked_at?: string | null
          loser_refund_tct?: number
          on_chain_escrow_state?: string
          platform_fee_tct?: number | null
          player_black_id: string
          player_black_locked_tct: number
          player_white_id: string
          player_white_locked_tct: number
          released_at?: string | null
          settled_at?: string | null
          settled_reason?: string | null
          settlement_tx_id?: string | null
          status?: Database["public"]["Enums"]["escrow_status"]
          total_pool_tct: number
          winner_id?: string | null
          winner_payout_tct?: number | null
        }
        Update: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          commission_rate?: number
          commission_tct?: number | null
          created_at?: string
          game_id?: string
          id?: string
          locked_at?: string | null
          loser_refund_tct?: number
          on_chain_escrow_state?: string
          platform_fee_tct?: number | null
          player_black_id?: string
          player_black_locked_tct?: number
          player_white_id?: string
          player_white_locked_tct?: number
          released_at?: string | null
          settled_at?: string | null
          settled_reason?: string | null
          settlement_tx_id?: string | null
          status?: Database["public"]["Enums"]["escrow_status"]
          total_pool_tct?: number
          winner_id?: string | null
          winner_payout_tct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "game_escrows_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: true
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_escrows_player_black_id_fkey"
            columns: ["player_black_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_escrows_player_white_id_fkey"
            columns: ["player_white_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_escrows_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      game_history: {
        Row: {
          created_at: string
          elo_after: number
          elo_before: number
          elo_change: number
          game_id: string
          id: string
          increment_seconds: number
          opponent_id: string | null
          opponent_username: string
          played_as: string
          played_at: string
          player_id: string
          result: string
          time_control_seconds: number
          wager_tct: number
        }
        Insert: {
          created_at?: string
          elo_after: number
          elo_before: number
          elo_change: number
          game_id: string
          id?: string
          increment_seconds?: number
          opponent_id?: string | null
          opponent_username: string
          played_as: string
          played_at: string
          player_id: string
          result: string
          time_control_seconds: number
          wager_tct?: number
        }
        Update: {
          created_at?: string
          elo_after?: number
          elo_before?: number
          elo_change?: number
          game_id?: string
          id?: string
          increment_seconds?: number
          opponent_id?: string | null
          opponent_username?: string
          played_as?: string
          played_at?: string
          player_id?: string
          result?: string
          time_control_seconds?: number
          wager_tct?: number
        }
        Relationships: [
          {
            foreignKeyName: "game_history_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_history_opponent_id_fkey"
            columns: ["opponent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_history_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      game_moves: {
        Row: {
          created_at: string
          fen_after: string
          fen_before: string
          game_id: string
          id: string
          is_capture: boolean
          is_castling: boolean
          is_check: boolean
          is_checkmate: boolean
          is_en_passant: boolean
          is_promotion: boolean
          move_number: number
          player_id: string
          promotion_piece: string | null
          san: string
          time_remaining_ms: number
          time_spent_ms: number
          uci: string
        }
        Insert: {
          created_at?: string
          fen_after: string
          fen_before: string
          game_id: string
          id?: string
          is_capture?: boolean
          is_castling?: boolean
          is_check?: boolean
          is_checkmate?: boolean
          is_en_passant?: boolean
          is_promotion?: boolean
          move_number: number
          player_id: string
          promotion_piece?: string | null
          san: string
          time_remaining_ms: number
          time_spent_ms: number
          uci: string
        }
        Update: {
          created_at?: string
          fen_after?: string
          fen_before?: string
          game_id?: string
          id?: string
          is_capture?: boolean
          is_castling?: boolean
          is_check?: boolean
          is_checkmate?: boolean
          is_en_passant?: boolean
          is_promotion?: boolean
          move_number?: number
          player_id?: string
          promotion_piece?: string | null
          san?: string
          time_remaining_ms?: number
          time_spent_ms?: number
          uci?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_moves_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_moves_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          black_elo_after: number | null
          black_elo_before: number | null
          black_elo_change: number | null
          black_player_id: string
          black_time_remaining: number | null
          created_at: string
          current_fen: string | null
          current_turn: string
          end_reason: Database["public"]["Enums"]["end_reason"] | null
          ended_at: string | null
          final_fen: string | null
          id: string
          increment_seconds: number
          initial_fen: string
          last_move_at: string | null
          move_count: number
          on_chain_game_id: string | null
          on_chain_player1: string | null
          on_chain_player2: string | null
          on_chain_settled: boolean | null
          on_chain_settled_at: string | null
          on_chain_status: string | null
          on_chain_tx_hash: string | null
          pgn: string | null
          result: Database["public"]["Enums"]["game_result"] | null
          started_at: string | null
          status: Database["public"]["Enums"]["game_status"]
          time_control_seconds: number
          wager_tct: number
          white_elo_after: number | null
          white_elo_before: number | null
          white_elo_change: number | null
          white_player_id: string
          white_time_remaining: number | null
          winner_id: string | null
        }
        Insert: {
          black_elo_after?: number | null
          black_elo_before?: number | null
          black_elo_change?: number | null
          black_player_id: string
          black_time_remaining?: number | null
          created_at?: string
          current_fen?: string | null
          current_turn?: string
          end_reason?: Database["public"]["Enums"]["end_reason"] | null
          ended_at?: string | null
          final_fen?: string | null
          id?: string
          increment_seconds?: number
          initial_fen?: string
          last_move_at?: string | null
          move_count?: number
          on_chain_game_id?: string | null
          on_chain_player1?: string | null
          on_chain_player2?: string | null
          on_chain_settled?: boolean | null
          on_chain_settled_at?: string | null
          on_chain_status?: string | null
          on_chain_tx_hash?: string | null
          pgn?: string | null
          result?: Database["public"]["Enums"]["game_result"] | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["game_status"]
          time_control_seconds: number
          wager_tct?: number
          white_elo_after?: number | null
          white_elo_before?: number | null
          white_elo_change?: number | null
          white_player_id: string
          white_time_remaining?: number | null
          winner_id?: string | null
        }
        Update: {
          black_elo_after?: number | null
          black_elo_before?: number | null
          black_elo_change?: number | null
          black_player_id?: string
          black_time_remaining?: number | null
          created_at?: string
          current_fen?: string | null
          current_turn?: string
          end_reason?: Database["public"]["Enums"]["end_reason"] | null
          ended_at?: string | null
          final_fen?: string | null
          id?: string
          increment_seconds?: number
          initial_fen?: string
          last_move_at?: string | null
          move_count?: number
          on_chain_game_id?: string | null
          on_chain_player1?: string | null
          on_chain_player2?: string | null
          on_chain_settled?: boolean | null
          on_chain_settled_at?: string | null
          on_chain_status?: string | null
          on_chain_tx_hash?: string | null
          pgn?: string | null
          result?: Database["public"]["Enums"]["game_result"] | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["game_status"]
          time_control_seconds?: number
          wager_tct?: number
          white_elo_after?: number | null
          white_elo_before?: number | null
          white_elo_change?: number | null
          white_player_id?: string
          white_time_remaining?: number | null
          winner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "games_black_player_id_fkey"
            columns: ["black_player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_white_player_id_fkey"
            columns: ["white_player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_balances: {
        Row: {
          account_id: string
          account_type: string
          balance: number
          currency: string
          id: string
          pending_credits: number
          pending_debits: number
          updated_at: string
        }
        Insert: {
          account_id: string
          account_type: string
          balance?: number
          currency?: string
          id?: string
          pending_credits?: number
          pending_debits?: number
          updated_at?: string
        }
        Update: {
          account_id?: string
          account_type?: string
          balance?: number
          currency?: string
          id?: string
          pending_credits?: number
          pending_debits?: number
          updated_at?: string
        }
        Relationships: []
      }
      ledger_entries: {
        Row: {
          account_id: string
          account_type: string
          amount: number
          balance_after: number | null
          created_at: string
          currency: string
          description: string
          direction: string
          id: string
          metadata: Json | null
          transaction_id: string
        }
        Insert: {
          account_id: string
          account_type: string
          amount: number
          balance_after?: number | null
          created_at?: string
          currency?: string
          description: string
          direction: string
          id: string
          metadata?: Json | null
          transaction_id: string
        }
        Update: {
          account_id?: string
          account_type?: string
          amount?: number
          balance_after?: number | null
          created_at?: string
          currency?: string
          description?: string
          direction?: string
          id?: string
          metadata?: Json | null
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "ledger_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_transactions: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string
          id: string
          is_balanced: boolean
          metadata: Json | null
          reversal_transaction_id: string | null
          reversed_at: string | null
          status: string
          total_credits: number
          total_debits: number
          type: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string
          id: string
          is_balanced?: boolean
          metadata?: Json | null
          reversal_transaction_id?: string | null
          reversed_at?: string | null
          status?: string
          total_credits?: number
          total_debits?: number
          type: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string
          id?: string
          is_balanced?: boolean
          metadata?: Json | null
          reversal_transaction_id?: string | null
          reversed_at?: string | null
          status?: string
          total_credits?: number
          total_debits?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_transactions_reversal_transaction_id_fkey"
            columns: ["reversal_transaction_id"]
            isOneToOne: false
            referencedRelation: "ledger_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      matchmaking_queue: {
        Row: {
          created_at: string
          elo_range_max: number
          elo_range_min: number
          expires_at: string
          game_id: string | null
          id: string
          increment_seconds: number
          matched_at: string | null
          matched_with_id: string | null
          status: Database["public"]["Enums"]["queue_status"]
          time_control_seconds: number
          user_elo: number
          user_id: string
          wager_tct: number
        }
        Insert: {
          created_at?: string
          elo_range_max: number
          elo_range_min: number
          expires_at: string
          game_id?: string | null
          id?: string
          increment_seconds?: number
          matched_at?: string | null
          matched_with_id?: string | null
          status?: Database["public"]["Enums"]["queue_status"]
          time_control_seconds: number
          user_elo: number
          user_id: string
          wager_tct: number
        }
        Update: {
          created_at?: string
          elo_range_max?: number
          elo_range_min?: number
          expires_at?: string
          game_id?: string | null
          id?: string
          increment_seconds?: number
          matched_at?: string | null
          matched_with_id?: string | null
          status?: Database["public"]["Enums"]["queue_status"]
          time_control_seconds?: number
          user_elo?: number
          user_id?: string
          wager_tct?: number
        }
        Relationships: [
          {
            foreignKeyName: "matchmaking_queue_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matchmaking_queue_matched_with_id_fkey"
            columns: ["matched_with_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matchmaking_queue_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_orders: {
        Row: {
          completed_at: string | null
          created_at: string
          crypto_amount: number | null
          crypto_currency: string
          destination_wallet_address: string | null
          exchange_rate: number | null
          failure_reason: string | null
          fiat_amount: number
          fiat_currency: string
          id: string
          network_fee: number | null
          order_type: Database["public"]["Enums"]["payment_order_type"]
          payout_destination: string | null
          payout_method: string | null
          platform_fee: number | null
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_fee: number | null
          provider_order_id: string
          provider_transaction_id: string | null
          status: Database["public"]["Enums"]["payment_order_status"]
          tct_amount: number | null
          updated_at: string
          user_id: string
          webhook_payload: Json | null
          webhook_received_at: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          crypto_amount?: number | null
          crypto_currency?: string
          destination_wallet_address?: string | null
          exchange_rate?: number | null
          failure_reason?: string | null
          fiat_amount: number
          fiat_currency?: string
          id?: string
          network_fee?: number | null
          order_type: Database["public"]["Enums"]["payment_order_type"]
          payout_destination?: string | null
          payout_method?: string | null
          platform_fee?: number | null
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_fee?: number | null
          provider_order_id: string
          provider_transaction_id?: string | null
          status?: Database["public"]["Enums"]["payment_order_status"]
          tct_amount?: number | null
          updated_at?: string
          user_id: string
          webhook_payload?: Json | null
          webhook_received_at?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          crypto_amount?: number | null
          crypto_currency?: string
          destination_wallet_address?: string | null
          exchange_rate?: number | null
          failure_reason?: string | null
          fiat_amount?: number
          fiat_currency?: string
          id?: string
          network_fee?: number | null
          order_type?: Database["public"]["Enums"]["payment_order_type"]
          payout_destination?: string | null
          payout_method?: string | null
          platform_fee?: number | null
          provider?: Database["public"]["Enums"]["payment_provider"]
          provider_fee?: number | null
          provider_order_id?: string
          provider_transaction_id?: string | null
          status?: Database["public"]["Enums"]["payment_order_status"]
          tct_amount?: number | null
          updated_at?: string
          user_id?: string
          webhook_payload?: Json | null
          webhook_received_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_deposits: {
        Row: {
          amount_tct: number
          amount_usdc: number
          block_number: number
          confirmations: number
          confirmed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          required_confirmations: number
          status: string
          tx_hash: string
          user_id: string
          wallet_address: string
        }
        Insert: {
          amount_tct: number
          amount_usdc: number
          block_number: number
          confirmations?: number
          confirmed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          required_confirmations?: number
          status?: string
          tx_hash: string
          user_id: string
          wallet_address: string
        }
        Update: {
          amount_tct?: number
          amount_usdc?: number
          block_number?: number
          confirmations?: number
          confirmed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          required_confirmations?: number
          status?: string
          tx_hash?: string
          user_id?: string
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_deposits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_fiat_deposits: {
        Row: {
          admin_id: string | null
          admin_note: string | null
          amount_tct: number
          amount_usd: number
          created_at: string
          id: string
          processed_at: string | null
          reference_code: string
          status: string
          user_id: string
        }
        Insert: {
          admin_id?: string | null
          admin_note?: string | null
          amount_tct: number
          amount_usd: number
          created_at?: string
          id?: string
          processed_at?: string | null
          reference_code: string
          status?: string
          user_id: string
        }
        Update: {
          admin_id?: string | null
          admin_note?: string | null
          amount_tct?: number
          amount_usd?: number
          created_at?: string
          id?: string
          processed_at?: string | null
          reference_code?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_fiat_deposits_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_fiat_deposits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_on_chain_games: {
        Row: {
          create_tx_hash: string
          created_at: string | null
          creator_user_id: string | null
          creator_wallet: string
          expires_at: string | null
          id: string
          is_public: boolean | null
          on_chain_game_id: string
          room_code: string | null
          status: string | null
          timeout_seconds: number | null
          wager_usdc: number
        }
        Insert: {
          create_tx_hash: string
          created_at?: string | null
          creator_user_id?: string | null
          creator_wallet: string
          expires_at?: string | null
          id?: string
          is_public?: boolean | null
          on_chain_game_id: string
          room_code?: string | null
          status?: string | null
          timeout_seconds?: number | null
          wager_usdc: number
        }
        Update: {
          create_tx_hash?: string
          created_at?: string | null
          creator_user_id?: string | null
          creator_wallet?: string
          expires_at?: string | null
          id?: string
          is_public?: boolean | null
          on_chain_game_id?: string
          room_code?: string | null
          status?: string | null
          timeout_seconds?: number | null
          wager_usdc?: number
        }
        Relationships: []
      }
      platform_config: {
        Row: {
          config_key: string
          config_value: Json
          created_at: string
          description: string | null
          id: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          config_key: string
          config_value: Json
          created_at?: string
          description?: string | null
          id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          config_key?: string
          config_value?: Json
          created_at?: string
          description?: string | null
          id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "platform_config_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_connections: {
        Row: {
          access_token_encrypted: string
          broadcaster_type: string | null
          channel_url: string | null
          connected_at: string | null
          created_at: string | null
          disconnected_at: string | null
          display_name: string | null
          id: string
          is_active: boolean | null
          is_live_enabled: boolean | null
          last_refreshed_at: string | null
          platform: Database["public"]["Enums"]["stream_platform"]
          platform_user_id: string
          profile_image_url: string | null
          refresh_token_encrypted: string | null
          token_expires_at: string | null
          updated_at: string | null
          user_id: string
          username: string
        }
        Insert: {
          access_token_encrypted: string
          broadcaster_type?: string | null
          channel_url?: string | null
          connected_at?: string | null
          created_at?: string | null
          disconnected_at?: string | null
          display_name?: string | null
          id?: string
          is_active?: boolean | null
          is_live_enabled?: boolean | null
          last_refreshed_at?: string | null
          platform: Database["public"]["Enums"]["stream_platform"]
          platform_user_id: string
          profile_image_url?: string | null
          refresh_token_encrypted?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_id: string
          username: string
        }
        Update: {
          access_token_encrypted?: string
          broadcaster_type?: string | null
          channel_url?: string | null
          connected_at?: string | null
          created_at?: string | null
          disconnected_at?: string | null
          display_name?: string | null
          id?: string
          is_active?: boolean | null
          is_live_enabled?: boolean | null
          last_refreshed_at?: string | null
          platform?: Database["public"]["Enums"]["stream_platform"]
          platform_user_id?: string
          profile_image_url?: string | null
          refresh_token_encrypted?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_id?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_connections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_fees: {
        Row: {
          amount_tct: number
          created_at: string
          deposit_id: string | null
          fee_type: string
          game_id: string | null
          id: string
        }
        Insert: {
          amount_tct: number
          created_at?: string
          deposit_id?: string | null
          fee_type: string
          game_id?: string | null
          id?: string
        }
        Update: {
          amount_tct?: number
          created_at?: string
          deposit_id?: string | null
          fee_type?: string
          game_id?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_fees_deposit_id_fkey"
            columns: ["deposit_id"]
            isOneToOne: false
            referencedRelation: "pending_deposits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_fees_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_vault: {
        Row: {
          created_at: string | null
          id: string
          last_verified_block: number | null
          onchain_usdc_balance: number | null
          status: string | null
          total_commission_tct: number | null
          total_tct_issued: number | null
          total_usdc_value: number | null
          updated_at: string | null
          vault_address: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          last_verified_block?: number | null
          onchain_usdc_balance?: number | null
          status?: string | null
          total_commission_tct?: number | null
          total_tct_issued?: number | null
          total_usdc_value?: number | null
          updated_at?: string | null
          vault_address: string
        }
        Update: {
          created_at?: string | null
          id?: string
          last_verified_block?: number | null
          onchain_usdc_balance?: number | null
          status?: string | null
          total_commission_tct?: number | null
          total_tct_issued?: number | null
          total_usdc_value?: number | null
          updated_at?: string | null
          vault_address?: string
        }
        Relationships: []
      }
      play_now_queue: {
        Row: {
          created_at: string
          elo_range_max: number
          elo_range_min: number
          elo_rating: number
          expires_at: string
          game_id: string | null
          id: string
          increment_seconds: number
          matched_at: string | null
          matched_with_id: string | null
          on_chain_game_id: string | null
          ready: boolean
          status: string
          time_control_seconds: number
          updated_at: string
          user_id: string
          wager_tct: number
        }
        Insert: {
          created_at?: string
          elo_range_max?: number
          elo_range_min?: number
          elo_rating?: number
          expires_at?: string
          game_id?: string | null
          id?: string
          increment_seconds?: number
          matched_at?: string | null
          matched_with_id?: string | null
          on_chain_game_id?: string | null
          ready?: boolean
          status?: string
          time_control_seconds?: number
          updated_at?: string
          user_id: string
          wager_tct?: number
        }
        Update: {
          created_at?: string
          elo_range_max?: number
          elo_range_min?: number
          elo_rating?: number
          expires_at?: string
          game_id?: string | null
          id?: string
          increment_seconds?: number
          matched_at?: string | null
          matched_with_id?: string | null
          on_chain_game_id?: string | null
          ready?: boolean
          status?: string
          time_control_seconds?: number
          updated_at?: string
          user_id?: string
          wager_tct?: number
        }
        Relationships: [
          {
            foreignKeyName: "play_now_queue_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "play_now_queue_matched_with_id_fkey"
            columns: ["matched_with_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "play_now_queue_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active_wallet_type: string
          admin_2fa_enabled: boolean
          admin_2fa_verified_at: string | null
          admin_notes: string | null
          avatar_index: number
          ban_expires_at: string | null
          ban_reason: string | null
          banned_at: string | null
          banned_by: string | null
          created_at: string
          current_streak: number
          elo_rating: number
          email: string | null
          embedded_wallet_address: string | null
          external_wallet_address: string | null
          games_drawn: number
          games_lost: number
          games_played: number
          games_won: number
          haptic_enabled: boolean
          id: string
          is_admin: boolean
          is_banned: boolean
          is_super_admin: boolean
          is_suspended: boolean
          last_seen_at: string
          longest_streak: number
          music_enabled: boolean
          notifications_enabled: boolean
          auth_user_id: string | null
          profile_picture_url: string | null
          push_token: string | null
          smart_wallet_address: string | null
          sound_enabled: boolean
          suspended_at: string | null
          suspended_by: string | null
          suspension_expires_at: string | null
          suspension_reason: string | null
          updated_at: string
          username: string
        }
        Insert: {
          active_wallet_type?: string
          admin_2fa_enabled?: boolean
          admin_2fa_verified_at?: string | null
          admin_notes?: string | null
          avatar_index?: number
          ban_expires_at?: string | null
          ban_reason?: string | null
          banned_at?: string | null
          banned_by?: string | null
          created_at?: string
          current_streak?: number
          elo_rating?: number
          email?: string | null
          embedded_wallet_address?: string | null
          external_wallet_address?: string | null
          games_drawn?: number
          games_lost?: number
          games_played?: number
          games_won?: number
          haptic_enabled?: boolean
          id?: string
          is_admin?: boolean
          is_banned?: boolean
          is_super_admin?: boolean
          is_suspended?: boolean
          last_seen_at?: string
          longest_streak?: number
          music_enabled?: boolean
          notifications_enabled?: boolean
          auth_user_id?: string | null
          profile_picture_url?: string | null
          push_token?: string | null
          smart_wallet_address?: string | null
          sound_enabled?: boolean
          suspended_at?: string | null
          suspended_by?: string | null
          suspension_expires_at?: string | null
          suspension_reason?: string | null
          updated_at?: string
          username: string
        }
        Update: {
          active_wallet_type?: string
          admin_2fa_enabled?: boolean
          admin_2fa_verified_at?: string | null
          admin_notes?: string | null
          avatar_index?: number
          ban_expires_at?: string | null
          ban_reason?: string | null
          banned_at?: string | null
          banned_by?: string | null
          created_at?: string
          current_streak?: number
          elo_rating?: number
          email?: string | null
          embedded_wallet_address?: string | null
          external_wallet_address?: string | null
          games_drawn?: number
          games_lost?: number
          games_played?: number
          games_won?: number
          haptic_enabled?: boolean
          id?: string
          is_admin?: boolean
          is_banned?: boolean
          is_super_admin?: boolean
          is_suspended?: boolean
          last_seen_at?: string
          longest_streak?: number
          music_enabled?: boolean
          notifications_enabled?: boolean
          auth_user_id?: string | null
          profile_picture_url?: string | null
          push_token?: string | null
          smart_wallet_address?: string | null
          sound_enabled?: boolean
          suspended_at?: string | null
          suspended_by?: string | null
          suspension_expires_at?: string | null
          suspension_reason?: string | null
          updated_at?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_banned_by_fkey"
            columns: ["banned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_suspended_by_fkey"
            columns: ["suspended_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rake_ledger: {
        Row: {
          account_id: string | null
          balance_after_tct: number
          created_at: string
          credit_tct: number
          debit_tct: number
          description: string | null
          entry_type: Database["public"]["Enums"]["ledger_entry_type"]
          escrow_id: string | null
          game_id: string | null
          id: string
          metadata: Json | null
          transaction_id: string
          user_id: string | null
        }
        Insert: {
          account_id?: string | null
          balance_after_tct: number
          created_at?: string
          credit_tct?: number
          debit_tct?: number
          description?: string | null
          entry_type: Database["public"]["Enums"]["ledger_entry_type"]
          escrow_id?: string | null
          game_id?: string | null
          id?: string
          metadata?: Json | null
          transaction_id: string
          user_id?: string | null
        }
        Update: {
          account_id?: string | null
          balance_after_tct?: number
          created_at?: string
          credit_tct?: number
          debit_tct?: number
          description?: string | null
          entry_type?: Database["public"]["Enums"]["ledger_entry_type"]
          escrow_id?: string | null
          game_id?: string | null
          id?: string
          metadata?: Json | null
          transaction_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rake_ledger_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "vault_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rake_ledger_escrow_id_fkey"
            columns: ["escrow_id"]
            isOneToOne: false
            referencedRelation: "game_escrows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rake_ledger_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rake_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          action_type: string
          attempt_count: number
          created_at: string
          id: string
          identifier: string
          locked_until: string | null
          updated_at: string
          window_start: string
        }
        Insert: {
          action_type: string
          attempt_count?: number
          created_at?: string
          id?: string
          identifier: string
          locked_until?: string | null
          updated_at?: string
          window_start?: string
        }
        Update: {
          action_type?: string
          attempt_count?: number
          created_at?: string
          id?: string
          identifier?: string
          locked_until?: string | null
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      relay_game_mappings: {
        Row: {
          cancelled_at: string | null
          created_at: string
          id: string
          off_chain_game_id: string
          on_chain_game_id: string
          role: string
          user_id: string
          wager_tct: number
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          id?: string
          off_chain_game_id: string
          on_chain_game_id: string
          role: string
          user_id: string
          wager_tct: number
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          id?: string
          off_chain_game_id?: string
          on_chain_game_id?: string
          role?: string
          user_id?: string
          wager_tct?: number
        }
        Relationships: []
      }
      relay_nonces: {
        Row: {
          id: string
          nonce: number
          operation: string
          used_at: string
          user_id: string
        }
        Insert: {
          id?: string
          nonce: number
          operation: string
          used_at?: string
          user_id: string
        }
        Update: {
          id?: string
          nonce?: number
          operation?: string
          used_at?: string
          user_id?: string
        }
        Relationships: []
      }
      relay_transactions: {
        Row: {
          created_at: string
          error: string | null
          gas_used: string | null
          id: string
          operation: string
          params: Json
          success: boolean
          tx_hash: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          gas_used?: string | null
          id?: string
          operation: string
          params?: Json
          success?: boolean
          tx_hash?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          error?: string | null
          gas_used?: string | null
          id?: string
          operation?: string
          params?: Json
          success?: boolean
          tx_hash?: string | null
          user_id?: string
        }
        Relationships: []
      }
      reward_payouts: {
        Row: {
          amount_tct: number
          amount_usdc: number
          chain_id: number
          completed_at: string | null
          created_at: string
          destination_address: string
          error_message: string | null
          id: string
          processed_at: string | null
          reward_id: string
          status: string
          tx_hash: string | null
          user_id: string
        }
        Insert: {
          amount_tct: number
          amount_usdc: number
          chain_id?: number
          completed_at?: string | null
          created_at?: string
          destination_address: string
          error_message?: string | null
          id?: string
          processed_at?: string | null
          reward_id: string
          status?: string
          tx_hash?: string | null
          user_id: string
        }
        Update: {
          amount_tct?: number
          amount_usdc?: number
          chain_id?: number
          completed_at?: string | null
          created_at?: string
          destination_address?: string
          error_message?: string | null
          id?: string
          processed_at?: string | null
          reward_id?: string
          status?: string
          tx_hash?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reward_payouts_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "rewards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_payouts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rewards: {
        Row: {
          avatar_url: string | null
          created_at: string
          criteria_type: Database["public"]["Enums"]["criteria_type"]
          criteria_value: number
          description: string
          gradient_end: string
          gradient_start: string
          icon: string
          id: string
          is_active: boolean
          name: string
          reward_type: string
          sort_order: number
          tct_reward: number
          tier: Database["public"]["Enums"]["reward_tier"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          criteria_type: Database["public"]["Enums"]["criteria_type"]
          criteria_value: number
          description: string
          gradient_end?: string
          gradient_start?: string
          icon?: string
          id?: string
          is_active?: boolean
          name: string
          reward_type?: string
          sort_order?: number
          tct_reward?: number
          tier?: Database["public"]["Enums"]["reward_tier"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          criteria_type?: Database["public"]["Enums"]["criteria_type"]
          criteria_value?: number
          description?: string
          gradient_end?: string
          gradient_start?: string
          icon?: string
          id?: string
          is_active?: boolean
          name?: string
          reward_type?: string
          sort_order?: number
          tct_reward?: number
          tier?: Database["public"]["Enums"]["reward_tier"]
          updated_at?: string
        }
        Relationships: []
      }
      security_audit_log: {
        Row: {
          created_at: string | null
          event_type: string
          id: string
          ip_address: string | null
          new_values: Json | null
          old_values: Json | null
          record_id: string | null
          table_name: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          event_type: string
          id?: string
          ip_address?: string | null
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          event_type?: string
          id?: string
          ip_address?: string | null
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      settlement_logs: {
        Row: {
          block_number: number | null
          contract_result: number
          created_at: string | null
          game_id: string | null
          gas_used: string | null
          id: string
          on_chain_game_id: string
          result: string
          tx_hash: string
        }
        Insert: {
          block_number?: number | null
          contract_result: number
          created_at?: string | null
          game_id?: string | null
          gas_used?: string | null
          id?: string
          on_chain_game_id: string
          result: string
          tx_hash: string
        }
        Update: {
          block_number?: number | null
          contract_result?: number
          created_at?: string | null
          game_id?: string | null
          gas_used?: string | null
          id?: string
          on_chain_game_id?: string
          result?: string
          tx_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlement_logs_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      stream_chat_messages: {
        Row: {
          badges: string[] | null
          color: string | null
          created_at: string | null
          display_name: string | null
          donation_amount: number | null
          donation_currency: string | null
          emotes: Json | null
          id: string
          is_highlighted: boolean | null
          is_moderator: boolean | null
          is_subscriber: boolean | null
          message: string
          platform_message_id: string | null
          platform_user_id: string
          session_id: string
          username: string
        }
        Insert: {
          badges?: string[] | null
          color?: string | null
          created_at?: string | null
          display_name?: string | null
          donation_amount?: number | null
          donation_currency?: string | null
          emotes?: Json | null
          id?: string
          is_highlighted?: boolean | null
          is_moderator?: boolean | null
          is_subscriber?: boolean | null
          message: string
          platform_message_id?: string | null
          platform_user_id: string
          session_id: string
          username: string
        }
        Update: {
          badges?: string[] | null
          color?: string | null
          created_at?: string | null
          display_name?: string | null
          donation_amount?: number | null
          donation_currency?: string | null
          emotes?: Json | null
          id?: string
          is_highlighted?: boolean | null
          is_moderator?: boolean | null
          is_subscriber?: boolean | null
          message?: string
          platform_message_id?: string | null
          platform_user_id?: string
          session_id?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "stream_chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "stream_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      stream_events: {
        Row: {
          bitrate: number | null
          created_at: string | null
          current_state:
            | Database["public"]["Enums"]["stream_connection_state"]
            | null
          error_code: string | null
          error_message: string | null
          event_type: string
          fps: number | null
          id: string
          metadata: Json | null
          previous_state:
            | Database["public"]["Enums"]["stream_connection_state"]
            | null
          session_id: string
          viewer_count: number | null
        }
        Insert: {
          bitrate?: number | null
          created_at?: string | null
          current_state?:
            | Database["public"]["Enums"]["stream_connection_state"]
            | null
          error_code?: string | null
          error_message?: string | null
          event_type: string
          fps?: number | null
          id?: string
          metadata?: Json | null
          previous_state?:
            | Database["public"]["Enums"]["stream_connection_state"]
            | null
          session_id: string
          viewer_count?: number | null
        }
        Update: {
          bitrate?: number | null
          created_at?: string | null
          current_state?:
            | Database["public"]["Enums"]["stream_connection_state"]
            | null
          error_code?: string | null
          error_message?: string | null
          event_type?: string
          fps?: number | null
          id?: string
          metadata?: Json | null
          previous_state?:
            | Database["public"]["Enums"]["stream_connection_state"]
            | null
          session_id?: string
          viewer_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stream_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "stream_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      stream_sessions: {
        Row: {
          audio_bitrate: number | null
          average_viewer_count: number | null
          connection_state:
            | Database["public"]["Enums"]["stream_connection_state"]
            | null
          created_at: string | null
          description: string | null
          dropped_frames: number | null
          duration_seconds: number | null
          ended_at: string | null
          error_code: string | null
          error_message: string | null
          frame_rate: number | null
          game_id: string | null
          health_quality: Database["public"]["Enums"]["stream_quality"] | null
          id: string
          last_bitrate: number | null
          last_fps: number | null
          last_latency_ms: number | null
          peak_viewer_count: number | null
          platform: Database["public"]["Enums"]["stream_platform"]
          platform_connection_id: string | null
          reconnect_attempts: number | null
          resolution: Database["public"]["Enums"]["stream_resolution"]
          rtmp_url: string
          started_at: string | null
          stream_key_encrypted: string
          tags: string[] | null
          title: string
          total_frames: number | null
          total_unique_viewers: number | null
          updated_at: string | null
          user_id: string
          video_bitrate: number
          viewer_count: number | null
          vod_thumbnail_url: string | null
          vod_url: string | null
        }
        Insert: {
          audio_bitrate?: number | null
          average_viewer_count?: number | null
          connection_state?:
            | Database["public"]["Enums"]["stream_connection_state"]
            | null
          created_at?: string | null
          description?: string | null
          dropped_frames?: number | null
          duration_seconds?: number | null
          ended_at?: string | null
          error_code?: string | null
          error_message?: string | null
          frame_rate?: number | null
          game_id?: string | null
          health_quality?: Database["public"]["Enums"]["stream_quality"] | null
          id?: string
          last_bitrate?: number | null
          last_fps?: number | null
          last_latency_ms?: number | null
          peak_viewer_count?: number | null
          platform: Database["public"]["Enums"]["stream_platform"]
          platform_connection_id?: string | null
          reconnect_attempts?: number | null
          resolution: Database["public"]["Enums"]["stream_resolution"]
          rtmp_url: string
          started_at?: string | null
          stream_key_encrypted: string
          tags?: string[] | null
          title: string
          total_frames?: number | null
          total_unique_viewers?: number | null
          updated_at?: string | null
          user_id: string
          video_bitrate: number
          viewer_count?: number | null
          vod_thumbnail_url?: string | null
          vod_url?: string | null
        }
        Update: {
          audio_bitrate?: number | null
          average_viewer_count?: number | null
          connection_state?:
            | Database["public"]["Enums"]["stream_connection_state"]
            | null
          created_at?: string | null
          description?: string | null
          dropped_frames?: number | null
          duration_seconds?: number | null
          ended_at?: string | null
          error_code?: string | null
          error_message?: string | null
          frame_rate?: number | null
          game_id?: string | null
          health_quality?: Database["public"]["Enums"]["stream_quality"] | null
          id?: string
          last_bitrate?: number | null
          last_fps?: number | null
          last_latency_ms?: number | null
          peak_viewer_count?: number | null
          platform?: Database["public"]["Enums"]["stream_platform"]
          platform_connection_id?: string | null
          reconnect_attempts?: number | null
          resolution?: Database["public"]["Enums"]["stream_resolution"]
          rtmp_url?: string
          started_at?: string | null
          stream_key_encrypted?: string
          tags?: string[] | null
          title?: string
          total_frames?: number | null
          total_unique_viewers?: number | null
          updated_at?: string | null
          user_id?: string
          video_bitrate?: number
          viewer_count?: number | null
          vod_thumbnail_url?: string | null
          vod_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stream_sessions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stream_sessions_platform_connection_id_fkey"
            columns: ["platform_connection_id"]
            isOneToOne: false
            referencedRelation: "platform_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stream_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stream_settings: {
        Row: {
          audio_bitrate: number | null
          audio_enabled: boolean | null
          auto_save_vod: boolean | null
          camera_enabled: boolean | null
          camera_position: Database["public"]["Enums"]["camera_position"] | null
          camera_size: Database["public"]["Enums"]["camera_size"] | null
          created_at: string | null
          custom_rtmp_url: string | null
          custom_stream_key_encrypted: string | null
          default_platform:
            | Database["public"]["Enums"]["stream_platform"]
            | null
          default_resolution:
            | Database["public"]["Enums"]["stream_resolution"]
            | null
          id: string
          overlay_position: string | null
          show_move_history: boolean | null
          show_player_names: boolean | null
          show_ratings: boolean | null
          show_stakes: boolean | null
          show_timer: boolean | null
          updated_at: string | null
          use_front_camera: boolean | null
          user_id: string
        }
        Insert: {
          audio_bitrate?: number | null
          audio_enabled?: boolean | null
          auto_save_vod?: boolean | null
          camera_enabled?: boolean | null
          camera_position?:
            | Database["public"]["Enums"]["camera_position"]
            | null
          camera_size?: Database["public"]["Enums"]["camera_size"] | null
          created_at?: string | null
          custom_rtmp_url?: string | null
          custom_stream_key_encrypted?: string | null
          default_platform?:
            | Database["public"]["Enums"]["stream_platform"]
            | null
          default_resolution?:
            | Database["public"]["Enums"]["stream_resolution"]
            | null
          id?: string
          overlay_position?: string | null
          show_move_history?: boolean | null
          show_player_names?: boolean | null
          show_ratings?: boolean | null
          show_stakes?: boolean | null
          show_timer?: boolean | null
          updated_at?: string | null
          use_front_camera?: boolean | null
          user_id: string
        }
        Update: {
          audio_bitrate?: number | null
          audio_enabled?: boolean | null
          auto_save_vod?: boolean | null
          camera_enabled?: boolean | null
          camera_position?:
            | Database["public"]["Enums"]["camera_position"]
            | null
          camera_size?: Database["public"]["Enums"]["camera_size"] | null
          created_at?: string | null
          custom_rtmp_url?: string | null
          custom_stream_key_encrypted?: string | null
          default_platform?:
            | Database["public"]["Enums"]["stream_platform"]
            | null
          default_resolution?:
            | Database["public"]["Enums"]["stream_resolution"]
            | null
          id?: string
          overlay_position?: string | null
          show_move_history?: boolean | null
          show_player_names?: boolean | null
          show_ratings?: boolean | null
          show_stakes?: boolean | null
          show_timer?: boolean | null
          updated_at?: string | null
          use_front_camera?: boolean | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stream_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stream_statistics: {
        Row: {
          average_duration_seconds: number | null
          average_viewers: number | null
          created_at: string | null
          custom_streams: number | null
          id: string
          kick_streams: number | null
          last_stream_at: string | null
          last_stream_platform:
            | Database["public"]["Enums"]["stream_platform"]
            | null
          longest_stream_seconds: number | null
          peak_concurrent_viewers: number | null
          peak_viewers: number | null
          tiktok_streams: number | null
          total_duration_seconds: number | null
          total_streams: number | null
          total_unique_viewers: number | null
          total_viewers: number | null
          twitch_streams: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          average_duration_seconds?: number | null
          average_viewers?: number | null
          created_at?: string | null
          custom_streams?: number | null
          id?: string
          kick_streams?: number | null
          last_stream_at?: string | null
          last_stream_platform?:
            | Database["public"]["Enums"]["stream_platform"]
            | null
          longest_stream_seconds?: number | null
          peak_concurrent_viewers?: number | null
          peak_viewers?: number | null
          tiktok_streams?: number | null
          total_duration_seconds?: number | null
          total_streams?: number | null
          total_unique_viewers?: number | null
          total_viewers?: number | null
          twitch_streams?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          average_duration_seconds?: number | null
          average_viewers?: number | null
          created_at?: string | null
          custom_streams?: number | null
          id?: string
          kick_streams?: number | null
          last_stream_at?: string | null
          last_stream_platform?:
            | Database["public"]["Enums"]["stream_platform"]
            | null
          longest_stream_seconds?: number | null
          peak_concurrent_viewers?: number | null
          peak_viewers?: number | null
          tiktok_streams?: number | null
          total_duration_seconds?: number | null
          total_streams?: number | null
          total_unique_viewers?: number | null
          total_viewers?: number | null
          twitch_streams?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stream_statistics_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      support_messages: {
        Row: {
          created_at: string
          id: string
          is_admin: boolean
          message: string
          sender_id: string
          ticket_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_admin?: boolean
          message: string
          sender_id: string
          ticket_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_admin?: boolean
          message?: string
          sender_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          admin_last_read_at: string | null
          created_at: string
          id: string
          status: string
          subject: string
          updated_at: string
          user_id: string
          user_last_read_at: string | null
        }
        Insert: {
          admin_last_read_at?: string | null
          created_at?: string
          id?: string
          status?: string
          subject: string
          updated_at?: string
          user_id: string
          user_last_read_at?: string | null
        }
        Update: {
          admin_last_read_at?: string | null
          created_at?: string
          id?: string
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string
          user_last_read_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_matches: {
        Row: {
          bracket_position: string | null
          completed_at: string | null
          game_id: string | null
          id: string
          match_number: number
          next_match_id: string | null
          next_match_slot: number | null
          player1_id: string | null
          player1_score: number | null
          player1_seed: number | null
          player2_id: string | null
          player2_score: number | null
          player2_seed: number | null
          round: number
          scheduled_at: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["tournament_match_status"]
          tournament_id: string
          winner_id: string | null
        }
        Insert: {
          bracket_position?: string | null
          completed_at?: string | null
          game_id?: string | null
          id?: string
          match_number: number
          next_match_id?: string | null
          next_match_slot?: number | null
          player1_id?: string | null
          player1_score?: number | null
          player1_seed?: number | null
          player2_id?: string | null
          player2_score?: number | null
          player2_seed?: number | null
          round: number
          scheduled_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["tournament_match_status"]
          tournament_id: string
          winner_id?: string | null
        }
        Update: {
          bracket_position?: string | null
          completed_at?: string | null
          game_id?: string | null
          id?: string
          match_number?: number
          next_match_id?: string | null
          next_match_slot?: number | null
          player1_id?: string | null
          player1_score?: number | null
          player1_seed?: number | null
          player2_id?: string | null
          player2_score?: number | null
          player2_seed?: number | null
          round?: number
          scheduled_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["tournament_match_status"]
          tournament_id?: string
          winner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tournament_matches_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_next_match_id_fkey"
            columns: ["next_match_id"]
            isOneToOne: false
            referencedRelation: "tournament_matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_player1_id_fkey"
            columns: ["player1_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_player2_id_fkey"
            columns: ["player2_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_prizes: {
        Row: {
          amount_tct: number | null
          fixed_amount: number | null
          id: string
          paid_at: string | null
          payout_tx_hash: string | null
          payout_usdc_amount: number | null
          percentage: number
          place: number
          tournament_id: string
          transaction_id: string | null
          user_id: string | null
        }
        Insert: {
          amount_tct?: number | null
          fixed_amount?: number | null
          id?: string
          paid_at?: string | null
          payout_tx_hash?: string | null
          payout_usdc_amount?: number | null
          percentage: number
          place: number
          tournament_id: string
          transaction_id?: string | null
          user_id?: string | null
        }
        Update: {
          amount_tct?: number | null
          fixed_amount?: number | null
          id?: string
          paid_at?: string | null
          payout_tx_hash?: string | null
          payout_usdc_amount?: number | null
          percentage?: number
          place?: number
          tournament_id?: string
          transaction_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tournament_prizes_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_prizes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_registrations: {
        Row: {
          buchholz_score: number | null
          checked_in_at: string | null
          draws: number | null
          entry_fee_paid: number
          entry_fee_refunded: boolean | null
          entry_tx_hash: string | null
          entry_usdc_amount: number | null
          final_place: number | null
          id: string
          is_eliminated: boolean | null
          losses: number | null
          refund_tx_hash: string | null
          registered_at: string | null
          score: number | null
          seed: number | null
          sonneborn_berger: number | null
          tournament_id: string
          user_id: string
          wallet_address: string | null
          wins: number | null
        }
        Insert: {
          buchholz_score?: number | null
          checked_in_at?: string | null
          draws?: number | null
          entry_fee_paid?: number
          entry_fee_refunded?: boolean | null
          entry_tx_hash?: string | null
          entry_usdc_amount?: number | null
          final_place?: number | null
          id?: string
          is_eliminated?: boolean | null
          losses?: number | null
          refund_tx_hash?: string | null
          registered_at?: string | null
          score?: number | null
          seed?: number | null
          sonneborn_berger?: number | null
          tournament_id: string
          user_id: string
          wallet_address?: string | null
          wins?: number | null
        }
        Update: {
          buchholz_score?: number | null
          checked_in_at?: string | null
          draws?: number | null
          entry_fee_paid?: number
          entry_fee_refunded?: boolean | null
          entry_tx_hash?: string | null
          entry_usdc_amount?: number | null
          final_place?: number | null
          id?: string
          is_eliminated?: boolean | null
          losses?: number | null
          refund_tx_hash?: string | null
          registered_at?: string | null
          score?: number | null
          seed?: number | null
          sonneborn_berger?: number | null
          tournament_id?: string
          user_id?: string
          wallet_address?: string | null
          wins?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tournament_registrations_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_registrations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_templates: {
        Row: {
          created_at: string | null
          day_of_month: number | null
          day_of_week: number | null
          description: string | null
          entry_fee_tct: number
          hour_utc: number
          id: string
          increment_seconds: number
          is_active: boolean | null
          last_created_tournament_id: string | null
          max_players: number
          min_players: number
          minute_utc: number
          name: string
          next_scheduled_at: string | null
          prize_distribution: Json
          recurrence: string | null
          registration_closes_minutes_before: number | null
          registration_hours_before: number | null
          rounds: number | null
          time_control_seconds: number
          type: Database["public"]["Enums"]["tournament_type"]
        }
        Insert: {
          created_at?: string | null
          day_of_month?: number | null
          day_of_week?: number | null
          description?: string | null
          entry_fee_tct?: number
          hour_utc?: number
          id?: string
          increment_seconds?: number
          is_active?: boolean | null
          last_created_tournament_id?: string | null
          max_players?: number
          min_players?: number
          minute_utc?: number
          name: string
          next_scheduled_at?: string | null
          prize_distribution?: Json
          recurrence?: string | null
          registration_closes_minutes_before?: number | null
          registration_hours_before?: number | null
          rounds?: number | null
          time_control_seconds?: number
          type?: Database["public"]["Enums"]["tournament_type"]
        }
        Update: {
          created_at?: string | null
          day_of_month?: number | null
          day_of_week?: number | null
          description?: string | null
          entry_fee_tct?: number
          hour_utc?: number
          id?: string
          increment_seconds?: number
          is_active?: boolean | null
          last_created_tournament_id?: string | null
          max_players?: number
          min_players?: number
          minute_utc?: number
          name?: string
          next_scheduled_at?: string | null
          prize_distribution?: Json
          recurrence?: string | null
          registration_closes_minutes_before?: number | null
          registration_hours_before?: number | null
          rounds?: number | null
          time_control_seconds?: number
          type?: Database["public"]["Enums"]["tournament_type"]
        }
        Relationships: [
          {
            foreignKeyName: "tournament_templates_last_created_tournament_id_fkey"
            columns: ["last_created_tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournaments: {
        Row: {
          closed_at: string | null
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          current_players: number
          current_round: number | null
          description: string | null
          entry_fee_tct: number
          id: string
          increment_seconds: number
          is_rated: boolean | null
          max_players: number
          min_players: number
          name: string
          on_chain_pool_usdc: number | null
          prize_pool_tct: number
          rake_percentage: number | null
          registration_deadline: string | null
          registration_opens_at: string | null
          results_available_until: string | null
          rounds: number | null
          start_time: string
          started_at: string | null
          status: Database["public"]["Enums"]["tournament_status"]
          template_id: string | null
          time_control_seconds: number
          type: Database["public"]["Enums"]["tournament_type"]
        }
        Insert: {
          closed_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          current_players?: number
          current_round?: number | null
          description?: string | null
          entry_fee_tct?: number
          id?: string
          increment_seconds?: number
          is_rated?: boolean | null
          max_players?: number
          min_players?: number
          name: string
          on_chain_pool_usdc?: number | null
          prize_pool_tct?: number
          rake_percentage?: number | null
          registration_deadline?: string | null
          registration_opens_at?: string | null
          results_available_until?: string | null
          rounds?: number | null
          start_time: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["tournament_status"]
          template_id?: string | null
          time_control_seconds?: number
          type?: Database["public"]["Enums"]["tournament_type"]
        }
        Update: {
          closed_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          current_players?: number
          current_round?: number | null
          description?: string | null
          entry_fee_tct?: number
          id?: string
          increment_seconds?: number
          is_rated?: boolean | null
          max_players?: number
          min_players?: number
          name?: string
          on_chain_pool_usdc?: number | null
          prize_pool_tct?: number
          rake_percentage?: number | null
          registration_deadline?: string | null
          registration_opens_at?: string | null
          results_available_until?: string | null
          rounds?: number | null
          start_time?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["tournament_status"]
          template_id?: string | null
          time_control_seconds?: number
          type?: Database["public"]["Enums"]["tournament_type"]
        }
        Relationships: [
          {
            foreignKeyName: "tournaments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount_tct: number
          balance_after_tct: number
          balance_before_tct: number
          created_at: string
          description: string | null
          escrow_id: string | null
          game_id: string | null
          id: string
          tx_hash: string | null
          type: Database["public"]["Enums"]["transaction_type"]
          user_id: string
          withdrawal_id: string | null
        }
        Insert: {
          amount_tct: number
          balance_after_tct: number
          balance_before_tct: number
          created_at?: string
          description?: string | null
          escrow_id?: string | null
          game_id?: string | null
          id?: string
          tx_hash?: string | null
          type: Database["public"]["Enums"]["transaction_type"]
          user_id: string
          withdrawal_id?: string | null
        }
        Update: {
          amount_tct?: number
          balance_after_tct?: number
          balance_before_tct?: number
          created_at?: string
          description?: string | null
          escrow_id?: string | null
          game_id?: string | null
          id?: string
          tx_hash?: string | null
          type?: Database["public"]["Enums"]["transaction_type"]
          user_id?: string
          withdrawal_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_escrow_id_fkey"
            columns: ["escrow_id"]
            isOneToOne: false
            referencedRelation: "game_escrows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_withdrawal_id_fkey"
            columns: ["withdrawal_id"]
            isOneToOne: false
            referencedRelation: "withdrawals"
            referencedColumns: ["id"]
          },
        ]
      }
      user_achievements: {
        Row: {
          achievement_id: string
          created_at: string
          earned_at: string | null
          featured: boolean
          id: string
          notified_at: string | null
          progress: number
          updated_at: string
          user_id: string
        }
        Insert: {
          achievement_id: string
          created_at?: string
          earned_at?: string | null
          featured?: boolean
          id?: string
          notified_at?: string | null
          progress?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          achievement_id?: string
          created_at?: string
          earned_at?: string | null
          featured?: boolean
          id?: string
          notified_at?: string | null
          progress?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_achievements_achievement_id_fkey"
            columns: ["achievement_id"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_achievements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_kyc_status: {
        Row: {
          created_at: string
          detected_country: string | null
          detected_region: string | null
          id: string
          moonpay_customer_id: string | null
          moonpay_kyc_level: number | null
          moonpay_kyc_status: Database["public"]["Enums"]["kyc_status"]
          moonpay_verified_at: string | null
          preferred_provider:
            | Database["public"]["Enums"]["payment_provider"]
            | null
          region_detected_at: string | null
          transak_customer_id: string | null
          transak_kyc_status: Database["public"]["Enums"]["kyc_status"]
          transak_verified_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          detected_country?: string | null
          detected_region?: string | null
          id?: string
          moonpay_customer_id?: string | null
          moonpay_kyc_level?: number | null
          moonpay_kyc_status?: Database["public"]["Enums"]["kyc_status"]
          moonpay_verified_at?: string | null
          preferred_provider?:
            | Database["public"]["Enums"]["payment_provider"]
            | null
          region_detected_at?: string | null
          transak_customer_id?: string | null
          transak_kyc_status?: Database["public"]["Enums"]["kyc_status"]
          transak_verified_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          detected_country?: string | null
          detected_region?: string | null
          id?: string
          moonpay_customer_id?: string | null
          moonpay_kyc_level?: number | null
          moonpay_kyc_status?: Database["public"]["Enums"]["kyc_status"]
          moonpay_verified_at?: string | null
          preferred_provider?:
            | Database["public"]["Enums"]["payment_provider"]
            | null
          region_detected_at?: string | null
          transak_customer_id?: string | null
          transak_kyc_status?: Database["public"]["Enums"]["kyc_status"]
          transak_verified_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_kyc_status_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_rewards: {
        Row: {
          claimed_at: string | null
          created_at: string
          id: string
          notified_at: string | null
          progress: number
          reward_id: string
          tct_claimed: boolean
          unlocked_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          claimed_at?: string | null
          created_at?: string
          id?: string
          notified_at?: string | null
          progress?: number
          reward_id: string
          tct_claimed?: boolean
          unlocked_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          claimed_at?: string | null
          created_at?: string
          id?: string
          notified_at?: string | null
          progress?: number
          reward_id?: string
          tct_claimed?: boolean
          unlocked_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_rewards_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "rewards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_rewards_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_wallets: {
        Row: {
          approval_tx_hash: string | null
          chain_id: number
          created_at: string | null
          id: string
          updated_at: string | null
          usdc_approved: boolean | null
          user_id: string | null
          wallet_address: string
        }
        Insert: {
          approval_tx_hash?: string | null
          chain_id?: number
          created_at?: string | null
          id?: string
          updated_at?: string | null
          usdc_approved?: boolean | null
          user_id?: string | null
          wallet_address: string
        }
        Update: {
          approval_tx_hash?: string | null
          chain_id?: number
          created_at?: string | null
          id?: string
          updated_at?: string | null
          usdc_approved?: boolean | null
          user_id?: string | null
          wallet_address?: string
        }
        Relationships: []
      }
      vault_accounts: {
        Row: {
          account_name: string
          account_type: Database["public"]["Enums"]["vault_account_type"]
          balance_tct: number
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          total_credits_tct: number
          total_debits_tct: number
          updated_at: string
        }
        Insert: {
          account_name: string
          account_type: Database["public"]["Enums"]["vault_account_type"]
          balance_tct?: number
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          total_credits_tct?: number
          total_debits_tct?: number
          updated_at?: string
        }
        Update: {
          account_name?: string
          account_type?: Database["public"]["Enums"]["vault_account_type"]
          balance_tct?: number
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          total_credits_tct?: number
          total_debits_tct?: number
          updated_at?: string
        }
        Relationships: []
      }
      vault_audit: {
        Row: {
          actor_id: string | null
          actor_type: string
          affected_id: string | null
          affected_table: string
          change_summary: Json | null
          created_at: string
          escrow_id: string | null
          game_id: string | null
          id: string
          ip_address: unknown
          new_values: Json | null
          old_values: Json | null
          operation: string
          request_id: string | null
          transaction_id: string | null
          user_agent: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_type: string
          affected_id?: string | null
          affected_table: string
          change_summary?: Json | null
          created_at?: string
          escrow_id?: string | null
          game_id?: string | null
          id?: string
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          operation: string
          request_id?: string | null
          transaction_id?: string | null
          user_agent?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_type?: string
          affected_id?: string | null
          affected_table?: string
          change_summary?: Json | null
          created_at?: string
          escrow_id?: string | null
          game_id?: string | null
          id?: string
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          operation?: string
          request_id?: string | null
          transaction_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vault_audit_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_audit_escrow_id_fkey"
            columns: ["escrow_id"]
            isOneToOne: false
            referencedRelation: "game_escrows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_audit_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      vault_daily_stats: {
        Row: {
          created_at: string
          id: string
          rake_to_reward_pool_tct: number
          rake_to_treasury_tct: number
          reward_pool_balance_tct: number
          stats_date: string
          total_draw_refunds_tct: number
          total_draws: number
          total_games: number
          total_pot_volume_tct: number
          total_rake_collected_tct: number
          total_wager_volume_tct: number
          total_wagered_games: number
          total_winner_payouts_tct: number
          treasury_balance_tct: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          rake_to_reward_pool_tct?: number
          rake_to_treasury_tct?: number
          reward_pool_balance_tct?: number
          stats_date: string
          total_draw_refunds_tct?: number
          total_draws?: number
          total_games?: number
          total_pot_volume_tct?: number
          total_rake_collected_tct?: number
          total_wager_volume_tct?: number
          total_wagered_games?: number
          total_winner_payouts_tct?: number
          treasury_balance_tct?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          rake_to_reward_pool_tct?: number
          rake_to_treasury_tct?: number
          reward_pool_balance_tct?: number
          stats_date?: string
          total_draw_refunds_tct?: number
          total_draws?: number
          total_games?: number
          total_pot_volume_tct?: number
          total_rake_collected_tct?: number
          total_wager_volume_tct?: number
          total_wagered_games?: number
          total_winner_payouts_tct?: number
          treasury_balance_tct?: number
          updated_at?: string
        }
        Relationships: []
      }
      vault_reconciliation: {
        Row: {
          created_at: string | null
          discrepancy_usdc: number
          expected_usdc: number
          id: string
          is_reconciled: boolean | null
          notes: string | null
          onchain_usdc_balance: number
          platform_commission_tct: number
          snapshot_date: string
          total_user_tct: number
        }
        Insert: {
          created_at?: string | null
          discrepancy_usdc: number
          expected_usdc: number
          id?: string
          is_reconciled?: boolean | null
          notes?: string | null
          onchain_usdc_balance: number
          platform_commission_tct: number
          snapshot_date: string
          total_user_tct: number
        }
        Update: {
          created_at?: string | null
          discrepancy_usdc?: number
          expected_usdc?: number
          id?: string
          is_reconciled?: boolean | null
          notes?: string | null
          onchain_usdc_balance?: number
          platform_commission_tct?: number
          snapshot_date?: string
          total_user_tct?: number
        }
        Relationships: []
      }
      vault_transactions: {
        Row: {
          block_number: number | null
          confirmed_at: string | null
          created_at: string | null
          from_address: string | null
          id: string
          reference_id: string | null
          reference_type: string | null
          status: string | null
          tct_amount: number
          to_address: string | null
          tx_hash: string | null
          type: string
          usdc_amount: number
          user_id: string | null
        }
        Insert: {
          block_number?: number | null
          confirmed_at?: string | null
          created_at?: string | null
          from_address?: string | null
          id?: string
          reference_id?: string | null
          reference_type?: string | null
          status?: string | null
          tct_amount: number
          to_address?: string | null
          tx_hash?: string | null
          type: string
          usdc_amount: number
          user_id?: string | null
        }
        Update: {
          block_number?: number | null
          confirmed_at?: string | null
          created_at?: string | null
          from_address?: string | null
          id?: string
          reference_id?: string | null
          reference_type?: string | null
          status?: string | null
          tct_amount?: number
          to_address?: string | null
          tx_hash?: string | null
          type?: string
          usdc_amount?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vault_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      withdrawal_limits: {
        Row: {
          account_created_at: string
          created_at: string
          daily_limit_usd: number
          daily_reset_at: string
          daily_withdrawn_usd: number
          elevated_at: string | null
          elevated_daily_limit_usd: number | null
          elevated_reason: string | null
          elevated_weekly_limit_usd: number | null
          first_withdrawal_allowed_at: string
          id: string
          is_elevated: boolean
          updated_at: string
          user_id: string
          weekly_limit_usd: number
          weekly_reset_at: string
          weekly_withdrawn_usd: number
        }
        Insert: {
          account_created_at?: string
          created_at?: string
          daily_limit_usd?: number
          daily_reset_at?: string
          daily_withdrawn_usd?: number
          elevated_at?: string | null
          elevated_daily_limit_usd?: number | null
          elevated_reason?: string | null
          elevated_weekly_limit_usd?: number | null
          first_withdrawal_allowed_at?: string
          id?: string
          is_elevated?: boolean
          updated_at?: string
          user_id: string
          weekly_limit_usd?: number
          weekly_reset_at?: string
          weekly_withdrawn_usd?: number
        }
        Update: {
          account_created_at?: string
          created_at?: string
          daily_limit_usd?: number
          daily_reset_at?: string
          daily_withdrawn_usd?: number
          elevated_at?: string | null
          elevated_daily_limit_usd?: number | null
          elevated_reason?: string | null
          elevated_weekly_limit_usd?: number | null
          first_withdrawal_allowed_at?: string
          id?: string
          is_elevated?: boolean
          updated_at?: string
          user_id?: string
          weekly_limit_usd?: number
          weekly_reset_at?: string
          weekly_withdrawn_usd?: number
        }
        Relationships: [
          {
            foreignKeyName: "withdrawal_limits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      withdrawal_requests: {
        Row: {
          amount_tct: number
          amount_usdc: number
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          id: string
          idempotency_key: string | null
          processed_at: string | null
          status: string | null
          to_address: string
          tx_hash: string | null
          user_id: string
        }
        Insert: {
          amount_tct: number
          amount_usdc: number
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          idempotency_key?: string | null
          processed_at?: string | null
          status?: string | null
          to_address: string
          tx_hash?: string | null
          user_id: string
        }
        Update: {
          amount_tct?: number
          amount_usdc?: number
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          idempotency_key?: string | null
          processed_at?: string | null
          status?: string | null
          to_address?: string
          tx_hash?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "withdrawal_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      withdrawals: {
        Row: {
          amount_tct: number
          bank_account_name: string | null
          bank_account_number: string | null
          bank_bic: string | null
          bank_iban: string | null
          bank_sort_code: string | null
          completed_at: string | null
          created_at: string
          destination_address: string | null
          error_message: string | null
          fee_tct: number
          id: string
          net_amount_tct: number
          net_amount_usd: number | null
          net_amount_usdc: number | null
          signature: string | null
          status: string
          tx_hash: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount_tct: number
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_bic?: string | null
          bank_iban?: string | null
          bank_sort_code?: string | null
          completed_at?: string | null
          created_at?: string
          destination_address?: string | null
          error_message?: string | null
          fee_tct?: number
          id?: string
          net_amount_tct: number
          net_amount_usd?: number | null
          net_amount_usdc?: number | null
          signature?: string | null
          status?: string
          tx_hash?: string | null
          type: string
          user_id: string
        }
        Update: {
          amount_tct?: number
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_bic?: string | null
          bank_iban?: string | null
          bank_sort_code?: string | null
          completed_at?: string | null
          created_at?: string
          destination_address?: string | null
          error_message?: string | null
          fee_tct?: number
          id?: string
          net_amount_tct?: number
          net_amount_usd?: number | null
          net_amount_usdc?: number | null
          signature?: string | null
          status?: string
          tx_hash?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "withdrawals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_adjust_balance: {
        Args: {
          p_adjustment_type?: string
          p_admin_id: string
          p_amount_tct: number
          p_notes?: string
          p_reason: string
          p_target_user_id: string
        }
        Returns: Json
      }
      admin_ban_user: {
        Args: {
          p_admin_id: string
          p_duration_days?: number
          p_notes?: string
          p_reason: string
          p_target_user_id: string
        }
        Returns: Json
      }
      admin_cancel_tournament: {
        Args: { p_admin_id: string; p_tournament_id: string }
        Returns: Json
      }
      admin_create_tournament: {
        Args: {
          p_admin_id: string
          p_description?: string
          p_entry_fee?: number
          p_increment_seconds?: number
          p_is_rated?: boolean
          p_max_players?: number
          p_name: string
          p_start_time?: string
          p_time_control_seconds?: number
        }
        Returns: Json
      }
      admin_get_audit_trail: {
        Args: {
          p_end_date?: string
          p_limit?: number
          p_offset?: number
          p_operation?: string
          p_start_date?: string
        }
        Returns: {
          actor_id: string
          actor_type: string
          affected_table: string
          change_summary: Json
          created_at: string
          game_id: string
          id: string
          operation: string
        }[]
      }
      admin_get_dashboard_stats: { Args: never; Returns: Json }
      admin_get_ledger_entries: {
        Args: {
          p_entry_type?: Database["public"]["Enums"]["ledger_entry_type"]
          p_game_id?: string
          p_limit?: number
          p_offset?: number
        }
        Returns: {
          account_name: string
          balance_after_tct: number
          created_at: string
          credit_tct: number
          debit_tct: number
          description: string
          entry_type: Database["public"]["Enums"]["ledger_entry_type"]
          game_id: string
          id: string
          transaction_id: string
          user_id: string
        }[]
      }
      admin_get_user_details: { Args: { p_user_id: string }; Returns: Json }
      admin_get_vault_dashboard: { Args: never; Returns: Json }
      admin_grant_admin: {
        Args: {
          p_reason?: string
          p_super_admin_id: string
          p_target_user_id: string
        }
        Returns: Json
      }
      admin_grant_super_admin: {
        Args: {
          p_reason?: string
          p_super_admin_id: string
          p_target_user_id: string
        }
        Returns: Json
      }
      admin_revoke_admin: {
        Args: {
          p_reason?: string
          p_super_admin_id: string
          p_target_user_id: string
        }
        Returns: Json
      }
      admin_search_users: {
        Args: {
          p_filter_admin?: boolean
          p_filter_banned?: boolean
          p_filter_suspended?: boolean
          p_limit?: number
          p_offset?: number
          p_order_by?: string
          p_order_dir?: string
          p_search_term?: string
        }
        Returns: {
          available_tct: number
          ban_reason: string
          created_at: string
          elo_rating: number
          email: string
          games_played: number
          games_won: number
          id: string
          is_admin: boolean
          is_banned: boolean
          is_super_admin: boolean
          is_suspended: boolean
          last_seen_at: string
          locked_tct: number
          suspension_reason: string
          username: string
        }[]
      }
      admin_start_tournament: {
        Args: { p_admin_id: string; p_tournament_id: string }
        Returns: Json
      }
      admin_suspend_user: {
        Args: {
          p_admin_id: string
          p_duration_hours?: number
          p_notes?: string
          p_reason: string
          p_target_user_id: string
        }
        Returns: Json
      }
      admin_unban_user: {
        Args: {
          p_admin_id: string
          p_reason?: string
          p_target_user_id: string
        }
        Returns: Json
      }
      admin_unsuspend_user: {
        Args: {
          p_admin_id: string
          p_reason?: string
          p_target_user_id: string
        }
        Returns: Json
      }
      admin_update_rake_settings: {
        Args: {
          p_admin_id: string
          p_enabled?: boolean
          p_min_rake_tct?: number
          p_rake_percentage?: number
          p_reward_pool_split?: number
          p_treasury_split?: number
        }
        Returns: Json
      }
      advance_bye_winners: {
        Args: { p_tournament_id: string }
        Returns: number
      }
      aggregate_daily_vault_stats: {
        Args: { p_date?: string }
        Returns: boolean
      }
      approve_fiat_deposit: {
        Args: {
          p_admin_id: string
          p_admin_note?: string
          p_deposit_id: string
        }
        Returns: boolean
      }
      auto_start_tournaments: {
        Args: never
        Returns: {
          result: Json
          tournament_id: string
        }[]
      }
      calculate_objective_bonus: {
        Args: { p_challenge_id: string; p_game_id: string }
        Returns: number
      }
      call_notification_function: {
        Args: { payload: Json }
        Returns: undefined
      }
      cancel_escrow: {
        Args: { p_game_id: string; p_reason: string }
        Returns: Json
      }
      cancel_tournament: { Args: { p_tournament_id: string }; Returns: Json }
      cancel_withdrawal: {
        Args: { p_user_id: string; p_withdrawal_id: string }
        Returns: boolean
      }
      check_checkmate_in_moves: {
        Args: { p_game_id: string; p_target_moves: number }
        Returns: boolean
      }
      check_checkmate_with_piece: {
        Args: { p_game_id: string; p_piece_code: string }
        Returns: boolean
      }
      check_expired_challenges: { Args: never; Returns: number }
      check_expired_suspensions: { Args: never; Returns: number }
      check_rate_limit: {
        Args: {
          p_action_type: string
          p_cooldown_seconds?: number
          p_identifier: string
          p_max_attempts?: number
          p_window_seconds?: number
        }
        Returns: Json
      }
      check_round_completion: {
        Args: { p_round: number; p_tournament_id: string }
        Returns: Json
      }
      check_tournament_no_shows: {
        Args: never
        Returns: {
          forfeit_result: Json
          match_id: string
        }[]
      }
      check_user_achievements: {
        Args: { p_user_id: string }
        Returns: {
          achievement_description: string
          achievement_id: string
          achievement_name: string
          newly_earned: boolean
          rarity: Database["public"]["Enums"]["achievement_rarity"]
        }[]
      }
      check_user_rewards: {
        Args: { p_user_id: string }
        Returns: {
          newly_unlocked: boolean
          reward_description: string
          reward_id: string
          reward_name: string
          tct_reward: number
        }[]
      }
      check_user_wallet_approved: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      check_withdrawal_eligibility: {
        Args: { p_amount_usd: number; p_user_id: string }
        Returns: {
          cooldown_ends_at: string
          daily_remaining: number
          eligible: boolean
          reason: string
          weekly_remaining: number
        }[]
      }
      claim_dragon_reward: {
        Args: { p_reward_id: string; p_user_id: string }
        Returns: {
          amount_claimed: number
          error_message: string
          success: boolean
        }[]
      }
      claim_play_now_match: {
        Args: { p_my_queue_id: string; p_opponent_queue_id: string }
        Returns: Json
      }
      claim_reward_tct: {
        Args: { p_reward_id: string; p_user_id: string }
        Returns: {
          amount_claimed: number
          error_message: string
          success: boolean
        }[]
      }
      cleanup_expired_queue_entries: { Args: never; Returns: number }
      cleanup_old_challenges: {
        Args: { p_days_old?: number }
        Returns: {
          deleted_challenges: number
          deleted_notifications: number
        }[]
      }
      cleanup_old_chat_messages: { Args: never; Returns: undefined }
      close_expired_tournaments: { Args: never; Returns: Json }
      close_tournament: { Args: { p_tournament_id: string }; Returns: Json }
      close_tournament_registration: { Args: never; Returns: number }
      complete_crypto_withdrawal: {
        Args: { p_tx_hash: string; p_withdrawal_id: string }
        Returns: undefined
      }
      complete_game: {
        Args: {
          p_final_fen: string
          p_game_id: string
          p_pgn?: string
          p_result: string
          p_winner_id: string
        }
        Returns: {
          commission: number
          loser_refund: number
          new_black_elo: number
          new_white_elo: number
          success: boolean
          winner_payout: number
        }[]
      }
      complete_tournament: { Args: { p_tournament_id: string }; Returns: Json }
      complete_withdrawal: {
        Args: {
          p_error_message?: string
          p_request_id: string
          p_success: boolean
          p_tx_hash: string
        }
        Returns: boolean
      }
      connect_streaming_platform: {
        Args: {
          p_access_token_encrypted: string
          p_broadcaster_type?: string
          p_channel_url?: string
          p_display_name: string
          p_is_live_enabled?: boolean
          p_platform: Database["public"]["Enums"]["stream_platform"]
          p_platform_user_id: string
          p_profile_image_url?: string
          p_refresh_token_encrypted?: string
          p_token_expires_at?: string
          p_user_id: string
          p_username: string
        }
        Returns: {
          access_token_encrypted: string
          broadcaster_type: string | null
          channel_url: string | null
          connected_at: string | null
          created_at: string | null
          disconnected_at: string | null
          display_name: string | null
          id: string
          is_active: boolean | null
          is_live_enabled: boolean | null
          last_refreshed_at: string | null
          platform: Database["public"]["Enums"]["stream_platform"]
          platform_user_id: string
          profile_image_url: string | null
          refresh_token_encrypted: string | null
          token_expires_at: string | null
          updated_at: string | null
          user_id: string
          username: string
        }
        SetofOptions: {
          from: "*"
          to: "platform_connections"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_direct_challenge:
        | {
            Args: {
              p_color_preference?: string
              p_creator_id: string
              p_increment_seconds: number
              p_is_rated?: boolean
              p_opponent_username: string
              p_time_control_seconds: number
              p_wager_tct: number
            }
            Returns: {
              challenge_id: string
              error_message: string
              room_code: string
              success: boolean
            }[]
          }
        | {
            Args: {
              p_color_preference?: string
              p_creator_id: string
              p_increment_seconds: number
              p_is_rated?: boolean
              p_on_chain_game_id?: string
              p_opponent_username: string
              p_time_control_seconds: number
              p_wager_tct: number
            }
            Returns: {
              challenge_id: string
              error_message: string
              room_code: string
              success: boolean
            }[]
          }
      create_game_escrow: {
        Args: {
          p_black_player_id: string
          p_black_wager: number
          p_commission_rate?: number
          p_game_id: string
          p_white_player_id: string
          p_white_wager: number
        }
        Returns: string
      }
      create_tournament_from_template: {
        Args: { p_template_id: string }
        Returns: Json
      }
      create_tournament_game: {
        Args: { p_match_id: string; p_user_id: string }
        Returns: Json
      }
      disconnect_streaming_platform: {
        Args: {
          p_platform: Database["public"]["Enums"]["stream_platform"]
          p_user_id: string
        }
        Returns: undefined
      }
      end_stream_session: {
        Args: { p_session_id: string }
        Returns: {
          audio_bitrate: number | null
          average_viewer_count: number | null
          connection_state:
            | Database["public"]["Enums"]["stream_connection_state"]
            | null
          created_at: string | null
          description: string | null
          dropped_frames: number | null
          duration_seconds: number | null
          ended_at: string | null
          error_code: string | null
          error_message: string | null
          frame_rate: number | null
          game_id: string | null
          health_quality: Database["public"]["Enums"]["stream_quality"] | null
          id: string
          last_bitrate: number | null
          last_fps: number | null
          last_latency_ms: number | null
          peak_viewer_count: number | null
          platform: Database["public"]["Enums"]["stream_platform"]
          platform_connection_id: string | null
          reconnect_attempts: number | null
          resolution: Database["public"]["Enums"]["stream_resolution"]
          rtmp_url: string
          started_at: string | null
          stream_key_encrypted: string
          tags: string[] | null
          title: string
          total_frames: number | null
          total_unique_viewers: number | null
          updated_at: string | null
          user_id: string
          video_bitrate: number
          viewer_count: number | null
          vod_thumbnail_url: string | null
          vod_url: string | null
        }
        SetofOptions: {
          from: "*"
          to: "stream_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fail_withdrawal: {
        Args: { p_error_message: string; p_withdrawal_id: string }
        Returns: undefined
      }
      finalize_tournament: { Args: { p_tournament_id: string }; Returns: Json }
      find_compatible_opponents: {
        Args: {
          p_elo_range_max: number
          p_elo_range_min: number
          p_elo_rating: number
          p_increment_seconds: number
          p_limit?: number
          p_time_control_seconds: number
          p_user_id: string
          p_wager_tct: number
        }
        Returns: {
          on_chain_game_id: string
          opponent_avatar_index: number
          opponent_elo: number
          opponent_id: string
          opponent_username: string
          queue_id: string
        }[]
      }
      find_match: {
        Args: {
          p_elo_range?: number
          p_elo_rating: number
          p_user_id: string
          p_wager_tct: number
        }
        Returns: {
          avatar_url: string
          country: string
          elo_rating: number
          queue_id: string
          user_id: string
          username: string
        }[]
      }
      find_orphan_wager_games: {
        Args: never
        Returns: {
          black_player: string
          ended_at: string
          game_id: string
          on_chain_game_id: string
          result: string
          status: string
          wager_tct: number
          white_player: string
        }[]
      }
      finish_game: {
        Args: {
          p_end_reason: string
          p_final_fen: string
          p_game_id: string
          p_result: string
          p_status: string
          p_winner_id: string
        }
        Returns: undefined
      }
      fix_stuck_settled_games: {
        Args: never
        Returns: {
          game_id: string
          new_status: string
          old_status: string
        }[]
      }
      forfeit_tournament_match: {
        Args: { p_forfeit_player_id: string; p_match_id: string }
        Returns: Json
      }
      generate_knockout_bracket: {
        Args: { p_tournament_id: string }
        Returns: Json
      }
      generate_room_code: { Args: never; Returns: string }
      generate_swiss_pairings: {
        Args: { p_round: number; p_tournament_id: string }
        Returns: Json
      }
      get_admin_unread_support_count: { Args: never; Returns: number }
      get_challenge_history: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_status?: string[]
          p_user_id: string
        }
        Returns: {
          accepted_at: string
          created_at: string
          expires_at: string
          game_id: string
          game_result: string
          id: string
          increment_seconds: number
          opponent_elo: number
          opponent_username: string
          room_code: string
          status: Database["public"]["Enums"]["challenge_status"]
          time_control_seconds: number
          wager_tct: number
          was_creator: boolean
        }[]
      }
      get_current_user_profile_id: { Args: never; Returns: string }
      get_escrow_status: {
        Args: { p_game_id: string }
        Returns: {
          commission: number
          commission_rate: number
          escrow_id: string
          settled_at: string
          status: string
          total_pool: number
          winner_id: string
          winner_payout: number
        }[]
      }
      get_live_streams: {
        Args: {
          p_limit?: number
          p_platform?: Database["public"]["Enums"]["stream_platform"]
        }
        Returns: {
          duration_seconds: number
          game_id: string
          platform: Database["public"]["Enums"]["stream_platform"]
          profile_image_url: string
          session_id: string
          started_at: string
          title: string
          user_id: string
          username: string
          viewer_count: number
        }[]
      }
      get_next_relay_nonce: { Args: { p_user_id: string }; Returns: number }
      get_or_create_stream_settings: {
        Args: { p_user_id: string }
        Returns: {
          audio_bitrate: number | null
          audio_enabled: boolean | null
          auto_save_vod: boolean | null
          camera_enabled: boolean | null
          camera_position: Database["public"]["Enums"]["camera_position"] | null
          camera_size: Database["public"]["Enums"]["camera_size"] | null
          created_at: string | null
          custom_rtmp_url: string | null
          custom_stream_key_encrypted: string | null
          default_platform:
            | Database["public"]["Enums"]["stream_platform"]
            | null
          default_resolution:
            | Database["public"]["Enums"]["stream_resolution"]
            | null
          id: string
          overlay_position: string | null
          show_move_history: boolean | null
          show_player_names: boolean | null
          show_ratings: boolean | null
          show_stakes: boolean | null
          show_timer: boolean | null
          updated_at: string | null
          use_front_camera: boolean | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "stream_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_pending_deposits: {
        Args: { p_user_id: string }
        Returns: {
          amount_tct: number
          amount_usdc: number
          confirmations: number
          created_at: string
          id: string
          required_confirmations: number
          status: string
          tx_hash: string
        }[]
      }
      get_public_challenges: {
        Args: {
          p_limit?: number
          p_max_elo?: number
          p_max_wager?: number
          p_min_elo?: number
          p_min_wager?: number
          p_offset?: number
          p_time_category?: string
          p_user_id: string
          p_username_search?: string
        }
        Returns: {
          created_at: string
          creator_avatar_index: number
          creator_color_preference: string
          creator_elo: number
          creator_id: string
          creator_username: string
          expires_at: string
          id: string
          increment_seconds: number
          is_rated: boolean
          room_code: string
          time_category: string
          time_control_seconds: number
          wager_tct: number
        }[]
      }
      get_rake_settings: { Args: never; Returns: Json }
      get_recent_streams: {
        Args: {
          p_include_live?: boolean
          p_limit?: number
          p_platform?: Database["public"]["Enums"]["stream_platform"]
          p_user_id?: string
        }
        Returns: {
          audio_bitrate: number | null
          average_viewer_count: number | null
          connection_state:
            | Database["public"]["Enums"]["stream_connection_state"]
            | null
          created_at: string | null
          description: string | null
          dropped_frames: number | null
          duration_seconds: number | null
          ended_at: string | null
          error_code: string | null
          error_message: string | null
          frame_rate: number | null
          game_id: string | null
          health_quality: Database["public"]["Enums"]["stream_quality"] | null
          id: string
          last_bitrate: number | null
          last_fps: number | null
          last_latency_ms: number | null
          peak_viewer_count: number | null
          platform: Database["public"]["Enums"]["stream_platform"]
          platform_connection_id: string | null
          reconnect_attempts: number | null
          resolution: Database["public"]["Enums"]["stream_resolution"]
          rtmp_url: string
          started_at: string | null
          stream_key_encrypted: string
          tags: string[] | null
          title: string
          total_frames: number | null
          total_unique_viewers: number | null
          updated_at: string | null
          user_id: string
          video_bitrate: number
          viewer_count: number | null
          vod_thumbnail_url: string | null
          vod_url: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "stream_sessions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_relay_history: {
        Args: { p_limit?: number; p_offset?: number; p_user_id: string }
        Returns: {
          created_at: string
          error: string
          gas_used: string
          id: string
          operation: string
          params: Json
          success: boolean
          tx_hash: string
        }[]
      }
      get_stream_statistics: {
        Args: { p_user_id: string }
        Returns: {
          average_duration_seconds: number | null
          average_viewers: number | null
          created_at: string | null
          custom_streams: number | null
          id: string
          kick_streams: number | null
          last_stream_at: string | null
          last_stream_platform:
            | Database["public"]["Enums"]["stream_platform"]
            | null
          longest_stream_seconds: number | null
          peak_concurrent_viewers: number | null
          peak_viewers: number | null
          tiktok_streams: number | null
          total_duration_seconds: number | null
          total_streams: number | null
          total_unique_viewers: number | null
          total_viewers: number | null
          twitch_streams: number | null
          updated_at: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "stream_statistics"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_time_control_category: {
        Args: { p_increment_seconds: number; p_time_control_seconds: number }
        Returns: string
      }
      get_unread_notification_count: {
        Args: { p_user_id: string }
        Returns: number
      }
      get_user_platform_connections: {
        Args: { p_user_id: string }
        Returns: {
          access_token_encrypted: string
          broadcaster_type: string | null
          channel_url: string | null
          connected_at: string | null
          created_at: string | null
          disconnected_at: string | null
          display_name: string | null
          id: string
          is_active: boolean | null
          is_live_enabled: boolean | null
          last_refreshed_at: string | null
          platform: Database["public"]["Enums"]["stream_platform"]
          platform_user_id: string
          profile_image_url: string | null
          refresh_token_encrypted: string | null
          token_expires_at: string | null
          updated_at: string | null
          user_id: string
          username: string
        }[]
        SetofOptions: {
          from: "*"
          to: "platform_connections"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_user_reward_progress: {
        Args: { p_user_id: string }
        Returns: {
          avatar_url: string
          criteria_type: Database["public"]["Enums"]["criteria_type"]
          criteria_value: number
          current_progress: number
          is_unlocked: boolean
          reward_id: string
          reward_name: string
          reward_type: string
          tct_claimed: boolean
          tct_reward: number
          tier: Database["public"]["Enums"]["reward_tier"]
        }[]
      }
      get_user_unread_support_count: {
        Args: { p_user_id: string }
        Returns: number
      }
      get_user_withdrawals: {
        Args: { p_limit?: number; p_offset?: number; p_user_id: string }
        Returns: {
          amount_tct: number
          completed_at: string
          created_at: string
          destination_address: string
          fee_tct: number
          id: string
          net_amount_tct: number
          net_amount_usd: number
          net_amount_usdc: number
          status: string
          tx_hash: string
          type: string
        }[]
      }
      get_vault_account_id: {
        Args: { p_account_name: string }
        Returns: string
      }
      get_vault_address: { Args: never; Returns: string }
      get_vault_balances: {
        Args: never
        Returns: {
          reward_pool_balance_tct: number
          total_draw_refunds_tct: number
          total_games_settled: number
          total_rake_collected_tct: number
          treasury_balance_tct: number
        }[]
      }
      get_vault_statistics: {
        Args: { p_end_date?: string; p_start_date?: string }
        Returns: {
          stat_name: string
          stat_unit: string
          stat_value: number
        }[]
      }
      get_vault_status: {
        Args: never
        Returns: {
          active_users: number
          status: string
          total_commission_tct: number
          total_tct_issued: number
          total_usdc_value: number
          vault_address: string
        }[]
      }
      increment_balance_field: {
        Args: { p_amount: number; p_field: string; p_user_id: string }
        Returns: undefined
      }
      initialize_platform_vault: {
        Args: { p_vault_address: string }
        Returns: string
      }
      is_user_admin: { Args: { p_user_id: string }; Returns: boolean }
      is_user_restricted: {
        Args: { p_user_id: string }
        Returns: {
          expires_at: string
          is_restricted: boolean
          reason: string
          restriction_type: string
        }[]
      }
      is_user_super_admin: { Args: { p_user_id: string }; Returns: boolean }
      lock_balance_for_challenge:
        | {
            Args: {
              p_amount: number
              p_challenge_id: string
              p_user_id: string
            }
            Returns: boolean
          }
        | {
            Args: {
              p_amount: number
              p_challenge_id: string
              p_user_id: string
            }
            Returns: boolean
          }
      lock_balance_for_game: {
        Args: { p_amount: number; p_game_id: string; p_user_id: string }
        Returns: boolean
      }
      lock_escrow_both_players: {
        Args: {
          p_black_player_id: string
          p_game_id: string
          p_stake_amount: number
          p_white_player_id: string
        }
        Returns: Json
      }
      log_admin_action: {
        Args: {
          p_action_type: Database["public"]["Enums"]["admin_action_type"]
          p_admin_id: string
          p_device_info?: Json
          p_ip_address?: unknown
          p_new_values?: Json
          p_notes?: string
          p_old_values?: Json
          p_reason?: string
          p_severity: Database["public"]["Enums"]["admin_action_severity"]
          p_target_record_id?: string
          p_target_table?: string
          p_target_user_id?: string
          p_user_agent?: string
          p_was_2fa_verified?: boolean
        }
        Returns: string
      }
      mark_notifications_read: {
        Args: { p_notification_ids?: string[]; p_user_id: string }
        Returns: number
      }
      mark_support_ticket_read_admin: {
        Args: { p_ticket_id: string }
        Returns: undefined
      }
      mark_support_ticket_read_user: {
        Args: { p_ticket_id: string; p_user_id: string }
        Returns: undefined
      }
      open_tournament_registration: { Args: never; Returns: number }
      process_payment_order_completion: {
        Args: { p_order_id: string; p_tct_amount: number }
        Returns: boolean
      }
      queue_reward_payout: {
        Args: { p_amount_tct: number; p_reward_id: string; p_user_id: string }
        Returns: {
          error_message: string
          payout_id: string
          success: boolean
        }[]
      }
      record_draw_refund: {
        Args: {
          p_black_player_id: string
          p_black_refund_tct: number
          p_escrow_id: string
          p_game_id: string
          p_white_player_id: string
          p_white_refund_tct: number
        }
        Returns: string
      }
      record_rake_settlement: {
        Args: {
          p_escrow_id: string
          p_game_id: string
          p_loser_id: string
          p_rake_amount_tct: number
          p_total_pot_tct: number
          p_winner_id: string
          p_winner_payout_tct: number
        }
        Returns: string
      }
      record_tournament_match_result: {
        Args: { p_game_id?: string; p_match_id: string; p_winner_id: string }
        Returns: Json
      }
      record_vault_audit: {
        Args: {
          p_actor_id: string
          p_actor_type: string
          p_affected_id: string
          p_affected_table: string
          p_escrow_id?: string
          p_game_id?: string
          p_new_values: Json
          p_old_values: Json
          p_operation: string
          p_transaction_id?: string
        }
        Returns: string
      }
      record_vault_deposit: {
        Args: {
          p_block_number: number
          p_from_address: string
          p_tct_amount: number
          p_tx_hash: string
          p_usdc_amount: number
          p_user_id: string
        }
        Returns: string
      }
      record_withdrawal_against_limits: {
        Args: { p_amount_usd: number; p_user_id: string }
        Returns: boolean
      }
      refresh_platform_token: {
        Args: {
          p_access_token_encrypted: string
          p_platform: Database["public"]["Enums"]["stream_platform"]
          p_refresh_token_encrypted?: string
          p_token_expires_at?: string
          p_user_id: string
        }
        Returns: {
          access_token_encrypted: string
          broadcaster_type: string | null
          channel_url: string | null
          connected_at: string | null
          created_at: string | null
          disconnected_at: string | null
          display_name: string | null
          id: string
          is_active: boolean | null
          is_live_enabled: boolean | null
          last_refreshed_at: string | null
          platform: Database["public"]["Enums"]["stream_platform"]
          platform_user_id: string
          profile_image_url: string | null
          refresh_token_encrypted: string | null
          token_expires_at: string | null
          updated_at: string | null
          user_id: string
          username: string
        }
        SetofOptions: {
          from: "*"
          to: "platform_connections"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      refund_escrow: {
        Args: { p_game_id: string; p_reason?: string }
        Returns: boolean
      }
      register_for_tournament: {
        Args: { p_tournament_id: string; p_user_id: string }
        Returns: Json
      }
      register_for_tournament_on_chain: {
        Args: {
          p_entry_tx_hash: string
          p_entry_usdc_amount: number
          p_tournament_id: string
          p_user_id: string
          p_wallet_address: string
        }
        Returns: Json
      }
      reject_fiat_deposit: {
        Args: {
          p_admin_id: string
          p_admin_note?: string
          p_deposit_id: string
        }
        Returns: boolean
      }
      release_escrow_funds: {
        Args: {
          p_game_id: string
          p_is_draw?: boolean
          p_loser_id: string
          p_platform_fee_rate?: number
          p_winner_id: string
        }
        Returns: Json
      }
      release_escrow_refund: {
        Args: { p_amount: number; p_game_id: string; p_user_id: string }
        Returns: undefined
      }
      release_escrow_to_winner: {
        Args: { p_amount: number; p_game_id: string; p_user_id: string }
        Returns: undefined
      }
      request_withdrawal: {
        Args: {
          p_amount_tct: number
          p_idempotency_key?: string
          p_to_address: string
          p_user_id: string
        }
        Returns: {
          error_message: string
          request_id: string
          success: boolean
        }[]
      }
      run_vault_reconciliation: {
        Args: never
        Returns: {
          expected_usdc: number
          is_reconciled: boolean
          platform_commission: number
          snapshot_date: string
          total_user_tct: number
        }[]
      }
      send_expiration_warnings: { Args: never; Returns: number }
      set_featured_achievement: {
        Args: { p_achievement_id: string; p_user_id: string }
        Returns: boolean
      }
      set_play_now_chain_id: {
        Args: {
          p_my_queue_id: string
          p_on_chain_game_id: string
          p_opponent_queue_id: string
        }
        Returns: boolean
      }
      set_play_now_game_id: {
        Args: {
          p_game_id: string
          p_my_queue_id: string
          p_opponent_queue_id: string
        }
        Returns: boolean
      }
      settle_escrow: {
        Args: { p_game_id: string; p_reason?: string; p_winner_id: string }
        Returns: {
          commission: number
          escrow_id: string
          is_draw: boolean
          loser_refund: number
          winner_payout: number
        }[]
      }
      settle_escrow_with_rake: {
        Args: { p_game_id: string; p_reason?: string; p_winner_id: string }
        Returns: {
          escrow_id: string
          is_draw: boolean
          ledger_transaction_id: string
          loser_refund: number
          rake_amount: number
          reward_pool_amount: number
          treasury_amount: number
          winner_payout: number
        }[]
      }
      start_stream_session: {
        Args: {
          p_description?: string
          p_game_id?: string
          p_platform: Database["public"]["Enums"]["stream_platform"]
          p_resolution: Database["public"]["Enums"]["stream_resolution"]
          p_rtmp_url: string
          p_stream_key_encrypted: string
          p_tags?: string[]
          p_title: string
          p_user_id: string
          p_video_bitrate: number
        }
        Returns: {
          audio_bitrate: number | null
          average_viewer_count: number | null
          connection_state:
            | Database["public"]["Enums"]["stream_connection_state"]
            | null
          created_at: string | null
          description: string | null
          dropped_frames: number | null
          duration_seconds: number | null
          ended_at: string | null
          error_code: string | null
          error_message: string | null
          frame_rate: number | null
          game_id: string | null
          health_quality: Database["public"]["Enums"]["stream_quality"] | null
          id: string
          last_bitrate: number | null
          last_fps: number | null
          last_latency_ms: number | null
          peak_viewer_count: number | null
          platform: Database["public"]["Enums"]["stream_platform"]
          platform_connection_id: string | null
          reconnect_attempts: number | null
          resolution: Database["public"]["Enums"]["stream_resolution"]
          rtmp_url: string
          started_at: string | null
          stream_key_encrypted: string
          tags: string[] | null
          title: string
          total_frames: number | null
          total_unique_viewers: number | null
          updated_at: string | null
          user_id: string
          video_bitrate: number
          viewer_count: number | null
          vod_thumbnail_url: string | null
          vod_url: string | null
        }
        SetofOptions: {
          from: "*"
          to: "stream_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      start_tournament: { Args: { p_tournament_id: string }; Returns: Json }
      sync_admin_status_by_email: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      unlock_balance_for_challenge:
        | {
            Args: {
              p_amount: number
              p_challenge_id: string
              p_user_id: string
            }
            Returns: boolean
          }
        | {
            Args: {
              p_amount: number
              p_challenge_id: string
              p_user_id: string
            }
            Returns: boolean
          }
      unlock_balance_for_game: {
        Args: { p_amount: number; p_game_id: string; p_user_id: string }
        Returns: boolean
      }
      unregister_from_tournament: {
        Args: { p_tournament_id: string; p_user_id: string }
        Returns: Json
      }
      unregister_from_tournament_on_chain: {
        Args: {
          p_refund_tx_hash: string
          p_tournament_id: string
          p_user_id: string
        }
        Returns: Json
      }
      update_buchholz_scores: {
        Args: { p_tournament_id: string }
        Returns: undefined
      }
      update_ledger_balance: {
        Args: {
          p_account_id: string
          p_account_type: string
          p_amount: number
          p_currency?: string
        }
        Returns: undefined
      }
      update_stream_health: {
        Args: {
          p_bitrate: number
          p_dropped_frames: number
          p_fps: number
          p_latency_ms: number
          p_session_id: string
          p_total_frames: number
        }
        Returns: undefined
      }
      update_stream_state: {
        Args: {
          p_error_code?: string
          p_error_message?: string
          p_new_state: Database["public"]["Enums"]["stream_connection_state"]
          p_session_id: string
        }
        Returns: {
          audio_bitrate: number | null
          average_viewer_count: number | null
          connection_state:
            | Database["public"]["Enums"]["stream_connection_state"]
            | null
          created_at: string | null
          description: string | null
          dropped_frames: number | null
          duration_seconds: number | null
          ended_at: string | null
          error_code: string | null
          error_message: string | null
          frame_rate: number | null
          game_id: string | null
          health_quality: Database["public"]["Enums"]["stream_quality"] | null
          id: string
          last_bitrate: number | null
          last_fps: number | null
          last_latency_ms: number | null
          peak_viewer_count: number | null
          platform: Database["public"]["Enums"]["stream_platform"]
          platform_connection_id: string | null
          reconnect_attempts: number | null
          resolution: Database["public"]["Enums"]["stream_resolution"]
          rtmp_url: string
          started_at: string | null
          stream_key_encrypted: string
          tags: string[] | null
          title: string
          total_frames: number | null
          total_unique_viewers: number | null
          updated_at: string | null
          user_id: string
          video_bitrate: number
          viewer_count: number | null
          vod_thumbnail_url: string | null
          vod_url: string | null
        }
        SetofOptions: {
          from: "*"
          to: "stream_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_user_profile: {
        Args: {
          p_avatar_index?: number
          p_profile_id: string
          p_profile_picture_url?: string
          p_username?: string
        }
        Returns: {
          active_wallet_type: string
          admin_2fa_enabled: boolean
          admin_2fa_verified_at: string | null
          admin_notes: string | null
          avatar_index: number
          ban_expires_at: string | null
          ban_reason: string | null
          banned_at: string | null
          banned_by: string | null
          created_at: string
          current_streak: number
          elo_rating: number
          email: string | null
          embedded_wallet_address: string | null
          external_wallet_address: string | null
          games_drawn: number
          games_lost: number
          games_played: number
          games_won: number
          haptic_enabled: boolean
          id: string
          is_admin: boolean
          is_banned: boolean
          is_super_admin: boolean
          is_suspended: boolean
          last_seen_at: string
          longest_streak: number
          music_enabled: boolean
          notifications_enabled: boolean
          auth_user_id: string | null
          profile_picture_url: string | null
          push_token: string | null
          smart_wallet_address: string | null
          sound_enabled: boolean
          suspended_at: string | null
          suspended_by: string | null
          suspension_expires_at: string | null
          suspension_reason: string | null
          updated_at: string
          username: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_viewer_count: {
        Args: { p_session_id: string; p_viewer_count: number }
        Returns: undefined
      }
      upsert_user_wallet: {
        Args: {
          p_approval_tx_hash?: string
          p_chain_id?: number
          p_usdc_approved?: boolean
          p_user_id: string
          p_wallet_address: string
        }
        Returns: {
          approval_tx_hash: string | null
          chain_id: number
          created_at: string | null
          id: string
          updated_at: string | null
          usdc_approved: boolean | null
          user_id: string | null
          wallet_address: string
        }
        SetofOptions: {
          from: "*"
          to: "user_wallets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      validate_challenge_objectives: {
        Args: { p_challenge_id: string; p_game_id: string }
        Returns: {
          is_completed: boolean
          objective_id: string
          objective_type: Database["public"]["Enums"]["challenge_objective_type"]
          reward_multiplier: number
          target_value: string
        }[]
      }
      validate_wager_balance: {
        Args: { p_user_id: string; p_wager_amount: number }
        Returns: {
          available_balance: number
          error_message: string
          is_valid: boolean
        }[]
      }
      verify_ledger_transaction: {
        Args: { p_transaction_id: string }
        Returns: boolean
      }
    }
    Enums: {
      achievement_rarity: "common" | "rare" | "epic" | "legendary"
      admin_action_severity: "low" | "medium" | "high" | "critical"
      admin_action_type:
        | "user_ban"
        | "user_unban"
        | "user_suspend"
        | "user_unsuspend"
        | "user_balance_adjust"
        | "user_profile_edit"
        | "user_password_reset"
        | "admin_grant"
        | "admin_revoke"
        | "super_admin_grant"
        | "super_admin_revoke"
        | "config_update"
        | "rake_settings_update"
        | "manual_refund"
        | "manual_credit"
        | "manual_debit"
        | "escrow_force_settle"
        | "vault_adjustment"
        | "system_maintenance"
        | "export_data"
        | "view_sensitive_data"
        | "create_tournament"
        | "start_tournament"
        | "cancel_tournament"
      camera_position: "top-left" | "top-right" | "bottom-left" | "bottom-right"
      camera_size: "small" | "medium" | "large"
      challenge_notification_type:
        | "challenge_received"
        | "challenge_accepted"
        | "challenge_declined"
        | "challenge_cancelled"
        | "challenge_expiring_soon"
        | "challenge_expired"
        | "game_starting"
      challenge_objective_type:
        | "checkmate_in_moves"
        | "checkmate_with_piece"
        | "sacrifice_queen"
        | "promotion_mate"
        | "back_rank_mate"
        | "smothered_mate"
        | "capture_all_pieces"
        | "no_captures"
        | "time_under"
        | "move_limit"
      challenge_status:
        | "pending"
        | "accepted"
        | "cancelled"
        | "expired"
        | "declined"
      criteria_type:
        | "win_streak"
        | "games_played"
        | "total_earnings"
        | "total_wins"
        | "elo_rating"
        | "longest_streak"
        | "referral_count"
        | "tournament_wins"
        | "consecutive_days"
        | "checkmate_count"
        | "quick_win"
        | "comeback_win"
        | "perfect_game"
        | "first_blood"
        | "challenges_completed"
        | "tournaments_played"
      end_reason:
        | "checkmate"
        | "timeout"
        | "resign"
        | "abandon"
        | "draw_agreement"
        | "stalemate"
        | "insufficient_material"
        | "threefold_repetition"
        | "fifty_moves"
      escrow_status: "active" | "settled" | "refunded" | "disputed"
      game_result: "white_wins" | "black_wins" | "draw" | "abandoned"
      game_status: "pending" | "active" | "completed" | "abandoned"
      kyc_status: "not_started" | "pending" | "approved" | "rejected"
      ledger_entry_type:
        | "wager_in"
        | "wager_out"
        | "rake"
        | "payout"
        | "refund"
        | "admin_credit"
        | "admin_debit"
        | "admin_refund"
        | "compensation"
      payment_order_status:
        | "pending"
        | "waiting_payment"
        | "processing"
        | "completed"
        | "failed"
        | "cancelled"
        | "refunded"
      payment_order_type: "buy" | "sell"
      payment_provider: "moonpay" | "transak"
      queue_status: "waiting" | "matched" | "cancelled" | "expired"
      reward_tier: "bronze" | "silver" | "gold" | "platinum"
      stream_connection_state:
        | "idle"
        | "initializing"
        | "connecting"
        | "connected"
        | "streaming"
        | "reconnecting"
        | "paused"
        | "stopping"
        | "stopped"
        | "error"
      stream_platform: "twitch" | "tiktok" | "kick" | "custom"
      stream_quality: "excellent" | "good" | "fair" | "poor"
      stream_resolution: "480p" | "720p" | "1080p"
      tournament_match_status: "pending" | "in_progress" | "completed" | "bye"
      tournament_status:
        | "draft"
        | "registration"
        | "starting"
        | "active"
        | "completed"
        | "cancelled"
        | "closed"
      tournament_type: "knockout" | "swiss" | "arena"
      transaction_type:
        | "deposit"
        | "withdraw"
        | "wager_lock"
        | "wager_unlock"
        | "win_payout"
        | "loss_deduct"
        | "commission"
        | "refund"
        | "reward_payout"
      vault_account_type: "treasury" | "reward_pool" | "escrow" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      achievement_rarity: ["common", "rare", "epic", "legendary"],
      admin_action_severity: ["low", "medium", "high", "critical"],
      admin_action_type: [
        "user_ban",
        "user_unban",
        "user_suspend",
        "user_unsuspend",
        "user_balance_adjust",
        "user_profile_edit",
        "user_password_reset",
        "admin_grant",
        "admin_revoke",
        "super_admin_grant",
        "super_admin_revoke",
        "config_update",
        "rake_settings_update",
        "manual_refund",
        "manual_credit",
        "manual_debit",
        "escrow_force_settle",
        "vault_adjustment",
        "system_maintenance",
        "export_data",
        "view_sensitive_data",
        "create_tournament",
        "start_tournament",
        "cancel_tournament",
      ],
      camera_position: ["top-left", "top-right", "bottom-left", "bottom-right"],
      camera_size: ["small", "medium", "large"],
      challenge_notification_type: [
        "challenge_received",
        "challenge_accepted",
        "challenge_declined",
        "challenge_cancelled",
        "challenge_expiring_soon",
        "challenge_expired",
        "game_starting",
      ],
      challenge_objective_type: [
        "checkmate_in_moves",
        "checkmate_with_piece",
        "sacrifice_queen",
        "promotion_mate",
        "back_rank_mate",
        "smothered_mate",
        "capture_all_pieces",
        "no_captures",
        "time_under",
        "move_limit",
      ],
      challenge_status: [
        "pending",
        "accepted",
        "cancelled",
        "expired",
        "declined",
      ],
      criteria_type: [
        "win_streak",
        "games_played",
        "total_earnings",
        "total_wins",
        "elo_rating",
        "longest_streak",
        "referral_count",
        "tournament_wins",
        "consecutive_days",
        "checkmate_count",
        "quick_win",
        "comeback_win",
        "perfect_game",
        "first_blood",
        "challenges_completed",
        "tournaments_played",
      ],
      end_reason: [
        "checkmate",
        "timeout",
        "resign",
        "abandon",
        "draw_agreement",
        "stalemate",
        "insufficient_material",
        "threefold_repetition",
        "fifty_moves",
      ],
      escrow_status: ["active", "settled", "refunded", "disputed"],
      game_result: ["white_wins", "black_wins", "draw", "abandoned"],
      game_status: ["pending", "active", "completed", "abandoned"],
      kyc_status: ["not_started", "pending", "approved", "rejected"],
      ledger_entry_type: [
        "wager_in",
        "wager_out",
        "rake",
        "payout",
        "refund",
        "admin_credit",
        "admin_debit",
        "admin_refund",
        "compensation",
      ],
      payment_order_status: [
        "pending",
        "waiting_payment",
        "processing",
        "completed",
        "failed",
        "cancelled",
        "refunded",
      ],
      payment_order_type: ["buy", "sell"],
      payment_provider: ["moonpay", "transak"],
      queue_status: ["waiting", "matched", "cancelled", "expired"],
      reward_tier: ["bronze", "silver", "gold", "platinum"],
      stream_connection_state: [
        "idle",
        "initializing",
        "connecting",
        "connected",
        "streaming",
        "reconnecting",
        "paused",
        "stopping",
        "stopped",
        "error",
      ],
      stream_platform: ["twitch", "tiktok", "kick", "custom"],
      stream_quality: ["excellent", "good", "fair", "poor"],
      stream_resolution: ["480p", "720p", "1080p"],
      tournament_match_status: ["pending", "in_progress", "completed", "bye"],
      tournament_status: [
        "draft",
        "registration",
        "starting",
        "active",
        "completed",
        "cancelled",
        "closed",
      ],
      tournament_type: ["knockout", "swiss", "arena"],
      transaction_type: [
        "deposit",
        "withdraw",
        "wager_lock",
        "wager_unlock",
        "win_payout",
        "loss_deduct",
        "commission",
        "refund",
        "reward_payout",
      ],
      vault_account_type: ["treasury", "reward_pool", "escrow", "user"],
    },
  },
} as const
