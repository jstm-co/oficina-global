# Oficina global

**English** · [Español](README.es.md)

A [Paperclip](https://github.com/paperclipai/paperclip) plugin that draws the agents of **every company** in your instance in a pixel-art office: who is working, who needs you, who failed, who is paused and who is idle. You can answer their questions without leaving the office, get spoken notifications and leave it running on a TV.

**The interface and the voices are in Spanish** (Chilean voices included). This README quotes the on-screen labels in Spanish, with a translation the first time they appear.

- Plugin key: `jstm.oficina-pixel` · npm package: `paperclip-plugin-oficina-global` · version `0.9.7`
- Tested with Paperclip `2026.824.1`.

## What it does

- **One floor, one room per company.** Each agent has a desk and a character. While working, it types with its issue ID in a speech bubble; when it needs you, it raises its hand and lines up in front of your desk; on an error it turns red; when paused it sleeps; when idle it goes to the break room.
- **It moves.** Agents walk between their desk and the break room. An issue handed from one agent to another travels in an envelope or is handed over at the table. Idle agents chat about what is actually going on in the office, and pets in the hallway react when you click them.
- **Answer without leaving.** The questions, confirmations, suggested tasks and approvals that agents leave for you («Te toca», your turn) are answered in a window inside the office, with your session. The office only writes when you send an answer.
- **Notifications and voices** (off until you turn them on). When an agent starts needing you, a bell rings and its voice says what it needs («te necesito», I need you; «tengo un error», I have an error; «terminé», I'm done; «empecé», I started), with a different voice for each agent.
- **Choosing the voices** (0.11.0). In «Voces» (Voices), «Quién habla» (Who speaks) sets the voice of the **Resumen** (the spoken summary), the voice of **«Leer contexto»** (reads an issue aloud) and, on its own page, the voice of **each agent**, with a ▶ to hear each one first. The two that read on the spot only accept voices that answer in a few seconds (Lorenzo, Catalina, Alex, Dora, Santa) or the browser's voice; the four clones can be chosen for agents only. Changing an agent's voice records its phrases in the background and switches when they are all ready, so it never goes silent in between.
- **Room sign.** Under each room, a sign tells what each issue is about, one at a time.
- **Summary.** The «Resumen» (summary) button reads out loud what got done, what is waiting for you, what is being worked on and what is queued.
- **Read context.** In the top bar of each issue, a «Leer contexto» (read context) button reads out loud what the issue is about and what you are being asked.
- **3D view** (0.12.0). On a computer, the «Vista 3D» (3D view) button lets you walk through the same office in first person, starting at your desk: look around with the mouse and walk with W A S D. Each room has its walls, doors to the hallway and a ceiling with lamps; monitors can be read up close, an arrow points to whoever needs you and clicking someone opens their card, as in 2D. Agents' chats and handoffs show over their heads, and the light follows the viewer's clock: the sky through the windows, the sun reaching the floor and, at night, a dimmer office.
- **TV mode.** Full screen at 1920×1080, plus a link to open it on a TV with a session.
- **Phone.** The whole floor and, when you tap a room, that room zoomed in.

It shows up in the sidebar («Oficina global»), on its own page, as a Dashboard widget and in the top bar (on phones; on issue pages, on computers too).

## Requirements

- Paperclip with plugins (tested with `paperclipai` **2026.824.1**; the SDK is pinned to that version).
- To install from npm: npm on the machine where Paperclip runs, which uses it to download the package.
- To install from source: Node 22 and npm.
- Optional, for recorded voices: `uv`, `ffmpeg` and internet access (see [Voices](#voices)). Without them, the office uses the browser's voice.
- Optional, to let Chrome's built-in AI write part of the chats and the summary: desktop Chrome with Gemini Nano (see [Chrome AI](#chrome-ai)).

## Installation

Once, before installing: the CLI needs a user who owns the instance (installing requires board access).

```sh
npx paperclipai@2026.824.1 auth login --instance-admin --api-base http://<your-server>:3100
```

If you run it from a Paperclip agent's session, drop the agent's variables (`env -u PAPERCLIP_API_KEY -u PAPERCLIP_RUN_ID npx paperclipai …`): installing needs your session, not the agent's.

### From npm

```sh
npx paperclipai plugin install paperclip-plugin-oficina-global --api-base http://<your-server>:3100
```

Paperclip downloads it to `~/.paperclip/plugins/node_modules/paperclip-plugin-oficina-global` on the machine where it runs.

### From source

Paperclip loads the plugin from a local folder and serves the interface from its `dist/ui/`. It is best to install it from a separate copy from the one you edit.

```sh
git clone https://github.com/jstm-co/oficina-global.git
cd oficina-global
npm ci
npm run build
npx paperclipai plugin install "$PWD" --local --api-base http://<your-server>:3100
```

### Upgrading

If you installed from npm, `upgrade` downloads the latest published version:

```sh
npx paperclipai plugin upgrade jstm.oficina-pixel --api-base http://<your-server>:3100
```

If you installed from source:

```sh
git pull && npm ci && npm run build
npx paperclipai plugin upgrade jstm.oficina-pixel --api-base http://<your-server>:3100
```

### Uninstalling

```sh
npx paperclipai plugin disable jstm.oficina-pixel     # hides it without uninstalling
npx paperclipai plugin uninstall jstm.oficina-pixel   # removes it; it stores no data in Paperclip
```

The plugin only asks for interface capabilities (`ui.page.register`, `ui.sidebar.register`, `ui.dashboardWidget.register` and `ui.action.register`). The interface reads everything with the user's session, like Paperclip's Inbox.

## Voices

Voices are optional. The audio files are generated **once, on your computer**, and the page only plays them. Without them, the browser's voice speaks.

Run the generator in the plugin's folder: your clone if you installed from source, or `~/.paperclip/plugins/node_modules/paperclip-plugin-oficina-global` if you installed from npm.

```sh
npm run voces -- --api http://<your-server>:3100              # reads the agents with the CLI session (~/.paperclip/auth.json), GET only
npm run voces -- --api http://<your-server>:3100 --solo-plan  # no generation: which voice each agent gets and how many phrases are missing
```

| Voice | Engine | License |
|---|---|---|
| Lorenzo and Catalina (Chilean) | Microsoft Edge TTS (`edge-tts`) | Unofficial free service: **Microsoft receives the text of every phrase** (agent and issue names) |
| Alex, Dora and Santa | Kokoro-82M (`kokoro-onnx`) | Apache 2.0 |
| 2 Chilean clones | Chatterbox Multilingual (`chatterbox-tts`) | MIT |
| 2 Chilean clones | Qwen3-TTS 0.6B (`qwen-tts`) | Apache 2.0 |

- It needs `uv` (each engine runs with `uv run --with <package>`), `ffmpeg`, and internet access for Edge and to download the models the first time. It runs one engine at a time; the clones use ~4–5 GB of memory and take longer.
- The audio files go to `dist/ui/voces/` with their `indice.json`. When a new agent shows up, run the generator again: it only does what is missing.
- If you installed from npm, every upgrade replaces the plugin's folder and takes the audio files with it: run the generator again after `upgrade`.
- Since 0.5.0, the plugin's worker also builds on the fly the phrases that say the issue's name (in `dist/ui/voces/vivo/`, deleted after 7 days). For that, `uv` and `ffmpeg` must be on the `PATH` Paperclip starts with.
- The audio files are served next to the plugin's interface without a session: they say the name of each agent and its company. Keep that in mind if your Paperclip is open to the internet.

## Chrome AI

In desktop Chrome, Gemini Nano (free and local) can write the ending of the break-room chats and parts of the summary. You pick it in the «Conversaciones» (chats) menu. A check throws out anything that changes the meaning or brings in words that do not exist; without the AI, the usual phrases are used.

Chrome's AI only exists on secure pages: if you open Paperclip over `http://`, add its address in `chrome://flags/#unsafely-treat-insecure-origin-as-secure` and relaunch Chrome.

## Adapting it to your instance

This needs an install from source.

- `src/instancia.ts`: the fixed character of some agents (by ID) and how proper names are pronounced by the voices. In this copy it is empty: each agent gets a character from its name, title and role.
- `src/plano.ts`: how many columns each room has and which companies get their own color, by prefix. It comes tuned for the rooms of our instance (prefixes `BET`, `ELM`, `JST` and `MIG`); the others are drawn with the default sizes and in gray.

## Development

```sh
npm ci
npm test            # tests (vitest)
npm run typecheck
npm run build       # dist/: worker, manifest, interface, tv.html and the voice generator
```

The code is in `src/` (the logic, without React or the DOM, kept apart from `src/ui/`), the tests in `tests/` and the voice generator in `generador/`. Code comments are in Spanish and mention issues from our internal board («JST-123»), which are not public.

## Known limits

- The Paperclip API routes it reads are not part of the SDK (they are all in `src/fuentes.ts`): they may change with a new Paperclip version.
- The operating system notification needs `https://`; over `http://`, Paperclip shows the notice inside the page.
- Sound and voices start with your first click on the tab after opening it.
- iPhone has no full screen for web pages: TV mode explains how to add it to the home screen. It was not tested in Safari or on a real iPhone.
- The 3D view needs WebGL 2 and is for computers only (not on phones or in TV mode).
- Edge TTS is an unofficial service: if Microsoft changes it, the Lorenzo and Catalina voices stop generating until `edge-tts` is updated.

## Contributing and releases

Pull requests are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md). Every pull request runs the tests, the type check and the build on GitHub Actions. When a maintainer merges one that bumps the version in `package.json`, GitHub Actions publishes that version to npm by itself, with [provenance](https://docs.npmjs.com/generating-provenance-statements), and creates its GitHub Release. Nobody publishes from their own computer.

## License and attributions

The code is by JSTM, under the [MIT](LICENSE) license. The sprites and the notification sound are original (built by the scripts in `src/ui/assets/fuente/`).

There are two exceptions, under **CC BY-SA 4.0**:

- `generador/referencias/ref_hombre_cl.wav` and `ref_mujer_cl.wav`: phrases from the **Google Crowdsourced Chilean Spanish** set (OpenSLR 71, on Hugging Face as `ylacombe/google-chilean-spanish`), © Google. The voice clones come from them.
- `src/ia/palabrasFiltro.ts`: a filter with the most frequent Spanish words in the OpenSubtitles 2018 subtitles, from [FrequencyWords](https://github.com/hermitdave/FrequencyWords) (Hermit Dave).

See [AVISOS.md](AVISOS.md) (in Spanish). This project is not affiliated with Paperclip.
