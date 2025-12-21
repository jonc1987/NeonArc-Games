(() => {
  const createMeetingBtn = document.getElementById('createMeetingBtn');
  const meetingLinkContainer = document.getElementById('meetingLinkContainer');
  const meetingLinkInput = document.getElementById('meetingLink');
  const meetingLinkCopyBtn = document.getElementById('meetingLinkCopy');
  const statusEl = document.getElementById('meetStatus');
  const participantsList = document.getElementById('meetParticipants');
  const startCallBtn = document.getElementById('meetStartCallBtn');
  const toggleMuteBtn = document.getElementById('toggleMuteBtn');
  const localVideo = document.getElementById('meetLocalVideo');
  const remoteVideo = document.getElementById('meetRemoteVideo');
  const localLevelBar = document.getElementById('localLevelBar');
  const remoteLevelBar = document.getElementById('remoteLevelBar');

  let sessionId = new URLSearchParams(window.location.search).get('room');
  let isHost = false;
  let meetSocket = null;
  let meetPeerConnection = null;
  let meetLocalStream = null;
  let localTracksAttached = false;
  let isMuted = false;
  let meetingStarted = false;
  let audioContext = null;
  let localAnalyser = null;
  let remoteAnalyser = null;
  let meterAnimationFrame = null;
  let refreshTimer = null;
  let closeRefreshTimer = null;

  const GAME_ROUTE_PATTERN = /^\\/games\\/([^/?#]+)/i;

  createMeetingBtn?.addEventListener('click', handleCreateMeeting);
  startCallBtn?.addEventListener('click', () => startMeetCall());
  meetingLinkCopyBtn?.addEventListener('click', copyMeetingLink);
  toggleMuteBtn?.addEventListener('click', toggleMute);
  updateMicButton();
  updateStartCallVisibility();

  if (sessionId) {
    createMeetingBtn?.setAttribute('disabled', 'true');
    loadExistingSession();
  }

  function startMeetingRefresh() {
    if (refreshTimer) return;
    refreshTimer = setInterval(refreshMeetingStatus, 10000);
  }

  async function refreshMeetingStatus() {
    if (!sessionId) return;
    try {
      const response = await fetch(`/api/meet/session/${encodeURIComponent(sessionId)}`);
      if (!response.ok) {
        if (response.status === 404) {
          setStatus('Meeting ended or no longer available.', true);
        }
        return;
      }
      const payload = await response.json();
      isHost = Boolean(payload.youAreHost);
      updateStartCallVisibility();
      if (!meetSocket || meetSocket.readyState === WebSocket.CLOSED) {
        openMeetSocket();
      }
      if (isHost && !meetingStarted) {
        startMeetCall();
      }
    } catch (error) {
      console.error('Meeting refresh failed', error);
    }
  }

  function resolvePreferredGame() {
    const params = new URLSearchParams(window.location.search);
    const queryGame = params.get('game');
    if (queryGame) {
      return sanitizeGame(queryGame);
    }
    const match = window.location.pathname.match(GAME_ROUTE_PATTERN);
    if (match?.[1]) {
      return sanitizeGame(match[1]);
    }
    return 'rocket';
  }

  function sanitizeGame(value) {
    if (!value) return null;
    const cleaned = value.toString().trim().replace(/[^a-zA-Z0-9_-]/g, '');
    return cleaned || null;
  }

  function buildMeetingLink(id) {
    const game = resolvePreferredGame();
    return `${window.location.origin}/games/${encodeURIComponent(game)}?room=${encodeURIComponent(id)}`;
  }

  async function handleCreateMeeting() {
    if (!createMeetingBtn) return;
    createMeetingBtn.disabled = true;
    setStatus('Creating meeting…');
    try {
      const response = await fetch('/api/meet/session', { method: 'POST' });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Unable to create meeting.');
      }
      const payload = await response.json();
      sessionId = payload.sessionId;
      isHost = true;
      updateStartCallVisibility();
      showMeetingLink(buildMeetingLink(sessionId));
      window.history.replaceState(null, '', `?room=${encodeURIComponent(sessionId)}`);
      setStatus('Meeting created. Share the link, then press Start Meeting.');
      openMeetSocket();
      startMeetingRefresh();
    } catch (error) {
      setStatus(error.message, true);
      createMeetingBtn.disabled = false;
    }
  }

  async function loadExistingSession() {
    if (!sessionId) return;
    setStatus('Connecting to meeting…');
    try {
      const response = await fetch(`/api/meet/session/${encodeURIComponent(sessionId)}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Meeting unavailable.');
      }
      const payload = await response.json();
      isHost = Boolean(payload.youAreHost);
      showMeetingLink(buildMeetingLink(sessionId));
      setStatus(isHost ? 'You are hosting this meeting. Press Start Meeting when ready.' : 'Waiting for host to start the meeting.');
      updateStartCallVisibility();
      openMeetSocket();
      startMeetingRefresh();
    } catch (error) {
      setStatus(error.message, true);
    }
  }

  function showMeetingLink(link) {
    if (!meetingLinkContainer || !meetingLinkInput) return;
    meetingLinkInput.value = link;
    meetingLinkContainer.hidden = false;
  }

  function copyMeetingLink() {
    if (!meetingLinkInput?.value) return;
    const text = meetingLinkInput.value;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => setStatus('Unable to copy automatically.', true));
      setStatus('Link copied. Send it to your crew.');
    } else {
      meetingLinkInput.select();
      document.execCommand('copy');
      setStatus('Link copied. Send it to your crew.');
    }
  }

  function setStatus(message, isError = false) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.style.color = isError ? '#ff9bb3' : '#eaf9ff';
  }

  function updateParticipants(participants = [], host) {
    if (!participantsList) return;
    participantsList.innerHTML = '';
    if (!participants.length) {
      const placeholder = document.createElement('li');
      placeholder.className = 'muted';
      placeholder.textContent = 'Waiting for pilots to join...';
      participantsList.appendChild(placeholder);
      return;
    }
    participants.forEach((entry) => {
      const item = document.createElement('li');
      if (host && host.id === entry.id) {
        item.innerHTML = `<strong>${entry.username}</strong> <span style="font-size:10px;letter-spacing:0.15em;color:rgba(255,255,255,0.6)">HOST</span>`;
      } else {
        item.textContent = entry.username;
      }
      participantsList.appendChild(item);
    });
  }

  async function ensureLocalStream() {
    if (meetLocalStream) return meetLocalStream;
    try {
      meetLocalStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (localVideo) {
        localVideo.srcObject = meetLocalStream;
      }
      prepareLocalMeter(meetLocalStream);
      updateMicButton();
      return meetLocalStream;
    } catch (error) {
      setStatus('Camera & mic access denied.', true);
      throw error;
    }
  }

  function addLocalTracks() {
    if (!meetPeerConnection || !meetLocalStream || localTracksAttached) return;
    meetLocalStream.getTracks().forEach((track) => {
      meetPeerConnection.addTrack(track, meetLocalStream);
    });
    meetLocalStream.getAudioTracks().forEach((track) => {
      track.enabled = !isMuted;
    });
    localTracksAttached = true;
  }

  function createMeetPeerConnection() {
    const pc = new RTCPeerConnection();
    pc.addEventListener('icecandidate', (event) => {
      if (event.candidate) {
        meetSocket?.send(JSON.stringify({ type: 'signal.candidate', candidate: event.candidate }));
      }
    });
    pc.addEventListener('track', (event) => {
      if (remoteVideo) {
        remoteVideo.srcObject = event.streams[0];
      }
      prepareRemoteMeter(event.streams[0]);
    });
    return pc;
  }

  async function toggleMute() {
    if (!meetLocalStream) {
      try {
        await ensureLocalStream();
      } catch (error) {
        console.error('Unable to access microphone', error);
        return;
      }
    }
    if (!meetLocalStream) return;
    isMuted = !isMuted;
    meetLocalStream.getAudioTracks().forEach((track) => {
      track.enabled = !isMuted;
    });
    setStatus(isMuted ? 'Microphone muted.' : 'Microphone live.');
    updateMicButton();
  }

  function updateMicButton() {
    if (!toggleMuteBtn) return;
    toggleMuteBtn.classList.toggle('muted', isMuted);
    toggleMuteBtn.setAttribute('aria-pressed', String(isMuted));
    const micText = toggleMuteBtn.querySelector('.mic-text');
    if (micText) {
      micText.textContent = isMuted ? 'Unmute microphone' : 'Mute microphone';
    }
  }

  function updateStartCallVisibility() {
    if (!startCallBtn) return;
    const shouldShow = isHost && !meetingStarted;
    startCallBtn.hidden = !shouldShow;
  }

  function ensureAudioContext() {
    if (audioContext) return audioContext;
    const ContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!ContextCtor) return null;
    audioContext = new ContextCtor();
    if (audioContext.state === 'suspended' && audioContext.resume) {
      audioContext.resume().catch(() => {});
    }
    return audioContext;
  }

  function prepareLocalMeter(stream) {
    if (!stream || localAnalyser) return;
    try {
      const context = ensureAudioContext();
      if (!context) return;
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      localAnalyser = analyser;
      startMeterLoop();
    } catch (error) {
      console.error('Local audio meter initialization failed', error);
    }
  }

  function prepareRemoteMeter(stream) {
    if (!stream || remoteAnalyser) return;
    try {
      const context = ensureAudioContext();
      if (!context) return;
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      remoteAnalyser = analyser;
    } catch (error) {
      console.error('Remote audio meter initialization failed', error);
    }
  }

  function startMeterLoop() {
    if (meterAnimationFrame) return;
    const step = () => {
      const localLevel = isMuted ? 0 : getAudioLevel(localAnalyser);
      const remoteLevel = getAudioLevel(remoteAnalyser);
      if (localLevelBar) {
        localLevelBar.style.transform = `scaleX(${localLevel})`;
      }
      if (remoteLevelBar) {
        remoteLevelBar.style.transform = `scaleX(${remoteLevel})`;
      }
      meterAnimationFrame = requestAnimationFrame(step);
    };
    meterAnimationFrame = requestAnimationFrame(step);
  }

  function getAudioLevel(analyser) {
    if (!analyser) return 0;
    const data = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i += 1) {
      const normalized = (data[i] - 128) / 128;
      sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / data.length);
    return Math.min(1, rms * 2);
  }

  async function handleMeetSignal(payload) {
    if (!payload?.type) return;
    if (!meetPeerConnection) {
      meetPeerConnection = createMeetPeerConnection();
    }
    if (payload.type === 'signal.offer' && payload.offer) {
      await ensureLocalStream();
      addLocalTracks();
      await meetPeerConnection.setRemoteDescription(new RTCSessionDescription(payload.offer));
      const answer = await meetPeerConnection.createAnswer();
      await meetPeerConnection.setLocalDescription(answer);
      meetSocket?.send(JSON.stringify({ type: 'signal.answer', answer }));
      setStatus('Meeting started.');
    } else if (payload.type === 'signal.answer' && payload.answer) {
      await meetPeerConnection.setRemoteDescription(new RTCSessionDescription(payload.answer));
    } else if (payload.type === 'signal.candidate' && payload.candidate) {
      await meetPeerConnection.addIceCandidate(new RTCIceCandidate(payload.candidate));
    }
  }

  async function startMeetCall() {
    if (!sessionId) {
      setStatus('Create or join a meeting first.', true);
      return;
    }
    if (!meetSocket || meetSocket.readyState !== WebSocket.OPEN) {
      setStatus('Waiting for meeting connection.', true);
      return;
    }
    if (!isHost) {
      setStatus('Waiting for host to start the meeting.');
      updateStartCallVisibility();
      return;
    }
    if (!meetPeerConnection) {
      meetPeerConnection = createMeetPeerConnection();
    }
    try {
      await ensureLocalStream();
      addLocalTracks();
      if (isHost) {
        const offer = await meetPeerConnection.createOffer();
        await meetPeerConnection.setLocalDescription(offer);
        meetSocket.send(JSON.stringify({ type: 'signal.offer', offer }));
        meetingStarted = true;
        updateStartCallVisibility();
        setStatus('Meeting started.');
      } else {
        setStatus('Waiting for host to start the meeting.');
      }
    } catch (error) {
      console.error('Meet call error', error);
      setStatus('Unable to start call.', true);
    }
  }

  function openMeetSocket() {
    if (!sessionId) return;
    if (meetSocket && meetSocket.readyState === WebSocket.OPEN) return;
    const wsScheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
    meetSocket = new WebSocket(`${wsScheme}://${window.location.host}/ws/meet?room=${encodeURIComponent(sessionId)}`);
    meetSocket.addEventListener('open', () => {
      setStatus(isHost ? 'Meeting signal ready. Share the link.' : 'Connected. Waiting for host.');
      updateStartCallVisibility();
      refreshMeetingStatus();
    });
    meetSocket.addEventListener('message', (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload?.type === 'meet.participants') {
          updateParticipants(payload.participants, payload.host);
        } else if (payload?.type?.startsWith('signal.')) {
          handleMeetSignal(payload).catch((error) => console.error(error));
        } else if (payload?.type === 'meet.ready') {
          setStatus('Meeting signaling ready.');
        }
      } catch (error) {
        console.error('Meet socket parse error', error);
      }
    });
    meetSocket.addEventListener('close', () => {
      setStatus('Meeting connection closed.', true);
      if (closeRefreshTimer) {
        clearTimeout(closeRefreshTimer);
      }
      closeRefreshTimer = setTimeout(() => {
        refreshMeetingStatus();
      }, 1000);
    });
    meetSocket.addEventListener('error', () => {
      setStatus('Meeting signaling failed.', true);
    });
  }
})();
