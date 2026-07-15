import { useEffect, useRef } from 'react'
import { useNotesStore } from '../../store/useNotesStore'
import './Toolbar.css'

export default function Toolbar({ showToast }) {
  const transcription          = useNotesStore((s) => s.transcription)
  const scrollLocked           = useNotesStore((s) => s.scrollLocked)
  const setTranscriptionActive = useNotesStore((s) => s.setTranscriptionActive)
  const setInterimText         = useNotesStore((s) => s.setInterimText)
  const addTranscriptBlock     = useNotesStore((s) => s.addTranscriptBlock)
  const setTranscriptionError  = useNotesStore((s) => s.setTranscriptionError)
  const addSourceUrl           = useNotesStore((s) => s.addSourceUrl)
  const setScrollLocked        = useNotesStore((s) => s.setScrollLocked)
  const clearSession           = useNotesStore((s) => s.clearSession)

  const videoTimeRef         = useRef(null)
  const streamRef            = useRef(null)
  const audioCtxRef          = useRef(null)
  const analyserRef          = useRef(null)
  const animFrameRef         = useRef(null)
  const volumeBarRef         = useRef(null)
  const wsRef                = useRef(null)
  const connectionAttemptRef = useRef(0)

  // Poll active tab for video time and source URL while recording
  useEffect(() => {
    if (!transcription.isActive) { videoTimeRef.current = null; return }
    const interval = setInterval(async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        if (!tab) return
        if (tab.url && !tab.url.startsWith('chrome')) addSourceUrl(tab.url, tab.title)
        const res = await chrome.tabs.sendMessage(tab.id, { type: 'GET_VIDEO_INFO' })
        if (res?.hasVideo) {
          videoTimeRef.current = res.currentTime
          addSourceUrl(res.url || tab.url, res.title || tab.title)
        }
      } catch (_) {}
    }, 2000)
    return () => clearInterval(interval)
  }, [transcription.isActive])

  // Volume Meter
  function updateVolumeMeter() {
    if (!analyserRef.current || !volumeBarRef.current) return
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
    analyserRef.current.getByteFrequencyData(dataArray)
    let sum = 0
    for (let i = 0; i < dataArray.length; i++) sum += dataArray[i]
    const volume = Math.min(1, (sum / dataArray.length) / 60)
    volumeBarRef.current.style.transform = `scaleX(${volume})`
    volumeBarRef.current.style.opacity = volume > 0.05 ? '1' : '0.3'
    animFrameRef.current = requestAnimationFrame(updateVolumeMeter)
  }

  function cleanupAudio() {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    if (audioCtxRef.current) { audioCtxRef.current.close(); audioCtxRef.current = null }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
    if (volumeBarRef.current) volumeBarRef.current.style.transform = 'scaleX(0)'
  }

  // WebSocket message handler
  function handleServerMessage(event) {
    let data
    try { data = JSON.parse(event.data) } catch { return }
    if (data.type === 'interim') {
      setInterimText(data.text)
    } else if (data.type === 'final') {
      setInterimText('')
      if (data.text?.trim()) addTranscriptBlock(data.text.trim(), videoTimeRef.current)
    }
  }

  async function startSpeechRecognition() {
    const currentAttempt = ++connectionAttemptRef.current

    // Step 1: Pre-flight — verify Whisper server is reachable before anything else
    try {
      await new Promise((resolve, reject) => {
        const testWs = new WebSocket('ws://127.0.0.1:5000/ws')
        testWs.onopen = () => { testWs.close(); resolve() }
        testWs.onerror = () => reject(new Error(
          'Whisper server not running at 127.0.0.1:5000. Start: cd local-server && python server.py'
        ))
        setTimeout(() => reject(new Error('Connection to Whisper server timed out.')), 3000)
      })
    } catch (err) {
      if (currentAttempt === connectionAttemptRef.current) {
        setTranscriptionError(err.message)
        showToast('Server not running')
      }
      return
    }

    // Step 2: Show desktop capture picker via background.
    // chooseDesktopMedia shows ALL tabs including the current one.
    // Tab capture works even before the video is playing — it captures all tab
    // audio output, so starting the recording before pressing Play is fine.
    let stream
    try {
      showToast('A tab picker will appear — select the tab you want to transcribe', 4000)
      const resp = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Picker timed out. Try again.')), 120000)
        chrome.runtime.sendMessage({ type: 'REQUEST_TAB_AUDIO_STREAM' }, (r) => {
          clearTimeout(timer)
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message))
          resolve(r)  // always resolve — check cancelled below
        })
      })

      // User closed the picker without selecting — soft dismiss, not an error
      if (resp?.cancelled) {
        showToast('Tab not selected — click Record to try again')
        return
      }

      if (resp?.error) throw new Error(resp.error)

      // desktopCapture uses chromeMediaSource: 'desktop'
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: resp.streamId,
          },
        },
        video: false,
      })
    } catch (err) {
      if (currentAttempt === connectionAttemptRef.current) {
        setTranscriptionError(`Audio capture failed: ${err.message}`)
        showToast('Audio capture failed — see Transcript tab')
      }
      return
    }

    if (currentAttempt !== connectionAttemptRef.current) {
      stream.getTracks().forEach(t => t.stop()); return
    }

    stream.getAudioTracks()[0].addEventListener('ended', () => { if (wsRef.current) stopSpeechRecognition() })
    streamRef.current = stream

    // Step 3b: Auto-capture source URL
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (tab?.url && !tab.url.startsWith('chrome')) addSourceUrl(tab.url, tab.title)
    } catch (_) {}

    // Step 5: Audio analysis for the volume meter
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 })
    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 256
    const source = audioCtx.createMediaStreamSource(stream)
    source.connect(analyser)
    audioCtxRef.current = audioCtx
    analyserRef.current = analyser
    updateVolumeMeter()

    // Step 6: Connect to Whisper WebSocket
    const ws = new WebSocket('ws://127.0.0.1:5000/ws')
    wsRef.current = ws

    ws.onopen = () => {
      setTranscriptionActive(true)
      showToast('Connected to Whisper server!')
    }
    ws.onmessage = handleServerMessage
    ws.onerror = () => {
      setTranscriptionError('Whisper server connection lost.')
      stopSpeechRecognition()
    }
    ws.onclose = () => {
      if (wsRef.current !== null) stopSpeechRecognition()
    }

    // Step 7: Stream raw audio PCM to the Whisper server
    const processor = audioCtx.createScriptProcessor(4096, 1, 1)
    processor.onaudioprocess = (e) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(e.inputBuffer.getChannelData(0).buffer)
      }
    }
    source.connect(processor)
    const dummyGain = audioCtx.createGain()
    dummyGain.gain.value = 0
    processor.connect(dummyGain)
    dummyGain.connect(audioCtx.destination)
  }

  function stopSpeechRecognition() {
    connectionAttemptRef.current++
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null }
    setTranscriptionActive(false)
    setInterimText('')
    cleanupAudio()
  }

  function handleToggle() {
    if (transcription.isActive) {
      stopSpeechRecognition()
      showToast('Transcription stopped')
    } else {
      startSpeechRecognition()
    }
  }

  function handleClear() {
    if (!confirm('Clear all blocks in this session?')) return
    stopSpeechRecognition()
    clearSession()
    showToast('Session cleared')
  }

  return (
    <div className="toolbar">
      <button
        id="btn-record-toggle"
        className={`record-btn ${transcription.isActive ? 'recording' : ''}`}
        onClick={handleToggle}
        title={transcription.isActive ? 'Stop transcription' : 'Start transcription'}
      >
        <span className={`record-dot ${transcription.isActive ? 'animate-pulse' : ''}`} />
        {transcription.isActive ? 'Stop' : 'Record'}
      </button>

      <div className={`volume-container ${transcription.isActive ? 'active' : ''}`} title="Audio Level">
        <div className="volume-bar" ref={volumeBarRef} />
      </div>

      <button
        id="btn-scroll-lock"
        className={`btn-icon ${scrollLocked ? 'icon-active' : ''}`}
        onClick={() => setScrollLocked(!scrollLocked)}
        title={scrollLocked ? 'Unlock auto-scroll' : 'Lock scroll'}
      >
        {scrollLocked ? '🔒' : '🔓'}
      </button>

      <button
        id="btn-clear-session"
        className="btn-icon"
        onClick={handleClear}
        title="Clear session"
      >
        🗑️
      </button>
    </div>
  )
}
