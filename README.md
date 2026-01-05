# Text Based Table Top Simulator

## Description
This application is a table top simulator for pen and paper games like Dungeans and Dragons similar to roll20.
But this project is more reduced to the essentials and all the game definition is in a test-based campaign file that is easy to create with LLMs like Gemini or ChatGPT.

## Features
- Online Multiplayer: Multiple players can move tokens in real time simultaniously (identified by a session ID stored in local browser storrage)
- GM Mode vs. Player Mode: In GM Mode, the entire map is vissible and fog of war removed. In Player Mode, only the tokens of the player are vissible.
- Dynamic Ligting: Tokens are not visible on the screen unless one of the tokens you control can see them in the game (visibility radius and light source). Players can emit light
- Fog of War: At the beginning, the entire map is engoulved in fog of war. Once tokens saw it, it becomes known terrain.
- Only tokens that can be seen can be controlled
- **Campaign Validation**: Includes a [YAML schema](file:///home/jonas/projects/pnp-board/campaign-schema.json) for autocompletion and error checking in your IDE.

## Non-Features
- Voice chat
- Text Chate
- Disabling Dynamic Lighting (always enabled)
- Disabling Fog of War (always enabled)
- Plugins
- Rolling Virtual Dice
- Restricting controll of tokens to certain players

## Getting Started

Follow these steps to set up your first campaign:

### Step 1: Create the Campaign Folder Structure

Create a `campaign/` folder in the project root with the following structure:

```
campaign/
├── campaign.yaml           # Main campaign configuration
├── assets/
│   └── pictures/
│       ├── maps/           # Map background images (.jpg, .png)
│       └── tokens/         # Token images (.png)
├── entities/
│   ├── players/            # Player character files
│   └── npcs/               # NPC files
└── maps/                   # Map definition files
```

> [!TIP]
> Use the [campaign-schema.json](file:///home/jonas/projects/pnp-board/campaign-schema.json) for YAML validation and autocompletion in your IDE.

### Step 2: Create the Main Campaign File

Create `campaign/campaign.yaml` with your campaign name and the starting map:

```yaml
name: My Campaign Name
activeMapId: 0
```

### Step 3: Add Your Maps

Create map files in `campaign/maps/`. Each map file defines the grid, background image, and walls.

**Example: `campaign/maps/001-village.yaml`**

```yaml
maps:
- id: 0
  name: "Village Square"
  description: "The central village square"
  grid:
    cellSize: 50       # Grid cell size in pixels
    width: 18          # Map width in grid cells
    height: 12         # Map height in grid cells
  wallUnit: pixel      # Wall coordinates in pixels
  background:
  - picture: "pictures/maps/village.jpg"
    size: fullscreen
  walls:
  # Map boundaries (prevents tokens from leaving the map)
  - start: {x: 0, y: 0}
    end: {x: 900, y: 0}
  - start: {x: 900, y: 0}
    end: {x: 900, y: 600}
  - start: {x: 900, y: 600}
    end: {x: 0, y: 600}
  - start: {x: 0, y: 600}
    end: {x: 0, y: 0}
  lights: []
```

> **Note:** Place your map background image at `campaign/assets/pictures/maps/village.jpg`

### Step 4: Create Player Characters

Create player files in `campaign/entities/players/`. Players need a `sessionId` to control their token.

**Example: `campaign/entities/players/hero.yaml`**

```yaml
tokens:
  - id: 10001                    # Unique ID (use 10000+ for players)
    name: "Hero"
    picture: pictures/tokens/hero.png
    controlled_by:
      - sessionId: "player1"     # The player's session ID
    position:
      - map: 0                   # Starting map ID
        x: 10                    # Grid X position
        y: 10                    # Grid Y position
    visibility:
      emit_light:
        enabled: true
        radius: 5
        color: "#ffffff"
      night_vision: false
      view_distance: 12
    stats:
      ac: 16
      hp: 24
      speed: 30
      attributes:
        str: 16
        dex: 12
        con: 14
        int: 10
        wis: 12
        cha: 8
      actions:
        - name: Longsword
          modifiers:
            attack: 5
          reach: 5
          targets: 1
          hit: "1d8+3"
          type: slashing
```

> **Tip:** The `sessionId` is stored in the browser's local storage. Players can find their session ID in the browser console or you can assign them custom IDs.

### Step 5: Create NPCs (Optional)

Create NPC files in `campaign/entities/npcs/`. NPCs have `controlled_by: []` so only the GM can control them.

**Example: `campaign/entities/npcs/villager.yaml`**

```yaml
tokens:
  - id: 20001                    # Unique ID (use 20000+ for NPCs)
    name: "Friendly Villager"
    picture: "pictures/tokens/villager.png"
    controlled_by: []            # Empty = GM only
    position:
      - map: 0
        x: 15
        y: 12
    visibility:
      emit_light:
        enabled: false
      night_vision: false
      view_distance: 12
    stats:
      ac: 12
      hp: 14
      speed: 30
      attributes:
        str: 11
        dex: 12
        con: 11
        int: 12
        wis: 14
        cha: 16
      actions:
        - name: Dagger
          modifiers:
            attack: 3
          reach: 5
          targets: 1
          hit: "1d4+1"
          type: piercing
```

### Step 6: Add Your Assets

Place your images in the `campaign/assets/pictures/` folder:

- **Map backgrounds:** `campaign/assets/pictures/maps/`
- **Token images:** `campaign/assets/pictures/tokens/`

### Step 7: Start the Server

1. **Install dependencies** (first time only):
   ```bash
   cd frontend && npm install
   cd ../server && npm install
   ```

2. **Start the development server:**
   ```bash
   cd frontend && npm run dev
   ```

3. **Open the application** in your browser at `http://localhost:5174/`

4. **Access GM Mode:** Add `?gm=true` to the URL to see the full map without fog of war: `http://localhost:5174/?gm=true`

---

## File Structure

campaign - All files in this folder and in subfolders will be merged into one big campaign datastructure (only maps and tokens will be merged not e.g. name. IDs have to be unique)
campaign/campaign.yaml - This file describes the campaign
campaign/players/player1.yaml - This file describes an individual player
frontend/ - Frontend Code. Using Typescript and React, Tanstac routing and tailwind css
campaign/assets - This folder stores static assets (pictures) that can be referenced by the campaign file
server/ - This folder stores the ts server code. Uses node, npm and express

## campaign example
```yaml
#campaign/players/player1.yaml
tokens:
  - id: 10001
    name: "Jonas"
    picture: tokens/jonas.png
    controlled_by:
    - sessionId: 239981
    position:
    - map: 0
      x: 12
      y: 42
    visibility:
      emit_light:
        enabled: false
      night_vision: true
    stats:
      ac: 10
      hp: 4
      speed: 30
      attributes:
        str: 10
        dex: 10
        con: 10
        int: 10
        #...
      #...
      actions:
        - name: club
          modifiers:
            attack: 2
          reach: 5
          targets: 1
          hit: 2
          type: bludgeoning
          description: Melee Weapon Attack 
```
```yaml
#campaign/campaign.yaml
name: My Curse of Stradh Campaign
maps:
- id: 0
  name: Village of Barovia
  grid:
    size: 50
  background:
  - picture: maps/barovia_map.jpg
    size: fullscreen
  walls:
  - start:
      x: 10
      y: 10
    end:
      x: 10
      y: 20
  lights:
  - x: 23
    y: 12
    radius: 5
    color: white
tokens:
  - id: 200001
    name: "Rudolf van Richten"
    picture: tokens/rudolf_van_richten.png
    controlled_by: [] # Only contorlled by the Dungeon Master
    position:
    - map: 0
      x: 12
      y: 42
    visibility:
      emit_light:
        enabled: true
        radius: 5
        color: white
      night_vision: false
    stats:
      ac: 10
      hp: 4
      speed: 30
      attributes:
        str: 10
        dex: 10
        con: 10
        int: 10
        #...
      #...
      actions:
        - name: club
          modifiers:
            attack: 2
          reach: 5
          targets: 1
          hit: 2
          type: bludgeoning
          description: Melee Weapon Attack 
      #...
```