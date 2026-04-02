const state = {
  mode: "login",
  me: null,
  chats: [],
  friends: [],
  groups: [],
  selectedChat: null,
  selectedMessages: new Set(),
  replyTo: null
};

const DB_KEY = "chatgos-db";
const SESSION_KEY = "chatgos-session";

const $ = (id) => document.getElementById(id);
const accountPage = $("account-page");
const chatListPage = $("chat-list-page");
const chatWindowPage = $("chat-window-page");

function safeAvatar(url, seed = "chatgos") {
  if (url) return url;
  const hue = Array.from(seed).reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  const bg = `hsl(${hue} 70% 85%)`;
  const fg = `hsl(${(hue + 180) % 360} 45% 30%)`;
  const letter = (seed[0] || "C").toUpperCase();
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'><rect width='100%' height='100%' rx='40' fill='${bg}'/><text x='50%' y='54%' text-anchor='middle' font-size='34' font-family='Arial' fill='${fg}'>${letter}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const now = () => Date.now();
const uid = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;

function defaultDb() {
  return { users: {}, chats: {}, groups: {} };
}

function loadDb() {
  try {
    return JSON.parse(localStorage.getItem(DB_KEY)) || defaultDb();
  } catch {
    return defaultDb();
  }
}

function saveDb(db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

function transact(mutator) {
  const db = loadDb();
  mutator(db);
  saveDb(db);
  syncFromDb();
}

function showScreen(screen) {
  [accountPage, chatListPage, chatWindowPage].forEach((el) => el.classList.remove("active"));
  screen.classList.add("active");
}

function setAuthMode(mode) {
  state.mode = mode;
  $("tab-login").classList.toggle("active", mode === "login");
  $("tab-signup").classList.toggle("active", mode === "signup");
  $("auth-submit").textContent = mode === "login" ? "Login" : "Create Account";
  $("auth-error").textContent = "";
}

function findUserByUserId(userId) {
  return loadDb().users[userId] || null;
}

function handleSignUp(userId, password) {
  if (!/^[A-Za-z0-9]+$/.test(userId)) {
    throw new Error("User ID must contain only letters and numbers");
  }
  if (findUserByUserId(userId)) {
    throw new Error("User ID already exists");
  }
  transact((db) => {
    db.users[userId] = {
      userId,
      username: userId,
      password,
      photoUrl: "",
      status: "online",
      friends: [],
      blocked: [],
      createdAt: now()
    };
  });
  localStorage.setItem(SESSION_KEY, userId);
}

function handleLogin(userId, password) {
  const user = findUserByUserId(userId);
  if (!user || user.password !== password) throw new Error("Invalid User ID or password");
  transact((db) => {
    db.users[userId].status = "online";
  });
  localStorage.setItem(SESSION_KEY, userId);
}

function handleLogout() {
  if (!state.me) return;
  transact((db) => {
    if (db.users[state.me.userId]) db.users[state.me.userId].status = "offline";
  });
  localStorage.removeItem(SESSION_KEY);
  state.me = null;
  state.selectedChat = null;
  showScreen(accountPage);
}

function directChatId(a, b) {
  return [a, b].sort().join("__");
}

function ensureDirectChat(db, a, b) {
  const id = directChatId(a, b);
  if (!db.chats[id]) {
    db.chats[id] = {
      id,
      type: "direct",
      members: [a, b],
      lastMessage: "",
      updatedAt: now(),
      messages: []
    };
  }
  return db.chats[id];
}

function syncFromDb() {
  if (!state.me) return;
  const db = loadDb();
  const me = db.users[state.me.userId];
  if (!me) {
    handleLogout();
    return;
  }
  state.me = me;

  state.friends = (me.friends || [])
    .map((friendId) => db.users[friendId])
    .filter(Boolean);

  state.chats = state.friends.map((friend) => {
    const chat = ensureDirectChat(db, me.userId, friend.userId);
    const last = chat.messages.at(-1)?.text || "";
    return {
      id: chat.id,
      type: "direct",
      name: friend.username,
      photoUrl: friend.photoUrl || "",
      peerUserId: friend.userId,
      online: friend.status === "online",
      lastMessage: last || "No messages yet",
      updatedAt: chat.updatedAt || 0
    };
  });

  state.groups = Object.values(db.groups || {}).filter((g) => g.members.includes(me.userId));

  renderFriends();
  renderChatList();
  renderGroups();

  if (state.selectedChat) {
    const refreshed =
      state.selectedChat.type === "group"
        ? state.groups.find((g) => g.id === state.selectedChat.id)
        : state.chats.find((c) => c.id === state.selectedChat.id);
    if (refreshed) openChat(refreshed, true);
  }
}

function bootSession() {
  const sessionUserId = localStorage.getItem(SESSION_KEY);
  if (!sessionUserId) {
    showScreen(accountPage);
    return;
  }
  const user = findUserByUserId(sessionUserId);
  if (!user) {
    localStorage.removeItem(SESSION_KEY);
    showScreen(accountPage);
    return;
  }
  state.me = user;
  transact((db) => {
    if (db.users[sessionUserId]) db.users[sessionUserId].status = "online";
  });
  showScreen(chatListPage);
  syncFromDb();
}

function renderChatList() {
  const list = $("chat-list");
  list.innerHTML = "";
  const combined = [...state.chats].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  combined.forEach((chat) => {
    const li = document.createElement("li");
    li.className = "chat-item";
    li.innerHTML = `
      <div>
        <strong>${chat.name}</strong>
        <div class="muted">${chat.lastMessage}</div>
      </div>
      <div class="status ${chat.online ? "online" : ""}">${chat.online ? "online" : "offline"}</div>
    `;
    li.onclick = () => openChat(chat);
    list.appendChild(li);
  });
}

function renderFriends() {
  const ul = $("friends-list");
  ul.innerHTML = "";
  $("empty-friends").classList.toggle("hidden", state.friends.length > 0);
  state.friends.forEach((friend) => {
    const li = document.createElement("li");
    li.className = "chat-item";
    li.innerHTML = `<span>${friend.username}</span><button data-id="${friend.userId}" class="ghost-btn">Unfriend</button>`;
    li.querySelector("button").onclick = () => unfriend(friend.userId);
    ul.appendChild(li);
  });
}

function renderGroups() {
  const ul = $("group-list");
  ul.innerHTML = "";
  state.groups.forEach((g) => {
    const mine = g.adminId === state.me.userId;
    const li = document.createElement("li");
    li.className = "chat-item";
    li.innerHTML = `<span>${g.name} (${g.members.length})</span><div></div>`;
    const right = li.querySelector("div");

    const openBtn = document.createElement("button");
    openBtn.textContent = "Open";
    openBtn.className = "ghost-btn";
    openBtn.onclick = () => openChat({ ...g, type: "group" });
    right.appendChild(openBtn);

    if (mine) {
      const rename = document.createElement("button");
      rename.className = "ghost-btn";
      rename.textContent = "Rename";
      rename.onclick = () => {
        const name = prompt("New group name:", g.name);
        if (!name?.trim()) return;
        transact((db) => {
          db.groups[g.id].name = name.trim();
        });
      };
      right.appendChild(rename);

      const addMember = document.createElement("button");
      addMember.className = "ghost-btn";
      addMember.textContent = "Add Member";
      addMember.onclick = () => {
        const memberId = prompt("Enter member ID to add:");
        if (!memberId) return;
        transact((db) => {
          const target = db.users[memberId.trim()];
          if (!target) return;
          const group = db.groups[g.id];
          if (!group.members.includes(target.userId)) group.members.push(target.userId);
        });
      };
      right.appendChild(addMember);

      const removeMember = document.createElement("button");
      removeMember.className = "ghost-btn";
      removeMember.textContent = "Remove Member";
      removeMember.onclick = () => {
        const memberId = prompt("Enter member ID to remove:");
        if (!memberId) return;
        transact((db) => {
          const group = db.groups[g.id];
          group.members = group.members.filter((m) => m !== memberId.trim() && m !== group.adminId);
        });
      };
      right.appendChild(removeMember);
    } else {
      const leave = document.createElement("button");
      leave.className = "ghost-btn";
      leave.textContent = "Leave";
      leave.onclick = () => {
        transact((db) => {
          const group = db.groups[g.id];
          group.members = group.members.filter((m) => m !== state.me.userId);
        });
      };
      right.appendChild(leave);
    }

    ul.appendChild(li);
  });
}

function getChatMessages(chat) {
  const db = loadDb();
  if (chat.type === "group") return db.groups[chat.id]?.messages || [];
  return db.chats[chat.id]?.messages || [];
}

function openChat(chat, keepSelection = false) {
  state.selectedChat = chat;
  if (!keepSelection) {
    state.selectedMessages.clear();
    state.replyTo = null;
  }

  const isDirect = chat.type !== "group";
  $("chat-header").innerHTML = `<img class="avatar" src="${safeAvatar(chat.photoUrl, chat.name || chat.peerUserId || "chat")}"/><div><strong>${chat.name}</strong><div class="muted">Tap for profile</div></div>`;
  $("chat-header").onclick = () => {
    $("profile-avatar").src = safeAvatar(chat.photoUrl, chat.name || chat.peerUserId || "chat");
    $("profile-name").textContent = chat.name;
    $("profile-user-id").textContent = isDirect ? `User ID: ${chat.peerUserId}` : "Group Chat";
    $("block-btn").style.display = isDirect ? "block" : "none";
    $("unfriend-btn").style.display = isDirect ? "block" : "none";
    $("profile-popup").classList.remove("hidden");
  };

  const messages = getChatMessages(chat).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const list = $("message-list");
  list.innerHTML = "";
  messages.forEach((m) => {
    const el = document.createElement("div");
    const mine = m.senderId === state.me.userId;
    const selected = state.selectedMessages.has(m.id);
    el.className = `message ${mine ? "mine" : "theirs"} ${m.replyTo ? "reply" : ""} ${selected ? "selected" : ""}`;
    el.innerHTML = `${m.replyTo ? `<small>↪ ${m.replyToPreview || "reply"}</small><br/>` : ""}${m.text}`;
    el.onclick = () => toggleMessageSelection(m.id, m.text);
    list.appendChild(el);
  });
  showScreen(chatWindowPage);
}

function toggleMessageSelection(id, text) {
  if (state.selectedMessages.has(id)) state.selectedMessages.delete(id);
  else state.selectedMessages.add(id);
  state.replyTo = { id, text };
  if (state.selectedChat) openChat(state.selectedChat, true);
}

function sendMessage(text) {
  const chat = state.selectedChat;
  if (!chat) return;
  transact((db) => {
    const payload = {
      id: uid("msg"),
      senderId: state.me.userId,
      text,
      createdAt: now(),
      replyTo: state.replyTo?.id || null,
      replyToPreview: state.replyTo?.text || null
    };

    if (chat.type === "group") {
      const group = db.groups[chat.id];
      group.messages ||= [];
      group.messages.push(payload);
      group.updatedAt = now();
      group.lastMessage = text;
    } else {
      const direct = ensureDirectChat(db, state.me.userId, chat.peerUserId);
      direct.messages.push(payload);
      direct.updatedAt = now();
      direct.lastMessage = text;
    }
  });
  state.replyTo = null;
}

function deleteSelected() {
  const ids = new Set(state.selectedMessages);
  transact((db) => {
    const chat = state.selectedChat;
    if (!chat) return;
    if (chat.type === "group") {
      const group = db.groups[chat.id];
      group.messages = (group.messages || []).filter((m) => !ids.has(m.id));
    } else {
      const direct = db.chats[chat.id];
      if (direct) direct.messages = (direct.messages || []).filter((m) => !ids.has(m.id));
    }
  });
  state.selectedMessages.clear();
}

function clearChat() {
  transact((db) => {
    const chat = state.selectedChat;
    if (!chat) return;
    if (chat.type === "group") db.groups[chat.id].messages = [];
    else if (db.chats[chat.id]) db.chats[chat.id].messages = [];
  });
}

function unfriend(friendId) {
  transact((db) => {
    const me = db.users[state.me.userId];
    const friend = db.users[friendId];
    me.friends = (me.friends || []).filter((id) => id !== friendId);
    if (friend) friend.friends = (friend.friends || []).filter((id) => id !== me.userId);
  });
}

function blockUser(friendId) {
  transact((db) => {
    const me = db.users[state.me.userId];
    me.blocked ||= [];
    if (!me.blocked.includes(friendId)) me.blocked.push(friendId);
  });
}

$("auth-form").onsubmit = (e) => {
  e.preventDefault();
  const userId = $("user-id").value.trim();
  const password = $("password").value;
  try {
    if (state.mode === "signup") handleSignUp(userId, password);
    else handleLogin(userId, password);
    state.me = findUserByUserId(userId);
    showScreen(chatListPage);
    syncFromDb();
  } catch (err) {
    $("auth-error").textContent = err.message;
  }
};

$("tab-login").onclick = () => setAuthMode("login");
$("tab-signup").onclick = () => setAuthMode("signup");
$("logout-btn").onclick = handleLogout;
$("menu-toggle").onclick = () => $("menu-popup").classList.toggle("hidden");
$("friends-fab").onclick = () => $("friends-panel").classList.remove("hidden");
$("add-friend-fab").onclick = () => $("add-friend-panel").classList.remove("hidden");
$("open-settings").onclick = () => $("groups-panel").classList.remove("hidden");

Array.from(document.querySelectorAll("[data-close]")).forEach((btn) => {
  btn.onclick = () => $(btn.dataset.close).classList.add("hidden");
});

$("add-friend-form").onsubmit = (e) => {
  e.preventDefault();
  const id = $("friend-id-input").value.trim();
  const user = findUserByUserId(id);
  const out = $("friend-search-result");

  if (!user || id === state.me.userId) {
    out.innerHTML = `<p class="error-message">User not found</p>`;
    return;
  }

  out.innerHTML = `
    <div class="chat-item">
      <span>${user.username}</span>
      <button id="add-this-user" class="primary-btn">Send Friend Request / Add</button>
    </div>
  `;

  $("add-this-user").onclick = () => {
    transact((db) => {
      const me = db.users[state.me.userId];
      const friend = db.users[user.userId];
      me.friends ||= [];
      friend.friends ||= [];
      if (!me.friends.includes(friend.userId)) me.friends.push(friend.userId);
      if (!friend.friends.includes(me.userId)) friend.friends.push(me.userId);
      ensureDirectChat(db, me.userId, friend.userId);
    });
    out.innerHTML = `<p class="muted">Added successfully.</p>`;
  };
};

$("message-form").onsubmit = (e) => {
  e.preventDefault();
  const text = $("message-input").value.trim();
  if (!text || !state.selectedChat) return;
  sendMessage(text);
  $("message-input").value = "";
};

$("reply-btn").onclick = () => {
  if (!state.replyTo) alert("Select a message first.");
  else alert(`Reply target selected: ${state.replyTo.text.slice(0, 20)}`);
};

$("delete-btn").onclick = deleteSelected;
$("clear-chat-btn").onclick = clearChat;

$("block-btn").onclick = () => {
  if (state.selectedChat?.peerUserId) {
    blockUser(state.selectedChat.peerUserId);
    alert("User blocked.");
  }
};

$("unfriend-btn").onclick = () => {
  if (state.selectedChat?.peerUserId) {
    unfriend(state.selectedChat.peerUserId);
    $("profile-popup").classList.add("hidden");
  }
};

$("create-group-form").onsubmit = (e) => {
  e.preventDefault();
  const name = $("group-name").value.trim();
  const photoUrl = $("group-photo").value.trim();
  if (!name) return;
  transact((db) => {
    const id = uid("grp");
    db.groups[id] = {
      id,
      type: "group",
      name,
      photoUrl,
      members: [state.me.userId],
      adminId: state.me.userId,
      createdAt: now(),
      updatedAt: now(),
      lastMessage: "",
      messages: []
    };
  });
  $("group-name").value = "";
  $("group-photo").value = "";
};

window.addEventListener("storage", (e) => {
  if (e.key === DB_KEY || e.key === SESSION_KEY) syncFromDb();
});

setAuthMode("login");
bootSession();
