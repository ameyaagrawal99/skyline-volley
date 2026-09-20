import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import confetti from 'canvas-confetti'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Copy, Expand, HelpCircle, LogOut, Maximize2, RotateCcw, Share2, Volume2, VolumeX, Wifi, X } from 'lucide-react'
import { createGame, tick } from './game'
import { useNetwork } from './network'
import { emptyInput, type ActionName, type GameState, type InputState, type Side } from './types'

const keyMap: Record<string, ActionName> = {
  ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right', ArrowUp: 'up', w: 'up', ArrowDown: 'down', s: 'down',
  ' ': 'jump', z: 'bump', x: 'spike', Enter: 'bump',
}

function useSound() {
  const [muted, setMuted] = useState(false)
  const play = useCallback((kind: 'hit' | 'point' | 'whistle') => {
    if (muted) return
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    const gain = ctx.createGain(); gain.connect(ctx.destination)
    const osc = ctx.createOscillator(); osc.connect(gain)
    const now = ctx.currentTime
    const config = kind === 'point' ? [520, 880, .34] : kind === 'whistle' ? [1200, 1650, .18] : [135, 82, .09]
    osc.type = kind === 'hit' ? 'triangle' : 'sine'
    osc.frequency.setValueAtTime(config[0], now); osc.frequency.exponentialRampToValueAtTime(config[1], now + config[2])
    gain.gain.setValueAtTime(.08, now); gain.gain.exponentialRampToValueAtTime(.001, now + config[2])
    osc.start(now); osc.stop(now + config[2]); osc.onended = () => ctx.close()
  }, [muted])
  return { muted, setMuted, play }
}

function formatTime(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}

function ScoreCard({ label, score, sets, serving, tone }: { label: string; score: number; sets: number; serving: boolean; tone: 'coral' | 'teal' }) {
  return <div className={`score-card ${tone}`}>
    <div className="score-label">{serving && <span className="serve-arrow">▶</span>}{label}</div>
    <div className="score-value">{String(score).padStart(2, '0')}</div>
    <div className="set-dots" aria-label={`${sets} sets won`}><i className={sets > 0 ? 'won' : ''}/><i className={sets > 1 ? 'won' : ''}/><i className={sets > 2 ? 'won' : ''}/></div>
  </div>
}

function ControlButton({ action, label, icon, onChange, className = '' }: { action: ActionName; label: string; icon: React.ReactNode; onChange: (a: ActionName, down: boolean) => void; className?: string }) {
  return <button className={`control-button ${className}`} aria-label={label}
    onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); onChange(action, true) }}
    onPointerUp={() => onChange(action, false)} onPointerCancel={() => onChange(action, false)} onPointerLeave={() => onChange(action, false)}
    onClick={() => { onChange(action, true); window.setTimeout(() => onChange(action, false), 110) }}>
    {icon}<span>{label}</span>
  </button>
}

function Lobby({ onPractice, onCreate, onJoin, initialRoom, initialTransport }: { onPractice: () => void; onCreate: (kind: 'peer' | 'lan') => void; onJoin: (room: string, kind: 'peer' | 'lan') => void; initialRoom: string; initialTransport: 'peer' | 'lan' }) {
  const [code, setCode] = useState(initialRoom)
  return <div className="lobby-overlay">
    <div className="lobby-card">
      <div className="brand-lockup"><span className="brand-ball">✦</span><div><h1>SKYLINE<br/>VOLLEY</h1><p>Beach rallies, browser to browser.</p></div></div>
      <div className="lobby-actions">
        {initialRoom ? <>
          <p className="invite-copy">You’ve been invited to room <strong>{initialRoom}</strong>.</p>
          <button className="primary-action" onClick={() => onJoin(initialRoom, initialTransport)}><Wifi/> Join match</button>
        </> : <>
          <button className="primary-action" onClick={() => onCreate('peer')}><Share2/> Create online match</button>
          <button className="secondary-action" onClick={onPractice}>Practice against AI</button>
          <div className="join-row"><input value={code} onChange={e => setCode(e.target.value.toUpperCase())} maxLength={6} placeholder="ROOM CODE"/><button onClick={() => onJoin(code, 'peer')}>Join</button></div>
        </>}
      </div>
      <div className="lan-box"><Wifi size={18}/><div><strong>No internet? Play on the same Wi‑Fi.</strong><p>On the host computer run <code>npm run lan</code>, open the shown Wi‑Fi address, then create a LAN match.</p></div>{!initialRoom && <button onClick={() => onCreate('lan')}>Create LAN</button>}</div>
      <p className="key-hint">Keyboard: WASD / arrows · Space jump · Z bump · X spike</p>
    </div>
  </div>
}

export default function App() {
  const [state, setState] = useState<GameState>(() => createGame())
  const stateRef = useRef(state); stateRef.current = state
  const [input, setInput] = useState<InputState>(() => emptyInput())
  const inputRef = useRef(input); inputRef.current = input
  const remoteInput = useRef<InputState>(emptyInput())
  const [started, setStarted] = useState(false)
  const [practice, setPractice] = useState(false)
  const [view, setView] = useState<'close' | 'far'>('close')
  const [showRules, setShowRules] = useState(false)
  const [showLog, setShowLog] = useState(false)
  const [copied, setCopied] = useState(false)
  const { muted, setMuted, play } = useSound()

  const onMessage = useCallback((raw: unknown) => {
    const msg = raw as { type?: string; state?: GameState; input?: InputState }
    if (msg.type === 'state' && msg.state) setState(msg.state)
    if (msg.type === 'input' && msg.input) remoteInput.current = msg.input
  }, [])
  const network = useNetwork(onMessage)
  const mySide: Side = network.role === 'guest' ? 'far' : 'near'
  const isHost = network.role !== 'guest'

  const query = useMemo(() => new URLSearchParams(location.search), [])
  const initialRoom = query.get('room')?.toUpperCase() || ''
  const initialTransport = query.get('transport') === 'lan' ? 'lan' : 'peer'

  useEffect(() => {
    const down = (e: KeyboardEvent) => { const a = keyMap[e.key]; if (a) { e.preventDefault(); setInput(v => ({ ...v, [a]: true })) } }
    const up = (e: KeyboardEvent) => { const a = keyMap[e.key]; if (a) { e.preventDefault(); setInput(v => ({ ...v, [a]: false })) } }
    addEventListener('keydown', down); addEventListener('keyup', up)
    return () => { removeEventListener('keydown', down); removeEventListener('keyup', up) }
  }, [])

  useEffect(() => {
    if (!started || !isHost) return
    let frame = 0; let last = performance.now(); let raf = 0
    const loop = (now: number) => {
      const dt = Math.min(.035, (now - last) / 1000); last = now
      const inputs = { near: inputRef.current, far: remoteInput.current }
      const next = tick(stateRef.current, inputs, dt, practice)
      setState({ ...next, players: { near: { ...next.players.near }, far: { ...next.players.far } }, ball: { ...next.ball }, score: { ...next.score }, sets: { ...next.sets }, contacts: { ...next.contacts }, logs: [...next.logs] })
      if (!practice && network.status === 'connected' && frame++ % 2 === 0) network.send({ type: 'state', state: next })
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [started, isHost, practice, network.status, network.send])

  useEffect(() => {
    if (!started || isHost || network.status !== 'connected') return
    const id = setInterval(() => network.send({ type: 'input', input: inputRef.current }), 32)
    return () => clearInterval(id)
  }, [started, isHost, network.status, network.send])

  const lastScore = useRef(0)
  useEffect(() => {
    const total = state.score.near + state.score.far
    if (total > lastScore.current) {
      play('point')
      confetti({ particleCount: 76, spread: 64, origin: { y: .45 }, colors: ['#ff635c', '#29d3d1', '#ffd269', '#ffffff'], disableForReducedMotion: true })
    }
    lastScore.current = total
  }, [state.score.near, state.score.far, play])

  const changeInput = (action: ActionName, down: boolean) => setInput(v => ({ ...v, [action]: down }))
  const beginPractice = () => { setPractice(true); setStarted(true) }
  const create = (kind: 'peer' | 'lan') => { network.create(kind); setPractice(false); setStarted(true) }
  const join = (room: string, kind: 'peer' | 'lan') => { network.join(room, kind); setPractice(false); setStarted(true) }
  const copyLink = async () => { await navigator.clipboard.writeText(network.shareUrl); setCopied(true); setTimeout(() => setCopied(false), 1400) }
  const reset = () => { if (isHost) setState(createGame()) }

  const flip = mySide === 'far' && view === 'close'
  const mapX = (x: number) => flip ? 1 - x : x
  const mapY = (y: number) => flip ? 1 - y : y
  const pNear = state.players.near, pFar = state.players.far
  const me = state.score[mySide], them = state.score[mySide === 'near' ? 'far' : 'near']
  const mySets = state.sets[mySide], theirSets = state.sets[mySide === 'near' ? 'far' : 'near']

  return <main className="app-shell">
    {!started && <Lobby onPractice={beginPractice} onCreate={create} onJoin={join} initialRoom={initialRoom} initialTransport={initialTransport}/>} 
    <header className="topbar">
      <div className="mini-brand"><span>✦</span> SKYLINE VOLLEY</div>
      <div className={`connection-status ${network.status}`}><i/>{practice ? 'AI PRACTICE' : network.status === 'connected' ? 'LIVE · 2 PLAYERS' : network.status === 'waiting' ? `ROOM ${network.room}` : 'READY'}</div>
      <div className="top-actions">
        <button onClick={() => setMuted(!muted)} aria-label={muted ? 'Turn sound on' : 'Mute sound'}>{muted ? <VolumeX/> : <Volume2/>}</button>
        <button onClick={() => setShowRules(true)} aria-label="Rules"><HelpCircle/></button>
        {started && <button onClick={() => { network.leave(); setStarted(false); setPractice(false) }} aria-label="Leave"><LogOut/></button>}
      </div>
    </header>

    <div className="game-layout">
      <section className={`game-frame view-${view}`}>
        <div className="scoreboard">
          <ScoreCard label="YOU" score={me} sets={mySets} serving={state.serving === mySide} tone="coral"/>
          <div className="match-center"><strong>{formatTime(state.elapsed)}</strong><span>FIRST TO 15 · WIN BY 2</span><small>SET {state.sets.near + state.sets.far + 1} · RALLY {String(state.rally).padStart(2, '0')}</small></div>
          <ScoreCard label={practice ? 'AI RIVAL' : 'RIVAL'} score={them} sets={theirSets} serving={state.serving !== mySide} tone="teal"/>
        </div>

        <div className="court" aria-label="Vertical beach volleyball court">
          <div className="court-shade"/>
          <div className="net"><div className="net-tape"/></div>
          <div className="center-message" data-show={state.status !== 'playing'}>{state.message}</div>
          <div className={`player sprite-${pNear.action} near-player ${mySide === 'near' ? 'is-me' : 'is-rival'}`} style={{ left: `${mapX(pNear.x) * 100}%`, top: `${(mapY(pNear.y) - pNear.z * .24) * 100}%`, transform: `translate(-50%,-80%) scale(${.72 + mapY(pNear.y) * .38}) ${flip ? 'scaleX(-1)' : ''}` }}/>
          <div className={`player sprite-${pFar.action} far-player ${mySide === 'far' ? 'is-me' : 'is-rival'}`} style={{ left: `${mapX(pFar.x) * 100}%`, top: `${(mapY(pFar.y) - pFar.z * .24) * 100}%`, transform: `translate(-50%,-80%) scale(${.72 + mapY(pFar.y) * .38}) ${flip ? 'scaleX(-1)' : ''}` }}/>
          <div className="ball-shadow" style={{ left: `${mapX(state.ball.x) * 100}%`, top: `${mapY(state.ball.y) * 100}%`, opacity: Math.max(.12, .56 - state.ball.z) }}/>
          <div className="ball" style={{ left: `${mapX(state.ball.x) * 100}%`, top: `${(mapY(state.ball.y) - state.ball.z * .26) * 100}%`, transform: `translate(-50%,-50%) scale(${.7 + mapY(state.ball.y) * .42}) rotate(${state.revision * 5}deg)` }}/>
          <div className="contact-counter">{state.contacts[mySide]}/3 CONTACTS</div>
        </div>

        <div className="controls">
          <div className="move-pad">
            <ControlButton action="up" label="UP" icon={<ArrowUp/>} onChange={changeInput}/>
            <ControlButton action="left" label="LEFT" icon={<ArrowLeft/>} onChange={changeInput}/>
            <ControlButton action="down" label="DOWN" icon={<ArrowDown/>} onChange={changeInput}/>
            <ControlButton action="right" label="RIGHT" icon={<ArrowRight/>} onChange={changeInput}/>
          </div>
          <div className="action-pad">
            <ControlButton action="jump" label="JUMP" icon={<ArrowUp/>} onChange={changeInput} className="jump"/>
            <ControlButton action="bump" label="BUMP" icon={<span className="volley-icon">◒</span>} onChange={changeInput} className="bump"/>
            <ControlButton action="spike" label="SPIKE" icon={<span className="spike-icon">✦</span>} onChange={changeInput} className="spike"/>
          </div>
        </div>
      </section>

      <aside className={`side-panel ${showLog ? 'open' : ''}`}>
        <button className="mobile-panel-close" onClick={() => setShowLog(false)}><X/></button>
        <div className="panel-tabs"><button className="active">MATCH LOG</button><button onClick={() => setShowRules(true)}>RULES</button></div>
        <div className="log-list">{state.logs.length ? state.logs.map(log => <div className={`log-entry ${log.tone}`} key={log.id}><div><strong>RALLY {String(log.rally).padStart(2, '0')}</strong><time>{log.at}</time></div><p>{log.text}</p></div>) : <div className="empty-log"><span>✦</span><p>Your best rallies will appear here.</p></div>}</div>
        {!practice && network.room && <div className="invite-panel"><strong>{network.status === 'connected' ? 'Opponent connected' : 'Invite your rival'}</strong><p>{network.status === 'connected' ? 'The match is synchronized peer to peer.' : 'Share this link. The room opens automatically.'}</p><button onClick={copyLink}><Copy/>{copied ? 'Copied!' : 'Copy invite link'}</button><code>{network.room}</code>{network.error && <em>{network.error}</em>}</div>}
        <div className="camera-panel"><strong>VIEW / CAMERA</strong><div><button className={view === 'close' ? 'active' : ''} onClick={() => setView('close')}><Maximize2/> CLOSE</button><button className={view === 'far' ? 'active' : ''} onClick={() => setView('far')}><Expand/> FAR</button></div><p>Close keeps you nearest. Far keeps Player 1 at the near baseline.</p></div>
        <button className="reset-button" onClick={reset} disabled={!isHost}><RotateCcw/> Restart match</button>
      </aside>
    </div>

    <button className="mobile-log-button" onClick={() => setShowLog(true)}>MATCH LOG <span>{state.logs.length}</span></button>

    {showRules && <div className="modal-backdrop" onClick={() => setShowRules(false)}><div className="rules-modal" onClick={e => e.stopPropagation()}><button className="modal-close" onClick={() => setShowRules(false)}><X/></button><h2>How to play</h2><ol><li><strong>Score.</strong> Land the ball inside your rival’s court. First to 15 wins, but you must lead by two.</li><li><strong>Three contacts.</strong> Return the ball within three touches. A fourth touch is a fault.</li><li><strong>Stay clean.</strong> A ball into the net or beyond the court lines awards the rally to your rival.</li><li><strong>Build the play.</strong> Bump to control, jump near the ball, then spike from the air for a faster attack.</li></ol><p className="rules-note">This is a fast 1-v-1 adaptation of beach volleyball. Court changes and rotation are omitted.</p></div></div>}
  </main>
}
