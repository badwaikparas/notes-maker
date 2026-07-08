document.getElementById('btn-allow').addEventListener('click', async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    // Permission granted, close the tracks immediately
    stream.getTracks().forEach(t => t.stop())
    
    document.getElementById('btn-allow').style.display = 'none'
    document.getElementById('msg-error').style.display = 'none'
    document.getElementById('msg-success').style.display = 'block'
    
    // Automatically close the tab after 2 seconds
    setTimeout(() => window.close(), 2000)
  } catch (err) {
    document.getElementById('msg-error').style.display = 'block'
  }
})
