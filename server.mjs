import express from 'express'
import { createServer } from 'node:http'
import { networkInterfaces } from 'node:os'
import { Server } from 'socket.io'

const app = express()
const server = createServer(app)
const io = new Server(server)
const port = Number(process.env.PORT || 4173)
const rooms = new Map()

app.use(express.static('dist'))
app.get('{*splat}', (_req, res) => res.sendFile(new URL('./dist/index.html', import.meta.url).pathname))

io.on('connection', socket => {
  socket.on('room:create', ({ room }, ack) => {
    const id = String(room).toUpperCase()
    if (rooms.has(id)) return ack?.({ ok: false, error: 'Room already exists' })
    rooms.set(id, { host: socket.id, guest: null })
    socket.join(id)
    socket.data.room = id
    socket.data.role = 'host'
    ack?.({ ok: true })
  })
  socket.on('room:join', ({ room }, ack) => {
    const id = String(room).toUpperCase()
    const match = rooms.get(id)
    if (!match || match.guest) return ack?.({ ok: false, error: match ? 'Room is full' : 'Room not found' })
    match.guest = socket.id
    socket.join(id)
    socket.data.room = id
    socket.data.role = 'guest'
    io.to(match.host).emit('peer:joined')
    ack?.({ ok: true })
  })
  socket.on('game:message', data => {
    if (socket.data.room) socket.to(socket.data.room).emit('game:message', data)
  })
  socket.on('disconnect', () => {
    const id = socket.data.room
    if (!id) return
    const match = rooms.get(id)
    if (!match) return
    socket.to(id).emit('peer:left')
    if (socket.data.role === 'host') rooms.delete(id)
    else match.guest = null
  })
})

server.listen(port, '0.0.0.0', () => {
  const ips = Object.values(networkInterfaces()).flat().filter(x => x && x.family === 'IPv4' && !x.internal).map(x => x.address)
  console.log(`\nSkyline Volley is live:`)
  console.log(`  This computer: http://localhost:${port}`)
  ips.forEach(ip => console.log(`  Same Wi-Fi:    http://${ip}:${port}`))
  console.log('\nKeep this terminal open while playing.\n')
})
