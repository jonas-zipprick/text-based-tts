# PnP Board Online

## Description
This application is a table top simulator for pen and paper games like Dungeans and Dragons similar to roll20.
But this project is more reduced to the essentials and all the game definition is in a test-based campaign file that is easy to create with LLMs like Gemini or ChatGPT.

## Features
- Online Multiplayer: Multiple players can move tokens in real time simultaniously (identified by a session ID stored in local browser storrage)
- GM Mode vs. Player Mode: In GM Mode, the entire map is vissible and fog of war removed. In Player Mode, only the tokens of the player are vissible.
- Dynamic Ligting: Tokens are not visible on the screen unless one of the tokens you control can see them in the game (visibility radius and light source). Players can emit light
- Fog of War: At the beginning, the entire map is engoulved in fog of war. Once tokens saw it, it becomes known terrain.
- Only tokens that can be seen can be controlled

## Non-Features
- Voice chat
- Text Chate
- Disabling Dynamic Lighting (always enabled)
- Disabling Fog of War (always enabled)
- Plugins
- Rolling Virtual Dice
- Restricting controll of tokens to certain players

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