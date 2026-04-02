import { auth, db } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.9.1/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  addDoc,
  query,
  where,
  serverTimestamp,
  onSnapshot,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js";

const state = {
  mode: "login",
  me: null,
  meDoc: null,
  chats: [],
  friends: [],
  selectedChat: null,
  selectedMessages: new Set(),
  replyTo: null
};

const $ = (id) => document.getElementById(id);
const accountPage = $("account-page");
const chatListPage = $("chat-list-page");
const chatWindowPage = $("chat-window-page");

const safeAvatar = (url) => url || "https://api.dicebear.com/9.x/identicon/svg?seed=chatgos";
const toEmail = (userId) => `${userId.toLowerCase()}@chatgos.local`;

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

async function findUserByUserId(userId) {
  const snap = await getDoc(doc(db, "users", userId));
  return snap.exists() ? snap.data() : null;
}

async function handleSignUp(userId, password) {
  if (!/^[A-Za-z0-9]+$/.test(userId)) {
    throw new Error("User ID must contain only letters and numbers");
  }
  const existing = await findUserByUserId(userId);
  if (existing) {
    throw new Error("User ID already exists");
  }

  const cred = await createUserWithEmailAndPassword(auth, toEmail(userId), password);
  await setDoc(doc(db, "users", userId), {
    uid: cred.user.uid,
    userId,
    username: userId,
    photoUrl: "",
    status: "online",
    friends: [],
    blocked: [],
    createdAt: serverTimestamp()
  });
}

async function handleLogin(userId, password) {
  await signInWithEmailAndPassword(auth, toEmail(userId), password);
}

async function loadSelf() {
  const all = await getDocs(collection(db, "users"));
  const me = all.docs.map((x) => x.data()).find((x) => x.uid === auth.currentUser?.uid);
  if (!me) return;
  state.me = me;
  state.meDoc = doc(db, "users", me.userId);
  await updateDoc(state.meDoc, { status: "online" });
  watchFriends();
  watchChats();
  watchGroups();
}

function renderChatList() {
  const list = $("chat-list");
  list.innerHTML = "";
  const combined = [...state.chats].sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
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

async function unfriend(friendId) {
  await updateDoc(doc(db, "users", state.me.userId), { friends: arrayRemove(friendId) });
  await updateDoc(doc(db, "users", friendId), { friends: arrayRemove(state.me.userId) });
}

function watchFriends() {
  onSnapshot(doc(db, "users", state.me.userId), async (snap) => {
    const data = snap.data();
    state.me = data;
    const friends = await Promise.all((data.friends || []).map(async (id) => (await getDoc(doc(db, "users", id))).data()));
    state.friends = friends.filter(Boolean);
    renderFriends();
    renderChatList();
  });
}

function chatIdFor(a, b) {
  return [a, b].sort().join("__");
}

function watchChats() {
  const q = query(collection(db, "chats"), where("members", "array-contains", state.me.userId));
  onSnapshot(q, (snap) => {
    state.chats = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderChatList();
  });
}

function openChat(chat) {
  state.selectedChat = chat;
  $("chat-header").innerHTML = `<img class="avatar" src="${safeAvatar(chat.photoUrl)}"/><div><strong>${chat.name}</strong><div class="muted">Tap for profile</div></div>`;
  $("chat-header").onclick = () => {
    $("profile-avatar").src = safeAvatar(chat.photoUrl);
    $("profile-name").textContent = chat.name;
    $("profile-user-id").textContent = chat.peerUserId ? `User ID: ${chat.peerUserId}` : "Group Chat";
    $("profile-popup").classList.remove("hidden");
  };
  showScreen(chatWindowPage);

  onSnapshot(collection(db, "chats", chat.id, "messages"), (snap) => {
    const list = $("message-list");
    list.innerHTML = "";
    snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0))
      .forEach((m) => {
        const el = document.createElement("div");
        const mine = m.senderId === state.me.userId;
        const selected = state.selectedMessages.has(m.id);
        el.className = `message ${mine ? "mine" : "theirs"} ${m.replyTo ? "reply" : ""} ${selected ? "selected" : ""}`;
        el.innerHTML = `${m.replyTo ? `<small>↪ ${m.replyToPreview || "reply"}</small><br/>` : ""}${m.text}`;
        el.onclick = () => toggleMessageSelection(m.id, m.text);
        list.appendChild(el);
      });
  });
}

function toggleMessageSelection(id, text) {
  if (state.selectedMessages.has(id)) state.selectedMessages.delete(id);
  else state.selectedMessages.add(id);
  state.replyTo = { id, text };
}

async function sendMessage(text) {
  const chat = state.selectedChat;
  const payload = {
    senderId: state.me.userId,
    text,
    createdAt: serverTimestamp(),
    replyTo: state.replyTo?.id || null,
    replyToPreview: state.replyTo?.text || null
  };
  await addDoc(collection(db, "chats", chat.id, "messages"), payload);
  await updateDoc(doc(db, "chats", chat.id), { lastMessage: text, updatedAt: serverTimestamp() });
  state.replyTo = null;
}

async function deleteSelected() {
  const ids = Array.from(state.selectedMessages);
  for (const id of ids) {
    await deleteDoc(doc(db, "chats", state.selectedChat.id, "messages", id));
  }
  state.selectedMessages.clear();
}

async function startOrFindDirectChat(friend) {
  const id = chatIdFor(state.me.userId, friend.userId);
  const ref = doc(db, "chats", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      type: "direct",
      members: [state.me.userId, friend.userId],
      name: friend.username,
      peerUserId: friend.userId,
      photoUrl: friend.photoUrl || "",
      online: friend.status === "online",
      lastMessage: "",
      updatedAt: serverTimestamp()
    });
  }
}

function watchGroups() {
  const q = query(collection(db, "groups"), where("members", "array-contains", state.me.userId));
  onSnapshot(q, (snap) => {
    const groups = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const ul = $("group-list");
    ul.innerHTML = "";
    groups.forEach((g) => {
      const mine = g.adminId === state.me.userId;
      const li = document.createElement("li");
      li.className = "chat-item";
      li.innerHTML = `<span>${g.name} (${g.members.length})</span><div></div>`;
      const right = li.querySelector("div");
      const openBtn = document.createElement("button");
      openBtn.textContent = "Open";
      openBtn.className = "ghost-btn";
      openBtn.onclick = () => openChat({ ...g, name: g.name, photoUrl: g.photoUrl || "", peerUserId: null });
      right.appendChild(openBtn);

      if (mine) {
        const rename = document.createElement("button");
        rename.className = "ghost-btn";
        rename.textContent = "Rename";
        rename.onclick = async () => {
          const name = prompt("New group name:", g.name);
          if (name) await updateDoc(doc(db, "groups", g.id), { name });
        };
        right.appendChild(rename);
      }

      const leave = document.createElement("button");
      leave.className = "ghost-btn";
      leave.textContent = mine ? "Remove Member" : "Leave";
      leave.onclick = async () => {
        if (mine) {
          const member = prompt("Enter member ID to remove:");
          if (member) await updateDoc(doc(db, "groups", g.id), { members: arrayRemove(member) });
        } else {
          await updateDoc(doc(db, "groups", g.id), { members: arrayRemove(state.me.userId) });
        }
      };
      right.appendChild(leave);
      ul.appendChild(li);
    });
  });
}

$("auth-form").onsubmit = async (e) => {
  e.preventDefault();
  const userId = $("user-id").value.trim();
  const password = $("password").value;

  try {
    if (state.mode === "signup") await handleSignUp(userId, password);
    else await handleLogin(userId, password);
  } catch (err) {
    $("auth-error").textContent = err.message;
  }
};

$("tab-login").onclick = () => setAuthMode("login");
$("tab-signup").onclick = () => setAuthMode("signup");
$("logout-btn").onclick = async () => signOut(auth);
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
  const user = await findUserByUserId(id);
  const out = $("friend-search-result");
  if (!user) {
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
    await updateDoc(doc(db, "users", state.me.userId), { friends: arrayUnion(user.userId) });
    await updateDoc(doc(db, "users", user.userId), { friends: arrayUnion(state.me.userId) });
    await startOrFindDirectChat(user);
    out.innerHTML = `<p class="muted">Added successfully.</p>`;
  };
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
$("clear-chat-btn").onclick = async () => {
  if (!state.selectedChat) return;
  const snap = await getDocs(collection(db, "chats", state.selectedChat.id, "messages"));
  for (const d of snap.docs) await deleteDoc(d.ref);
};

$("block-btn").onclick = async () => {
  if (state.selectedChat?.peerUserId) {
    await updateDoc(doc(db, "users", state.me.userId), { blocked: arrayUnion(state.selectedChat.peerUserId) });
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
  await addDoc(collection(db, "groups"), {
    name,
    photoUrl,
    members: [state.me.userId],
    adminId: state.me.userId,
    createdAt: serverTimestamp()
  });
  $("group-name").value = "";
  $("group-photo").value = "";
};

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    if (state.meDoc) await updateDoc(state.meDoc, { status: "offline" }).catch(() => {});
    state.me = null;
    showScreen(accountPage);
    return;
  }

  await loadSelf();
  showScreen(chatListPage);
});

setAuthMode("login");
