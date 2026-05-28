/**
 * Audio Manager - Web Stub
 *
 * Web platform doesn't fully support expo-av.
 * This stub provides no-op implementations.
 */

export type SoundEffect =
  | "move" | "capture" | "check" | "castle" | "promote" | "illegal"
  | "gameStart" | "gameEnd" | "win" | "lose" | "draw"
  | "lowTime" | "timeout" | "button" | "toggle" | "notification"
  | "deposit" | "achievement" | "error" | "chip" | "chipStack";

class AudioManagerWebClass {
  async initialize(): Promise<void> {
    console.log("AudioManager: Web platform - audio limited");
  }

  async play(_effect: SoundEffect, _volumeMultiplier?: number): Promise<void> {}
  async playMoveSound(_options: any): Promise<void> {}
  async playGameResult(_result: "win" | "lose" | "draw"): Promise<void> {}
  async playBackgroundMusic(_fadeIn?: boolean): Promise<void> {}
  async stopBackgroundMusic(_fadeOut?: boolean): Promise<void> {}
  async pauseBackgroundMusic(): Promise<void> {}
  async resumeBackgroundMusic(): Promise<void> {}
  setSoundEnabled(_enabled: boolean): void {}
  setMusicEnabled(_enabled: boolean): void {}
  async setMasterVolume(_volume: number): Promise<void> {}
  async setSoundVolume(_volume: number): Promise<void> {}
  async setMusicVolume(_volume: number): Promise<void> {}
  applySettings(_settings: any): void {}
  async cleanup(): Promise<void> {}
  get isInitialized(): boolean { return true; }
  get isSoundEnabled(): boolean { return false; }
  get isMusicEnabled(): boolean { return false; }
  get isMusicPlaying(): boolean { return false; }
}

export const AudioManager = new AudioManagerWebClass();

export function playSound(_effect: SoundEffect, _volume?: number): void {}
export function playMoveSound(_options: any): void {}
export function playGameResult(_result: "win" | "lose" | "draw"): void {}

export default AudioManager;
