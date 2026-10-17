import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CakeScene, SliceCake } from './CakeScene'
import BouquetModal from './BouquetModal'
import { LETTER_MESSAGE, PLAYLIST, PARTNER_NAME, SENDER_NAME } from './config'
import './App.css'

const PALETTE = [
  { name: 'Lavender', color: '#b99be8' }, { name: 'Lilac', color: '#c8a2c8' },
  { name: 'Violet', color: '#7952b3' }, { name: 'Amethyst', color: '#9966cc' },
  { name: 'Orchid', color: '#da70d6' }, { name: 'Plum', color: '#54235f' },
]
const ICING = ['#f6eafa', '#e9b8ee', '#cda5f5', '#ffcadf', '#fff2d6']
const DESIGNS = [
  { id: 'classic', icon: '✦', label: 'Classic smooth' }, { id: 'ruffled', icon: '〰', label: 'Piped ruffle' },
  { id: 'drip', icon: '◒', label: 'Dreamy drip' }, { id: 'dots', icon: '·••', label: 'Sugar dots' },
  { id: 'hearts', icon: '♡', label: 'Pearl hearts' },
]

function FloatingHearts({ musicPlaying }) {
  const hearts = useMemo(() => Array.from({ length: 22 }, (_, i) => ({
    '--left': `${(i * 37) % 103 - 2}%`, '--delay': `${(i * 1.7) % 11}s`, '--duration': `${9 + (i % 6)}s`,
    '--size': `${10 + (i % 5) * 5}px`, '--color': ['#f6d5ff', '#d39bf2', '#ffb7dc', '#ffffff'][i % 4],
  })), [])
  return <div className={musicPlaying ? 'heart-field music-hearts' : 'heart-field'} aria-hidden="true">{hearts.map((heart, i) => <span key={i} className="floating-heart" style={heart}>♥</span>)}</div>
}


function MusicPlayer({ started, onPlayingChange }) {
  const audio = useRef(null)
  const [playlist, setPlaylist] = useState(PLAYLIST)
  const [track, setTrack] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [volume, setVolume] = useState(0.36)
  const [muted, setMuted] = useState(false)
  const [shuffle, setShuffle] = useState(false)
  const [repeat, setRepeat] = useState('all')
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [missing, setMissing] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [toast, setToast] = useState(false)
  const queue = useRef([])
  const volumeRef = useRef(volume)
  const mutedRef = useRef(muted)
  const current = playlist[track]
  const currentSrc = current?.src
  useEffect(() => { onPlayingChange(playing) }, [playing, onPlayingChange])

  const shuffled = (items) => [...items].sort(() => Math.random() - 0.5)
  const showToast = () => { setToast(true); window.setTimeout(() => setToast(false), 2200) }
  const playTrack = (index, autoplay = playing) => {
    setTrack(index)
    setMissing(false)
    setProgress(0)
    showToast()
    if (autoplay) window.setTimeout(() => audio.current?.play().then(() => setPlaying(true)).catch(() => setMissing(true)), 0)
  }
  const nextTrack = (direction = 1) => {
    if (repeat === 'one' && direction === 1) { audio.current.currentTime = 0; audio.current.play().catch(() => setMissing(true)); return }
    let next
    if (shuffle) {
      if (!queue.current.length) queue.current = shuffled(playlist.map((_, index) => index).filter((index) => index !== track))
      next = queue.current.shift()
    } else next = (track + direction + playlist.length) % playlist.length
    playTrack(next, true)
  }
  useEffect(() => {
    const element = audio.current
    if (!element || !currentSrc) return
    element.src = currentSrc
    element.load()
  }, [track, playlist, currentSrc])
  useEffect(() => {
    const element = audio.current
    if (!started || !element) return
    const target = mutedRef.current ? 0 : volumeRef.current
    element.volume = 0
    element.play().then(() => {
      setPlaying(true)
      let step = 0
      const timer = window.setInterval(() => {
        step += 0.04
        if (step >= target) { element.volume = target; window.clearInterval(timer) } else element.volume = step
      }, 45)
    }).catch(() => setMissing(true))
  }, [started, track])
  useEffect(() => {
    if (audio.current) {
      volumeRef.current = volume
      mutedRef.current = muted
      audio.current.volume = muted ? 0 : volume
      if (playing && !muted && audio.current.volume === 0) audio.current.volume = 0.01
    }
  }, [volume, muted, playing])
  const startMusic = () => {
    if (!audio.current) return
    if (playing) { audio.current.pause(); setPlaying(false); return }
    audio.current.play().then(() => setPlaying(true)).catch(() => setMissing(true))
  }
  const upload = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    const uploaded = { title: file.name.replace(/\.[^/.]+$/, ''), artist: 'Your uploaded song', src: URL.createObjectURL(file) }
    setPlaylist((items) => [...items, uploaded])
    setTrack(playlist.length)
    setMissing(false)
    setPlaying(true)
  }
  const handleError = () => { setMissing(true); window.setTimeout(() => nextTrack(), 900) }
  const formatTime = (value) => `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`
  return <div className={`music-player glass-panel ${expanded ? 'expanded' : ''}`}>
    <audio ref={audio} onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)} onTimeUpdate={(event) => setProgress(event.currentTarget.currentTime)} onEnded={() => nextTrack()} onError={handleError} />
    <button className="player-mobile-toggle" onClick={() => setExpanded((value) => !value)} aria-label="Expand music player"><span className={playing ? 'vinyl spinning' : 'vinyl'}>♥</span></button>
    <div className="track-meta"><span className={playing ? 'music-note pulse' : 'music-note'}>♫</span><span><strong>{current?.title}</strong><small>{current?.artist}</small></span></div>
    <div className="music-actions"><button className="icon-button" onClick={() => nextTrack(-1)} aria-label="Previous track">◀</button><button className="icon-button" onClick={startMusic} aria-label={playing ? 'Pause music' : 'Play music'}>{playing ? 'Ⅱ' : '▶'}</button><button className="icon-button" onClick={() => nextTrack()} aria-label="Next track">▶</button></div>
    <div className="progress-wrap"><input aria-label="Track progress" type="range" min="0" max={duration || 0} step="0.1" value={progress} onChange={(event) => { audio.current.currentTime = Number(event.target.value); setProgress(event.target.value) }} /><span>{formatTime(progress)} / {formatTime(duration)}</span></div>
    <input aria-label="Music volume" type="range" min="0" max="1" step="0.01" value={volume} onChange={(event) => setVolume(Number(event.target.value))} />
    <button className="player-option" onClick={() => setMuted((value) => !value)} aria-label={muted ? 'Unmute music' : 'Mute music'}>{muted ? '🔇' : '🔊'}</button>
    <button className={`player-option ${shuffle ? 'selected' : ''}`} onClick={() => { setShuffle((value) => !value); queue.current = [] }} aria-label="Toggle shuffle">🔀</button>
    <button className="player-option" onClick={() => setRepeat((value) => value === 'all' ? 'one' : 'all')} aria-label="Toggle repeat">{repeat === 'one' ? '🔂' : '🔁'}</button>
    <button className="playlist-button" onClick={() => setExpanded((value) => !value)} aria-label="Open playlist">☷</button>
    {expanded && <div className="playlist-drawer"><div className="drawer-title">Playlist <span>{playlist.length} songs</span></div>{playlist.map((item, index) => <button key={`${item.src}-${index}`} className={index === track ? 'playlist-item current' : 'playlist-item'} onClick={() => { playTrack(index, true); setExpanded(false) }}><span>{index === track && playing ? '♫' : String(index + 1).padStart(2, '0')}</span><span><strong>{item.title}</strong><small>{item.artist}</small></span></button>)}<label className="upload-row">＋ Upload your own audio<input type="file" accept="audio/*" onChange={upload} /></label></div>}
    {missing && <span className="audio-hint">That song is missing — skipping to the next one 💜</span>}{toast && <span className="now-playing">Now playing 💜</span>}
  </div>
}

function Welcome({ onStart }) {
  return <motion.main className="welcome-stage" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><div className="eyebrow">A little surprise, made with love</div><motion.div className="hero-heart" animate={{ scale: [1, 1.06, 1], rotate: [-3, 3, -3] }} transition={{ repeat: Infinity, duration: 3.2 }}>♥</motion.div><h1>I made something<br /><em>for you</em> <span>💜</span></h1><p className="welcome-copy">A sweet little moment for my favorite person.<br />Take your time — this one is just for us.</p><button className="primary-button" onClick={onStart}>Start the surprise <span>→</span></button><div className="welcome-foot">with all my heart · always</div></motion.main>
}

function CakeCustomizer({ settings, setSettings, onDone }) {
  const update = (key, value) => setSettings((prev) => ({ ...prev, [key]: value }))
  return <motion.main className="customizer-stage" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -18 }}><header className="stage-header"><div className="eyebrow">Chapter one · make it ours</div><h2>Build a cake <em>for you</em></h2><p>Pick the details that feel a little like us.</p></header><div className="customizer-grid"><div className="cake-viewport glass-panel"><CakeScene {...settings} /><div className="drag-note">↔ drag to twirl</div></div><section className="control-panel glass-panel"><div className="control-block"><div className="control-title"><span>01</span><strong>Cake color</strong><i>{settings.cakeColorName}</i></div><div className="swatches">{PALETTE.map((item) => <button key={item.name} title={item.name} className={settings.cakeColor === item.color ? 'swatch active' : 'swatch'} style={{ background: item.color }} onClick={() => setSettings((p) => ({ ...p, cakeColor: item.color, cakeColorName: item.name }))} />)}<label className="swatch custom-swatch" title="Custom cake color"><span>+</span><input type="color" value={settings.cakeColor} onChange={(e) => setSettings((p) => ({ ...p, cakeColor: e.target.value, cakeColorName: 'Custom' }))} /></label></div></div><div className="control-block"><div className="control-title"><span>02</span><strong>Icing style</strong></div><div className="design-grid">{DESIGNS.map((item) => <button key={item.id} className={settings.design === item.id ? 'design-choice active' : 'design-choice'} onClick={() => update('design', item.id)}><span>{item.icon}</span><small>{item.label}</small></button>)}</div></div><div className="control-block"><div className="control-title"><span>03</span><strong>Icing color</strong></div><div className="icing-row">{ICING.map((color) => <button key={color} className={settings.icingColor === color ? 'icing-dot active' : 'icing-dot'} style={{ background: color }} onClick={() => update('icingColor', color)} />)}<label className="mini-color"><input type="color" value={settings.icingColor} onChange={(e) => update('icingColor', e.target.value)} />+</label></div></div><div className="control-block"><div className="control-title"><span>04</span><strong>Little extras</strong></div><div className="toggles">{[['candles', 'Candles', '✧'], ['berries', 'Berries', '●'], ['hearts', 'Little hearts', '♥']].map(([key, label, icon]) => <button key={key} className={settings.toppers[key] ? 'toggle active' : 'toggle'} onClick={() => setSettings((p) => ({ ...p, toppers: { ...p.toppers, [key]: !p.toppers[key] } }))}><span>{icon}</span>{label}<i>{settings.toppers[key] ? 'On' : 'Off'}</i></button>)}</div></div><button className="primary-button full-button" onClick={onDone}>Done, let’s cut it <span>🍰</span></button></section></div></motion.main>
}

function LetterModal({ onClose }) {
  return <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><motion.div className="letter" initial={{ y: 50, rotate: -3, scale: 0.8 }} animate={{ y: 0, rotate: 0, scale: 1 }} transition={{ type: 'spring', damping: 18 }}><button className="close-letter" onClick={onClose}>×</button><div className="letter-seal">♥</div><div className="eyebrow">A note for {PARTNER_NAME}</div><h2>To my favorite person,</h2><div className="letter-copy">{LETTER_MESSAGE.split('\n').map((line, i) => <p key={i}>{line || <br />}</p>)}</div><div className="letter-signoff">{SENDER_NAME} <span>♥</span></div></motion.div></motion.div>
}

function App() {
  const [stage, setStage] = useState('welcome'); const [cutCount, setCutCount] = useState(0); const [letterOpen, setLetterOpen] = useState(false)
  const [bouquetOpen, setBouquetOpen] = useState(false)
  const [musicPlaying, setMusicPlaying] = useState(false)
  const [settings, setSettings] = useState({ cakeColor: '#7952b3', cakeColorName: 'Violet', icingColor: '#f6eafa', design: 'classic', toppers: { candles: true, berries: false, hearts: true } })
  const reset = () => { setCutCount(0); setLetterOpen(false); setBouquetOpen(false); setStage('customize') }
  const showLetter = cutCount >= 6
  return <div className="app-shell"><FloatingHearts musicPlaying={musicPlaying} /><div className="ambient-glow glow-one" /><div className="ambient-glow glow-two" /><AnimatePresence mode="wait">{stage === 'welcome' && <Welcome key="welcome" onStart={() => setStage('customize')} />}{stage === 'customize' && <CakeCustomizer key="customize" settings={settings} setSettings={setSettings} onDone={() => setStage('slice')} />}{stage === 'slice' && <motion.main key="slice" className="slice-stage" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><header className="stage-header"><div className="eyebrow">Chapter two · the sweetest part</div><h2>One slice <em>for you</em></h2><p>{showLetter ? 'Something special is waiting inside...' : 'Cut a little piece of my heart.'}</p></header><SliceCake settings={settings} cutCount={cutCount} onCut={() => setCutCount((c) => Math.min(c + 1, 6))} showLetter={showLetter} onLetter={() => setLetterOpen(true)} /><div className="cut-progress"><span>{showLetter ? 'The last little surprise' : 'Cut a slice 💜'}</span><b>{showLetter ? '♥' : `${6 - cutCount} slices left`}</b></div></motion.main>}{stage === 'closing' && <motion.main key="closing" className="closing-stage" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><motion.div className="closing-heart" animate={{ scale: [1, 1.1, 1] }} transition={{ repeat: Infinity, duration: 2 }}>♥</motion.div><div className="eyebrow">The end · or just the beginning</div><h2>I love you, <em>{PARTNER_NAME}</em></h2><p>Thank you for sharing this little moment with me.</p><button className="primary-button" onClick={reset}>Replay <span>↻</span></button></motion.main>}</AnimatePresence><MusicPlayer started={stage !== 'welcome'} onPlayingChange={setMusicPlaying} />{letterOpen && <LetterModal onClose={() => { setLetterOpen(false); setBouquetOpen(true) }} />}    <AnimatePresence>
     {bouquetOpen && <BouquetModal key="bouquet" onContinue={() => { setBouquetOpen(false); setStage('closing') }} />}
   </AnimatePresence> </div>
}

export default App
