/**
 * Haptics Manager - Web Stub
 *
 * Web platform doesn't support haptic feedback.
 * This stub provides no-op implementations.
 */

export type HapticIntensity = "light" | "medium" | "heavy";
export type HapticNotification = "success" | "warning" | "error";
export type ChessHaptic =
  | "move" | "capture" | "check" | "castle" | "promote" | "illegal"
  | "gameStart" | "gameEnd" | "win" | "lose" | "draw" | "lowTime" | "timeout";

class HapticsManagerWebClass {
  private enabled = false;

  setEnabled(_enabled: boolean): void {}
  get isEnabled(): boolean { return false; }

  async light(): Promise<void> {}
  async medium(): Promise<void> {}
  async heavy(): Promise<void> {}
  async soft(): Promise<void> {}
  async rigid(): Promise<void> {}
  async success(): Promise<void> {}
  async warning(): Promise<void> {}
  async error(): Promise<void> {}
  async selection(): Promise<void> {}
  async move(): Promise<void> {}
  async capture(): Promise<void> {}
  async check(): Promise<void> {}
  async castle(): Promise<void> {}
  async promote(): Promise<void> {}
  async illegal(): Promise<void> {}
  async gameStart(): Promise<void> {}
  async gameEnd(): Promise<void> {}
  async win(): Promise<void> {}
  async lose(): Promise<void> {}
  async draw(): Promise<void> {}
  async lowTime(): Promise<void> {}
  async timeout(): Promise<void> {}
  async buttonPress(): Promise<void> {}
  async toggle(): Promise<void> {}
  async slider(): Promise<void> {}
  async longPress(): Promise<void> {}
  async dragStart(): Promise<void> {}
  async dragEnd(): Promise<void> {}
  async refresh(): Promise<void> {}
  async pattern(_pattern: Array<[HapticIntensity, number]>): Promise<void> {}
  async notification(_type: HapticNotification): Promise<void> {}
  async chess(_type: ChessHaptic): Promise<void> {}
}

export const HapticsManager = new HapticsManagerWebClass();

export function hapticLight(): void {}
export function hapticMedium(): void {}
export function hapticHeavy(): void {}
export function hapticSelection(): void {}
export function hapticSuccess(): void {}
export function hapticWarning(): void {}
export function hapticError(): void {}
export function hapticMove(_options?: any): void {}

export default HapticsManager;
