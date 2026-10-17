# Made for you 💜

A romantic, single-page React surprise built with Vite, React Three Fiber, Drei, and Framer Motion.

## Run it

```bash
npm install
npm run dev
```

Open the local URL Vite prints in your browser. Check the production bundle with `npm run build`.

## Make it personal

1. Put the optional music file at `public/audio/blessed.mp3`. The app does not bundle or download music. If it is missing, the player shows a friendly hint instead of crashing.
2. Edit `src/config.js` to change `PARTNER_NAME`, `SENDER_NAME`, and the single `LETTER_MESSAGE` constant.
3. Add extra tracks to `MUSIC_TRACKS` in that same file. Each track needs a title, artist, and file path under `public/`.
4. The music player also accepts a local audio upload through the plus button.

The Start button is the user gesture that permits music playback. If a browser still blocks playback, use the play button in the floating player.
