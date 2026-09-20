import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import confetti from 'canvas-confetti'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Copy, Expand, Gamepad2, HelpCircle, LogOut, Maximize2, MousePointer2, Move, RotateCcw, Share2, Sparkles, Volume2, VolumeX, Wifi, Wind, X } from 'lucide-react'
import { createGame, tick } from './game'
import { useNetwork } from './network'
import { emptyInput, type ActionName, type ControlScheme, type Difficulty, type GameMode, type GameState, type InputState, type PlayerState, type Side, type Uniform } from './types'

const keyMap: Record<string, ActionName> = {
  ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right', ArrowUp: 'up', w: 'up', ArrowDown: 'down', s: 'down',
  ' ': 'smart', z: 'bump', x: 'spike', Enter: 'smart',
}
const uniformLabels: Record<Uniform, string> = { coral: 'Coral', ocean: 'Ocean', gold: 'Gold', violet: 'Violet' }
const rivalUniform: Record<Uniform, Uniform> = { coral: 'ocean', ocean: 'coral', gold: 'violet', violet: 'gold' }

function useSound() {
  const [muted, setMuted] = useState(false)
  const play = useCallback((kind: 'hit' | 'point' | 'whistle' | 'crowd') => {
    if (muted) return
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx(), gain = ctx.createGain(); gain.connect(ctx.destination); const now = ctx.currentTime
    if (kind === 'crowd') {
      const buffer = ctx.createBuffer(1, ctx.sampleRate * .7, ctx.sampleRate), data = buffer.getChannelData(0)
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
      const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 850
      source.buffer = buffer; source.connect(filter); filter.connect(gain); gain.gain.setValueAtTime(.055, now); gain.gain.exponentialRampToValueAtTime(.001, now + .7)
      source.start(); source.onended = () => ctx.close(); return
    }
    const osc = ctx.createOscillator(); osc.connect(gain)
    const config = kind === 'point' ? [520, 880, .34] : kind === 'whistle' ? [1200, 1650, .18] : [135, 82, .09]
    osc.type = kind === 'hit' ? 'triangle' : 'sine'; osc.frequency.setValueAtTime(config[0], now); osc.frequency.exponentialRampToValueAtTime(config[1], now + config[2])
    gain.gain.setValueAtTime(.08, now); gain.gain.exponentialRampToValueAtTime(.001, now + config[2]); osc.start(now); osc.stop(now + config[2]); osc.onended = () => ctx.close()
  }, [muted])
  return { muted, setMuted, play }
}

const formatTime = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`

function ScoreCard({ label, score, sets, serving, tone }: { label: string; score: number; sets: number; serving: boolean; tone: 'coral' | 'teal' }) {
  return <div className={`score-card ${tone}`}><div className="score-label">{serving && <span className="serve-arrow">▶</span>}{label}</div><div className="score-value">{String(score).padStart(2, '0')}</div><div className="set-dots" aria-label={`${sets} sets won`}><i className={sets > 0 ? 'won' : ''}/><i className={sets > 1 ? 'won' : ''}/><i className={sets > 2 ? 'won' : ''}/></div></div>
}

function ControlButton({ action, label, icon, onChange, className = '' }: { action: ActionName; label: string; icon: React.ReactNode; onChange: (a: ActionName, down: boolean) => void; className?: string }) {
  return <button className={`control-button ${className}`} aria-label={label}
    onPointerDown={e => { e.preventDefault(); e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); onChange(action, true) }}
    onPointerUp={e => { e.stopPropagation(); onChange(action, false) }} onPointerCancel={() => onChange(action, false)}
    onClick={() => { onChange(action, true); window.setTimeout(() => onChange(action, false), 120) }}>{icon}<span>{label}</span></button>
}

function Choice<T extends string>({ value, current, children, onSelect }: { value: T; current: T; children: React.ReactNode; onSelect: (v: T) => void }) {
  return <button className={value === current ? 'selected' : ''} onClick={() => onSelect(value)}>{children}</button>
}

interface LobbyProps {
  onPractice: () => void; onCreate: (kind: 'peer' | 'lan') => void; onJoin: (room: string, kind: 'peer' | 'lan') => void
  initialRoom: string; initialTransport: 'peer' | 'lan'; mode: GameMode; setMode: (v: GameMode) => void
  difficulty: Difficulty; setDifficulty: (v: Difficulty) => void; controls: ControlScheme; setControls: (v: ControlScheme) => void
  uniform: Uniform; setUniform: (v: Uniform) => void
}

function Lobby(props: LobbyProps) {
  const [code, setCode] = useState(props.initialRoom)
  return <div className="lobby-overlay"><div className="lobby-card expanded-lobby">
    <div className="brand-lockup"><span className="brand-ball">✦</span><div><h1>SKYLINE<br/>VOLLEY</h1><p>Beach rallies, browser to browser.</p></div></div>
    {props.initialRoom ? <div className="lobby-actions"><p className="invite-copy">You’ve been invited to room <strong>{props.initialRoom}</strong>.</p><button className="primary-action" onClick={() => props.onJoin(props.initialRoom, props.initialTransport)}><Wifi/> Join match</button></div> : <>
      <div className="setup-grid">
        <div className="setup-group"><strong>GAME MODE</strong><div><Choice value="squad" current={props.mode} onSelect={props.setMode}>3v3 Squad</Choice><Choice value="duel" current={props.mode} onSelect={props.setMode}>1v1 Duel</Choice></div><p>{props.mode === 'squad' ? 'Control the best-positioned player; teammates cover automatically.' : 'One player per side. Pure positioning and timing.'}</p></div>
        <div className="setup-group"><strong>CPU LEVEL</strong><div>{(['rookie','pro','legend'] as Difficulty[]).map(v => <Choice key={v} value={v} current={props.difficulty} onSelect={props.setDifficulty}>{v}</Choice>)}</div></div>
        <div className="setup-group"><strong>TOUCH CONTROL</strong><div><Choice value="joystick" current={props.controls} onSelect={props.setControls}><Move/> Float</Choice><Choice value="tap" current={props.controls} onSelect={props.setControls}><MousePointer2/> Tap</Choice><Choice value="classic" current={props.controls} onSelect={props.setControls}><Gamepad2/> Buttons</Choice></div></div>
        <div className="setup-group"><strong>YOUR KIT</strong><div className="uniform-choices">{(['coral','ocean','gold','violet'] as Uniform[]).map(v => <Choice key={v} value={v} current={props.uniform} onSelect={props.setUniform}><i className={`kit-swatch ${v}`}/>{uniformLabels[v]}</Choice>)}</div></div>
      </div>
      <div className="lobby-actions"><button className="primary-action" onClick={props.onPractice}><Sparkles/> Play CPU challenge</button><button className="secondary-action" onClick={() => props.onCreate('peer')}><Share2/> Create online match</button><div className="join-row"><input value={code} onChange={e => setCode(e.target.value.toUpperCase())} maxLength={6} placeholder="ROOM CODE"/><button onClick={() => props.onJoin(code, 'peer')}>Join</button></div></div>
    </>}
    <div className="lan-box"><Wifi size={18}/><div><strong>No internet? Play on the same Wi‑Fi.</strong><p>Run <code>npm run lan</code>, open the shown Wi‑Fi address, then create a LAN match.</p></div>{!props.initialRoom && <button onClick={() => props.onCreate('lan')}>Create LAN</button>}</div>
    <p className="key-hint">Touch anywhere on your half to move · Space/Enter smart hit · WASD/arrows supported</p>
  </div></div>
}

function PlayerSprite({ player, side, active, showAuto, uniform, mapX, mapY, flip }: { player: PlayerState; side: Side; active: boolean; showAuto: boolean; uniform: Uniform; mapX: (n: number) => number; mapY: (n: number) => number; flip: boolean }) {
  const y = mapY(player.y), scale = .72 + y * .38
  return <div className={`player-wrap ${active ? 'active-player' : 'team-player'} side-${side}`} style={{ left: `${mapX(player.x) * 100}%`, top: `${(y - player.z * .24) * 100}%`, transform: `translate(-50%,-80%) scale(${scale}) ${flip ? 'scaleX(-1)' : ''}` }}>
    {active && showAuto && <span className="auto-label">AUTO {player.jersey}</span>}
    <div className={`player sprite-${player.action} uniform-${uniform}`}/><b>{player.jersey}</b>{player.action === 'run' && <i className="sand-puff"/>}
  </div>
}

export default function App() {
  const [mode, setMode] = useState<GameMode>('squad'), [difficulty, setDifficulty] = useState<Difficulty>('pro')
  const [controlScheme, setControlScheme] = useState<ControlScheme>('joystick'), [uniform, setUniform] = useState<Uniform>('coral')
  const [state, setState] = useState<GameState>(() => createGame('squad', 'pro'))
  const stateRef = useRef(state); stateRef.current = state
  const [input, setInput] = useState<InputState>(() => emptyInput()); const inputRef = useRef(input); inputRef.current = input
  const remoteInput = useRef<InputState>(emptyInput())
  const [started, setStarted] = useState(false), [practice, setPractice] = useState(false), [view, setView] = useState<'close' | 'far'>('close')
  const [showRules, setShowRules] = useState(false), [showLog, setShowLog] = useState(false), [copied, setCopied] = useState(false)
  const [joystick, setJoystick] = useState({ visible: false, x: 0, y: 0, dx: 0, dy: 0 })
  const joystickOrigin = useRef({ x: 0, y: 0, moved: false }); const courtRef = useRef<HTMLDivElement>(null)
  const { muted, setMuted, play } = useSound()

  const onMessage = useCallback((raw: unknown) => {
    const msg = raw as { type?: string; state?: GameState; input?: InputState }
    if (msg.type === 'state' && msg.state) { setState(msg.state); setMode(msg.state.mode); setDifficulty(msg.state.difficulty) }
    if (msg.type === 'input' && msg.input) remoteInput.current = msg.input
  }, [])
  const network = useNetwork(onMessage), mySide: Side = network.role === 'guest' ? 'far' : 'near', isHost = network.role !== 'guest'
  const query = useMemo(() => new URLSearchParams(location.search), []), initialRoom = query.get('room')?.toUpperCase() || '', initialTransport = query.get('transport') === 'lan' ? 'lan' : 'peer'

  useEffect(() => {
    const down = (e: KeyboardEvent) => { const a = keyMap[e.key]; if (a) { e.preventDefault(); setInput(v => ({ ...v, [a]: true })) } }
    const up = (e: KeyboardEvent) => { const a = keyMap[e.key]; if (a) { e.preventDefault(); setInput(v => ({ ...v, [a]: false })) } }
    addEventListener('keydown', down); addEventListener('keyup', up); return () => { removeEventListener('keydown', down); removeEventListener('keyup', up) }
  }, [])
  useEffect(() => {
    if (!started || !isHost) return
    let frame = 0, last = performance.now(), raf = 0
    const loop = (now: number) => {
      const dt = Math.min(.035, (now - last) / 1000); last = now
      const next = tick(stateRef.current, { near: inputRef.current, far: remoteInput.current }, dt, practice)
      setState({ ...next, players: { near: { ...next.players.near }, far: { ...next.players.far } }, teammates: { near: next.teammates.near.map(p => ({ ...p })), far: next.teammates.far.map(p => ({ ...p })) }, activeJersey: { ...next.activeJersey }, ball: { ...next.ball }, score: { ...next.score }, sets: { ...next.sets }, contacts: { ...next.contacts }, logs: [...next.logs] })
      if (!practice && network.status === 'connected' && frame++ % 2 === 0) network.send({ type: 'state', state: next })
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop); return () => cancelAnimationFrame(raf)
  }, [started, isHost, practice, network.status, network.send])
  useEffect(() => {
    if (!started || isHost || network.status !== 'connected') return
    const id = setInterval(() => network.send({ type: 'input', input: inputRef.current }), 32); return () => clearInterval(id)
  }, [started, isHost, network.status, network.send])

  const lastScore = useRef(0), lastContacts = useRef(0)
  useEffect(() => {
    const total = state.score.near + state.score.far
    if (total > lastScore.current) { play('point'); if (state.crowdEnergy > .7) play('crowd'); confetti({ particleCount: 86, spread: 70, origin: { y: .45 }, colors: ['#ff635c','#29d3d1','#ffd269','#fff'], disableForReducedMotion: true }) }
    lastScore.current = total
  }, [state.score.near, state.score.far, state.crowdEnergy, play])
  useEffect(() => { const n = state.contacts.near + state.contacts.far; if (n > lastContacts.current) play('hit'); lastContacts.current = n }, [state.contacts.near, state.contacts.far, play])

  const resetGame = useCallback((nextMode = mode, nextDifficulty = difficulty) => { const fresh = createGame(nextMode, nextDifficulty); stateRef.current = fresh; setState(fresh) }, [mode, difficulty])
  const beginPractice = () => { resetGame(); setPractice(true); setStarted(true) }
  const create = (kind: 'peer' | 'lan') => { resetGame(); network.create(kind); setPractice(false); setStarted(true) }
  const join = (room: string, kind: 'peer' | 'lan') => { network.join(room, kind); setPractice(false); setStarted(true) }
  const changeInput = (action: ActionName, down: boolean) => setInput(v => ({ ...v, [action]: down }))
  const pulseSmart = () => { setInput(v => ({ ...v, smart: true })); window.setTimeout(() => setInput(v => ({ ...v, smart: false })), 150) }
  const copyLink = async () => { await navigator.clipboard.writeText(network.shareUrl); setCopied(true); window.setTimeout(() => setCopied(false), 1400) }

  const flip = mySide === 'far' && view === 'close', mapX = (x: number) => flip ? 1 - x : x, mapY = (y: number) => flip ? 1 - y : y
  const displayToWorld = (x: number, y: number) => ({ x: flip ? 1 - x : x, y: flip ? 1 - y : y })
  const setMoveDirections = (dx: number, dy: number) => setInput(v => ({ ...v, left: dx < -.24, right: dx > .24, up: dy < -.24, down: dy > .24, targetX: null, targetY: null }))
  const courtPoint = (e: React.PointerEvent) => { const rect = courtRef.current!.getBoundingClientRect(); return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height } }
  const onCourtDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (controlScheme === 'classic' || (e.target as HTMLElement).closest('button')) return
    e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); const p = courtPoint(e), world = displayToWorld(p.x, p.y)
    const onMySide = mySide === 'near' ? world.y > .50 : world.y < .50; if (!onMySide) return
    if (controlScheme === 'tap') { setInput(v => ({ ...v, targetX: world.x, targetY: world.y })); return }
    joystickOrigin.current = { x: e.clientX, y: e.clientY, moved: false }; setJoystick({ visible: true, x: p.x, y: p.y, dx: 0, dy: 0 }); setInput(v => ({ ...v, targetX: null, targetY: null }))
  }
  const onCourtMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!joystick.visible || controlScheme !== 'joystick') return
    const dxPx = e.clientX - joystickOrigin.current.x, dyPx = e.clientY - joystickOrigin.current.y, d = Math.hypot(dxPx, dyPx), max = 54
    if (d > 8) joystickOrigin.current.moved = true
    const dx = Math.max(-1, Math.min(1, dxPx / max)), dy = Math.max(-1, Math.min(1, dyPx / max))
    setJoystick(v => ({ ...v, dx, dy })); const mapped = flip ? { dx: -dx, dy: -dy } : { dx, dy }; setMoveDirections(mapped.dx, mapped.dy)
  }
  const onCourtUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (controlScheme === 'joystick') {
      if (joystick.visible && !joystickOrigin.current.moved) {
        const p = courtPoint(e), world = displayToWorld(p.x, p.y)
        setInput(v => ({ ...v, left: false, right: false, up: false, down: false, targetX: world.x, targetY: world.y }))
      } else setInput(v => ({ ...v, left: false, right: false, up: false, down: false }))
      setJoystick(v => ({ ...v, visible: false }))
    }
  }

  const me = state.score[mySide], foeSide = mySide === 'near' ? 'far' : 'near', them = state.score[foeSide], mySets = state.sets[mySide], theirSets = state.sets[foeSide]
  const myUniform = uniform, foeUniform = rivalUniform[uniform], active = state.players[mySide], ballDistance = Math.hypot(active.x - state.ball.x, active.y - state.ball.y)
  const smartLabel = state.status === 'ready' && state.serving === mySide ? 'SERVE' : ballDistance < .2 && state.ball.z > .22 ? 'SPIKE' : state.ball.z > .3 && ballDistance < .23 ? 'BLOCK' : 'HIT'
  const allNear = [state.players.near, ...state.teammates.near], allFar = [state.players.far, ...state.teammates.far]
  const trajectory = [1,2,3].map(i => ({ x: state.ball.x + state.ball.vx * i * .1, y: state.ball.y + state.ball.vy * i * .1 - Math.max(0, state.ball.z + state.ball.vz * i * .1) * .26 }))

  return <main className="app-shell" data-mode={state.mode}>
    {!started && (
      <Lobby onPractice={beginPractice} onCreate={create} onJoin={join} initialRoom={initialRoom} initialTransport={initialTransport} mode={mode} setMode={setMode} difficulty={difficulty} setDifficulty={setDifficulty} controls={controlScheme} setControls={setControlScheme} uniform={uniform} setUniform={setUniform}/>
    )}
    <header className="topbar"><div className="mini-brand"><span>✦</span> SKYLINE VOLLEY</div><div className={`connection-status ${network.status}`}><i/>{practice ? `${state.mode === 'squad' ? '3v3' : '1v1'} · CPU ${state.difficulty.toUpperCase()}` : network.status === 'connected' ? 'LIVE · 2 PLAYERS' : network.status === 'waiting' ? `ROOM ${network.room}` : 'READY'}</div><div className="top-actions"><button onClick={() => setMuted(!muted)} aria-label={muted ? 'Turn sound on' : 'Mute sound'}>{muted ? <VolumeX/> : <Volume2/>}</button><button onClick={() => setShowRules(true)} aria-label="Rules"><HelpCircle/></button>{started && <button onClick={() => { network.leave(); setStarted(false); setPractice(false) }} aria-label="Leave"><LogOut/></button>}</div></header>

    <div className="game-layout"><section className={`game-frame view-${view} controls-${controlScheme}`}>
      <div className="scoreboard"><ScoreCard label="YOU" score={me} sets={mySets} serving={state.serving === mySide} tone="coral"/><div className="match-center"><strong>{formatTime(state.elapsed)}</strong><span>{state.mode === 'squad' ? '3v3 RALLY' : '1v1 DUEL'} · {state.difficulty.toUpperCase()}</span><small>SET {state.sets.near + state.sets.far + 1} · RALLY {String(state.rally).padStart(2, '0')}</small></div><ScoreCard label={practice ? 'CPU' : 'RIVAL'} score={them} sets={theirSets} serving={state.serving !== mySide} tone="teal"/></div>
      <div className="court" ref={courtRef} aria-label="Interactive vertical beach volleyball court" onPointerDown={onCourtDown} onPointerMove={onCourtMove} onPointerUp={onCourtUp} onPointerCancel={onCourtUp}>
        <div className="court-shade"/><div className="environment-hud"><div className="wind-meter"><Wind/> WIND {Math.round(Math.abs(state.wind) * 100)} <b>{state.wind >= 0 ? '→' : '←'}</b></div><div className="crowd-meter"><span>CROWD</span><i><b style={{ width: `${state.crowdEnergy * 100}%` }}/></i></div></div>
        <div className="net"><div className="net-tape"/></div><div className="center-message" data-show={state.status !== 'playing'}>{state.message}</div>
        {allNear.map(p => <PlayerSprite key={`near-${p.jersey}`} player={p} side="near" active={p === state.players.near} showAuto={state.mode === 'squad'} uniform={mySide === 'near' ? myUniform : foeUniform} mapX={mapX} mapY={mapY} flip={flip}/>)}
        {allFar.map(p => <PlayerSprite key={`far-${p.jersey}`} player={p} side="far" active={p === state.players.far} showAuto={state.mode === 'squad'} uniform={mySide === 'far' ? myUniform : foeUniform} mapX={mapX} mapY={mapY} flip={flip}/>)}
        {trajectory.map((p,i) => <i key={i} className="trajectory-dot" style={{ left: `${mapX(p.x) * 100}%`, top: `${mapY(p.y) * 100}%`, opacity: .65 - i * .15 }}/>) }
        <div className="ball-shadow" style={{ left: `${mapX(state.ball.x) * 100}%`, top: `${mapY(state.ball.y) * 100}%`, opacity: Math.max(.12, .56 - state.ball.z) }}/><div className="ball" style={{ left: `${mapX(state.ball.x) * 100}%`, top: `${(mapY(state.ball.y) - state.ball.z * .26) * 100}%`, transform: `translate(-50%,-50%) scale(${.7 + mapY(state.ball.y) * .42}) rotate(${state.revision * 5}deg)` }}/>
        <div className="contact-counter">{state.contacts[mySide]}/3 CONTACTS</div>
        {joystick.visible && <div className="floating-joystick" style={{ left: `${joystick.x * 100}%`, top: `${joystick.y * 100}%` }}><i style={{ transform: `translate(${joystick.dx * 34}px,${joystick.dy * 34}px)` }}/></div>}
        {controlScheme !== 'classic' && <button className={`smart-hit ${smartLabel.toLowerCase()}`} aria-label={`Smart hit: ${smartLabel}`} onPointerDown={e => { e.preventDefault(); e.stopPropagation(); pulseSmart() }} onClick={e => { e.stopPropagation(); pulseSmart() }}><span>◒</span><strong>{smartLabel}</strong><small>SMART</small></button>}
        {controlScheme !== 'classic' && <div className="control-hint">{controlScheme === 'joystick' ? 'DRAG ANYWHERE TO MOVE' : 'TAP YOUR COURT TO MOVE'}</div>}
      </div>
      {controlScheme === 'classic' && <div className="controls"><div className="move-pad"><ControlButton action="up" label="UP" icon={<ArrowUp/>} onChange={changeInput}/><ControlButton action="left" label="LEFT" icon={<ArrowLeft/>} onChange={changeInput}/><ControlButton action="down" label="DOWN" icon={<ArrowDown/>} onChange={changeInput}/><ControlButton action="right" label="RIGHT" icon={<ArrowRight/>} onChange={changeInput}/></div><div className="action-pad"><ControlButton action="jump" label="JUMP" icon={<ArrowUp/>} onChange={changeInput} className="jump"/><ControlButton action="bump" label="BUMP" icon={<span className="volley-icon">◒</span>} onChange={changeInput} className="bump"/><ControlButton action="spike" label="SPIKE" icon={<span className="spike-icon">✦</span>} onChange={changeInput} className="spike"/></div></div>}
      <div className="game-utility"><div className="control-switch"><button className={controlScheme === 'joystick' ? 'active' : ''} onClick={() => setControlScheme('joystick')}><Move/> Float</button><button className={controlScheme === 'tap' ? 'active' : ''} onClick={() => setControlScheme('tap')}><MousePointer2/> Tap</button><button className={controlScheme === 'classic' ? 'active' : ''} onClick={() => setControlScheme('classic')}><Gamepad2/> Buttons</button></div><div className="uniform-mini">{(['coral','ocean','gold','violet'] as Uniform[]).map(v => <button key={v} aria-label={`${uniformLabels[v]} uniform`} className={`${v} ${uniform === v ? 'active' : ''}`} onClick={() => setUniform(v)}/>)}</div></div>
    </section>

    <aside className={`side-panel ${showLog ? 'open' : ''}`}><button className="mobile-panel-close" onClick={() => setShowLog(false)}><X/></button><div className="panel-tabs"><button className="active">MATCH LOG</button><button onClick={() => setShowRules(true)}>RULES</button></div><div className="log-list">{state.logs.length ? state.logs.map(log => <div className={`log-entry ${log.tone}`} key={log.id}><div><strong>RALLY {String(log.rally).padStart(2, '0')}</strong><time>{log.at}</time></div><p>{log.text}</p></div>) : <div className="empty-log"><span>✦</span><p>Your best rallies will appear here.</p></div>}</div>
      {!practice && network.room && <div className="invite-panel"><strong>{network.status === 'connected' ? 'Opponent connected' : 'Invite your rival'}</strong><p>{network.status === 'connected' ? 'The match is synchronized in real time.' : 'Share this link. The room opens automatically.'}</p><button onClick={copyLink}><Copy/>{copied ? 'Copied!' : 'Copy invite link'}</button><code>{network.room}</code>{network.error && <em>{network.error}</em>}</div>}
      <div className="camera-panel"><strong>VIEW / CAMERA</strong><div><button className={view === 'close' ? 'active' : ''} onClick={() => setView('close')}><Maximize2/> CLOSE</button><button className={view === 'far' ? 'active' : ''} onClick={() => setView('far')}><Expand/> FAR</button></div><p>Close keeps you nearest. Far keeps Player 1 at the near baseline.</p></div>
      {practice && <div className="difficulty-panel"><strong>CPU DIFFICULTY</strong><div>{(['rookie','pro','legend'] as Difficulty[]).map(v => <button key={v} className={state.difficulty === v ? 'active' : ''} onClick={() => { setDifficulty(v); stateRef.current.difficulty = v; setState(s => ({ ...s, difficulty: v })) }}>{v}</button>)}</div></div>}
      <button className="reset-button" onClick={() => resetGame()} disabled={!isHost}><RotateCcw/> Restart match</button>
    </aside></div>
    <button className="mobile-log-button" onClick={() => setShowLog(true)}>MATCH LOG <span>{state.logs.length}</span></button>
    {showRules && <div className="modal-backdrop" onClick={() => setShowRules(false)}><div className="rules-modal" onClick={e => e.stopPropagation()}><button className="modal-close" onClick={() => setShowRules(false)}><X/></button><h2>Rules & physics</h2><ol><li><strong>Rally scoring.</strong> First to 15 wins, but the winner must lead by two.</li><li><strong>Three contacts.</strong> Your team must return the ball within three touches. A block counts as a team touch in this adaptation.</li><li><strong>In, out and net.</strong> Boundary lines are in. Ground contact ends the rally; a ball that fails to clear the net is a fault.</li><li><strong>Smart play.</strong> HIT serves or bumps low balls, jumps for high balls and spikes when you are airborne and close.</li><li><strong>3v3 arcade mode.</strong> The nearest teammate is auto-selected while the other two cover open court. Official beach volleyball is normally 2v2; this mode is intentionally an arcade variant.</li><li><strong>Environment.</strong> Wind gently bends the ball, sand reduces acceleration, and crowd energy rises during longer, harder rallies.</li></ol><p className="rules-note">Player contact with the net, substitutions, rotations, time-outs and side changes are simplified to keep browser matches fast.</p></div></div>}
  </main>
}
