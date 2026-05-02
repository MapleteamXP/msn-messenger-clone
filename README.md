# MSN Messenger Clone

A fully working, real-time MSN Messenger clone built with Node.js, Socket.io, and SQLite.

## Features

- **Real-time messaging** via WebSocket (Socket.io)
- **User accounts** with username/password authentication
- **Contact list** with online/away/busy/offline status indicators
- **Multiple chat windows** — draggable, minimizable, closable
- **Typing indicators** — see when someone is typing
- **Nudge feature** — shake the chat window!
- **Message history** — saved in SQLite database
- **Contact requests** — add contacts, accept/decline requests
- **Classic MSN UI** — Windows Live Messenger 2009 styling
- **Sound effects** — Web Audio API generated sounds
- **Toast notifications** — for new messages and nudges
- **Mobile responsive** — works on phones too

## Quick Start

```bash
# Install dependencies
npm install

# Start the server
npm start

# Or for development with auto-reload
npm run dev
```

Then open `http://localhost:3000` in your browser.

## Deployment

### Render / Railway / Heroku
1. Push to GitHub
2. Connect repo to platform
3. Set `PORT` env var (or let platform auto-set)
4. Deploy!

### VPS / Self-hosted
```bash
git clone <repo-url>
cd msn-messenger-clone
npm install
npm start
# Runs on port 3000 by default
```

### Using PM2 (production)
```bash
npm install -g pm2
pm2 start server/server.js --name msn-messenger
pm2 save
pm2 startup
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Node.js + Express |
| Real-time | Socket.io |
| Database | SQLite (better-sqlite3) |
| Frontend | Vanilla HTML/CSS/JS |
| Auth | SHA-256 password hashing |

## Database Schema

```sql
users: id, username, password_hash, display_name, status, last_seen
contacts: id, user_id, contact_id, status (pending/accepted)
messages: id, sender_id, receiver_id, content, timestamp, is_read
```

## File Structure

```
msn-messenger-clone/
├── server/
│   └── server.js          # Express + Socket.io server
├── public/
│   ├── index.html         # Main UI
│   ├── css/
│   │   └── style.css      # MSN Messenger styling
│   └── js/
│       └── app.js         # Frontend logic
├── package.json
└── README.md
```

## API Events (Socket.io)

### Client → Server
- `user:register` — Create account
- `user:login` — Authenticate
- `user:status` — Change status
- `contacts:add` — Add contact
- `contacts:accept` — Accept request
- `contacts:remove` — Remove contact
- `message:send` — Send message
- `message:history` — Get chat history
- `typing:start` / `typing:stop`
- `nudge:send`

### Server → Client
- `message:receive` — New message
- `typing:start` / `typing:stop`
- `nudge:receive`
- `contact:status` — Contact status change
- `contacts:pending` — New contact request

## Notes

- Passwords are hashed with SHA-256 + salt
- Messages are stored in SQLite (persistent)
- All real-time communication via WebSocket
- No external APIs required — fully self-contained
- Works offline between users on the same server

## License

MIT — Built by Mapley 🫡
