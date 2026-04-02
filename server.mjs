import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PORT = process.env.PORT || 8080;
const DB_FILE = join(__dirname, "db.json");

const clients = new Map();

const now = () => Date.now();
const uid = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;
const directChatId = (a, b) => [a, b].sort().join("__");

function defaultDb() {
  return { users: {}, chats: {}, groups: {} };
}

function loadDb() {
  if (!existsSync(DB_FILE)) return defaultDb();
  try {
    return JSON.parse(readFileSync(DB_FILE, "utf8"));
  } catch {
    return defaultDb();
  }
}

let db = loadDb();

function saveDb() {
  writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function send(res, status, payload, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function ensureDirectChat(a, b) {
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

function bootstrapFor(userId) {
  const me = db.users[userId];
  if (!me) return null;
  const friends = (me.friends || []).map((id) => db.users[id]).filter(Boolean);
  const chats = friends.map((friend) => {
    const chat = ensureDirectChat(userId, friend.userId);
    return {
      id: chat.id,
      type: "direct",
      name: friend.username,
      photoUrl: friend.photoUrl || "",
      peerUserId: friend.userId,
      online: friend.status === "online",
      lastMessage: chat.messages.at(-1)?.text || "No messages yet",
      updatedAt: chat.updatedAt || 0,
      messages: chat.messages || []
    };
  });
  const groups = Object.values(db.groups).filter((g) => g.members.includes(userId));
  return { me, friends, chats, groups };
}

function notifyUsers(userIds) {
  const unique = [...new Set(userIds.filter(Boolean))];
  unique.forEach((userId) => {
    const set = clients.get(userId);
    if (!set) return;
    const payload = JSON.stringify({ type: "sync", at: now() });
    for (const res of set) {
      res.write(`data: ${payload}\n\n`);
    }
  });
}

function contentType(path) {
  const ext = extname(path);
  return (
    {
      ".html": "text/html; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".json": "application/json; charset=utf-8"
    }[ext] || "text/plain; charset=utf-8"
  );
}

async function handleApi(req, res, url) {
  if (url.pathname === "/events" && req.method === "GET") {
    const userId = url.searchParams.get("userId") || "";
    if (!db.users[userId]) return send(res, 404, { error: "Unknown user" });
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*"
    });
    res.write("retry: 1000\n\n");

    if (!clients.has(userId)) clients.set(userId, new Set());
    clients.get(userId).add(res);

    req.on("close", () => {
      const set = clients.get(userId);
      if (!set) return;
      set.delete(res);
      if (!set.size) clients.delete(userId);
    });
    return;
  }

  if (url.pathname === "/api/signup" && req.method === "POST") {
    const { userId, password } = await readBody(req);
    if (!/^[A-Za-z0-9]+$/.test(userId || "")) return send(res, 400, { error: "User ID must contain only letters and numbers" });
    if (db.users[userId]) return send(res, 400, { error: "User ID already exists" });
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
    saveDb();
    notifyUsers([userId]);
    return send(res, 200, { ok: true });
  }

  if (url.pathname === "/api/login" && req.method === "POST") {
    const { userId, password } = await readBody(req);
    const user = db.users[userId];
    if (!user || user.password !== password) return send(res, 400, { error: "Invalid User ID or password" });
    user.status = "online";
    saveDb();
    notifyUsers([userId, ...(user.friends || [])]);
    return send(res, 200, { ok: true });
  }

  if (url.pathname === "/api/logout" && req.method === "POST") {
    const { userId } = await readBody(req);
    const user = db.users[userId];
    if (user) {
      user.status = "offline";
      saveDb();
      notifyUsers([userId, ...(user.friends || [])]);
    }
    return send(res, 200, { ok: true });
  }

  if (url.pathname === "/api/bootstrap" && req.method === "GET") {
    const userId = url.searchParams.get("userId");
    const data = bootstrapFor(userId);
    if (!data) return send(res, 404, { error: "Unknown user" });
    return send(res, 200, data);
  }

  if (url.pathname === "/api/search-user" && req.method === "GET") {
    const userId = url.searchParams.get("userId");
    const user = db.users[userId];
    return send(res, 200, { user: user ? { userId: user.userId, username: user.username, photoUrl: user.photoUrl } : null });
  }

  if (url.pathname === "/api/friends/add" && req.method === "POST") {
    const { me, friendId } = await readBody(req);
    if (!db.users[me] || !db.users[friendId]) return send(res, 404, { error: "User not found" });
    if (!db.users[me].friends.includes(friendId)) db.users[me].friends.push(friendId);
    if (!db.users[friendId].friends.includes(me)) db.users[friendId].friends.push(me);
    ensureDirectChat(me, friendId);
    saveDb();
    notifyUsers([me, friendId]);
    return send(res, 200, { ok: true });
  }

  if (url.pathname === "/api/friends/remove" && req.method === "POST") {
    const { me, friendId } = await readBody(req);
    if (!db.users[me] || !db.users[friendId]) return send(res, 404, { error: "User not found" });
    db.users[me].friends = db.users[me].friends.filter((id) => id !== friendId);
    db.users[friendId].friends = db.users[friendId].friends.filter((id) => id !== me);
    saveDb();
    notifyUsers([me, friendId]);
    return send(res, 200, { ok: true });
  }

  if (url.pathname === "/api/block" && req.method === "POST") {
    const { me, targetId } = await readBody(req);
    if (!db.users[me]) return send(res, 404, { error: "User not found" });
    if (!db.users[me].blocked.includes(targetId)) db.users[me].blocked.push(targetId);
    saveDb();
    notifyUsers([me]);
    return send(res, 200, { ok: true });
  }

  if (url.pathname === "/api/messages/send" && req.method === "POST") {
    const { chatType, chatId, from, to, text, replyTo, replyToPreview } = await readBody(req);
    const message = { id: uid("msg"), senderId: from, text, createdAt: now(), replyTo: replyTo || null, replyToPreview: replyToPreview || null };
    if (chatType === "group") {
      const group = db.groups[chatId];
      if (!group) return send(res, 404, { error: "Group not found" });
      group.messages.push(message);
      group.lastMessage = text;
      group.updatedAt = now();
      saveDb();
      notifyUsers(group.members);
      return send(res, 200, { ok: true });
    }
    const direct = ensureDirectChat(from, to);
    direct.messages.push(message);
    direct.lastMessage = text;
    direct.updatedAt = now();
    saveDb();
    notifyUsers([from, to]);
    return send(res, 200, { ok: true });
  }

  if (url.pathname === "/api/messages/delete" && req.method === "POST") {
    const { chatType, chatId, ids } = await readBody(req);
    if (chatType === "group") {
      const group = db.groups[chatId];
      if (!group) return send(res, 404, { error: "Group not found" });
      group.messages = group.messages.filter((m) => !ids.includes(m.id));
      saveDb();
      notifyUsers(group.members);
      return send(res, 200, { ok: true });
    }
    const chat = db.chats[chatId];
    if (!chat) return send(res, 404, { error: "Chat not found" });
    chat.messages = chat.messages.filter((m) => !ids.includes(m.id));
    saveDb();
    notifyUsers(chat.members);
    return send(res, 200, { ok: true });
  }

  if (url.pathname === "/api/chats/clear" && req.method === "POST") {
    const { chatType, chatId } = await readBody(req);
    if (chatType === "group") {
      const group = db.groups[chatId];
      if (!group) return send(res, 404, { error: "Group not found" });
      group.messages = [];
      saveDb();
      notifyUsers(group.members);
      return send(res, 200, { ok: true });
    }
    const chat = db.chats[chatId];
    if (!chat) return send(res, 404, { error: "Chat not found" });
    chat.messages = [];
    saveDb();
    notifyUsers(chat.members);
    return send(res, 200, { ok: true });
  }

  if (url.pathname === "/api/groups/create" && req.method === "POST") {
    const { userId, name, photoUrl } = await readBody(req);
    const id = uid("grp");
    db.groups[id] = {
      id,
      type: "group",
      name,
      photoUrl: photoUrl || "",
      members: [userId],
      adminId: userId,
      createdAt: now(),
      updatedAt: now(),
      lastMessage: "",
      messages: []
    };
    saveDb();
    notifyUsers([userId]);
    return send(res, 200, { ok: true, groupId: id });
  }

  if (url.pathname === "/api/groups/rename" && req.method === "POST") {
    const { userId, groupId, name } = await readBody(req);
    const group = db.groups[groupId];
    if (!group) return send(res, 404, { error: "Group not found" });
    if (group.adminId !== userId) return send(res, 403, { error: "Admin only" });
    group.name = name;
    saveDb();
    notifyUsers(group.members);
    return send(res, 200, { ok: true });
  }

  if (url.pathname === "/api/groups/add-member" && req.method === "POST") {
    const { userId, groupId, memberId } = await readBody(req);
    const group = db.groups[groupId];
    if (!group) return send(res, 404, { error: "Group not found" });
    if (group.adminId !== userId) return send(res, 403, { error: "Admin only" });
    if (!db.users[memberId]) return send(res, 404, { error: "Member not found" });
    if (!group.members.includes(memberId)) group.members.push(memberId);
    saveDb();
    notifyUsers(group.members);
    notifyUsers([memberId]);
    return send(res, 200, { ok: true });
  }

  if (url.pathname === "/api/groups/remove-member" && req.method === "POST") {
    const { userId, groupId, memberId } = await readBody(req);
    const group = db.groups[groupId];
    if (!group) return send(res, 404, { error: "Group not found" });
    if (group.adminId !== userId) return send(res, 403, { error: "Admin only" });
    group.members = group.members.filter((m) => m !== memberId && m !== group.adminId);
    saveDb();
    notifyUsers(group.members);
    notifyUsers([memberId]);
    return send(res, 200, { ok: true });
  }

  if (url.pathname === "/api/groups/leave" && req.method === "POST") {
    const { userId, groupId } = await readBody(req);
    const group = db.groups[groupId];
    if (!group) return send(res, 404, { error: "Group not found" });
    group.members = group.members.filter((m) => m !== userId);
    saveDb();
    notifyUsers([...group.members, userId]);
    return send(res, 200, { ok: true });
  }

  return false;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    return res.end();
  }

  if (url.pathname.startsWith("/api/") || url.pathname === "/events") {
    const out = await handleApi(req, res, url);
    if (out === false) send(res, 404, { error: "Not found" });
    return;
  }

  const filePath = url.pathname === "/" ? join(__dirname, "index.html") : join(__dirname, url.pathname);
  try {
    const raw = readFileSync(filePath);
    res.writeHead(200, { "Content-Type": contentType(filePath) });
    res.end(raw);
  } catch {
    send(res, 404, { error: "Not found" });
  }
});

server.listen(PORT, () => {
  console.log(`Chatgos server running on http://localhost:${PORT}`);
});
