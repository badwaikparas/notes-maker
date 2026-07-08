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
    
    // Calculate average volume
    let sum = 0
    for (let i = 0; i < dataArray.length; i++) { sum += dataArray[i] }
    const average = sum / dataArray.length
    
    // Map average (0-255) to a scale (0-1) with a slight boost
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

  // ── Web Speech API ───────────────────────────────────────────────────────
  async function startSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setTranscriptionError('Speech Recognition not supported in this browser.')
      return
    }

    try {
      // 1. Get the stream and keep it to measure volume
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // 2. Set up AudioContext & Analyser
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      
      const source = audioCtx.createMediaStreamSource(stream)
      source.connect(analyser)
      
      audioCtxRef.current = audioCtx
      analyserRef.current = analyser
      updateVolumeMeter()
      
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setTranscriptionError('Microphone access denied. Opening setup page...')
        chrome.tabs.create({ url: chrome.runtime.getURL('setup.html') })
      } else {
        setTranscriptionError(`Microphone error: ${err.message}`)
      }
      return
    }

    const recognition = new SpeechRecognition()
    recognition.continuous      = true
    recognition.interimResults  = true
    recognition.lang            = settings.language || 'en-US'
    recognition.maxAlternatives = 1
    recognitionRef.current      = recognition

    recognition.onresult = (event) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          addTranscriptBlock(result[0].transcript, videoTimeRef.current)
        } else {
          interim += result[0].transcript
        }
      }
      setInterimText(interim)
    }

    recognition.onerror = (event) => {
      if (event.error === 'no-speech') return
      if (event.error === 'aborted') return
      console.error('[NotesMaker] SpeechRecognition error:', event.error)
      setTranscriptionError(`Mic error: ${event.error}`)
      restartRef.current = false
      cleanupAudio()
    }

    recognition.onend = () => {
      setInterimText('')
      if (restartRef.current) {
        try { recognition.start() } catch (_) {}
      } else {
        cleanupAudio()
      }
    }

    restartRef.current = true
    recognition.start()
    setTranscriptionActive(true)
  }

  function stopSpeechRecognition() {
    restartRef.current = false
    recognitionRef.current?.stop()
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
      showToast('🎙️ Transcription started')
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
