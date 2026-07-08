/**
 * Storage Manager
 * Wraps chrome.storage.local for session persistence.
 */

const SESSION_KEY = 'nm_session'
const AUTO_SAVE_INTERVAL_MS = 30_000

let _autoSaveTimer = null

/**
 * Save session state to chrome.storage.local via the background worker.
 */
export async function saveSession(serializedSession) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'AUTO_SAVE', payload: serializedSession },
      (response) => resolve(response?.ok ?? false)
    )
  })
}

/**
 * Load previously saved session from storage.
 */
export async function loadSavedSession() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'LOAD_SESSION' }, (response) => {
      resolve(response?.session ?? null)
    })
  })
}

/**
 * Clear the saved session from storage.
 */
export async function clearSavedSession() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'CLEAR_SESSION' }, () => resolve())
  })
}

/**
 * Start the auto-save interval.
 * @param {Function} getState - fn that returns the serialised session
 */
export function startAutoSave(getState) {
  stopAutoSave()
  _autoSaveTimer = setInterval(async () => {
    const state = getState()
    await saveSession(state)
  }, AUTO_SAVE_INTERVAL_MS)
}

export function stopAutoSave() {
  if (_autoSaveTimer) {
    clearInterval(_autoSaveTimer)
    _autoSaveTimer = null
  }
}
