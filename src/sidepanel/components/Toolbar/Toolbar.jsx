import { useEffect, useRef, useState } from 'react'
import { useNotesStore } from '../../store/useNotesStore'
import './Toolbar.css'

export default function Toolbar({ showToast }) {
  const transcription      = useNotesStore((s) => s.transcription)
  const settings           = useNotesStore((s) => s.settings)
  const scrollLocked       = useNotesStore((s) => s.scrollLocked)
  const setTranscriptionActive = useNotesStore((s) => s.setTranscriptionActive)
  const setInterimText         = useNotesStore((s) => s.setInterimText)
  const addTranscriptBlock     = useNotesStore((s) => s.addTranscriptBlock)
  const setTranscriptionError  = useNotesStore((s) => s.setTranscriptionError)
  const setVideoInfo           = useNotesStore((s) => s.setVideoInfo)
  const setScrollLocked        = useNotesStore((s) => s.setScrollLocked)
  const clearSession           = useNotesStore((s) => s.clearSession)

  const recognitionRef = useRef(null)
  const restartRef     = useRef(false)
  const videoTimeRef   = useRef(null)
  const streamRef      = useRef(null)
  const audioCtxRef    = useRef(null)
  const analyserRef    = useRef(null)
  const animFrameRef   = useRef(null)
  const volumeBarRef   = useRef(null)
  const wsRef          = useRef(null)
  const connectionAttemptRef = useRef(0)

  // ── Poll content script for video time while transcription is active ────
  useEffect(() => {
    if (!transcription.isActive) { videoTimeRef.current = null; return }
    const interval = setInterval(async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        if (!tab) return
        const res = await chrome.tabs.sendMessage(tab.id, { type: 'GET_VIDEO_INFO' })
        if (res?.hasVideo) {
          videoTimeRef.current = res.currentTime
          setVideoInfo(res.url, res.title)
        }
      } catch (_) {}
    }, 2000)
    return () => clearInterval(interval)
  }, [transcription.isActive])

  // ── Volume Meter Loop ───────────────────────────────────────────────────
  function updateVolumeMeter() {
    if (!analyserRef.current || !volumeBarRef.current) return
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
    analyserRef.current.getByteFrequencyData(dataArray)
    
    let sum = 0
    for (let i = 0; i < dataArray.length; i++) { sum += dataArray[i] }
    const average = sum / dataArray.length
    
    const volume = Math.min(1, average / 60) 
    
    volumeBarRef.current.style.transform = `scaleX(${volume})`
    volumeBarRef.current.style.opacity = volume > 0.05 ? '1' : '0.3'

    animFrameRef.current = requestAnimationFrame(updateVolumeMeter)
  }

  function cleanupAudio() {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    if (audioCtxRef.current) { audioCtxRef.current.close(); audioCtxRef.current = null }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
    if (volumeBarRef.current) { volumeBarRef.current.style.transform = 'scaleX(0)' }
  }

  // ── Local Python Server WebSocket Logic ──────────────────────────────────
  async function startSpeechRecognition() {
    const currentAttempt = ++connectionAttemptRef.current

    try {
      // 1. Prompt user to share the tab (like Google Meet)
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "browser" },
        audio: true
        // Note: Do NOT use preferCurrentTab: true in a Side Panel, as it restricts the list to the Side Panel itself!
      })
      
      // If the user forgot to check "Share audio", throw an error
      if (stream.getAudioTracks().length === 0) {
        stream.getTracks().forEach(t => t.stop())
        throw new Error("You must check 'Share tab audio' in the prompt!")
      }

      // If the user clicked record again while this prompt was open, discard this stream.
      if (currentAttempt !== connectionAttemptRef.current) {
        stream.getTracks().forEach(t => t.stop())
        return
      }

      // 2. Kill the video track instantly so we only keep audio and don't waste resources
      stream.getVideoTracks().forEach(t => t.stop())

      streamRef.current = stream

      // 2. Set up AudioContext locked to 16,000 Hz for Whisper compatibility
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 })
      
      // 3. Set up Volume Analyser
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      const source = audioCtx.createMediaStreamSource(stream)
      
      source.connect(analyser)
      
      audioCtxRef.current = audioCtx
      analyserRef.current = analyser
      updateVolumeMeter()

      // 4. Connect to local Python server
      const ws = new WebSocket('ws://127.0.0.1:5000/ws')
      wsRef.current = ws

      ws.onopen = () => {
        setTranscriptionActive(true)
        showToast('🎙️ Connected to local Whisper server!')
      }

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data)
        if (data.type === 'interim') {
          setInterimText(data.text)
        } else if (data.type === 'final') {
          setInterimText('')
          addTranscriptBlock(data.text, videoTimeRef.current)
        }
      }

      ws.onerror = () => {
        setTranscriptionError('Could not connect to Python server at 127.0.0.1:5000. Is it running?')
        stopSpeechRecognition()
      }

      ws.onclose = () => {
        if (transcription.isActive) {
          stopSpeechRecognition()
        }
      }

      // 5. Stream raw audio to server
      const processor = audioCtx.createScriptProcessor(4096, 1, 1)
      processor.onaudioprocess = (e) => {
        if (ws.readyState === WebSocket.OPEN) {
          const float32 = e.inputBuffer.getChannelData(0)
          ws.send(float32.buffer)
        }
      }

      source.connect(processor)
      const dummyGain = audioCtx.createGain()
      dummyGain.gain.value = 0
      processor.connect(dummyGain)
      dummyGain.connect(audioCtx.destination)

    } catch (err) {
      console.error(err)
      // Only show error if this was the latest attempt
      if (currentAttempt === connectionAttemptRef.current) {
        setTranscriptionError(`Failed to capture tab audio: ${err.message}`)
      }
      return
    }
  }

  function stopSpeechRecognition() {
    connectionAttemptRef.current++ // cancel any pending requests
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    setTranscriptionActive(false)
    setInterimText('')
    cleanupAudio()
  }

  function handleToggle() {
    if (transcription.isActive) {
      stopSpeechRecognition()
      showToast('⏹ Transcription stopped')
    } else {
      startSpeechRecognition()
      // Toast and active state will be handled by ws.onopen
    }
  }

  function handleClear() {
    if (!confirm('Clear all blocks in this session?')) return
    stopSpeechRecognition()
    clearSession()
    showToast('🗑️ Session cleared')
  }

  return (
    <div className="toolbar">
      {/* Record / Stop button */}
      <button
        id="btn-record-toggle"
        className={`record-btn ${transcription.isActive ? 'recording' : ''}`}
        onClick={handleToggle}
        title={transcription.isActive ? 'Stop transcription' : 'Start transcription'}
      >
        <span className={`record-dot ${transcription.isActive ? 'animate-pulse' : ''}`} />
        {transcription.isActive ? 'Stop' : 'Record'}
      </button>

      {/* Volume Meter */}
      <div className={`volume-container ${transcription.isActive ? 'active' : ''}`} title="Microphone Input Level">
        <div className="volume-bar" ref={volumeBarRef}></div>
      </div>

      {/* Scroll lock */}
      <button
        id="btn-scroll-lock"
        className={`btn-icon ${scrollLocked ? 'icon-active' : ''}`}
        onClick={() => setScrollLocked(!scrollLocked)}
        title={scrollLocked ? 'Unlock auto-scroll' : 'Lock scroll'}
      >
        {scrollLocked ? '🔒' : '🔓'}
      </button>

      {/* Clear session */}
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
