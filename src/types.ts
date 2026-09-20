export type Side = 'near' | 'far'
export type ActionName = 'left' | 'right' | 'up' | 'down' | 'jump' | 'bump' | 'spike'
export type InputState = Record<ActionName, boolean>

export interface PlayerState {
  x: number
  y: number
  z: number
  vz: number
  action: 'idle' | 'run' | 'jump' | 'bump' | 'spike'
  facing: -1 | 1
}

export interface BallState {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
}

export interface LogEntry {
  id: number
  rally: number
  text: string
  at: string
  tone?: 'point' | 'fault' | 'info'
}

export interface GameState {
  players: Record<Side, PlayerState>
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
}

export const emptyInput = (): InputState => ({
  left: false, right: false, up: false, down: false,
  jump: false, bump: false, spike: false,
})
