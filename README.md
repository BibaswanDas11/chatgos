# Chatgos

A responsive, WhatsApp-inspired web chat interface with a non-blue color palette.

## Features implemented

- Account page with login and account creation.
- User ID constraints (`[A-Za-z0-9]+`) and duplicate check with exact red message: `User ID already exists`.
- Firebase Authentication + Firestore `users` storage model.
- Chat list page with `☰ Chatgos` header, menu (Settings + Logout), and two floating action buttons.
- Friends panel with empty state: `No friends till now. Try adding some.` and Unfriend action.
- Add Friends panel that searches by user ID and adds both users to each other's friend lists.
- Chat window with profile popup (display picture, username, user ID) and actions: Block, Clear Chat, Unfriend.
- Text messaging, reply-to metadata support, and selected-message deletion.
- Group chats with create, rename/admin controls, add/remove members (via admin), and member leave behavior.
- Responsive design for mobile + desktop.

## Setup

1. Create Firebase project and enable **Email/Password Authentication**.
2. Create Firestore collections:
   - `users`
   - `chats` with subcollection `messages`
   - `groups`
3. Update `firebase-config.js` with your config values.
4. Serve the folder using any static web server, for example:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## If the files are not showing up on GitHub

If your local repo has these files but GitHub does not, it usually means the commit was never pushed.

Run these commands in your local repository:

```bash
git status
git remote -v
git log --oneline -n 5
git push origin <your-branch-name>
```

If this is a brand new repository or branch, run:

```bash
git push -u origin <your-branch-name>
```

Then refresh your GitHub repo page and switch to the same branch name you pushed.

## Firestore schema overview

### users/{userId}

- `uid`, `userId`, `username`, `photoUrl`, `status`, `friends[]`, `blocked[]`, timestamps

### chats/{chatId}

- `type: "direct"`, `members[]`, `name`, `peerUserId`, `lastMessage`, `updatedAt`
- `messages/{messageId}` -> `senderId`, `text`, `replyTo`, `replyToPreview`, `createdAt`

### groups/{groupId}

- `name`, `photoUrl`, `members[]`, `adminId`, `createdAt`
