# Meeting Windows preview

An Electron Windows x64 client for the existing Church meeting service. This preview connects to **https://dev.bolccop.org/meeting**. It needs an internet connection; it does not ship a separate backend or change the production website.

## Use

Run `release/BOLCCOP-Meeting-Dev-<version>-x64.exe`.

- **Sign-in** is a small card-sized window: no backdrop, only the form, with a faint close button top-right. Drag anywhere outside the fields to move it.
- **Home** (room list) and **meeting** windows have no title strip. Minimize / maximize / close sit in the page's top-right corner and the page header is the drag area; double-click it to maximize. No page scrollbars.
- **Devices**: camera and microphone are granted without a system prompt when you turn them on with the meeting buttons (Windows privacy settings still apply). Desktop joins start with both off.
- **Screen sharing** opens a Zoom-style chooser: the first screen is preselected, double-click or Enter shares, Esc cancels. The meeting window itself is never offered. "Share computer sound" is on by default. It captures all system audio, including the meeting itself, so others may hear an echo of their own voices unless the presenter uses headphones.
- Sharing a **whole screen** collapses the meeting to a floating toolbar at the top of the display (mic, camera, raise hand, Bible, chat, members, Stop sharing, expand). The hand button shows how many others have a hand up; clicking it drops down the queue (hosts can lower one or all) and your own raise/lower button. While anything is shared the meeting window is excluded from capture, so expanding it mid-share never shows the meeting inside the share. Bible/chat/members in the toolbar expand the full meeting; nothing else (such as a host opening the Bible) does.
- Shares go out at the screen's native resolution (capped at 1440p), up to 30 fps, as a single sharp layer: on a slow uplink the frame rate drops, never the resolution — as in Zoom. Cameras capture at 720p, and viewers receive video sized to their real screen pixels (not CSS pixels).
- Closing the window during a meeting asks the same in-app question as Hang up (hosts: end for everyone), then quits.

The preview is unsigned and has no automatic updater. Windows may show an unknown-publisher warning. The interface loads from Dev, so Dev web deploys reach the app on reload; changes to the files in this folder need a new executable.

## Development

```powershell
cd Church/desktop
npm ci
npm start
npm test
npm run smoke          # against Dev
npm run pack
```

For UI work against an undeployed web build, run Vite from `Church/` with `VITE_API_PROXY_TARGET=https://dev.bolccop.org npx vite`, then `set MEETING_DESKTOP_URL=http://localhost:2101/meeting` before `npm start` / `npm run smoke`. The override only applies when run through `electron .`; a packaged build always loads Dev.

The smoke test uses a temporary profile, mocks authentication and room services, checks layout transitions and capture cancellation, and never joins a real room. Screenshots are saved under `artifacts/`. Test two-client audio/video, host actions, whole-screen capture, window capture, audio sharing, and capture exclusion on Windows before distributing beyond a pilot group.

## Boundaries

- Remote renderer: sandbox and context isolation enabled; no Node access.
- IPC checks the sender webContents, main frame, exact Dev origin and meeting path.
- Privileged bridge only exposes stage/sharing/window controls, not arbitrary shell or file access.
- Devices start when enabled through meeting controls, without a duplicate app consent dialog. Windows privacy settings still apply. Display capture requires explicit source selection.
- External HTTP(S) links open in the system browser. Non-HTTP protocols and unexpected top-level navigation are blocked.
- No Cloudflare tokens, local environment files, or repository secrets are included in the package.

## Microphone in Remote Desktop

If Windows exposes only Remote Audio outputs and no microphone input, the app cannot capture a microphone. Enable Remote audio recording / Record from this computer in the Remote Desktop client, reconnect, then retry the microphone. A missing microphone no longer prevents desktop camera-only capture.
