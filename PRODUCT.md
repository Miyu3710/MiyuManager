# MiyuManager

MiyuManager is a local-first Windows library for visual novels and adventure games. It keeps
installed games, launch profiles, covers, source-backed metadata, play sessions and user-written
status in one place. The product is not a store, reader, streaming service or in-game progress
tracker.

The main user is one collector managing a personal library on a desktop or television. The most
frequent tasks are: continue the last game, find a title in a growing library, start a game, correct
metadata or a cover, review play time, and scan another local folder. The television view is used
with a controller and must stay legible from a distance.

## Product truth

- Games, installations and covers are local files. Metadata may come from VNDB, Bangumi, Kungal,
  Hikarinagi and Steam, with source and update time retained.
- Play time comes from tracked launch sessions, not from reading a game's save data. A session can
  be corrected or entered manually and is marked accordingly.
- User status, rating, notes and collection membership are user-authored. They must never look like
  automatically detected story progress.
- The default desktop window is 1440 × 900 with a minimum of 1120 × 720. The interface also supports
  maximized and scaled Windows desktops, keyboard operation, reduced motion and a full-screen TV
  window.
- The app uses a custom window bar. Destructive actions require confirmation; unavailable local
  paths and launch failures state what failed and what can be done next.

## Primary actions

1. Launch the current or selected game.
2. Find a game across the library, metadata and collections.
3. Add or rescan a local game folder.
4. Correct metadata, covers and launch settings without losing existing values.
5. Review play history and open the television view.

## Interface principles

The library's covers and real data carry the visual identity. Utility text stays quiet, controls
state their result, and repeated explanatory copy is removed in favour of labels, structure and
state. Functional text never drops below 12px, and the primary reading roles use self-hosted Noto
Sans SC, Noto Serif SC and Manrope. The desktop UI is an operating surface first: scanning,
hierarchy and long-session comfort outrank decorative spectacle.
