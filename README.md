# Tab Creator

Write guitar tabs by clicking a spot on the staff and typing, instead of hand-editing dashes in a
text box. When you're done, copy the result as plain text and paste it into Ultimate Guitar, or as
a markdown code block for Obsidian.

**Try it live: <https://tab-creator-two.vercel.app>**

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

**Use the hosted copy** at <https://tab-creator-two.vercel.app>. Nothing to install; your tab is
saved in your own browser.

**Or just open it.** Download the repo and double-click `public/index.html`. That's all it needs.

**Or run the Docker image.** Every push to `main` builds an image (amd64, arm64 and arm/v7) and
pushes it to this repository's container registry:

```bash
docker run -d -p 8085:80 ghcr.io/jrdnrgrs/tab-creator:latest
```


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
