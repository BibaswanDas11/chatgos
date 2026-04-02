# Chatgos

A responsive, WhatsApp-inspired web chat interface with a non-blue color palette.

## Backend model (offline)

This version uses **no online backend**. All data is stored in browser `localStorage` under:

- `chatgos-db` (users, direct chats, groups, messages)
- `chatgos-session` (logged-in user)

That means:
- Works fully offline in a single browser profile.
- Data persists locally on that device/browser.
- Opening the app in multiple tabs syncs via the browser `storage` event.

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

1. No Firebase setup is required.
2. Serve this folder using any static web server, for example:

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


## FAQ: realtime + profiles in this offline version

- **Realtime messaging:** Yes, but only within the same browser profile (for example, multiple tabs on one machine). Cross-device internet realtime is not included in this offline build.
- **Real accounts/profiles:** Yes, accounts are persisted locally. If a user signs up, logs out, and returns later on the same browser/profile (without clearing site storage), they can log in again with the same User ID/password.
- **When data is lost:** Clearing browser storage/site data, private/incognito session reset, or switching to another device/browser profile.
