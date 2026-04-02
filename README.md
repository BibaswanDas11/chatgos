# Chatgos

A responsive, WhatsApp-inspired web chat interface with a non-blue color palette.

## Backend model (self-hosted, no Firebase)

This version removes Firebase and uses a lightweight self-hosted Node backend:

- `server.mjs` serves the app + REST APIs + SSE realtime events.
- `db.json` stores users/chats/groups/messages on the server filesystem.
- Browser `localStorage` stores only `chatgos-session` (current signed-in user).

This gives you:
- Realtime messaging across different accounts/devices connected to the same Chatgos server.
- Account persistence even if a user clears browser data (because account records live in `db.json`).

## Features implemented

- Account page with login and account creation.
- User ID constraints (`[A-Za-z0-9]+`) and duplicate check with exact red message: `User ID already exists`.
- Chat list page with `☰ Chatgos` header, menu (Settings + Logout), and two floating action buttons.
- Friends panel with empty state: `No friends till now. Try adding some.` and Unfriend action.
- Add Friends panel that searches by user ID and adds both users to each other's friend lists.
- Chat window with profile popup (display picture, username, user ID) and actions: Block, Clear Chat, Unfriend.
- Text messaging, reply-to metadata support, and selected-message deletion.
- Group chats with create, rename/admin controls, add/remove members (via admin), and member leave behavior.
- Responsive design for mobile + desktop.

## Setup

1. Start the Chatgos server:

```bash
node server.mjs
```

2. Open in browser:

```text
http://localhost:8080
```

## Notes

- To share across devices/accounts in realtime, all clients must open the same running server URL.
- `db.json` is created/updated automatically and is your persistent account/message store.
