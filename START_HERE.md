# The Room Remix

A tiny, interactive interior-design playground. Rearrange a sunlit studio or a little bedroom, try a different palette, and compare your room with its original layout.

![Room Remix's studio and design controls](docs/room-remix.png)

## What you need

- Git.
- Python 3.9 or newer.
- A current browser, such as Chrome, Edge, Firefox, or Safari.

Everything else is included. There are no packages to install, accounts to create, or API keys to configure. After cloning, the room playground works offline. The coding challenge needs an internet connection to open your question.

Check your setup before the session:

| | macOS / Linux | Windows PowerShell |
|---|---|---|
| Git | `git --version` | `git --version` |
| Python | `python3 --version` | `py -3 --version` |

If either command is missing, install [Git](https://git-scm.com/downloads) or [Python](https://www.python.org/downloads/) first. Git and Python are explicit prerequisites; they may not already be installed on your laptop. On Windows, the Python installer should enable the `py` launcher. If you have a working `python --version` showing Python 3.9+, you can use `python` instead of `py -3` below.

## Launch the playground

Open a terminal. On Windows, PowerShell is fine. Clone this repository and enter its folder:

```sh
git clone https://github.com/Dream-Technologies/room-remix.git
cd room-remix
```

**macOS / Linux**

```sh
python3 demo.py
```

**Windows PowerShell**

```powershell
py -3 demo.py
```

Your browser opens automatically. If it doesn't, open the `http://127.0.0.1:...` link printed in the terminal. Keep that terminal running while you explore.

## Make yourself at home

1. Drag furniture to rearrange the room. Pieces stay inside the room.
2. Select a piece and click the rotate button, or press **R**.
3. Choose **Warm minimal**, **Colorful retro**, or **Cozy corner**. A style changes the room's palette and materials while preserving your furniture positions.
4. Try a wall color, flooring, or a selected piece's fabric or finish.
5. Switch between **Before** and **After**. Before shows the original room; After preserves your design and lets you keep editing.
6. Try the bedroom from the room selector. **Start fresh** resets the current room.

For keyboard controls, select a piece from the furniture list, then use the **arrow keys** to nudge it along the room's axes. Hold **Shift** for bigger steps. Press **R** to rotate or **Escape** to deselect. The controls also work with touch.

Your design lives in this browser tab. Refreshing, switching rooms, or starting fresh resets it. This is a playful design sketch, with free placement inside the room; it doesn't check furniture collisions or building requirements.

## Try another command

First stop the program with **Ctrl+C** in the terminal. Then launch the bedroom:

```sh
# macOS / Linux
python3 demo.py --room tiny-bedroom
```

```powershell
# Windows PowerShell
py -3 demo.py --room tiny-bedroom
```

You can also discover the available options:

```sh
python3 demo.py --help
```

On Windows, use `py -3 demo.py --help`.

| Option | What it does |
|---|---|
| `--room studio` | Opens the sunlit studio (the default). |
| `--room tiny-bedroom` | Opens the bedroom. |
| `--no-browser` | Prints both links without opening a browser. |
| `--ide` | Opens the coding-challenge editor. |
| `--port 8000` | Uses a specific local port. By default, the launcher finds an available port. |

When you're finished, press **Ctrl+C** in the terminal to stop the program. No source-file changes, commits, or submissions are required to explore the demo.

## Coding challenge

Open the editor directly with `python3 demo.py --ide` on macOS or Linux, or `py -3 demo.py --ide` in Windows PowerShell. You can also click **Code** in the room page header.

The editor first asks for an **interview code**. Your interviewer gives you one at the start of the session; it looks like `K7QF2-M9XRT`. Type it in and click **Open question**. The editor then shows your question in the **Challenge** panel and its starter code in the editor.

Each code works only once. Refreshing the page keeps your question, but if you close the tab or your browser crashes, ask your interviewer for a new code. Your code in the editor is saved in this browser and comes back when you open the question again.

Choose **Python**, **JavaScript**, **TypeScript**, or **Other**. Python runs with the Python you already need to launch the demo. JavaScript and TypeScript run in your browser, so no other runtimes are needed. **Other** is for writing in any language that you want to talk through instead of running.

For runnable languages, the **Input** box is standard input. Press **Run** (**Ctrl+Enter** or **Cmd+Enter**) to see the output. There is no autocomplete or AI. Use **Copy** if you want to keep your code somewhere else.

Some questions use NumPy. If **Run** reports `No module named numpy`, install it with `python3 -m pip install numpy` (Windows: `py -3 -m pip install numpy`) and run again.

## If something doesn't work

- **Command not found:** check the prerequisites above. Try `py -3` or a verified Python 3 `python` command on Windows.
- **Can't open `demo.py`:** run the command from the `room-remix` folder. Check your location with `pwd` in macOS, Linux, or PowerShell. Use `ls` to see the files.
- **Browser didn't open:** copy the complete link printed in the terminal into a browser on the same laptop.
- **Port already in use:** launch without `--port` to automatically choose an available port.
- **Room stopped responding:** make sure the terminal is still running the program, then refresh the browser.
- **Interview code didn't work:** check that you typed it exactly, then ask your interviewer for a new one. A code stops working once it's used or after 24 hours.
- **"Can't reach Dream":** the coding challenge needs an internet connection to open your question. Check your connection and try again.

## What's inside

```text
room-remix/
  START_HERE.md       This guide
  demo.py             Python standard-library launcher and local server
  dist/
    index.html        Design desk and semantic controls
    styles.css        Responsive layout
    app.js            Canvas geometry and interactions
    ide.html          Coding-challenge editor
    ide.css           Editor layout and styles
    ide.js            Editor and runner controls
    js-runner.js      Browser JavaScript and TypeScript runner
    vendor/
      sucrase.js      Offline TypeScript transpiler
      sucrase-entry.js Sucrase transform export for rebuilding
      README.md       Vendored transpiler version and rebuild command
      LICENSE         Sucrase MIT license
  docs/
    room-remix.png    Screenshot of the demo
  tests/
    test_launcher.py  Standard-library launcher checks
    test_ide.py       Coding-editor and runner checks
  LICENSE             MIT
```

The floorplans, dimensions, palettes, and geometric furniture are invented specifically for this demo. The rendering and interactions are implemented independently. This repository contains no production app code, real catalog assets, customer projects, private datasets, or internal design algorithms. It uses no analytics or external assets. The only network request beyond the local server is the coding challenge sending your interview code to Dream's API (`https://api.dreamhq.com`) to open your question.

For contributors, run the tests with `python3 -m unittest discover -s tests -v` (Windows: `py -3 -m unittest discover -s tests -v`). Optional browser-agent hooks use feature detection and don't affect regular browsers.
