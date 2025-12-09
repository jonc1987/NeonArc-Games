(function () {
  const panel = document.getElementById('stackjackSessionPanel');
  const statusEl = document.getElementById('stackjackSessionStatus');
  const hostNameEl = document.getElementById('stackjackHostName');
  const guestNameEl = document.getElementById('stackjackGuestName');
  const eventFeed = document.getElementById('stackjackEventFeed');
  const callBtn = document.getElementById('stackjackCallBtn');
  const muteBtn = document.getElementById('stackjackMuteBtn');
  const localVideo = document.getElementById('stackjackLocalVideo');
  const remoteVideo = document.getElementById('stackjackRemoteVideo');

  const emptyManager = {
    initialize: async () => {},
    startCall: () => {},
    sendEvent: () => {},
    setStatus: () => {},
    updateParticipants: () => {},
    toggleMic: () => {},
  };

  if (!panel) {
    window.stackjackSession = emptyManager;
    return;
  }

  let stackjackSessionId = null;
  let stackjackRole = null;
  let stackjackSignalSocket = null;
  let stackjackPeerConnection = null;
  let stackjackLocalStream = null;
  let stackjackMuted = true;

  const getAudioTracks = () => (stackjackLocalStream ? stackjackLocalStream.getAudioTracks() : []);

  const applyMuteState = () => {
    const disabled = stackjackMuted;
    getAudioTracks().forEach((track) => {
      track.enabled = !disabled;
    });
    if (muteBtn) {
      muteBtn.hidden = !stackjackLocalStream;
      muteBtn.textContent = disabled ? 'Unmute microphone' : 'Mute microphone';
    }
  };

  const setStatus = (message, isError = false) => {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.style.color = isError ? '#ff6ee6' : 'rgba(255, 255, 255, 0.85)';
  };

  const updateParticipants = (participants = {}) => {
    panel.hidden = false;
    if (hostNameEl) {
      hostNameEl.textContent = participants.host || 'Host';
    }
    if (guestNameEl) {
      guestNameEl.textContent = participants.guest || 'Guest';
    }
  };

  const renderEvent = (payload) => {
    if (!eventFeed || !payload) return;
    const entry = document.createElement('div');
    entry.className = 'stackjack-event';
    const header = document.createElement('div');
    header.textContent = `${payload.origin || 'Friend'} · ${payload.message || payload.event || 'Round update'}`;
    const timestamp = document.createElement('time');
    timestamp.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    timestamp.style.fontSize = '11px';
    timestamp.style.color = 'rgba(255, 255, 255, 0.4)';
    entry.appendChild(header);
    entry.appendChild(timestamp);
    eventFeed.prepend(entry);
    while (eventFeed.children.length > 8) {
      eventFeed.removeChild(eventFeed.lastChild);
    }
  };

  const sendEvent = (data = {}) => {
    if (!stackjackSignalSocket || stackjackSignalSocket.readyState !== WebSocket.OPEN) return;
    stackjackSignalSocket.send(JSON.stringify({ type: 'game.event', ...data }));
  };

  const createPeerConnection = () => {
    const pc = new RTCPeerConnection();
    pc.addEventListener('icecandidate', (event) => {
      if (event.candidate) {
        stackjackSignalSocket?.send(JSON.stringify({ type: 'signal.candidate', candidate: event.candidate }));
      }
    });
    pc.addEventListener('track', (event) => {
      if (remoteVideo) {
        remoteVideo.srcObject = event.streams[0];
      }
    });
    return pc;
  };

  const handleSignal = async (payload) => {
    if (!payload?.type) return;
    if (!stackjackPeerConnection) {
      stackjackPeerConnection = createPeerConnection();
    }
    if (payload.type === 'signal.offer' && payload.offer) {
      await stackjackPeerConnection.setRemoteDescription(new RTCSessionDescription(payload.offer));
      const answer = await stackjackPeerConnection.createAnswer();
      await stackjackPeerConnection.setLocalDescription(answer);
      stackjackSignalSocket?.send(JSON.stringify({ type: 'signal.answer', answer }));
    } else if (payload.type === 'signal.answer' && payload.answer) {
      await stackjackPeerConnection.setRemoteDescription(new RTCSessionDescription(payload.answer));
    } else if (payload.type === 'signal.candidate' && payload.candidate) {
      await stackjackPeerConnection.addIceCandidate(new RTCIceCandidate(payload.candidate));
    }
  };

  const connectSocket = (sessionId) => {
    if (!sessionId) return;
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    stackjackSignalSocket = new WebSocket(
      `${protocol}://${window.location.host}/ws/stackjack?session=${encodeURIComponent(sessionId)}`,
    );
    stackjackSignalSocket.addEventListener('message', (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload?.type === 'session.participants') {
          updateParticipants(payload.participants);
        }
        if (payload?.type === 'session.ready') {
          stackjackRole = payload.role;
          setStatus('Connected to shared StackJack session.');
        }
        if (payload?.type === 'game.event') {
          renderEvent(payload);
        }
        if (payload?.type?.startsWith('signal.')) {
          handleSignal(payload);
        }
      } catch (error) {
        console.error('StackJack signaling parse error', error);
      }
    });
    stackjackSignalSocket.addEventListener('close', () => {
      setStatus('Session disconnected.', true);
    });
    stackjackSignalSocket.addEventListener('error', () => {
      setStatus('Signaling error.', true);
    });
  };

  const initialize = async () => {
    const sessionId = new URLSearchParams(window.location.search).get('session');
    if (!sessionId) return;
    stackjackSessionId = sessionId;
    setStatus('Joining shared session...');
    connectSocket(sessionId);
    try {
      const response = await fetch(
        `/api/multiplayer/stackjack/session/${encodeURIComponent(sessionId)}/join`,
        { method: 'POST' },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus(payload.error || 'Unable to join session.', true);
        return;
      }
      stackjackRole = payload.role;
      updateParticipants({
        host: payload.role === 'host' ? 'You' : payload.partner?.username || 'Host',
        guest: payload.role === 'guest' ? 'You' : payload.partner?.username || 'Guest',
      });
      setStatus(`Session active (${payload.role}).`);
    } catch (error) {
      console.error('Failed to join StackJack session', error);
      setStatus('Unable to join session.', true);
    }
  };

  const startCall = async () => {
    if (!stackjackSessionId || !stackjackSignalSocket) {
      setStatus('Join a session before starting a video call.', true);
      return;
    }
    if (!stackjackPeerConnection) {
      stackjackPeerConnection = createPeerConnection();
    }
    if (!stackjackLocalStream) {
      try {
        stackjackLocalStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (localVideo) {
          localVideo.srcObject = stackjackLocalStream;
        }
        if (stackjackLocalStream) {
          stackjackLocalStream.getTracks().forEach((track) => {
            stackjackPeerConnection?.addTrack(track, stackjackLocalStream);
          });
          stackjackMuted = true;
          applyMuteState();
        }
      } catch (error) {
        console.error('Failed to capture media', error);
        setStatus('Unable to access camera/mic.', true);
        return;
      }
    } else {
      applyMuteState();
    }
    try {
      const offer = await stackjackPeerConnection.createOffer();
      await stackjackPeerConnection.setLocalDescription(offer);
      stackjackSignalSocket.send(JSON.stringify({ type: 'signal.offer', offer }));
    } catch (error) {
      console.error('Failed to start video call', error);
      setStatus('Unable to start call.', true);
    }
  };

  const toggleMic = () => {
    if (!stackjackLocalStream) return;
    stackjackMuted = !stackjackMuted;
    applyMuteState();
  };

  if (callBtn) {
    callBtn.addEventListener('click', startCall);
  }
  if (muteBtn) {
    muteBtn.addEventListener('click', toggleMic);
  }

  applyMuteState();

  const stackjackSessionManager = {
    initialize,
    startCall,
    sendEvent,
    setStatus,
    updateParticipants,
    toggleMic,
    isConnected: () => Boolean(stackjackSessionId && stackjackSignalSocket?.readyState === WebSocket.OPEN),
  };

  window.stackjackSession = stackjackSessionManager;
  initialize();
})();
