export type Side = 'near' | 'far'
export type GameMode = 'duel' | 'squad'
export type Difficulty = 'rookie' | 'pro' | 'legend'
export type ControlScheme = 'joystick' | 'tap' | 'classic'
export type Uniform = 'coral' | 'ocean' | 'gold' | 'violet'
export type ActionName = 'left' | 'right' | 'up' | 'down' | 'jump' | 'bump' | 'spike' | 'smart'

export interface InputState extends Record<ActionName, boolean> {
  targetX: number | null
  targetY: number | null
}

export interface PlayerState {
  jersey: number
  x: number
  y: number
  z: number
  vz: number
  action: 'idle' | 'run' | 'jump' | 'bump' | 'spike' | 'block'
  facing: -1 | 1
  aiCooldown: number
}

export interface BallState { x: number; y: number; z: number; vx: number; vy: number; vz: number }

export interface LogEntry {
  id: number; rally: number; text: string; at: string; tone?: 'point' | 'fault' | 'info'
}

export interface GameState {
  players: Record<Side, PlayerState>
  teammates: Record<Side, PlayerState[]>
  activeJersey: Record<Side, number>
  ball: BallState
  score: Record<Side, number>
  sets: Record<Side, number>
  serving: Side
  rally: number
  contacts: Record<Side, number>
  status: 'ready' | 'playing' | 'point' | 'match'
  message: string
  elapsed: number
  logs: LogEntry[]
  revision: number
  mode: GameMode
  difficulty: Difficulty
  wind: number
  crowdEnergy: number
  lastTouch: Side | null
  pointTimer: number
}

export const emptyInput = (): InputState => ({
  left: false, right: false, up: false, down: false,
  jump: false, bump: false, spike: false, smart: false,
  targetX: null, targetY: null,
})
