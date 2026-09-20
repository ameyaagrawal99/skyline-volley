import type { GameState, InputState, LogEntry, PlayerState, Side } from './types'

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
const other = (s: Side): Side => s === 'near' ? 'far' : 'near'

const player = (side: Side): PlayerState => ({
  x: .5,
  y: side === 'near' ? .80 : .30,
  z: 0,
  vz: 0,
  action: 'idle',
  facing: side === 'near' ? -1 : 1,
})

const clock = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`

export function createGame(): GameState {
  return {
    players: { near: player('near'), far: player('far') },
    ball: { x: .5, y: .72, z: .42, vx: 0, vy: 0, vz: 0 },
    score: { near: 0, far: 0 },
    sets: { near: 0, far: 0 },
    serving: 'near', rally: 1, contacts: { near: 0, far: 0 },
    status: 'ready', message: 'Tap BUMP to serve', elapsed: 0, logs: [], revision: 0,
  }
}

function addLog(state: GameState, text: string, tone: LogEntry['tone'] = 'info') {
  state.logs = [{ id: Date.now() + Math.random(), rally: state.rally, text, at: clock(state.elapsed), tone }, ...state.logs].slice(0, 24)
}

function resetRally(state: GameState) {
  state.players.near = player('near')
  state.players.far = player('far')
  const sy = state.serving === 'near' ? .72 : .36
  state.ball = { x: .5, y: sy, z: .42, vx: 0, vy: 0, vz: 0 }
  state.contacts = { near: 0, far: 0 }
  state.status = 'ready'
  state.message = `${state.serving === 'near' ? 'PLAYER 1' : 'PLAYER 2'} to serve`
}

function awardPoint(state: GameState, winner: Side, reason: string) {
  state.score[winner] += 1
  state.serving = winner
  state.status = 'point'
  state.message = `Point — ${winner === 'near' ? 'PLAYER 1' : 'PLAYER 2'}`
  addLog(state, `${state.message} · ${reason}`, reason.includes('fault') || reason.includes('out') ? 'fault' : 'point')
  const a = state.score[winner]
  const b = state.score[other(winner)]
  if (a >= 15 && a - b >= 2) {
    state.sets[winner] += 1
    state.status = 'match'
    state.message = `${winner === 'near' ? 'PLAYER 1' : 'PLAYER 2'} wins!`
    addLog(state, `${state.message} ${a}–${b}`, 'point')
  }
  setTimeout(() => {
    if (state.status === 'match') {
      state.score = { near: 0, far: 0 }
      state.rally = 1
    } else state.rally += 1
    resetRally(state)
  }, 1300)
}

function movePlayer(p: PlayerState, input: InputState, side: Side, dt: number) {
  const speed = .34
  const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0)
  const dy = (input.down ? 1 : 0) - (input.up ? 1 : 0)
  p.x = clamp(p.x + dx * speed * dt, .15, .85)
  const bounds = side === 'near' ? [.57, .89] : [.20, .43]
  p.y = clamp(p.y + dy * speed * dt, bounds[0], bounds[1])
  if (dx) p.facing = dx > 0 ? 1 : -1
  if (input.jump && p.z <= .002) p.vz = 1.15
  p.vz -= 2.8 * dt
  p.z = Math.max(0, p.z + p.vz * dt)
  if (p.z === 0 && p.vz < 0) p.vz = 0
  p.action = p.z > .02 ? 'jump' : dx || dy ? 'run' : input.spike ? 'spike' : input.bump ? 'bump' : 'idle'
}

function hitBall(state: GameState, side: Side, input: InputState) {
  const p = state.players[side]
  const b = state.ball
  const distance = Math.hypot((p.x - b.x) * 1.2, p.y - b.y)
  const reachable = distance < .15 && b.z < p.z + .34
  if (!reachable || (!input.bump && !input.spike && !input.jump)) return
  const direction = side === 'near' ? -1 : 1
  const isSpike = input.spike && p.z > .06
  b.vx = (b.x - p.x) * (isSpike ? 1.9 : 1.15)
  b.vy = direction * (isSpike ? .88 : .58)
  b.vz = isSpike ? .52 : .92
  b.z = Math.max(b.z, .20)
  state.contacts[side] += 1
  state.contacts[other(side)] = 0
  state.status = 'playing'
  state.message = isSpike ? 'POWER SPIKE!' : state.contacts[side] === 1 ? 'Nice receive' : `${state.contacts[side]} contacts`
  if (state.contacts[side] > 3) awardPoint(state, other(side), 'four-touch fault')
}

function aiInput(state: GameState): InputState {
  const i = { left: false, right: false, up: false, down: false, jump: false, bump: false, spike: false }
  const p = state.players.far
  const b = state.ball
  if (b.x < p.x - .025) i.left = true
  if (b.x > p.x + .025) i.right = true
  if (b.y < p.y - .025) i.up = true
  if (b.y > p.y + .025) i.down = true
  const near = Math.hypot(p.x - b.x, p.y - b.y) < .17
  if (near && b.z < .52) { i.bump = true; if (b.z > .22) { i.jump = true; i.spike = true } }
  if (state.status === 'ready' && state.serving === 'far') i.bump = true
  return i
}

export function tick(state: GameState, inputs: Record<Side, InputState>, dt: number, useAI: boolean): GameState {
  if (state.status === 'point' || state.status === 'match') return state
  const farInput = useAI ? aiInput(state) : inputs.far
  movePlayer(state.players.near, inputs.near, 'near', dt)
  movePlayer(state.players.far, farInput, 'far', dt)

  if (state.status === 'ready') {
    const serveInput = state.serving === 'near' ? inputs.near : farInput
    const p = state.players[state.serving]
    state.ball.x = p.x
    state.ball.y = p.y + (state.serving === 'near' ? -.05 : .05)
    state.ball.z = p.z + .34
    if (serveInput.bump || serveInput.spike) {
      state.status = 'playing'
      state.ball.vy = state.serving === 'near' ? -.62 : .62
      state.ball.vx = (Math.random() - .5) * .18
      state.ball.vz = .75
      state.message = 'Serve!'
      addLog(state, `${state.serving === 'near' ? 'PLAYER 1' : 'PLAYER 2'} served`)
    }
  } else {
    const b = state.ball
    b.vz -= 1.55 * dt
    b.x += b.vx * dt
    b.y += b.vy * dt
    b.z += b.vz * dt
    b.vx *= .998
    hitBall(state, 'near', inputs.near)
    hitBall(state, 'far', farInput)

    if (Math.abs(b.y - .5) < .018 && b.z < .27) {
      const losing = b.vy < 0 ? 'near' : 'far'
      awardPoint(state, other(losing), 'net fault')
    } else if (b.z <= 0) {
      const inCourt = b.x >= .10 && b.x <= .90 && b.y >= .18 && b.y <= .92
      if (!inCourt) {
        const lastSide = b.vy < 0 ? 'near' : 'far'
        awardPoint(state, other(lastSide), 'ball out')
      } else awardPoint(state, b.y > .5 ? 'far' : 'near', 'ball down')
    }
  }
  state.elapsed += dt
  state.revision += 1
  return state
}
