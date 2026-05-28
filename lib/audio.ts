/**
 * Audio Manager
 *
 * Elite-standard audio system for Treasure Chess featuring:
 * - Singleton pattern for global access
 * - Preloaded sounds for instant playback
 * - Sound pooling for concurrent playback
 * - Volume control and muting
 * - Background music with fade transitions
 * - Settings persistence integration
 *
 * @example
 * // Initialize on app start
 * await AudioManager.initialize();
 *
 * // Play sounds
 * AudioManager.play('move');
 * AudioManager.play('capture');
 *
 * // Control settings
 * AudioManager.setSoundEnabled(false);
 * AudioManager.setMusicEnabled(true);
 */

import { Audio, AVPlaybackStatus } from "expo-av";
import { Platform } from "react-native";

// ============================================================================
// Types
// ============================================================================

/**
 * Available sound effects
 */
export type SoundEffect =
  | "move"          // Piece moved
  | "capture"       // Piece captured
  | "check"         // King in check
  | "castle"        // Castling move
  | "promote"       // Pawn promotion
  | "illegal"       // Illegal move attempt
  | "gameStart"     // Game started
  | "gameEnd"       // Game ended (generic)
  | "win"           // Player won
  | "lose"          // Player lost
  | "draw"          // Game drawn
  | "lowTime"       // Low time warning
  | "timeout"       // Time ran out
  | "button"        // UI button press
  | "toggle"        // Toggle switch
  | "notification"  // New notification
  | "deposit"       // Deposit received
  | "achievement"   // Achievement unlocked
  | "error"         // Error occurred
  | "chip"          // Betting chip sound
  | "chipStack";    // Multiple chips / stake selection

/**
 * Sound configuration
 */
interface SoundConfig {
  source: any;
  volume: number;
  poolSize: number; // Number of concurrent instances allowed
}

/**
 * Audio manager state
 */
interface AudioState {
  isInitialized: boolean;
  soundEnabled: boolean;
  musicEnabled: boolean;
  masterVolume: number;
  soundVolume: number;
  musicVolume: number;
}

// ============================================================================
// Sound Definitions
// ============================================================================

/**
 * Sound effect configurations
 * Maps sound names to their audio files and settings
 */
const SOUND_CONFIGS: Record<SoundEffect, SoundConfig> = {
  // Chess sounds - using Unity assets
  move: {
    source: require("@/assets/sounds/move.mp3"),
    volume: 0.8,
    poolSize: 2,
  },
  capture: {
    source: require("@/assets/sounds/capture.mp3"),
    volume: 0.9,
    poolSize: 2,
  },
  check: {
    source: require("@/assets/sounds/alert_bell.mp3"),
    volume: 0.7,
    poolSize: 1,
  },
  castle: {
    source: require("@/assets/sounds/pawn.mp3"),
    volume: 0.8,
    poolSize: 1,
  },
  promote: {
    source: require("@/assets/sounds/achievement.mp3"),
    volume: 0.7,
    poolSize: 1,
  },
  illegal: {
    source: require("@/assets/sounds/button.mp3"),
    volume: 0.4,
    poolSize: 1,
  },

  // Game state sounds - using Unity assets
  gameStart: {
    source: require("@/assets/sounds/button.mp3"),
    volume: 0.6,
    poolSize: 1,
  },
  gameEnd: {
    source: require("@/assets/sounds/clock.mp3"),
    volume: 0.7,
    poolSize: 1,
  },
  win: {
    source: require("@/assets/sounds/game_win.mp3"),
    volume: 0.8,
    poolSize: 1,
  },
  lose: {
    source: require("@/assets/sounds/lose.mp3"),
    volume: 0.7,
    poolSize: 1,
  },
  draw: {
    source: require("@/assets/sounds/clock.mp3"),
    volume: 0.6,
    poolSize: 1,
  },

  // Timer sounds - using Unity assets
  lowTime: {
    source: require("@/assets/sounds/alert_bell.mp3"),
    volume: 0.5,
    poolSize: 1,
  },
  timeout: {
    source: require("@/assets/sounds/clock.mp3"),
    volume: 0.8,
    poolSize: 1,
  },

  // UI sounds - using Unity assets
  button: {
    source: require("@/assets/sounds/button.mp3"),
    volume: 0.5,
    poolSize: 3,
  },
  toggle: {
    source: require("@/assets/sounds/button.mp3"),
    volume: 0.4,
    poolSize: 2,
  },
  notification: {
    source: require("@/assets/sounds/clock.mp3"),
    volume: 0.6,
    poolSize: 1,
  },
  deposit: {
    source: require("@/assets/sounds/deposit.mp3"),
    volume: 0.7,
    poolSize: 1,
  },
  achievement: {
    source: require("@/assets/sounds/achievement.mp3"),
    volume: 0.8,
    poolSize: 1,
  },
  error: {
    source: require("@/assets/sounds/clock.mp3"),
    volume: 0.5,
    poolSize: 1,
  },
  chip: {
    source: require("@/assets/sounds/chip.mp3"),
    volume: 0.6,
    poolSize: 2,
  },
  chipStack: {
    source: require("@/assets/sounds/chip_stack.mp3"),
    volume: 0.7,
    poolSize: 1,
  },
};

// ============================================================================
// Sound Pool
// ============================================================================

/**
 * Sound pool for managing concurrent sound instances
 */
class SoundPool {
  private sounds: Audio.Sound[] = [];
  private currentIndex = 0;
  private config: SoundConfig;
  private isLoaded = false;

  constructor(config: SoundConfig) {
    this.config = config;
  }

  async load(): Promise<void> {
    if (this.isLoaded) return;

    try {
      for (let i = 0; i < this.config.poolSize; i++) {
        const { sound } = await Audio.Sound.createAsync(this.config.source, {
          shouldPlay: false,
          volume: this.config.volume,
        });
        this.sounds.push(sound);
      }
      this.isLoaded = true;
    } catch (error) {
      console.warn("Failed to load sound pool:", error);
    }
  }

  async play(volume?: number): Promise<void> {
    if (!this.isLoaded || this.sounds.length === 0) return;

    const sound = this.sounds[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.sounds.length;

    try {
      await sound.setPositionAsync(0);
      if (volume !== undefined) {
        await sound.setVolumeAsync(volume);
      }
      await sound.playAsync();
    } catch (error) {
      // Silently fail - sound playback is not critical
    }
  }

  async setVolume(volume: number): Promise<void> {
    for (const sound of this.sounds) {
      try {
        await sound.setVolumeAsync(volume * this.config.volume);
      } catch {
        // Ignore errors
      }
    }
  }

  async unload(): Promise<void> {
    for (const sound of this.sounds) {
      try {
        await sound.unloadAsync();
      } catch {
        // Ignore errors
      }
    }
    this.sounds = [];
    this.isLoaded = false;
  }
}

// ============================================================================
// Audio Manager Class
// ============================================================================

/**
 * Singleton Audio Manager
 */
class AudioManagerClass {
  private state: AudioState = {
    isInitialized: false,
    soundEnabled: true,
    musicEnabled: true,
    masterVolume: 1.0,
    soundVolume: 1.0,
    musicVolume: 0.5,
  };

  private soundPools: Map<SoundEffect, SoundPool> = new Map();
  private backgroundMusic: Audio.Sound | null = null;
  private isBackgroundMusicPlaying = false;
  private initPromise: Promise<void> | null = null;

  // ============================================================================
  // Initialization
  // ============================================================================

  /**
   * Initialize the audio system
   * Should be called once on app start
   */
  async initialize(): Promise<void> {
    if (this.state.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this._initialize();
    return this.initPromise;
  }

  private async _initialize(): Promise<void> {
    try {
      // Configure audio mode
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      // Preload all sounds
      await this.preloadSounds();

      this.state.isInitialized = true;
      console.log("AudioManager initialized");
    } catch (error) {
      console.error("Failed to initialize AudioManager:", error);
      // Still mark as initialized to prevent repeated attempts
      this.state.isInitialized = true;
    }
  }

  /**
   * Preload all sound effects for instant playback
   */
  private async preloadSounds(): Promise<void> {
    const loadPromises: Promise<void>[] = [];

    for (const [name, config] of Object.entries(SOUND_CONFIGS)) {
      const pool = new SoundPool(config);
      this.soundPools.set(name as SoundEffect, pool);
      loadPromises.push(pool.load());
    }

    // Load in parallel
    await Promise.all(loadPromises);
    console.log("All sounds preloaded");
  }

  // ============================================================================
  // Sound Playback
  // ============================================================================

  /**
   * Play a sound effect
   * @param effect - The sound effect to play
   * @param volumeMultiplier - Optional volume multiplier (0-1)
   */
  async play(effect: SoundEffect, volumeMultiplier: number = 1): Promise<void> {
    if (!this.state.soundEnabled) return;
    if (!this.state.isInitialized) {
      await this.initialize();
    }

    const pool = this.soundPools.get(effect);
    if (!pool) {
      console.warn(`Unknown sound effect: ${effect}`);
      return;
    }

    const finalVolume =
      this.state.masterVolume * this.state.soundVolume * volumeMultiplier;
    await pool.play(finalVolume);
  }

  /**
   * Play a chess move sound based on move properties
   */
  async playMoveSound(options: {
    isCapture?: boolean;
    isCheck?: boolean;
    isCastle?: boolean;
    isPromotion?: boolean;
  }): Promise<void> {
    const { isCapture, isCheck, isCastle, isPromotion } = options;

    // Priority: check > promotion > capture > castle > move
    if (isCheck) {
      await this.play("check");
    } else if (isPromotion) {
      await this.play("promote");
    } else if (isCapture) {
      await this.play("capture");
    } else if (isCastle) {
      await this.play("castle");
    } else {
      await this.play("move");
    }
  }

  /**
   * Play game result sound
   */
  async playGameResult(result: "win" | "lose" | "draw"): Promise<void> {
    await this.play(result);
  }

  // ============================================================================
  // Background Music
  // ============================================================================

  /**
   * Play background music
   * @param fadeIn - Whether to fade in the music
   */
  async playBackgroundMusic(fadeIn: boolean = true): Promise<void> {
    if (!this.state.musicEnabled) return;

    try {
      if (!this.backgroundMusic) {
        const { sound } = await Audio.Sound.createAsync(
          require("@/assets/sounds/bg.mp3"),
          {
            shouldPlay: false,
            isLooping: true,
            volume: fadeIn ? 0 : this.state.musicVolume * this.state.masterVolume,
          }
        );
        this.backgroundMusic = sound;
      }

      await this.backgroundMusic.playAsync();
      this.isBackgroundMusicPlaying = true;

      if (fadeIn) {
        await this.fadeMusic(this.state.musicVolume * this.state.masterVolume, 2000);
      }
    } catch (error) {
      console.error("Failed to play background music:", error);
    }
  }

  /**
   * Stop background music
   * @param fadeOut - Whether to fade out the music
   */
  async stopBackgroundMusic(fadeOut: boolean = true): Promise<void> {
    if (!this.backgroundMusic || !this.isBackgroundMusicPlaying) return;

    try {
      if (fadeOut) {
        await this.fadeMusic(0, 1000);
      }
      await this.backgroundMusic.stopAsync();
      this.isBackgroundMusicPlaying = false;
    } catch (error) {
      console.error("Failed to stop background music:", error);
    }
  }

  /**
   * Pause background music
   */
  async pauseBackgroundMusic(): Promise<void> {
    if (!this.backgroundMusic || !this.isBackgroundMusicPlaying) return;

    try {
      await this.backgroundMusic.pauseAsync();
    } catch (error) {
      console.error("Failed to pause background music:", error);
    }
  }

  /**
   * Resume background music
   */
  async resumeBackgroundMusic(): Promise<void> {
    if (!this.backgroundMusic || !this.state.musicEnabled) return;

    try {
      const status = await this.backgroundMusic.getStatusAsync();
      if (status.isLoaded && !status.isPlaying) {
        await this.backgroundMusic.playAsync();
      }
    } catch (error) {
      console.error("Failed to resume background music:", error);
    }
  }

  /**
   * Fade music volume over time
   */
  private async fadeMusic(targetVolume: number, durationMs: number): Promise<void> {
    if (!this.backgroundMusic) return;

    const steps = 20;
    const stepDuration = durationMs / steps;

    try {
      const status = await this.backgroundMusic.getStatusAsync();
      if (!status.isLoaded) return;

      const startVolume = status.volume ?? 0;
      const volumeDelta = (targetVolume - startVolume) / steps;

      for (let i = 0; i <= steps; i++) {
        const newVolume = startVolume + volumeDelta * i;
        await this.backgroundMusic.setVolumeAsync(Math.max(0, Math.min(1, newVolume)));
        await new Promise((resolve) => setTimeout(resolve, stepDuration));
      }
    } catch {
      // Ignore fade errors
    }
  }

  // ============================================================================
  // Settings
  // ============================================================================

  /**
   * Enable or disable sound effects
   */
  setSoundEnabled(enabled: boolean): void {
    this.state.soundEnabled = enabled;
  }

  /**
   * Enable or disable background music
   */
  setMusicEnabled(enabled: boolean): void {
    this.state.musicEnabled = enabled;

    if (!enabled && this.isBackgroundMusicPlaying) {
      this.stopBackgroundMusic();
    }
  }

  /**
   * Set master volume (affects both sounds and music)
   */
  async setMasterVolume(volume: number): Promise<void> {
    this.state.masterVolume = Math.max(0, Math.min(1, volume));
    await this.updateAllVolumes();
  }

  /**
   * Set sound effects volume
   */
  async setSoundVolume(volume: number): Promise<void> {
    this.state.soundVolume = Math.max(0, Math.min(1, volume));
    await this.updateSoundVolumes();
  }

  /**
   * Set music volume
   */
  async setMusicVolume(volume: number): Promise<void> {
    this.state.musicVolume = Math.max(0, Math.min(1, volume));
    await this.updateMusicVolume();
  }

  /**
   * Apply settings from user preferences
   */
  applySettings(settings: {
    soundEnabled?: boolean;
    musicEnabled?: boolean;
    masterVolume?: number;
    soundVolume?: number;
    musicVolume?: number;
  }): void {
    if (settings.soundEnabled !== undefined) {
      this.setSoundEnabled(settings.soundEnabled);
    }
    if (settings.musicEnabled !== undefined) {
      this.setMusicEnabled(settings.musicEnabled);
    }
    if (settings.masterVolume !== undefined) {
      this.setMasterVolume(settings.masterVolume);
    }
    if (settings.soundVolume !== undefined) {
      this.setSoundVolume(settings.soundVolume);
    }
    if (settings.musicVolume !== undefined) {
      this.setMusicVolume(settings.musicVolume);
    }
  }

  private async updateAllVolumes(): Promise<void> {
    await Promise.all([this.updateSoundVolumes(), this.updateMusicVolume()]);
  }

  private async updateSoundVolumes(): Promise<void> {
    const volume = this.state.masterVolume * this.state.soundVolume;
    for (const pool of this.soundPools.values()) {
      await pool.setVolume(volume);
    }
  }

  private async updateMusicVolume(): Promise<void> {
    if (this.backgroundMusic) {
      try {
        const volume = this.state.masterVolume * this.state.musicVolume;
        await this.backgroundMusic.setVolumeAsync(volume);
      } catch {
        // Ignore errors
      }
    }
  }

  // ============================================================================
  // State Getters
  // ============================================================================

  get isInitialized(): boolean {
    return this.state.isInitialized;
  }

  get isSoundEnabled(): boolean {
    return this.state.soundEnabled;
  }

  get isMusicEnabled(): boolean {
    return this.state.musicEnabled;
  }

  get isMusicPlaying(): boolean {
    return this.isBackgroundMusicPlaying;
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  /**
   * Cleanup all audio resources
   * Call when app is closing or during memory pressure
   */
  async cleanup(): Promise<void> {
    // Stop and unload background music
    if (this.backgroundMusic) {
      try {
        await this.backgroundMusic.stopAsync();
        await this.backgroundMusic.unloadAsync();
      } catch {
        // Ignore errors
      }
      this.backgroundMusic = null;
    }

    // Unload all sound pools
    for (const pool of this.soundPools.values()) {
      await pool.unload();
    }
    this.soundPools.clear();

    this.state.isInitialized = false;
    this.initPromise = null;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

/**
 * Global AudioManager instance
 */
export const AudioManager = new AudioManagerClass();

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Play a sound effect (convenience function)
 */
export function playSound(effect: SoundEffect, volume?: number): void {
  AudioManager.play(effect, volume);
}

/**
 * Play move sound based on move type
 */
export function playMoveSound(options: {
  isCapture?: boolean;
  isCheck?: boolean;
  isCastle?: boolean;
  isPromotion?: boolean;
}): void {
  AudioManager.playMoveSound(options);
}

/**
 * Play game result sound
 */
export function playGameResult(result: "win" | "lose" | "draw"): void {
  AudioManager.playGameResult(result);
}

// ============================================================================
// Default Export
// ============================================================================

export default AudioManager;
