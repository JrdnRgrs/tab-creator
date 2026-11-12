# Tab Creator

Write guitar tabs by clicking a spot on the staff and typing, instead of hand-editing dashes in a
text box. When you're done, copy the result as plain text and paste it into Ultimate Guitar, or as
a markdown code block for Obsidian.

```
Intro
e|--------------------------------------------------------------------------|
B|-------------6------------------------------------------------------------|
G|---7-7-5-7-7-7-7-7-5-7----7-7-7-7-7-7-7-7-7-7-7-7-7-7-7-7-----------------|
D|---0-0-0-0-0-0-0-0-0-0----0-0-0-0-0-0-0-0-0-0-0-0-0-0-0-0-----------------|
A|--------------------------------------------------------------------------|
E|--------------------------------------------------------------------------|
```

It is a static web page: HTML, CSS and plain JavaScript, with no build step, no dependencies and
no backend. Your tab is saved in the browser you're using and never leaves it.

## Running it

**Just open it.** Double-click `public/index.html`. That's all it needs.

**Or serve it locally**, which behaves the same but gives it a normal `http://` address:

```bash
python -m http.server 8765 --directory public
```

Then open <http://localhost:8765>.

**Or run it in Docker** (see below) to have it always available on a home server.

## Deploying with Docker

The image is nginx serving the `public/` folder. It builds as is on a Raspberry Pi (arm64 or
32-bit) and on a normal PC.

```bash
docker compose up -d --build
```

Then open `http://<host>:8085`. Change the port on the left side of `ports` in
`docker-compose.yml` if 8085 is taken. After pulling a newer version, run the same command again.

### Portainer

The compose file builds the image from this folder, so Portainer needs the folder, not only the
compose text. Either:

- **Stack from a Git repository** (Stacks → Add stack → Repository): point it at this repo and set
  the compose path to `docker-compose.yml`. Portainer clones the repo and builds on the Pi.
- **Or build on the Pi yourself**: copy or clone this folder onto the Pi, run
  `docker compose up -d --build` in it, and the container then shows up in Portainer.

Pasting `docker-compose.yml` on its own into Portainer's web editor will not work, because there
is nothing there for `build: .` to build from.

### Cloudflare Tunnel

Point the tunnel's public hostname at the container:

- If `cloudflared` runs in Docker, put both containers on the same network (there is a commented
  block for this in `docker-compose.yml`) and use `http://tab-creator:80` as the service.
- If `cloudflared` runs on the host, use `http://localhost:8085`.

Things to know before putting it on the internet:

- There is no login. Anyone with the address can use the editor. They cannot see your tabs,
  because tabs are stored in each visitor's own browser, not on the server. If you'd rather keep
  it to yourself, put a Cloudflare Access policy in front of the hostname.
- Tabs are saved per browser and per address. A tab written at `http://pi:8085` will not appear
  at `https://tabs.example.com` or on your phone. Use **Copy tab** to move one, and **Import tab…**
  to bring it back in.

## Using it

Click any cell on a string and type. The character lands there and nothing else moves.

| Key | What it does |
| --- | --- |
| Click, then type | Put a fret number or symbol in that cell |
| `Enter` / `Shift+Enter` | Next string down / up in the same column, for stacking a chord |
| `Tab` | Jump to the next note column, leaving one dash |
| `Space` | Blank the cell and step right |
| `Backspace`, `Delete` | Erase |
| `Shift+arrows`, or drag | Select a region. `Ctrl+C`, `Ctrl+X`, `Ctrl+V` work on it |
| `Ctrl+D` | Repeat the selection to the right |
| `Ctrl+Space` (or `Insert`) | Insert a column across all strings |
| `Ctrl+Backspace`, `Ctrl+Delete` | Remove a column (behind / at the cursor) |
| The same with `Shift` | Insert or remove on the current string only |
| `Ctrl+B` | Bar line down all strings |
| `Ctrl+Enter` | New staff below |
| `End` | Jump to just past the last note on the string |
| `Ctrl+P` | Play / stop |
| `Ctrl+Z`, `Ctrl+Y` | Undo, redo |

Typing past the right edge of a staff makes it longer.

**Techniques.** Type them (`5h7`, `7p5`, `7b9`, `5/7`, `7~`, `x`), or use the toolbar. `( )` and
`< >` wrap the fret number at the cursor. `PM` writes on the line above the staff; select a span
of columns first to get `PM-----|`.

**Text lines.** Each staff has a line above it for lyrics, chord names or a section name, which
stays lined up with the columns underneath. Hover a staff for buttons to add more lines above or
below. Free text between staffs goes in a text block (`+ Text`).

**Chord stamp.** Pick a root and a quality in the sidebar and click a shape to stamp it at the
cursor. The stock shapes are for six strings in standard tuning. The custom box takes any shape,
lowest string first: `x32010`, or `8 10 10 9 8 8` when a fret has two digits.

**Strings and tuning.** The Staff bar has presets (guitar tunings, 7-string, bass, ukulele, banjo)
and a box for your own labels, top line to bottom line. The number of labels is the number of
strings. Untick *labels* for bare `|` lines.

**Import.** *Import tab…* takes pasted text and turns it back into editable staffs, so you can fix
up or extend an existing tab.

### Playback

**▶ Play** plays the current staff and everything after it. With a region selected it plays just
that region, and only the strings in it. Shift+click starts from the cursor.

Text tabs do not record rhythm, so playback gives every column the same amount of time; the
*Speed* slider sets how much. Notes spaced further apart sound further apart, and that's all it
knows. It is meant for checking that the notes are right, not for hearing the song as played.

Pitches come from the string labels. The presets are exact. For labels you type yourself it
assumes a guitar-range tuning with each string lower than the one above it. Hammer-ons, pull-offs,
slides and bends are played as separate, slightly softer notes; `x` is a short muted hit; vibrato
and other marks are ignored.

Tick *sound as I type* to hear each note as you enter it.

## Project layout

```
public/               the site; this folder is all that gets served
  index.html
  css/styles.css
  js/core.js          tab model, text import/export, note reading (no DOM, also runs in Node)
  js/chords.js        chord shapes for the stamp panel
  js/audio.js         plucked-string synth (Web Audio)
  js/app.js           the editor UI
  js/theme.js         applies a saved light/dark choice before the page paints
test/core.test.js     tests for core.js and chords.js
Dockerfile            nginx + public/
nginx.conf
docker-compose.yml
```

The scripts are ordinary `<script>` files, not ES modules, so the page keeps working when opened
straight from disk.

## Tests

```bash
npm test
```

Needs Node 18 or newer and nothing else. The tests cover the model and the text import/export; the
editor UI itself is not under test.

## Notes

- Made for a desktop browser with a keyboard and mouse. It is not set up for touch screens.
- Light or dark follows your system until you use the switch in the top bar.
