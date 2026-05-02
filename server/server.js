const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// Database setup
const db = new Database(path.join(__dirname, '../msn.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    status TEXT DEFAULT 'offline',
    last_seen INTEGER,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  );
  
  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    contact_id INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    UNIQUE(user_id, contact_id)
  );
  
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL,
    receiver_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    timestamp INTEGER DEFAULT (strftime('%s', 'now')),
    is_read INTEGER DEFAULT 0
  );
`);

// Prepared statements
const registerUser = db.prepare('INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)');
const loginUser = db.prepare('SELECT * FROM users WHERE username = ? AND password_hash = ?');
const updateStatus = db.prepare('UPDATE users SET status = ?, last_seen = ? WHERE id = ?');
const getUserById = db.prepare('SELECT id, username, display_name, status FROM users WHERE id = ?');
const getUserByUsername = db.prepare('SELECT id FROM users WHERE username = ?');
const addContact = db.prepare('INSERT INTO contacts (user_id, contact_id, status) VALUES (?, ?, ?)');
const getContacts = db.prepare(`
  SELECT u.id, u.username, u.display_name, u.status
  FROM contacts c
  JOIN users u ON u.id = c.contact_id
  WHERE c.user_id = ? AND c.status = 'accepted'
`);
const getPendingContacts = db.prepare(`
  SELECT u.id, u.username, u.display_name
  FROM contacts c
  JOIN users u ON u.id = c.contact_id
  WHERE c.user_id = ? AND c.status = 'pending'
`);
const acceptContact = db.prepare("UPDATE contacts SET status = 'accepted' WHERE user_id = ? AND contact_id = ?");
const removeContact = db.prepare('DELETE FROM contacts WHERE user_id = ? AND contact_id = ?');
const insertMessage = db.prepare('INSERT INTO messages (sender_id, receiver_id, content) VALUES (?, ?, ?)');
const getMessages = db.prepare(`
  SELECT * FROM messages 
  WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
  ORDER BY timestamp DESC
  LIMIT 200
`);
const markRead = db.prepare('UPDATE messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ? AND is_read = 0');

// Hash password
function hashPassword(password) {
  return crypto.createHash('sha256').update(password + 'msn-salt-2024').digest('hex');
}

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Track online users
const onlineUsers = new Map();

io.on('connection', (socket) => {
  console.log('[MSN] Client connected:', socket.id);
  
  // REGISTER
  socket.on('user:register', ({ username, password, display_name }, callback) => {
    try {
      const hash = hashPassword(password);
      const result = registerUser.run(username, hash, display_name || username);
      callback({ success: true, userId: result.lastInsertRowid });
    } catch (err) {
      callback({ success: false, error: 'Username already taken' });
    }
  });
  
  // LOGIN
  socket.on('user:login', ({ username, password }, callback) => {
    const hash = hashPassword(password);
    const user = loginUser.get(username, hash);
    
    if (!user) {
      callback({ success: false, error: 'Invalid username or password' });
      return;
    }
    
    updateStatus.run('online', Date.now(), user.id);
    
    onlineUsers.set(socket.id, {
      userId: user.id,
      username: user.username,
      displayName: user.display_name || user.username,
      status: 'online'
    });
    
    const contacts = getContacts.all(user.id);
    const pending = getPendingContacts.all(user.id);
    
    callback({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        display_name: user.display_name || user.username,
        status: 'online'
      },
      contacts,
      pending
    });
    
    notifyContactsStatus(user.id, 'online');
  });
  
  // STATUS CHANGE
  socket.on('user:status', ({ status }) => {
    const user = onlineUsers.get(socket.id);
    if (!user) return;
    
    user.status = status;
    updateStatus.run(status, Date.now(), user.userId);
    notifyContactsStatus(user.userId, status);
  });
  
  // ADD CONTACT
  socket.on('contacts:add', ({ username }, callback) => {
    const user = onlineUsers.get(socket.id);
    if (!user) return callback({ success: false, error: 'Not logged in' });
    
    const contact = getUserByUsername.get(username);
    if (!contact) return callback({ success: false, error: 'User not found' });
    if (contact.id === user.userId) return callback({ success: false, error: 'Cannot add yourself' });
    
    try {
      addContact.run(user.userId, contact.id, 'pending');
      addContact.run(contact.id, user.userId, 'pending');
      
      // Notify the other user
      for (const [sockId, u] of onlineUsers) {
        if (u.userId === contact.id) {
          io.to(sockId).emit('contacts:pending', {
            id: user.userId,
            username: user.username,
            display_name: user.displayName
          });
        }
      }
      
      callback({ success: true });
    } catch (err) {
      callback({ success: false, error: 'Already in contacts' });
    }
  });
  
  // ACCEPT CONTACT
  socket.on('contacts:accept', ({ contactId }, callback) => {
    const user = onlineUsers.get(socket.id);
    if (!user) return;
    
    acceptContact.run(user.userId, contactId);
    acceptContact.run(contactId, user.userId);
    
    const contact = getUserById.get(contactId);
    callback({ success: true, contact });
  });
  
  // REMOVE CONTACT
  socket.on('contacts:remove', ({ contactId }, callback) => {
    const user = onlineUsers.get(socket.id);
    if (!user) return;
    
    removeContact.run(user.userId, contactId);
    removeContact.run(contactId, user.userId);
    callback({ success: true });
  });
  
  // SEND MESSAGE
  socket.on('message:send', ({ to, content }, callback) => {
    const user = onlineUsers.get(socket.id);
    if (!user) return;
    
    const result = insertMessage.run(user.userId, to, content);
    const timestamp = Math.floor(Date.now() / 1000);
    
    // Notify recipient
    for (const [sockId, u] of onlineUsers) {
      if (u.userId === parseInt(to)) {
        io.to(sockId).emit('message:receive', {
          id: result.lastInsertRowid,
          from: user.userId,
          from_name: user.displayName,
          content,
          timestamp
        });
      }
    }
    
    callback({ success: true, messageId: result.lastInsertRowid, timestamp });
  });
  
  // GET MESSAGE HISTORY
  socket.on('message:history', ({ contactId }, callback) => {
    const user = onlineUsers.get(socket.id);
    if (!user) return;
    
    const messages = getMessages.all(user.userId, contactId, contactId, user.userId);
    markRead.run(contactId, user.userId);
    callback({ success: true, messages: messages.reverse() });
  });
  
  // TYPING INDICATORS
  socket.on('typing:start', ({ to }) => {
    const user = onlineUsers.get(socket.id);
    if (!user) return;
    
    for (const [sockId, u] of onlineUsers) {
      if (u.userId === parseInt(to)) {
        io.to(sockId).emit('typing:start', { from: user.userId, from_name: user.displayName });
      }
    }
  });
  
  socket.on('typing:stop', ({ to }) => {
    const user = onlineUsers.get(socket.id);
    if (!user) return;
    
    for (const [sockId, u] of onlineUsers) {
      if (u.userId === parseInt(to)) {
        io.to(sockId).emit('typing:stop', { from: user.userId });
      }
    }
  });
  
  // NUDGE
  socket.on('nudge:send', ({ to }) => {
    const user = onlineUsers.get(socket.id);
    if (!user) return;
    
    for (const [sockId, u] of onlineUsers) {
      if (u.userId === parseInt(to)) {
        io.to(sockId).emit('nudge:receive', { from: user.displayName });
      }
    }
  });
  
  // DISCONNECT
  socket.on('disconnect', () => {
    const user = onlineUsers.get(socket.id);
    if (user) {
      updateStatus.run('offline', Date.now(), user.userId);
      notifyContactsStatus(user.userId, 'offline');
      onlineUsers.delete(socket.id);
    }
    console.log('[MSN] Client disconnected:', socket.id);
  });
});

function notifyContactsStatus(userId, status) {
  const contacts = getContacts.all(userId);
  
  for (const contact of contacts) {
    for (const [sockId, u] of onlineUsers) {
      if (u.userId === contact.id) {
        io.to(sockId).emit('contact:status', { contactId: userId, status });
      }
    }
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`[Delta] Messenger running on port ${PORT}`);
  console.log(`[Delta] Open http://localhost:${PORT} in your browser`);
});
