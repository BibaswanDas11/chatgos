const state = {
  mode: "login",
  me: null,
  chats: [],
  friends: [],
  groups: [],
  selectedChat: null,
  selectedMessages: new Set(),
  replyTo: null,
  stream: null
};

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

async function api(path, method = "GET", body) {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || "Request failed");
  return payload;
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

async function syncFromServer() {
  if (!state.me?.userId) return;
  const data = await api(`/api/bootstrap?userId=${encodeURIComponent(state.me.userId)}`);
  state.me = data.me;
  state.friends = data.friends || [];
  state.chats = data.chats || [];
  state.groups = data.groups || [];
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

function connectEvents() {
  if (!state.me?.userId) return;
  if (state.stream) state.stream.close();
  state.stream = new EventSource(`/events?userId=${encodeURIComponent(state.me.userId)}`);
  state.stream.onmessage = () => {
    syncFromServer().catch(() => {});
  };
}

async function handleSignUp(userId, password) {
  await api("/api/signup", "POST", { userId, password });
  localStorage.setItem(SESSION_KEY, userId);
  state.me = { userId, username: userId };
  connectEvents();
  await syncFromServer();
}

async function handleLogin(userId, password) {
  await api("/api/login", "POST", { userId, password });
  localStorage.setItem(SESSION_KEY, userId);
  state.me = { userId, username: userId };
  connectEvents();
  await syncFromServer();
}

async function handleLogout() {
  if (state.me?.userId) {
    await api("/api/logout", "POST", { userId: state.me.userId }).catch(() => {});
  }
  if (state.stream) state.stream.close();
  state.stream = null;
  state.me = null;
  state.selectedChat = null;
  localStorage.removeItem(SESSION_KEY);
  showScreen(accountPage);
}

async function bootSession() {
  const sessionUserId = localStorage.getItem(SESSION_KEY);
  if (!sessionUserId) return showScreen(accountPage);
  state.me = { userId: sessionUserId, username: sessionUserId };
  connectEvents();
  try {
    await syncFromServer();
    showScreen(chatListPage);
  } catch {
    localStorage.removeItem(SESSION_KEY);
    showScreen(accountPage);
  }
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
        <div class="muted">${chat.lastMessage || "No messages yet"}</div>
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
      rename.onclick = async () => {
        const name = prompt("New group name:", g.name);
        if (!name?.trim()) return;
        await api("/api/groups/rename", "POST", { userId: state.me.userId, groupId: g.id, name: name.trim() });
        await syncFromServer();
      };
      right.appendChild(rename);

      const addMember = document.createElement("button");
      addMember.className = "ghost-btn";
      addMember.textContent = "Add Member";
      addMember.onclick = async () => {
        const memberId = prompt("Enter member ID to add:");
        if (!memberId?.trim()) return;
        try {
          await api("/api/groups/add-member", "POST", { userId: state.me.userId, groupId: g.id, memberId: memberId.trim() });
          await syncFromServer();
        } catch (err) {
          alert(err.message);
        }
      };
      right.appendChild(addMember);

      const removeMember = document.createElement("button");
      removeMember.className = "ghost-btn";
      removeMember.textContent = "Remove Member";
      removeMember.onclick = async () => {
        const memberId = prompt("Enter member ID to remove:");
        if (!memberId?.trim()) return;
        await api("/api/groups/remove-member", "POST", { userId: state.me.userId, groupId: g.id, memberId: memberId.trim() });
        await syncFromServer();
      };
      right.appendChild(removeMember);
    } else {
      const leave = document.createElement("button");
      leave.className = "ghost-btn";
      leave.textContent = "Leave";
      leave.onclick = async () => {
        await api("/api/groups/leave", "POST", { userId: state.me.userId, groupId: g.id });
        await syncFromServer();
      };
      right.appendChild(leave);
    }

    ul.appendChild(li);
  });
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

  const messages = (chat.messages || []).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
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

async function sendMessage(text) {
  const chat = state.selectedChat;
  if (!chat) return;
  await api("/api/messages/send", "POST", {
    chatType: chat.type === "group" ? "group" : "direct",
    chatId: chat.id,
    from: state.me.userId,
    to: chat.peerUserId,
    text,
    replyTo: state.replyTo?.id || null,
    replyToPreview: state.replyTo?.text || null
  });
  state.replyTo = null;
  await syncFromServer();
}

async function deleteSelected() {
  const ids = [...state.selectedMessages];
  if (!ids.length || !state.selectedChat) return;
  await api("/api/messages/delete", "POST", {
    chatType: state.selectedChat.type === "group" ? "group" : "direct",
    chatId: state.selectedChat.id,
    ids
  });
  state.selectedMessages.clear();
  await syncFromServer();
}

async function clearChat() {
  if (!state.selectedChat) return;
  await api("/api/chats/clear", "POST", {
    chatType: state.selectedChat.type === "group" ? "group" : "direct",
    chatId: state.selectedChat.id
  });
  await syncFromServer();
}

async function unfriend(friendId) {
  await api("/api/friends/remove", "POST", { me: state.me.userId, friendId });
  await syncFromServer();
}

async function blockUser(friendId) {
  await api("/api/block", "POST", { me: state.me.userId, targetId: friendId });
}

$("auth-form").onsubmit = async (e) => {
  e.preventDefault();
  const userId = $("user-id").value.trim();
  const password = $("password").value;

  try {
    if (state.mode === "signup") await handleSignUp(userId, password);
    else await handleLogin(userId, password);
    showScreen(chatListPage);
  } catch (err) {
    $("auth-error").textContent = err.message;
  }
};

$("tab-login").onclick = () => setAuthMode("login");
$("tab-signup").onclick = () => setAuthMode("signup");
$("logout-btn").onclick = () => handleLogout();
$("menu-toggle").onclick = () => $("menu-popup").classList.toggle("hidden");
$("friends-fab").onclick = () => $("friends-panel").classList.remove("hidden");
$("add-friend-fab").onclick = () => $("add-friend-panel").classList.remove("hidden");
$("open-settings").onclick = () => $("groups-panel").classList.remove("hidden");

Array.from(document.querySelectorAll("[data-close]")).forEach((btn) => {
  btn.onclick = () => $(btn.dataset.close).classList.add("hidden");
});

$("add-friend-form").onsubmit = async (e) => {
  e.preventDefault();
  const id = $("friend-id-input").value.trim();
  const out = $("friend-search-result");

  try {
    const result = await api(`/api/search-user?userId=${encodeURIComponent(id)}`);
    const user = result.user;
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

    $("add-this-user").onclick = async () => {
      await api("/api/friends/add", "POST", { me: state.me.userId, friendId: user.userId });
      out.innerHTML = `<p class="muted">Added successfully.</p>`;
      await syncFromServer();
    };
  } catch (err) {
    out.innerHTML = `<p class="error-message">${err.message}</p>`;
  }
};

$("message-form").onsubmit = async (e) => {
  e.preventDefault();
  const text = $("message-input").value.trim();
  if (!text || !state.selectedChat) return;
  await sendMessage(text);
  $("message-input").value = "";
};

$("reply-btn").onclick = () => {
  if (!state.replyTo) alert("Select a message first.");
  else alert(`Reply target selected: ${state.replyTo.text.slice(0, 20)}`);
};

$("delete-btn").onclick = () => deleteSelected();
$("clear-chat-btn").onclick = () => clearChat();

$("block-btn").onclick = async () => {
  if (state.selectedChat?.peerUserId) {
    await blockUser(state.selectedChat.peerUserId);
    alert("User blocked.");
  }
};

$("unfriend-btn").onclick = async () => {
  if (state.selectedChat?.peerUserId) {
    await unfriend(state.selectedChat.peerUserId);
    $("profile-popup").classList.add("hidden");
  }
};

$("create-group-form").onsubmit = async (e) => {
  e.preventDefault();
  const name = $("group-name").value.trim();
  const photoUrl = $("group-photo").value.trim();
  if (!name) return;
  await api("/api/groups/create", "POST", { userId: state.me.userId, name, photoUrl });
  $("group-name").value = "";
  $("group-photo").value = "";
  await syncFromServer();
};

setAuthMode("login");
bootSession();
