# Pomodoro Cube Timer

## Current State
Fully working Pomodoro timer with cuboid card UI, 90/10/7 defaults, auto-session flow, Web Audio alarms, shareable URLs (?study=&break=&sessions=), OBS transparent mode (?obs=1), localStorage settings persistence, skip/reset/start-pause controls, spacebar shortcut.

Settings panel only controls study time, break time, and total sessions.

## Requested Changes (Diff)

### Add
- Color customization settings: background color, study mode card color, break mode card color, text color, button color
- Color pickers (HTML `<input type="color">`) in settings panel for each color
- localStorage persistence for color settings (separate key)
- URL parameter support for colors: ?studyColor=&breakColor=&bgColor=&textColor=&btnColor=
- Dynamic URL update when colors change in settings (pushState/replaceState)
- Smooth CSS transitions on color changes between modes
- Real-time preview as user picks colors

### Modify
- Settings dialog: add a "Colors" section below the existing timer settings
- Share URL: include color params alongside study/break/sessions params
- bgColor / cardColor / textColor / btnColor: all driven by color state instead of hardcoded
- Save button: persists both timer and color settings

### Remove
- Hardcoded phase-based color derivations (bgColor, cardColor, accentColor etc.) — replaced by user-configurable values

## Implementation Plan
1. Add `ColorSettings` interface with studyColor, breakColor, bgColor, textColor, btnColor
2. loadColors() reads URL params first, then localStorage, then defaults
3. Colors state drives all inline styles throughout the component
4. Settings dialog gets color pickers section
5. On save, persist colors to localStorage and update URL params via replaceState
6. Share URL includes color params
7. CSS transition: all color/background-color properties use `transition: background-color 0.6s ease, color 0.3s ease`
