import type { Difficulty, GameMode, GameState, InputState, LogEntry, PlayerState, Side } from './types'

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
const other = (s: Side): Side => s === 'near' ? 'far' : 'near'
const sideBounds = (side: Side): [number, number] => side === 'near' ? [.56, .90] : [.18, .44]
const formations: Record<Side, Array<[number, number]>> = {
  near: [[.50, .80], [.27, .66], [.73, .64]], far: [[.50, .28], [.27, .39], [.73, .40]],
}

const player = (side: Side, slot = 0): PlayerState => ({
  jersey: slot + 1, x: formations[side][slot][0], y: formations[side][slot][1],
  z: 0, vz: 0, action: 'idle', facing: side === 'near' ? -1 : 1, aiCooldown: 0,
})
const clock = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`

export function createGame(mode: GameMode = 'duel', difficulty: Difficulty = 'pro'): GameState {
  return {
    players: { near: player('near'), far: player('far') },
    teammates: { near: mode === 'squad' ? [player('near', 1), player('near', 2)] : [], far: mode === 'squad' ? [player('far', 1), player('far', 2)] : [] },
    activeJersey: { near: 1, far: 1 }, ball: { x: .5, y: .72, z: .42, vx: 0, vy: 0, vz: 0 },
    score: { near: 0, far: 0 }, sets: { near: 0, far: 0 }, serving: 'near', rally: 1,
    contacts: { near: 0, far: 0 }, status: 'ready', message: 'Tap HIT to serve', elapsed: 0, logs: [], revision: 0,
    mode, difficulty, wind: (Math.random() - .5) * .18, crowdEnergy: .12, lastTouch: null, pointTimer: 0,
  }
}

function addLog(state: GameState, text: string, tone: LogEntry['tone'] = 'info') {
  state.logs = [{ id: Date.now() + Math.random(), rally: state.rally, text, at: clock(state.elapsed), tone }, ...state.logs].slice(0, 24)
}
function resetTeam(state: GameState, side: Side) {
  const all = [player(side), ...(state.mode === 'squad' ? [player(side, 1), player(side, 2)] : [])]
  state.players[side] = all[0]; state.teammates[side] = all.slice(1); state.activeJersey[side] = 1
}
function resetRally(state: GameState) {
  resetTeam(state, 'near'); resetTeam(state, 'far')
  state.ball = { x: .5, y: state.serving === 'near' ? .72 : .36, z: .42, vx: 0, vy: 0, vz: 0 }
  state.contacts = { near: 0, far: 0 }; state.lastTouch = null; state.pointTimer = 0
  state.wind = clamp(state.wind * .35 + (Math.random() - .5) * .2, -.16, .16)
  state.crowdEnergy = Math.max(.1, state.crowdEnergy * .45)
  state.status = 'ready'; state.message = `${state.serving === 'near' ? 'PLAYER 1' : 'PLAYER 2'} to serve`
}
function awardPoint(state: GameState, winner: Side, reason: string) {
  if (state.status === 'point' || state.status === 'match') return
  state.score[winner] += 1; state.serving = winner; state.status = 'point'; state.crowdEnergy = 1; state.pointTimer = 1.3
  state.message = `Point — ${winner === 'near' ? 'PLAYER 1' : 'PLAYER 2'}`
  addLog(state, `${state.message} · ${reason}`, reason.includes('fault') || reason.includes('out') ? 'fault' : 'point')
  const a = state.score[winner], b = state.score[other(winner)]
  if (a >= 15 && a - b >= 2) {
    state.sets[winner] += 1; state.status = 'match'; state.message = `${winner === 'near' ? 'PLAYER 1' : 'PLAYER 2'} wins!`
    addLog(state, `${state.message} ${a}–${b}`, 'point')
  }
}

function smartActions(state: GameState, side: Side, input: InputState): InputState {
  if (!input.smart) return input
  const p = state.players[side], b = state.ball
  const close = Math.hypot((p.x - b.x) * 1.15, p.y - b.y) < .18
  return { ...input, bump: state.status === 'ready' || b.z < .28, jump: close && b.z >= .2, spike: close && b.z >= .24 }
}
function movePlayer(p: PlayerState, input: InputState, side: Side, dt: number, speedScale = 1) {
  const speed = .36 * speedScale
  let dx = (input.right ? 1 : 0) - (input.left ? 1 : 0), dy = (input.down ? 1 : 0) - (input.up ? 1 : 0)
  if (!dx && !dy && input.targetX != null && input.targetY != null) {
    const tx = input.targetX - p.x, ty = input.targetY - p.y, d = Math.hypot(tx, ty)
    if (d > .018) { dx = tx / d; dy = ty / d }
  }
  p.x = clamp(p.x + dx * speed * dt, .12, .88)
  const bounds = sideBounds(side); p.y = clamp(p.y + dy * speed * dt, bounds[0], bounds[1])
  if (dx) p.facing = dx > 0 ? 1 : -1
  if (input.jump && p.z <= .002) p.vz = 1.15
  p.vz -= 2.8 * dt; p.z = Math.max(0, p.z + p.vz * dt); if (p.z === 0 && p.vz < 0) p.vz = 0
  p.action = p.z > .02 ? (input.spike ? 'spike' : 'jump') : dx || dy ? 'run' : input.bump ? 'bump' : input.spike ? 'spike' : 'idle'
  p.aiCooldown = Math.max(0, p.aiCooldown - dt)
}
function difficultyConfig(level: Difficulty) {
  return level === 'rookie' ? { speed: .72, reach: .135, error: .22 } : level === 'legend' ? { speed: 1.15, reach: .19, error: .025 } : { speed: .94, reach: .165, error: .09 }
}
function aiInputFor(state: GameState, p: PlayerState, side: Side, slot: number, aggressive: boolean): InputState {
  const i: InputState = { left: false, right: false, up: false, down: false, jump: false, bump: false, spike: false, smart: false, targetX: null, targetY: null }
  const b = state.ball, bounds = sideBounds(side), home = formations[side][slot]
  const ballOnSide = state.status === 'playing' && (side === 'near' ? b.y > .49 : b.y < .51)
  const predictedX = clamp(b.x + b.vx * Math.max(0, b.z / Math.max(.25, Math.abs(b.vz) + .2)), .14, .86)
  i.targetX = ballOnSide ? predictedX : home[0]
  i.targetY = ballOnSide ? clamp(b.y + (side === 'near' ? .025 : -.025), bounds[0], bounds[1]) : home[1]
  const cfg = difficultyConfig(state.difficulty), near = Math.hypot((p.x - b.x) * 1.18, p.y - b.y) < cfg.reach
  if (near && b.z < .56 && Math.random() > cfg.error && p.aiCooldown <= 0) {
    i.bump = true; i.jump = b.z > .22; i.spike = aggressive && b.z > .24
  }
  return i
}
const allPlayers = (state: GameState, side: Side) => [state.players[side], ...state.teammates[side]]
function autoSelect(state: GameState, side: Side) {
  if (state.mode !== 'squad') return
  const b = state.ball, onSide = side === 'near' ? b.y > .49 : b.y < .51
  if (!onSide || state.status !== 'playing') return
  const team = allPlayers(state, side); let best = 0, bestDistance = Infinity
  team.forEach((p, index) => { const d = Math.hypot((p.x - b.x) * 1.1, p.y - b.y); if (d < bestDistance) { best = index; bestDistance = d } })
  if (best === 0) return
  const previous = state.players[side]; state.players[side] = state.teammates[side][best - 1]; state.teammates[side][best - 1] = previous
  state.activeJersey[side] = state.players[side].jersey
}
function hitBall(state: GameState, side: Side, p: PlayerState, input: InputState, reachBoost = 0) {
  const b = state.ball, distance = Math.hypot((p.x - b.x) * 1.16, p.y - b.y)
  if (distance >= .15 + reachBoost || b.z >= p.z + .36 || (!input.bump && !input.spike && !input.jump) || p.aiCooldown > .16) return false
  const direction = side === 'near' ? -1 : 1, isSpike = input.spike && p.z > .05
  const error = Math.random() < difficultyConfig(state.difficulty).error ? (Math.random() - .5) * .34 : 0
  b.vx = (b.x - p.x) * (isSpike ? 1.9 : 1.12) + error; b.vy = direction * (isSpike ? .88 : .60); b.vz = isSpike ? .50 : .88; b.z = Math.max(b.z, .20)
  state.contacts[side] += 1; state.contacts[other(side)] = 0; state.lastTouch = side; state.status = 'playing'
  state.crowdEnergy = clamp(state.crowdEnergy + (isSpike ? .18 : .07), 0, 1)
  state.message = isSpike ? 'POWER SPIKE!' : state.contacts[side] === 1 ? 'Nice receive' : state.contacts[side] === 2 ? 'Set it up!' : 'Final touch!'
  p.aiCooldown = .24; if (state.contacts[side] > 3) awardPoint(state, other(side), 'four-touch fault')
  return true
}
function updateTeammates(state: GameState, side: Side, dt: number) {
  const cfg = difficultyConfig(state.difficulty)
  state.teammates[side].forEach(p => {
    const ai = aiInputFor(state, p, side, Math.min(p.jersey - 1, 2), state.contacts[side] >= 2)
    movePlayer(p, ai, side, dt, cfg.speed * .92)
    if (state.status === 'playing') hitBall(state, side, p, ai, .012)
  })
}

export function tick(state: GameState, rawInputs: Record<Side, InputState>, dt: number, useAI: boolean): GameState {
  if (state.status === 'point' || state.status === 'match') {
    state.pointTimer -= dt; state.elapsed += dt; state.revision += 1
    if (state.pointTimer <= 0) {
      if (state.status === 'match') { state.score = { near: 0, far: 0 }; state.rally = 1 } else state.rally += 1
      resetRally(state)
    }
    return state
  }
  autoSelect(state, 'near'); autoSelect(state, 'far')
  const nearInput = smartActions(state, 'near', rawInputs.near)
  const farBase = useAI ? aiInputFor(state, state.players.far, 'far', Math.min(state.players.far.jersey - 1, 2), true) : rawInputs.far
  const farInput = smartActions(state, 'far', farBase), cfg = difficultyConfig(state.difficulty)
  movePlayer(state.players.near, nearInput, 'near', dt); movePlayer(state.players.far, farInput, 'far', dt, useAI ? cfg.speed : 1)
  updateTeammates(state, 'near', dt); updateTeammates(state, 'far', dt)
  if (state.status === 'ready') {
    const serveInput = state.serving === 'near' ? nearInput : farInput, p = state.players[state.serving]
    state.ball.x = p.x; state.ball.y = p.y + (state.serving === 'near' ? -.05 : .05); state.ball.z = p.z + .34
    if (serveInput.bump || serveInput.spike || serveInput.smart) {
      state.status = 'playing'; state.ball.vy = state.serving === 'near' ? -.62 : .62; state.ball.vx = (Math.random() - .5) * .18; state.ball.vz = .75; state.lastTouch = state.serving
      state.message = 'Serve!'; addLog(state, `${state.serving === 'near' ? 'PLAYER 1' : 'PLAYER 2'} served`)
    }
  } else {
    const b = state.ball
    b.vz -= 1.55 * dt; b.vx += state.wind * .055 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.vx *= .998
    hitBall(state, 'near', state.players.near, nearInput); hitBall(state, 'far', state.players.far, farInput, useAI ? .01 : 0)
    if (Math.abs(b.y - .5) < .018 && b.z < .27) awardPoint(state, other(state.lastTouch || (b.vy < 0 ? 'near' : 'far')), 'net fault')
    else if (b.z <= 0) {
      const inCourt = b.x >= .10 && b.x <= .90 && b.y >= .18 && b.y <= .92
      if (!inCourt) awardPoint(state, other(state.lastTouch || (b.vy < 0 ? 'near' : 'far')), 'ball out')
      else awardPoint(state, b.y > .5 ? 'far' : 'near', 'ball down')
    }
  }
  state.elapsed += dt; state.revision += 1; return state
}
