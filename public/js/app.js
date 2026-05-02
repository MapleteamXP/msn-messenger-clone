// ==================== MSN MESSENGER CLONE - FRONTEND ====================
const socket = io();

// State
let currentUser = null;
let contacts = [];
let pendingContacts = [];
let chatWindows = {}; // contactId -> chat window element
let typingTimers = {};
let unreadCounts = {};

// ==================== AUDIO ====================
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function playSound(type) {
  if (!audioCtx) audioCtx = new AudioContext();
  
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  
  if (type === 'message') {
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.15);
  } else if (type === 'nudge') {
    osc.frequency.value = 220;
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.3);
  } else if (type === 'login') {
    [523, 659, 784].forEach((f, i) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.connect(g);
      g.connect(audioCtx.destination);
      o.frequency.value = f;
      g.gain.setValueAtTime(0.1, audioCtx.currentTime + i * 0.1);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + i * 0.1 + 0.2);
      o.start(audioCtx.currentTime + i * 0.1);
      o.stop(audioCtx.currentTime + i * 0.1 + 0.2);
    });
  }
}

// ==================== DOM ELEMENTS ====================
const loginScreen = document.getElementById('loginScreen');
const mainWindow = document.getElementById('mainWindow');
const signInForm = document.getElementById('signInForm');
const registerForm = document.getElementById('registerForm');
const tabLogin = document.getElementById('tabLogin');
const tabRegister = document.getElementById('tabRegister');
const btnSignIn = document.getElementById('btnSignIn');
const btnRegister = document.getElementById('btnRegister');
const loginError = document.getElementById('loginError');
const regError = document.getElementById('regError');
const contactsList = document.getElementById('contactsList');
const offlineContactsList = document.getElementById('offlineContactsList');
const myDisplayName = document.getElementById('myDisplayName');
const profileDisplayName = document.getElementById('profileDisplayName');
const statusSelector = document.getElementById('statusSelector');
const chatWindowsContainer = document.getElementById('chatWindows');
const addContactModal = document.getElementById('addContactModal');
const toastContainer = document.getElementById('toastContainer');

// ==================== TAB SWITCHING ====================
tabLogin.addEventListener('click', () => {
  tabLogin.classList.add('active');
  tabRegister.classList.remove('active');
  signInForm.classList.add('active');
  registerForm.classList.remove('active');
});

tabRegister.addEventListener('click', () => {
  tabRegister.classList.add('active');
  tabLogin.classList.remove('active');
  registerForm.classList.add('active');
  signInForm.classList.remove('active');
});

// ==================== LOGIN ====================
btnSignIn.addEventListener('click', () => {
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  
  if (!username || !password) {
    loginError.textContent = 'Please enter username and password';
    return;
  }
  
  socket.emit('user:login', { username, password }, (response) => {
    if (response.success) {
      currentUser = response.user;
      contacts = response.contacts || [];
      pendingContacts = response.pending || [];
      playSound('login');
      showMainWindow();
    } else {
      loginError.textContent = response.error || 'Login failed';
    }
  });
});

// ==================== REGISTER ====================
btnRegister.addEventListener('click', () => {
  const username = document.getElementById('regUsername').value.trim();
  const displayName = document.getElementById('regDisplayName').value.trim();
  const password = document.getElementById('regPassword').value;
  
  if (!username || !password) {
    regError.textContent = 'Please enter username and password';
    return;
  }
  
  if (password.length < 4) {
    regError.textContent = 'Password must be at least 4 characters';
    return;
  }
  
  socket.emit('user:register', { username, password, display_name: displayName || username }, (response) => {
    if (response.success) {
      regError.textContent = '';
      regError.style.color = '#4caf50';
      regError.textContent = 'Account created! Please sign in.';
      setTimeout(() => {
        tabLogin.click();
        document.getElementById('loginUsername').value = username;
      }, 1500);
    } else {
      regError.style.color = '#d32f2f';
      regError.textContent = response.error || 'Registration failed';
    }
  });
});

// ==================== SHOW MAIN WINDOW ====================
function showMainWindow() {
  loginScreen.classList.remove('active');
  mainWindow.classList.add('active');
  
  myDisplayName.textContent = currentUser.display_name;
  profileDisplayName.textContent = currentUser.display_name;
  document.getElementById('myStatusDot').className = 'status-dot online';
  
  renderContacts();
  renderPendingContacts();
}

// ==================== LOGOUT ====================
document.getElementById('btnLogout').addEventListener('click', () => {
  socket.disconnect();
  location.reload();
});

// ==================== STATUS CHANGE ====================
statusSelector.addEventListener('change', (e) => {
  const status = e.target.value;
  socket.emit('user:status', { status });
  
  const dot = document.getElementById('myStatusDot');
  dot.className = 'status-dot ' + status;
});

// ==================== CONTACTS ====================
function renderContacts() {
  contactsList.innerHTML = '';
  offlineContactsList.innerHTML = '';
  
  let onlineCount = 0;
  let offlineCount = 0;
  
  contacts.forEach(contact => {
    const el = createContactElement(contact);
    
    if (contact.status === 'online' || contact.status === 'away' || contact.status === 'busy') {
      contactsList.appendChild(el);
      onlineCount++;
    } else {
      offlineContactsList.appendChild(el);
      offlineCount++;
    }
  });
  
  document.getElementById('onlineCount').textContent = onlineCount;
  document.getElementById('offlineCount').textContent = offlineCount;
}

function createContactElement(contact) {
  const div = document.createElement('div');
  div.className = 'contact-item';
  div.dataset.contactId = contact.id;
  
  const avatar = document.createElement('div');
  avatar.className = 'contact-avatar';
  avatar.textContent = (contact.display_name || contact.username).charAt(0).toUpperCase();
  
  const info = document.createElement('div');
  info.className = 'contact-info';
  
  const name = document.createElement('div');
  name.className = 'contact-name';
  name.textContent = contact.display_name || contact.username;
  
  const status = document.createElement('div');
  status.className = 'contact-status';
  status.textContent = contact.status || 'offline';
  
  info.appendChild(name);
  info.appendChild(status);
  
  const dot = document.createElement('span');
  dot.className = 'status-dot ' + (contact.status || 'offline');
  
  div.appendChild(avatar);
  div.appendChild(info);
  div.appendChild(dot);
  
  div.addEventListener('click', () => openChatWindow(contact));
  div.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (confirm(`Remove ${contact.display_name || contact.username} from contacts?`)) {
      socket.emit('contacts:remove', { contactId: contact.id }, (res) => {
        if (res.success) {
          contacts = contacts.filter(c => c.id !== contact.id);
          renderContacts();
        }
      });
    }
  });
  
  return div;
}

function renderPendingContacts() {
  const section = document.getElementById('pendingSection');
  const list = document.getElementById('pendingList');
  
  if (!pendingContacts || pendingContacts.length === 0) {
    section.style.display = 'none';
    return;
  }
  
  section.style.display = 'block';
  list.innerHTML = '';
  
  pendingContacts.forEach(p => {
    const div = document.createElement('div');
    div.className = 'pending-item';
    div.innerHTML = `
      <span>${p.display_name || p.username}</span>
      <div>
        <button onclick="acceptContact(${p.id})">Accept</button>
        <button onclick="declineContact(${p.id})">Decline</button>
      </div>
    `;
    list.appendChild(div);
  });
}

window.acceptContact = function(contactId) {
  socket.emit('contacts:accept', { contactId }, (res) => {
    if (res.success) {
      pendingContacts = pendingContacts.filter(p => p.id !== contactId);
      contacts.push(res.contact);
      renderContacts();
      renderPendingContacts();
    }
  });
};

window.declineContact = function(contactId) {
  socket.emit('contacts:remove', { contactId }, () => {
    pendingContacts = pendingContacts.filter(p => p.id !== contactId);
    renderPendingContacts();
  });
};

// ==================== ADD CONTACT ====================
document.getElementById('btnAddContact').addEventListener('click', () => {
  addContactModal.style.display = 'flex';
  document.getElementById('addContactInput').focus();
});

document.getElementById('btnCancelAdd').addEventListener('click', () => {
  addContactModal.style.display = 'none';
  document.getElementById('addContactInput').value = '';
  document.getElementById('addContactError').textContent = '';
});

document.getElementById('btnConfirmAdd').addEventListener('click', () => {
  const username = document.getElementById('addContactInput').value.trim();
  if (!username) return;
  
  socket.emit('contacts:add', { username }, (res) => {
    if (res.success) {
      addContactModal.style.display = 'none';
      document.getElementById('addContactInput').value = '';
      document.getElementById('addContactError').textContent = '';
      showToast('Contact request sent!', 'success');
    } else {
      document.getElementById('addContactError').textContent = res.error;
    }
  });
});

// ==================== CHAT WINDOWS ====================
function openChatWindow(contact) {
  if (chatWindows[contact.id]) {
    // Bring to front
    chatWindows[contact.id].style.zIndex = getMaxZIndex() + 1;
    return;
  }
  
  const win = document.createElement('div');
  win.className = 'chat-window';
  win.style.left = (100 + Object.keys(chatWindows).length * 30) + 'px';
  win.style.top = (50 + Object.keys(chatWindows).length * 30) + 'px';
  win.style.zIndex = getMaxZIndex() + 1;
  win.dataset.contactId = contact.id;
  
  const header = document.createElement('div');
  header.className = 'chat-title-bar';
  header.innerHTML = `
    <div class="chat-title">
      <span class="chat-status-dot status-dot ${contact.status || 'offline'}"></span>
      <span>${contact.display_name || contact.username}</span>
    </div>
    <div class="window-controls">
      <button class="win-btn minimize">_</button>
      <button class="win-btn close">×</button>
    </div>
  `;
  
  const body = document.createElement('div');
  body.className = 'chat-body';
  body.innerHTML = `
    <div class="chat-messages" id="chat-messages-${contact.id}"></div>
    <div class="typing-indicator" id="typing-${contact.id}" style="display:none;"></div>
    <div class="chat-toolbar">
      <button class="toolbar-btn">B</button>
      <button class="toolbar-btn">I</button>
      <button class="toolbar-btn">U</button>
      <button class="toolbar-btn">😊</button>
    </div>
    <div class="chat-input-area">
      <textarea class="chat-input" id="input-${contact.id}" placeholder="Type a message..."></textarea>
      <button class="btn-send" id="send-${contact.id}">Send</button>
      <button class="btn-nudge" id="nudge-${contact.id}">Nudge</button>
    </div>
  `;
  
  win.appendChild(header);
  win.appendChild(body);
  chatWindowsContainer.appendChild(win);
  chatWindows[contact.id] = win;
  
  // Load history
  socket.emit('message:history', { contactId: contact.id }, (res) => {
    if (res.success) {
      const msgsDiv = document.getElementById(`chat-messages-${contact.id}`);
      res.messages.forEach(msg => {
        const isMe = msg.sender_id === currentUser.id;
        appendMessage(contact.id, {
          from: isMe ? currentUser.display_name : (contact.display_name || contact.username),
          content: msg.content,
          timestamp: msg.timestamp,
          isMe
        });
      });
      msgsDiv.scrollTop = msgsDiv.scrollHeight;
    }
  });
  
  // Close button
  header.querySelector('.close').addEventListener('click', () => {
    win.remove();
    delete chatWindows[contact.id];
  });
  
  // Minimize
  header.querySelector('.minimize').addEventListener('click', () => {
    win.style.display = win.style.display === 'none' ? 'flex' : 'none';
  });
  
  // Drag
  makeDraggable(win, header);
  
  // Send message
  const input = document.getElementById(`input-${contact.id}`);
  const sendBtn = document.getElementById(`send-${contact.id}`);
  
  function sendMessage() {
    const content = input.value.trim();
    if (!content) return;
    
    socket.emit('message:send', { to: contact.id, content }, (res) => {
      if (res.success) {
        appendMessage(contact.id, {
          from: currentUser.display_name,
          content,
          timestamp: res.timestamp,
          isMe: true
        });
        input.value = '';
      }
    });
    
    socket.emit('typing:stop', { to: contact.id });
  }
  
  sendBtn.addEventListener('click', sendMessage);
  
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  
  input.addEventListener('input', () => {
    socket.emit('typing:start', { to: contact.id });
    
    clearTimeout(typingTimers[contact.id]);
    typingTimers[contact.id] = setTimeout(() => {
      socket.emit('typing:stop', { to: contact.id });
    }, 2000);
  });
  
  // Nudge
  document.getElementById(`nudge-${contact.id}`).addEventListener('click', () => {
    socket.emit('nudge:send', { to: contact.id });
    
    // Animate own window too
    win.classList.add('nudge');
    setTimeout(() => win.classList.remove('nudge'), 500);
  });
  
  // Focus click
  win.addEventListener('mousedown', () => {
    win.style.zIndex = getMaxZIndex() + 1;
  });
}

function appendMessage(contactId, msg) {
  const msgsDiv = document.getElementById(`chat-messages-${contactId}`);
  if (!msgsDiv) return;
  
  const bubble = document.createElement('div');
  bubble.className = 'message-bubble' + (msg.isMe ? ' me' : '');
  
  const date = new Date(msg.timestamp * 1000);
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  bubble.innerHTML = `
    <div class="message-header">${msg.from}</div>
    <div class="message-content">${escapeHtml(msg.content)}</div>
    <div class="message-timestamp">${timeStr}</div>
  `;
  
  msgsDiv.appendChild(bubble);
  msgsDiv.scrollTop = msgsDiv.scrollHeight;
}

function makeDraggable(element, handle) {
  let isDragging = false;
  let offsetX, offsetY;
  
  handle.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('win-btn')) return;
    isDragging = true;
    offsetX = e.clientX - element.offsetLeft;
    offsetY = e.clientY - element.offsetTop;
    element.style.zIndex = getMaxZIndex() + 1;
  });
  
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    element.style.left = (e.clientX - offsetX) + 'px';
    element.style.top = (e.clientY - offsetY) + 'px';
  });
  
  document.addEventListener('mouseup', () => {
    isDragging = false;
  });
}

function getMaxZIndex() {
  const windows = document.querySelectorAll('.chat-window');
  let max = 1000;
  windows.forEach(w => {
    const z = parseInt(w.style.zIndex) || 1000;
    if (z > max) max = z;
  });
  return max;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ==================== SOCKET EVENTS ====================
socket.on('message:receive', (msg) => {
  const contact = contacts.find(c => c.id === msg.from);
  if (!contact) return;
  
  // Open chat if not open
  if (!chatWindows[contact.id]) {
    openChatWindow(contact);
  }
  
  appendMessage(contact.id, {
    from: msg.from_name,
    content: msg.content,
    timestamp: msg.timestamp,
    isMe: false
  });
  
  playSound('message');
  
  // Show toast if window not focused
  if (document.hidden || chatWindows[contact.id].style.zIndex < getMaxZIndex()) {
    showToast(`New message from ${msg.from_name}`, 'message');
  }
});

socket.on('typing:start', (data) => {
  const indicator = document.getElementById(`typing-${data.from}`);
  if (indicator) {
    indicator.textContent = `${data.from_name} is typing...`;
    indicator.style.display = 'block';
  }
});

socket.on('typing:stop', (data) => {
  const indicator = document.getElementById(`typing-${data.from}`);
  if (indicator) {
    indicator.style.display = 'none';
  }
});

socket.on('nudge:receive', (data) => {
  showToast(`${data.from} sent you a nudge!`, 'nudge');
  playSound('nudge');
  
  // Shake all chat windows
  Object.values(chatWindows).forEach(win => {
    win.classList.add('nudge');
    setTimeout(() => win.classList.remove('nudge'), 500);
  });
});

socket.on('contact:status', (data) => {
  const contact = contacts.find(c => c.id === data.contactId);
  if (contact) {
    contact.status = data.status;
    renderContacts();
    
    // Update chat window status dot
    const win = chatWindows[contact.id];
    if (win) {
      const dot = win.querySelector('.chat-status-dot');
      if (dot) dot.className = 'chat-status-dot status-dot ' + data.status;
    }
  }
});

socket.on('contacts:pending', (data) => {
  pendingContacts.push(data);
  renderPendingContacts();
  showToast(`${data.display_name || data.username} wants to add you!`, 'contact');
});

// ==================== TOASTS ====================
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = 'toast';
  
  const colors = {
    message: '#0077b6',
    nudge: '#ff9800',
    contact: '#4caf50',
    success: '#4caf50',
    info: '#0077b6'
  };
  
  toast.style.borderLeftColor = colors[type] || colors.info;
  toast.innerHTML = `<div class="toast-title">${type === 'message' ? 'New Message' : type === 'nudge' ? 'Nudge!' : type === 'contact' ? 'Contact Request' : 'Notification'}</div>
    ${message}`;
  
  toastContainer.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ==================== SEARCH CONTACTS ====================
document.getElementById('searchContacts').addEventListener('input', (e) => {
  const query = e.target.value.toLowerCase();
  const items = document.querySelectorAll('.contact-item');
  
  items.forEach(item => {
    const name = item.querySelector('.contact-name').textContent.toLowerCase();
    item.style.display = name.includes(query) ? 'flex' : 'none';
  });
});

// ==================== WINDOW CONTROLS ====================
document.querySelectorAll('.win-btn.minimize').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const win = e.target.closest('.msn-window') || e.target.closest('.chat-window');
    if (win) win.style.display = 'none';
  });
});

document.querySelectorAll('.win-btn.close').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const win = e.target.closest('.msn-window');
    if (win) {
      // For main window, just hide it
      mainWindow.classList.remove('active');
      loginScreen.classList.add('active');
    }
  });
});

console.log('[Delta] Client loaded');
