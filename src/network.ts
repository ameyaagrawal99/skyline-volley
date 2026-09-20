import { useCallback, useEffect, useRef, useState } from 'react'
import Peer, { type DataConnection } from 'peerjs'
import { io, type Socket } from 'socket.io-client'

export type NetworkRole = 'solo' | 'host' | 'guest'
export type NetworkStatus = 'idle' | 'opening' | 'waiting' | 'connected' | 'error'
type MessageHandler = (data: unknown) => void

const randomRoom = () => Math.random().toString(36).slice(2, 8).toUpperCase()
const peerId = (room: string) => `skyline-volley-${room.toLowerCase()}`

export function useNetwork(onMessage: MessageHandler) {
  const [role, setRole] = useState<NetworkRole>('solo')
  const [status, setStatus] = useState<NetworkStatus>('idle')
  const [room, setRoom] = useState('')
  const [error, setError] = useState('')
  const handler = useRef(onMessage)
  const peer = useRef<Peer | null>(null)
  const connection = useRef<DataConnection | null>(null)
  const socket = useRef<Socket | null>(null)
  const transport = useRef<'peer' | 'lan'>('peer')

  useEffect(() => { handler.current = onMessage }, [onMessage])

  const bindConnection = useCallback((conn: DataConnection) => {
    connection.current = conn
    conn.on('open', () => setStatus('connected'))
    conn.on('data', data => handler.current(data))
    conn.on('close', () => setStatus('waiting'))
    conn.on('error', err => { setError(err.message); setStatus('error') })
  }, [])

  const create = useCallback((kind: 'peer' | 'lan' = 'peer') => {
    const id = randomRoom()
    setRoom(id); setRole('host'); setStatus('opening'); setError(''); transport.current = kind
    if (kind === 'lan') {
      const s = io(); socket.current = s
      s.on('connect', () => s.emit('room:create', { room: id }, (r: { ok: boolean; error?: string }) => {
        if (r.ok) setStatus('waiting'); else { setError(r.error || 'Could not create room'); setStatus('error') }
      }))
      s.on('peer:joined', () => setStatus('connected'))
      s.on('peer:left', () => setStatus('waiting'))
      s.on('game:message', data => handler.current(data))
      s.on('connect_error', () => { setError('LAN server not found. Start it with npm run lan.'); setStatus('error') })
      return id
    }
    const p = new Peer(peerId(id)); peer.current = p
    p.on('open', () => setStatus('waiting'))
    p.on('connection', bindConnection)
    p.on('error', err => { setError(err.type === 'unavailable-id' ? 'Room code was taken. Try again.' : err.message); setStatus('error') })
    return id
  }, [bindConnection])

  const join = useCallback((id: string, kind: 'peer' | 'lan' = 'peer') => {
    const clean = id.trim().toUpperCase()
    if (!clean) return
    setRoom(clean); setRole('guest'); setStatus('opening'); setError(''); transport.current = kind
    if (kind === 'lan') {
      const s = io(); socket.current = s
      s.on('connect', () => s.emit('room:join', { room: clean }, (r: { ok: boolean; error?: string }) => {
        if (r.ok) setStatus('connected'); else { setError(r.error || 'Could not join room'); setStatus('error') }
      }))
      s.on('game:message', data => handler.current(data))
      s.on('peer:left', () => setStatus('waiting'))
      s.on('connect_error', () => { setError('LAN server not found. Open the Wi-Fi link shared by the host.'); setStatus('error') })
      return
    }
    const p = new Peer(); peer.current = p
    p.on('open', () => bindConnection(p.connect(peerId(clean), { reliable: true })))
    p.on('error', err => { setError(err.message); setStatus('error') })
  }, [bindConnection])

  const send = useCallback((data: unknown) => {
    if (transport.current === 'lan') socket.current?.emit('game:message', data)
    else if (connection.current?.open) connection.current.send(data)
  }, [])

  const leave = useCallback(() => {
    connection.current?.close(); peer.current?.destroy(); socket.current?.disconnect()
    connection.current = null; peer.current = null; socket.current = null
    setRole('solo'); setStatus('idle'); setRoom(''); setError('')
  }, [])

  useEffect(() => () => {
    connection.current?.close(); peer.current?.destroy(); socket.current?.disconnect()
  }, [])

  const shareUrl = room ? `${location.origin}${location.pathname}?room=${room}${transport.current === 'lan' ? '&transport=lan' : ''}` : ''
  return { role, status, room, error, shareUrl, create, join, send, leave }
}
