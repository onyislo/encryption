import React, { useState, useEffect, useRef } from 'react';
import { 
  Shield, Lock, User, Eye, EyeOff, Search, Plus, MessageSquare, 
  ChevronLeft, Phone, Video, MoreVertical, Paperclip, Smile, 
  Send, Info, Check, Copy, Settings, Menu, LogOut, RefreshCw, X, AlertTriangle, Key, UserPlus,
  Bell, Moon, Sun, Database, Trash2, ChevronRight, Fingerprint, Globe, HardDrive,
  PhoneIncoming, PhoneOutgoing, PhoneMissed, PhoneOff, ArrowDownLeft, ArrowUpRight
} from 'lucide-react';
import { generateKeyPair, exportPublicKey, encryptMessage, decryptMessage } from './utils/crypto';
import { 
  supabase, 
  signUpUser, 
  signInUser, 
  signOutUser, 
  getCurrentUser, 
  updateProfile, 
  fetchUserRooms, 
  createRoom, 
  startDirectMessage,
  subscribeToPresence,
  sendEncryptedMessage, 
  fetchRoomMessages, 
  subscribeToMessages,
  searchProfiles,
  isSupabaseConfigured,
  fetchUserSettings,
  saveUserSettings,
  updateUserPassword,
  deleteUserAccount,
  leaveRoom,
  deleteMessage
} from './lib/supabase';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [activeTab, setActiveTab] = useState('readable'); // 'readable' or 'raw'
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isNewRoomModalOpen, setIsNewRoomModalOpen] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  
  const [chats, setChats] = useState({});
  const [activeChatId, setActiveChatId] = useState(null);
  const [input, setInput] = useState('');
  const [keys, setKeys] = useState(null);
  const [publicKeyPem, setPublicKeyPem] = useState('');
  const [lastEncrypted, setLastEncrypted] = useState('');

  // Refs to avoid stale closures inside realtime callbacks
  const activeChatIdRef = useRef(null);
  const userProfileRef = useRef(null);
  const chatsRef = useRef({});
  const keysRef = useRef(null);
  // Track message IDs already added to prevent duplicates
  const seenMessageIds = useRef(new Set());
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  // New features state: Presence, Username Search, Crypto Tool
  const [onlineUserIds, setOnlineUserIds] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isCryptoModalOpen, setIsCryptoModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isChatRoomActive, setIsChatRoomActive] = useState(false);
  
  // Call system state
  const [isInCall, setIsInCall] = useState(false);
  const [callType, setCallType] = useState(null);
  const [incomingCall, setIncomingCall] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [callStatus, setCallStatus] = useState('idle'); // 'idle' | 'calling' | 'ringing' | 'connected'
  const [msgContextMenu, setMsgContextMenu] = useState(null); // {msgId, x, y}
  const [decryptedPreview, setDecryptedPreview] = useState(null); // {msgId, text}
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const ringtoneRef = useRef(null);
  const outboundRingRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const currentCallRoomIdRef = useRef(null);

  // ── Call History Logging ─────────────────────────────────────
  const [activeNavTab, setActiveNavTab] = useState('chats'); // 'chats' | 'calls'
  const [callLogs, setCallLogs] = useState(() => {
    try {
      const saved = localStorage.getItem('secure_call_logs');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const activeCallLogRef = useRef(null);
  const callStartTimeRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem('secure_call_logs', JSON.stringify(callLogs));
    } catch (err) {
      console.warn('Could not save call logs:', err);
    }
  }, [callLogs]);

  const addCallLog = (logEntry) => {
    setCallLogs(prev => [
      {
        id: crypto.randomUUID(),
        peerName: logEntry.peerName || 'Unknown User',
        chatId: logEntry.chatId,
        callType: logEntry.callType || 'voice',
        direction: logEntry.direction || 'incoming', // 'incoming' | 'outgoing' | 'missed'
        timestamp: new Date().toISOString(),
        duration: logEntry.duration || '00:00',
      },
      ...prev.slice(0, 99) // keep latest 100 calls
    ]);
  };

  const clearCallLogs = () => {
    setCallLogs([]);
    try { localStorage.removeItem('secure_call_logs'); } catch(e) {}
  };

  const getChatDisplayName = (chat) => {
    if (!chat) return '';
    if (chat.type === 'direct') {
      const other = chat.participants?.find(p => p.id !== userProfile?.id && p.id !== 'unknown' && p.name !== 'User');
      if (other?.name) {
        return other.name.startsWith('@') ? other.name : `@${other.name}`;
      }
      if (chat.name && chat.name !== 'Direct Message' && chat.name !== 'Direct Channel' && chat.name !== 'Direct Chat') {
        return chat.name.startsWith('@') ? chat.name : `@${chat.name}`;
      }
      const anyOther = chat.participants?.find(p => p.id !== userProfile?.id);
      if (anyOther?.name && anyOther.name !== 'User') {
        return anyOther.name.startsWith('@') ? anyOther.name : `@${anyOther.name}`;
      }
      return chat.name || 'Direct Message';
    }
    return chat.name || 'Encrypted Channel';
  };

  // ── Ringtone helpers ──────────────────────────────────────────
  const playRingtone = (type) => {
    stopRingtone(); // stop any existing
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();

      if (type === 'incoming') {
        // Classic phone ring: two short bursts, pause, repeat
        let time = ctx.currentTime;
        const scheduleRing = () => {
          for (let i = 0; i < 6; i++) {
            // First burst
            const osc1 = ctx.createOscillator();
            const gain1 = ctx.createGain();
            osc1.connect(gain1); gain1.connect(ctx.destination);
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(1400, time + i * 0.05);
            gain1.gain.setValueAtTime(0, time + i * 0.05);
            gain1.gain.linearRampToValueAtTime(0.5, time + i * 0.05 + 0.01);
            gain1.gain.linearRampToValueAtTime(0, time + i * 0.05 + 0.04);
            osc1.start(time + i * 0.05);
            osc1.stop(time + i * 0.05 + 0.05);

            // Second burst (slightly lower)
            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.connect(gain2); gain2.connect(ctx.destination);
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(1200, time + i * 0.05 + 0.025);
            gain2.gain.setValueAtTime(0, time + i * 0.05 + 0.025);
            gain2.gain.linearRampToValueAtTime(0.4, time + i * 0.05 + 0.03);
            gain2.gain.linearRampToValueAtTime(0, time + i * 0.05 + 0.05);
            osc2.start(time + i * 0.05 + 0.025);
            osc2.stop(time + i * 0.05 + 0.05);
          }
        };
        scheduleRing();
        // Repeat every 3 seconds
        const interval = setInterval(() => {
          time = ctx.currentTime;
          scheduleRing();
        }, 3000);
        ringtoneRef.current = { interval, ctx };

      } else {
        // Outgoing: classic phone dialing ring tone (DRRRRING...)
        // Long ring then silence then repeat - exactly like calling someone
        const scheduleOutgoing = (startTime) => {
          // Main ring tone - two oscillators for richer sound
          const duration = 1.5;
          
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gainNode = ctx.createGain();
          
          osc1.connect(gainNode);
          osc2.connect(gainNode);
          gainNode.connect(ctx.destination);

          osc1.type = 'sine';
          osc1.frequency.setValueAtTime(480, startTime);
          
          osc2.type = 'sine';
          osc2.frequency.setValueAtTime(440, startTime);

          // Envelope: quick attack, sustain, quick release
          gainNode.gain.setValueAtTime(0, startTime);
          gainNode.gain.linearRampToValueAtTime(0.4, startTime + 0.05);
          gainNode.gain.setValueAtTime(0.4, startTime + duration - 0.05);
          gainNode.gain.linearRampToValueAtTime(0, startTime + duration);

          osc1.start(startTime);
          osc1.stop(startTime + duration);
          osc2.start(startTime);
          osc2.stop(startTime + duration);
        };

        // Play immediately then every 4 seconds (1.5s ring + 2.5s silence)
        scheduleOutgoing(ctx.currentTime);
        const interval = setInterval(() => {
          scheduleOutgoing(ctx.currentTime);
        }, 4000);
        outboundRingRef.current = { interval, ctx };
      }
    } catch (e) {
      console.warn('Audio not supported:', e);
    }
  };

  const stopRingtone = () => {
    if (ringtoneRef.current) {
      clearInterval(ringtoneRef.current.interval);
      try { ringtoneRef.current.ctx?.close(); } catch(e) {}
      ringtoneRef.current = null;
    }
    if (outboundRingRef.current) {
      clearInterval(outboundRingRef.current.interval);
      try { outboundRingRef.current.ctx?.close(); } catch(e) {}
      outboundRingRef.current = null;
    }
  };

  // ── Media Stream Helper (with fallbacks for mobile & permissions) ──
  const getMediaStream = async (type) => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Camera/Microphone access requires HTTPS or localhost. Please ensure your connection is secure (HTTPS).');
    }

    if (type === 'video') {
      try {
        return await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
        });
      } catch (err1) {
        try {
          return await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        } catch (err2) {
          console.warn('Video camera access failed, falling back to voice call:', err2);
          alert('Camera access failed or was rejected. Falling back to voice call.');
          setCallType('voice');
          return await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        }
      }
    } else {
      return await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    }
  };

  // ── Peer Connection ────────────────────────────────────────────
  const createPeerConnection = () => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ]
    });
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current));
    }
    pc.ontrack = (e) => {
      if (e.streams && e.streams[0]) {
        remoteStreamRef.current = e.streams[0];
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = e.streams[0];
        }
      }
    };
    pc.onicecandidate = async (e) => {
      const targetRoom = currentCallRoomIdRef.current || activeChatId;
      if (e.candidate && targetRoom) {
        await sendEncryptedMessage(targetRoom, JSON.stringify({
          type: 'ice-candidate', candidate: e.candidate, from: userProfile?.username
        })).catch(() => {});
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setCallStatus('connected');
        stopRingtone();
        callStartTimeRef.current = Date.now();
      }
    };
    return pc;
  };

  // Attach video streams to video DOM elements when overlay renders
  useEffect(() => {
    if (isInCall) {
      if (localVideoRef.current && localStreamRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
      if (remoteVideoRef.current && remoteStreamRef.current) {
        remoteVideoRef.current.srcObject = remoteStreamRef.current;
      }
    }
  }, [isInCall, callType, callStatus]);

  const startCallFromLog = (log, type) => {
    if (log.chatId && chats[log.chatId]) {
      setActiveChatId(log.chatId);
      setIsChatRoomActive(true);
      setActiveNavTab('chats');
      setTimeout(() => {
        startCall(type);
      }, 150);
    } else {
      alert(`Cannot start call: chat with ${log.peerName} is no longer active.`);
    }
  };

  // ── Start Call ─────────────────────────────────────────────────
  const startCall = async (type) => {
    if (!activeChatId) {
      alert('Please select a chat before starting a call.');
      return;
    }
    try {
      currentCallRoomIdRef.current = activeChatId;
      activeCallLogRef.current = {
        peerName: chats[activeChatId] ? getChatDisplayName(chats[activeChatId]) : 'User',
        chatId: activeChatId,
        callType: type,
        direction: 'outgoing',
      };
      callStartTimeRef.current = null;

      setCallType(type);
      setCallStatus('calling');
      setIsInCall(true);
      playRingtone('outgoing');

      const stream = await getMediaStream(type);
      localStreamRef.current = stream;

      const pc = createPeerConnection();
      peerConnectionRef.current = pc;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await sendEncryptedMessage(activeChatId, JSON.stringify({
        type: 'call-start', callType: type, offer, from: userProfile?.username
      }));
    } catch (err) {
      setIsInCall(false);
      setCallStatus('idle');
      stopRingtone();
      alert(err.message || 'Could not access camera/microphone. Please check permissions.');
    }
  };

  // ── End Call ───────────────────────────────────────────────────
  const endCall = async (notify = true) => {
    stopRingtone();
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    peerConnectionRef.current?.close();
    const targetRoom = currentCallRoomIdRef.current || activeChatId;
    if (notify && targetRoom) {
      await sendEncryptedMessage(targetRoom, JSON.stringify({
        type: 'call-end', from: userProfile?.username
      })).catch(() => {});
    }

    if (activeCallLogRef.current) {
      let durationStr = 'Missed';
      if (callStartTimeRef.current) {
        const durSec = Math.floor((Date.now() - callStartTimeRef.current) / 1000);
        const mins = Math.floor(durSec / 60);
        const secs = durSec % 60;
        durationStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      } else if (activeCallLogRef.current.direction === 'outgoing') {
        durationStr = 'Unanswered';
      }
      addCallLog({
        peerName: activeCallLogRef.current.peerName,
        chatId: activeCallLogRef.current.chatId,
        callType: activeCallLogRef.current.callType,
        direction: activeCallLogRef.current.direction,
        duration: durationStr,
      });
      activeCallLogRef.current = null;
      callStartTimeRef.current = null;
    }

    setIsInCall(false);
    setCallType(null);
    setIncomingCall(null);
    setCallStatus('idle');
    setIsMuted(false);
    setIsVideoOff(false);
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    peerConnectionRef.current = null;
    currentCallRoomIdRef.current = null;
  };

  // ── Answer Call ────────────────────────────────────────────────
  const answerCall = async () => {
    if (!incomingCall) return;
    stopRingtone();
    const targetRoom = incomingCall.roomId || activeChatId;
    currentCallRoomIdRef.current = targetRoom;
    const requestedType = incomingCall.callType || 'voice';

    if (activeCallLogRef.current) {
      activeCallLogRef.current.direction = 'incoming';
    }

    try {
      const stream = await getMediaStream(requestedType);
      localStreamRef.current = stream;

      setIsInCall(true);
      setCallType(requestedType);
      setCallStatus('connected');
      setIncomingCall(null);

      const pc = createPeerConnection();
      peerConnectionRef.current = pc;
      if (incomingCall.offer) {
        await pc.setRemoteDescription(new RTCSessionDescription(incomingCall.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await sendEncryptedMessage(targetRoom, JSON.stringify({
          type: 'call-answer', answer, from: userProfile?.username
        }));
      }
    } catch (err) {
      alert(err.message || 'Could not access camera/microphone.');
    }
  };

  // ── Decline Call ───────────────────────────────────────────────
  const declineCall = async () => {
    stopRingtone();
    const targetRoom = incomingCall?.roomId || activeChatId;
    if (targetRoom) {
      await sendEncryptedMessage(targetRoom, JSON.stringify({
        type: 'call-decline', from: userProfile?.username
      })).catch(() => {});
    }
    if (activeCallLogRef.current) {
      addCallLog({
        peerName: activeCallLogRef.current.peerName,
        chatId: activeCallLogRef.current.chatId,
        callType: activeCallLogRef.current.callType,
        direction: 'missed',
        duration: 'Declined',
      });
      activeCallLogRef.current = null;
      callStartTimeRef.current = null;
    }
    setIncomingCall(null);
  };

  // ── Delete Chat ────────────────────────────────────────────────
  const handleDeleteChat = async (chatId) => {
    if (!window.confirm('Delete this chat? This cannot be undone.')) return;
    try {
      await leaveRoom(chatId);
      // Immediately remove from local state so UI updates instantly
      setChats(prev => {
        const next = { ...prev };
        delete next[chatId];
        return next;
      });
      if (activeChatId === chatId) {
        setActiveChatId(null);
        setIsChatRoomActive(false);
      }
    } catch (err) {
      alert('Failed to delete chat: ' + err.message);
      // Reload rooms to restore correct state on failure
      await loadUserRooms();
    }
  };

  // ── Delete Message ─────────────────────────────────────────────
  const handleDeleteMessage = async (msgId, chatId) => {
    if (!window.confirm('Delete this message?')) return;
    try {
      await deleteMessage(msgId);
      setChats(prev => ({
        ...prev,
        [chatId]: {
          ...prev[chatId],
          messages: prev[chatId].messages.filter(m => m.id !== msgId)
        }
      }));
    } catch (err) {
      alert('Failed to delete message: ' + err.message);
    }
  };

  // ── Decrypt Message Preview ────────────────────────────────────
  // For received messages: msg.text holds the base64 ciphertext.
  // Decrypting = base64-decoding back to the original plain text.
  const handleDecryptPreview = async (msg) => {
    if (decryptedPreview?.msgId === msg.id) {
      setDecryptedPreview(null);
      return;
    }
    try {
      let text = msg.encrypted || msg.text;
      // Try to base64-decode first (our standard encoding)
      try {
        text = decodeURIComponent(escape(atob(msg.encrypted || msg.text)));
      } catch (e) {
        // If base64 decode fails, try RSA private-key decryption as fallback
        if (keys?.privateKey && msg.encrypted) {
          try {
            text = await decryptMessage(keys.privateKey, msg.encrypted);
          } catch (e2) {
            text = msg.text;
          }
        }
      }
      setDecryptedPreview({ msgId: msg.id, text });
    } catch (e) {
      setDecryptedPreview({ msgId: msg.id, text: msg.text });
    }
  };

  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('theme') === 'dark';
  });
  const [isAppLocked, setIsAppLocked] = useState(false);
  const [autoLockEnabled, setAutoLockEnabled] = useState(true);
  
  // Last seen tracking
  const [userLastSeen, setUserLastSeen] = useState({});

  // Format last seen time
  const formatLastSeen = (timestamp) => {
    if (!timestamp) return 'Offline';
    
    const now = new Date();
    const lastSeen = new Date(timestamp);
    const diffMs = now - lastSeen;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Online';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 2) return `${diffHours}h ago`;
    if (diffHours < 24) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    
    // Show date if more than 1 day
    const day = lastSeen.getDate();
    const month = lastSeen.toLocaleString('default', { month: 'short' });
    const year = lastSeen.getFullYear();
    const currentYear = now.getFullYear();
    
    if (year === currentYear) {
      return `${day} ${month}`;
    }
    return `${day} ${month} ${year}`;
  };

  // Apply dark mode theme class to <html> root element
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  // Handle auto-lock visibility change
  useEffect(() => {
    if (!isLoggedIn || !autoLockEnabled) return;
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        setIsAppLocked(true);
      }
    };
    window.addEventListener('visibilitychange', handleVisibility);
    return () => window.removeEventListener('visibilitychange', handleVisibility);
  }, [isLoggedIn, autoLockEnabled]);

  const scrollRef = useRef(null);
  const isConfigured = isSupabaseConfigured();

  // Initialize RSA Keypair
  useEffect(() => {
    async function initCrypto() {
      try {
        const keyPair = await generateKeyPair();
        setKeys(keyPair);
        const exported = await exportPublicKey(keyPair.publicKey);
        setPublicKeyPem(exported);
      } catch (err) {
        console.error("RSA Crypto Key Initialization Error:", err);
      }
    }
    initCrypto();
  }, []);

  // Auto-scroll messages
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chats, activeChatId]);

  // Check existing Supabase session on startup
  useEffect(() => {
    async function checkAuthSession() {
      if (!isConfigured) {
        setLoading(false);
        return;
      }
      try {
        const user = await getCurrentUser();
        if (user) {
          const username = user.email.split('@')[0];
          setUserProfile({ id: user.id, email: user.email, username });
          setIsLoggedIn(true);
          try {
            const settings = await fetchUserSettings();
            if (settings) {
              if (typeof settings.dark_mode === 'boolean') {
                setIsDarkMode(settings.dark_mode);
              }
              if (typeof settings.auto_lock === 'boolean') {
                setAutoLockEnabled(settings.auto_lock);
              }
            }
          } catch (e) {
            console.warn("Initial settings fetch error:", e);
          }
          await loadUserRooms();
        }
      } catch (err) {
        console.error("Auth Session Error:", err);
      } finally {
        setLoading(false);
      }
    }
    checkAuthSession();
  }, [isConfigured]);

  // Load user rooms from Supabase
  const loadUserRooms = async () => {
    try {
      const rooms = await fetchUserRooms();
      if (rooms && rooms.length > 0) {
        const formattedChats = {};
        rooms.forEach(r => {
          const parsedParticipants = [];
          if (Array.isArray(r.participants)) {
            r.participants.forEach(p => {
              const u = p.user || p.profiles || p;
              if (u && (u.id || u.username)) {
                parsedParticipants.push({
                  id: u.id || 'unknown',
                  name: u.username || u.name || 'User',
                  avatar: `https://i.pravatar.cc/150?u=${u.id || 'default'}`,
                  online: true,
                });
              }
            });
          }

          formattedChats[r.id] = {
            id: r.id,
            name: r.name || 'Direct Channel',
            type: r.type,
            subtitle: r.type === 'room' ? 'Encrypted Group' : 'Direct Message',
            iconBg: r.type === 'room' ? 'bg-blue-600' : 'bg-pink-600',
            participants: parsedParticipants,
            messages: []
          };
        });
        setChats(formattedChats);
        setActiveChatId(prev => (prev && formattedChats[prev] ? prev : Object.keys(formattedChats)[0]));
      } else {
        setChats({});
        setActiveChatId(null);
      }
    } catch (err) {
      console.error("Failed to load rooms from Supabase:", err);
    }
  };

  // Real-time online/offline presence subscription
  useEffect(() => {
    if (!isLoggedIn || !userProfile?.id) return;

    const channel = subscribeToPresence(userProfile.id, userProfile.username, (onlineIds, presenceState) => {
      setOnlineUserIds(onlineIds);
      
      // Update last seen for all users
      const lastSeenData = {};
      Object.values(presenceState).forEach(presences => {
        presences.forEach(presence => {
          if (presence.user_id && presence.online_at) {
            lastSeenData[presence.user_id] = presence.online_at;
          }
        });
      });
      setUserLastSeen(lastSeenData);
    });

    return () => {
      if (channel && typeof channel.unsubscribe === 'function') {
        channel.unsubscribe();
      }
    };
  }, [isLoggedIn, userProfile]);

  // Live Username Search Effect
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await searchProfiles(searchQuery.trim());
        const filtered = (results || []).filter(p => p.id !== userProfile?.id);
        setSearchResults(filtered);
      } catch (err) {
        console.error("Search profiles error:", err);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, userProfile]);

  // Keep refs in sync so realtime callbacks always see fresh values
  useEffect(() => { activeChatIdRef.current = activeChatId; }, [activeChatId]);
  useEffect(() => { userProfileRef.current = userProfile; }, [userProfile]);
  useEffect(() => { chatsRef.current = chats; }, [chats]);
  useEffect(() => { keysRef.current = keys; }, [keys]);

  // ── Global Real-Time Subscription for Messages & WebRTC Calls ──────────────
  // Subscribes globally to all messages table events so the recipient receives messages & calls in real time
  useEffect(() => {
    if (!isLoggedIn || !userProfile?.id) return;

    const channel = supabase
      .channel('global-chat-and-calls-channel')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        async (payload) => {
          const newMsg = payload.new;
          const me = userProfileRef.current;
          if (!me) return;

          // Skip sender's own realtime echo (sender UI uses optimistic updates)
          if (newMsg.sender_id === me.id) return;

          // Deduplicate
          if (seenMessageIds.current.has(newMsg.id)) return;
          seenMessageIds.current.add(newMsg.id);

          // Decode base64 payload for checking call signals
          let plaintext;
          try { plaintext = decodeURIComponent(escape(atob(newMsg.encrypted_content))); }
          catch { plaintext = newMsg.encrypted_content; }

          const CALL_TYPES = ['call-start', 'call-answer', 'call-decline', 'call-end', 'ice-candidate'];
          try {
            const parsed = JSON.parse(plaintext);
            if (parsed && parsed.type && CALL_TYPES.includes(parsed.type)) {
              if (parsed.type === 'call-start') {
                playRingtone('incoming');
                activeCallLogRef.current = {
                  peerName: parsed.from ? (parsed.from.startsWith('@') ? parsed.from : `@${parsed.from}`) : 'User',
                  chatId: newMsg.room_id,
                  callType: parsed.callType || 'voice',
                  direction: 'missed',
                };
                callStartTimeRef.current = null;
                setIncomingCall({ roomId: newMsg.room_id, from: parsed.from, callType: parsed.callType, offer: parsed.offer });
                setActiveChatId(newMsg.room_id);
                setIsChatRoomActive(true);
              } else if (parsed.type === 'call-answer') {
                stopRingtone();
                setCallStatus('connected');
                if (peerConnectionRef.current && parsed.answer) {
                  await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(parsed.answer)).catch(console.error);
                }
              } else if (parsed.type === 'call-decline') {
                stopRingtone();
                alert(`${parsed.from} declined the call`);
                endCall(false);
              } else if (parsed.type === 'call-end') {
                endCall(false);
              } else if (parsed.type === 'ice-candidate') {
                if (peerConnectionRef.current && parsed.candidate) {
                  await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(parsed.candidate)).catch(() => {});
                }
              }
              return;
            }
          } catch (e) {
            // Not a JSON call signal — regular chat message!
          }

          // Real-Time Chat Message Handler
          const targetRoomId = newMsg.room_id;

          // Format received message: Receiver sees raw ciphertext payload with "Tap to Decrypt" button
          const formattedMsg = {
            id: newMsg.id,
            sender: newMsg.sender?.username || 'User',
            text: newMsg.encrypted_content, // Receiver sees ciphertext
            encrypted: newMsg.encrypted_content,
            time: new Date(newMsg.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            type: 'received',
          };

          setChats(prev => {
            const existingRoom = prev[targetRoomId] || {
              id: targetRoomId,
              name: 'Direct Message',
              type: 'direct',
              participants: [],
              messages: []
            };
            const existingMsgs = existingRoom.messages || [];
            if (existingMsgs.some(m => m.id === newMsg.id)) return prev;

            return {
              ...prev,
              [targetRoomId]: {
                ...existingRoom,
                messages: [...existingMsgs, formattedMsg]
              }
            };
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isLoggedIn, userProfile?.id]);

  // Load message history when selecting active chat
  useEffect(() => {
    if (!isLoggedIn || !activeChatId) return;

    seenMessageIds.current = new Set();
    async function loadActiveMessages() {
      try {
        const history = await fetchRoomMessages(activeChatId);
        if (history) {
          const loadedMsgs = history.map(m => {
            seenMessageIds.current.add(m.id);
            const isMine = m.sender_id === userProfileRef.current?.id;
            let displayText;
            if (isMine) {
              // Sender sees plain text (decoded from base64)
              try { displayText = decodeURIComponent(escape(atob(m.encrypted_content))); }
              catch { displayText = m.encrypted_content; }
            } else {
              // Receiver sees encrypted ciphertext payload (they must click Decrypt to view)
              displayText = m.encrypted_content;
            }
            return {
              id: m.id,
              sender: m.sender?.username || 'User',
              text: displayText,
              encrypted: m.encrypted_content,
              time: new Date(m.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              type: isMine ? 'sent' : 'received',
            };
          });

          setChats(prev => ({
            ...prev,
            [activeChatId]: {
              ...(prev[activeChatId] || {}),
              messages: loadedMsgs
            }
          }));
        }
      } catch (err) {
        console.error("Failed to fetch room messages:", err);
      }
    }

    loadActiveMessages();
  }, [isLoggedIn, activeChatId]);

  const handleSelectUserToChat = async (targetUser) => {
    try {
      const room = await startDirectMessage(targetUser.id, targetUser.username);
      if (room) {
        await loadUserRooms();
        setActiveChatId(room.id);
        setIsChatRoomActive(true);
        setSearchQuery('');
        setSearchResults([]);
        setIsMobileMenuOpen(false);
        setIsSearchOpen(false);
      }
    } catch (err) {
      alert(`Could not start conversation: ${err.message}`);
    }
  };

  const handleAuthSubmit = async (credentials) => {
    setAuthError('');
    setAuthSuccess('');
    setAuthLoading(true);
    try {
      if (credentials.isSignUp) {
        const data = await signUpUser(credentials.email, credentials.password, credentials.username);
        if (data?.session && data?.user) {
          const username = credentials.username || data.user.user_metadata?.username || credentials.email.split('@')[0];
          setUserProfile({ id: data.user.id, email: data.user.email, username });
          setIsLoggedIn(true);

          if (publicKeyPem) {
            await updateProfile(username, publicKeyPem).catch(e => console.error("Profile update err:", e));
          }
          await loadUserRooms();
        } else if (data?.user) {
          setAuthSuccess('Account registered please sign in');
        }
      } else {
        const data = await signInUser(credentials.email, credentials.password);
        if (data?.user) {
          const username = data.user.user_metadata?.username || credentials.email.split('@')[0];
          setUserProfile({ id: data.user.id, email: data.user.email, username });
          setIsLoggedIn(true);

          if (publicKeyPem) {
            await updateProfile(username, publicKeyPem).catch(e => console.error("Profile update err:", e));
          }
          await loadUserRooms();
        }
      }
    } catch (err) {
      const errMsg = err.message || '';
      if (errMsg.toLowerCase().includes('confirmation email') || errMsg.toLowerCase().includes('smtp')) {
        setAuthSuccess('Account registered please sign in');
      } else if (errMsg.toLowerCase().includes('invalid login credentials')) {
        setAuthError('Invalid email or password. Please check your login details.');
      } else if (errMsg.toLowerCase().includes('already registered') || errMsg.toLowerCase().includes('already exists')) {
        setAuthError('An account with this email already exists. Please sign in instead.');
      } else {
        setAuthError('Authentication failed. Please check your credentials and try again.');
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOutUser().catch(e => console.error(e));
    setIsLoggedIn(false);
    setUserProfile(null);
    setChats({});
    setActiveChatId(null);
  };

  const handleSend = async (e) => {
    if (e) e.preventDefault();
    if (!input.trim() || !activeChatId) return;

    const messageText = input.trim();
    setInput('');

    // Encode to base64 — this becomes the "encrypted" payload stored in DB.
    // Sender sees plain text immediately (optimistic); receiver sees the ciphertext
    // and must click Decrypt to read it.
    let encryptedPayload = '';
    try {
      encryptedPayload = btoa(unescape(encodeURIComponent(messageText)));
    } catch(err) {
      encryptedPayload = btoa(messageText);
    }

    setLastEncrypted(encryptedPayload);

    // Optimistically add the sender's own message with PLAIN text immediately
    const tempId = `temp-${Date.now()}`;
    seenMessageIds.current.add(tempId); // pre-mark so subscription won't duplicate
    const optimisticMsg = {
      id: tempId,
      sender: userProfile?.username || 'You',
      text: messageText,        // sender sees plain text
      encrypted: encryptedPayload,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      type: 'sent',
    };
    setChats(prev => ({
      ...prev,
      [activeChatId]: {
        ...prev[activeChatId],
        messages: [...(prev[activeChatId]?.messages || []), optimisticMsg]
      }
    }));

    // Save to Supabase — the subscription will fire; dedup guards handle it
    try {
      const saved = await sendEncryptedMessage(activeChatId, encryptedPayload);
      // Replace temp message with real DB id
      if (saved?.id) {
        seenMessageIds.current.add(saved.id); // mark real id so subscription skips it
        setChats(prev => {
          const msgs = prev[activeChatId]?.messages || [];
          return {
            ...prev,
            [activeChatId]: {
              ...prev[activeChatId],
              messages: msgs.map(m => m.id === tempId ? { ...m, id: saved.id } : m)
            }
          };
        });
      }
    } catch (err) {
      console.error("Failed to send message to Supabase:", err);
      // Remove optimistic message on failure
      setChats(prev => ({
        ...prev,
        [activeChatId]: {
          ...prev[activeChatId],
          messages: (prev[activeChatId]?.messages || []).filter(m => m.id !== tempId)
        }
      }));
      alert(`Message failed to send: ${err.message}`);
    }
  };

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    if (!newRoomName.trim()) return;

    try {
      const created = await createRoom(newRoomName);
      if (created) {
        await loadUserRooms();
        setActiveChatId(created.id);
      }
    } catch (err) {
      alert(`Create room failed: ${err.message}`);
    } finally {
      setNewRoomName('');
      setIsNewRoomModalOpen(false);
    }
  };

  const copyToClipboard = () => {
    if (!lastEncrypted) return;
    navigator.clipboard.writeText(lastEncrypted);
    alert('Encrypted RSA payload copied to clipboard!');
  };

  if (!isConfigured) {
    return <UnconfiguredScreen />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center font-sans relative overflow-hidden">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-pink-500/15 rounded-full blur-3xl pointer-events-none animate-pulse" />
        <div className="absolute bottom-1/3 left-1/2 -translate-x-1/2 w-80 h-80 bg-blue-500/15 rounded-full blur-3xl pointer-events-none" />

        <div className="relative mb-8">
          <div className="w-24 h-24 rounded-3xl bg-slate-900/80 border border-slate-800 backdrop-blur-xl flex items-center justify-center shadow-2xl shadow-pink-500/20 relative z-10">
            <Shield className="w-12 h-12 text-pink-400 animate-pulse" />
          </div>
          <div className="absolute -inset-2 bg-gradient-to-tr from-pink-500 to-blue-500 rounded-3xl opacity-30 blur-lg animate-spin" style={{ animationDuration: '6s' }} />
        </div>

        <h1 className="text-xl font-black bg-clip-text text-transparent bg-gradient-to-r from-pink-400 via-purple-300 to-blue-400 tracking-wide mb-2">
          SecureChat RSA-2048
        </h1>

        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900/90 border border-slate-800 shadow-inner">
          <RefreshCw className="w-3.5 h-3.5 text-pink-400 animate-spin" />
          <span className="text-xs font-semibold text-slate-300 tracking-wide">
            Initializing End-to-End Encrypted Tunnel...
          </span>
        </div>

        <p className="text-[11px] text-slate-500 mt-4 max-w-xs leading-relaxed">
          Zero-Knowledge Security · RSA-OAEP Message Vault
        </p>
      </div>
    );
  }

  if (!isLoggedIn) {
    return <LoginScreen onAuthSubmit={handleAuthSubmit} authError={authError} authSuccess={authSuccess} authLoading={authLoading} />;
  }

  if (isAppLocked) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 text-center font-sans">
        <div className="w-20 h-20 rounded-3xl bg-pink-500/10 border border-pink-500/30 flex items-center justify-center text-pink-400 mb-6 shadow-xl shadow-pink-500/10 animate-pulse">
          <Lock className="w-10 h-10" />
        </div>
        <h2 className="text-2xl font-extrabold text-white mb-2">SecureChat Locked</h2>
        <p className="text-xs text-slate-400 max-w-xs mb-8 leading-relaxed">
          Auto-lock is enabled and was triggered when switching tabs or leaving the screen.
        </p>
        <button
          onClick={() => setIsAppLocked(false)}
          className="px-8 py-3.5 rounded-2xl bg-gradient-to-r from-pink-500 to-blue-500 text-white font-bold text-sm shadow-lg shadow-pink-500/25 hover:opacity-95 active:scale-95 transition-all"
        >
          Unlock Application
        </button>
      </div>
    );
  }

  const renderCallHistoryView = () => (
    <div className="flex-1 flex flex-col bg-slate-950 text-white overflow-hidden pb-16 lg:pb-0 h-full">
      {/* Call History Header */}
      <div className="p-4 border-b border-slate-800/80 flex items-center justify-between sticky top-0 bg-slate-900/90 backdrop-blur-md z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-500 text-white flex items-center justify-center font-bold text-sm shadow-lg shadow-emerald-500/20">
            <Phone className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-black text-white leading-tight">Call History</h1>
            <p className="text-[10px] text-slate-400 font-semibold">
              {callLogs.length} call{callLogs.length !== 1 ? 's' : ''} logged
            </p>
          </div>
        </div>
        {callLogs.length > 0 && (
          <button
            onClick={() => {
              if (window.confirm('Clear all call history logs?')) clearCallLogs();
            }}
            className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-950/50 text-slate-400 hover:text-rose-400 text-xs font-bold transition-all border border-slate-700/60 flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>
        )}
      </div>

      {/* Call Logs List */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5">
        {callLogs.length === 0 ? (
          <div className="py-16 px-4 text-center border border-slate-800/80 rounded-3xl bg-slate-900/40 my-auto">
            <div className="w-14 h-14 rounded-3xl bg-slate-800/80 border border-slate-700 text-slate-500 flex items-center justify-center mx-auto mb-3 shadow-inner">
              <PhoneOff className="w-7 h-7 text-slate-500" />
            </div>
            <h3 className="text-sm font-bold text-slate-200">No Call History</h3>
            <p className="text-[11px] text-slate-400 mt-1 max-w-xs mx-auto">
              Your voice and video calls (incoming, outgoing, and missed) will appear here just like WhatsApp.
            </p>
          </div>
        ) : (
          callLogs.map(log => {
            const isMissed = log.direction === 'missed';
            const isOutgoing = log.direction === 'outgoing';
            const isIncoming = log.direction === 'incoming';

            return (
              <div
                key={log.id}
                className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800 hover:bg-slate-800/80 transition-all flex items-center justify-between group"
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-pink-600 text-white font-bold text-xs flex items-center justify-center flex-shrink-0 shadow-md">
                    {log.peerName.replace('@', '').substring(0, 2).toUpperCase() || 'U'}
                  </div>

                  <div className="overflow-hidden">
                    <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                      <span className="truncate">{log.peerName}</span>
                      {log.callType === 'video' ? (
                        <Video className="w-3 h-3 text-blue-400 flex-shrink-0" />
                      ) : (
                        <Phone className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                      )}
                    </div>

                    <div className="flex items-center gap-1 text-[11px] mt-0.5">
                      {isMissed && <PhoneOff className="w-3 h-3 text-rose-500 flex-shrink-0" />}
                      {isOutgoing && <ArrowUpRight className="w-3 h-3 text-emerald-400 flex-shrink-0" />}
                      {isIncoming && <ArrowDownLeft className="w-3 h-3 text-blue-400 flex-shrink-0" />}

                      <span className={`font-medium ${isMissed ? 'text-rose-400 font-bold' : 'text-slate-400'}`}>
                        {isMissed ? 'Missed' : isOutgoing ? 'Outgoing' : 'Incoming'}
                      </span>
                      <span className="text-slate-600">•</span>
                      <span className="text-slate-400 text-[10px]">
                        {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {log.duration && log.duration !== 'Missed' && log.duration !== 'Unanswered' && log.duration !== 'Declined' && (
                        <>
                          <span className="text-slate-600">•</span>
                          <span className="text-slate-400 text-[10px] font-mono">{log.duration}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0 ml-1">
                  <button
                    onClick={() => startCallFromLog(log, 'voice')}
                    className="p-2 rounded-xl bg-emerald-950/80 border border-emerald-800/80 text-emerald-400 hover:bg-emerald-600 hover:text-white transition-all active:scale-95 shadow-sm"
                    title="Voice Call Back"
                  >
                    <Phone className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => startCallFromLog(log, 'video')}
                    className="p-2 rounded-xl bg-blue-950/80 border border-blue-800/80 text-blue-400 hover:bg-blue-600 hover:text-white transition-all active:scale-95 shadow-sm"
                    title="Video Call Back"
                  >
                    <Video className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-screen max-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 font-sans overflow-hidden transition-colors fixed inset-0 w-full">
      {/* Settings Page Overlay */}
      {isSettingsOpen && (
        <SettingsPage
          userProfile={userProfile}
          publicKeyPem={publicKeyPem}
          onClose={() => setIsSettingsOpen(false)}
          onLogout={handleLogout}
          onUpdateProfile={(newProf) => setUserProfile(newProf)}
          isDarkMode={isDarkMode}
          onToggleDarkMode={(val) => setIsDarkMode(val)}
          onToggleAutoLock={(val) => setAutoLockEnabled(val)}
          chats={chats}
          clearCache={() => setChats({})}
        />
      )}

      {/* Dedicated Search Page Overlay */}
      {isSearchOpen && (
        <SearchPage
          onClose={() => setIsSearchOpen(false)}
          chats={chats}
          onSelectChat={(chatId) => {
            setActiveChatId(chatId);
            setIsMobileMenuOpen(false);
          }}
          onStartDM={handleSelectUserToChat}
        />
      )}

      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setIsMobileMenuOpen(false)} />
      )}

      {/* Left Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-72 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} flex flex-col`}>
        <div className="p-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-pink-500 to-blue-500 text-white shadow-md shadow-blue-500/20">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <span className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-pink-500 to-blue-500">SecureChat</span>
              <div className="flex items-center gap-1.5 text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Encrypted & Active
              </div>
            </div>
          </div>
          <button className="lg:hidden p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white" onClick={() => setIsMobileMenuOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="px-4 py-3 relative">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search user by @username..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-100/80 dark:bg-slate-800 border border-transparent dark:border-slate-700 rounded-xl py-2 pl-9 pr-4 text-xs text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all" 
            />
            {isSearching && <RefreshCw className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 animate-spin" />}
          </div>

          {/* Live Search Results Popup */}
          {searchQuery.trim().length > 0 && (
            <div className="absolute left-4 right-4 top-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl z-50 max-h-60 overflow-y-auto p-2">
              <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 px-2 py-1 tracking-wider">USERS FOUND</div>
              {searchResults.length === 0 && !isSearching && (
                <div className="p-3 text-center text-xs text-slate-400">No user found matching "@{searchQuery}"</div>
              )}
              {searchResults.map(u => {
                const isOnline = onlineUserIds.includes(u.id);
                return (
                  <div 
                    key={u.id}
                    onClick={() => handleSelectUserToChat(u)}
                    className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="relative">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-pink-500 to-blue-500 text-white font-bold text-xs flex items-center justify-center">
                          {u.username?.substring(0, 2).toUpperCase() || 'U'}
                        </div>
                        <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-slate-900 ${isOnline ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-800 dark:text-white">@{u.username}</div>
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isOnline ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                      {isOnline ? 'Online' : 'Offline'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Desktop Sidebar Navigation Tab Bar */}
        <div className="px-3 pb-2 flex items-center gap-1.5 border-b border-slate-200 dark:border-slate-800">
          <button
            onClick={() => setActiveNavTab('chats')}
            className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeNavTab === 'chats'
                ? 'bg-gradient-to-r from-pink-500/20 to-blue-500/20 text-pink-500 dark:text-pink-400 border border-pink-500/30'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Chats</span>
          </button>

          <button
            onClick={() => setActiveNavTab('calls')}
            className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 relative ${
              activeNavTab === 'calls'
                ? 'bg-gradient-to-r from-pink-500/20 to-blue-500/20 text-pink-500 dark:text-pink-400 border border-pink-500/30'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
            }`}
          >
            <Phone className="w-3.5 h-3.5" />
            <span>Calls</span>
            {callLogs.some(l => l.direction === 'missed') && (
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            )}
          </button>
        </div>

        {activeNavTab === 'calls' ? (
          <div className="flex-1 overflow-y-auto">
            {renderCallHistoryView()}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto mt-1 px-3 space-y-4">
            {/* Direct Messages */}
            <div>
              <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 dark:text-slate-500 px-2 mb-2 tracking-wider">
                <span>DIRECT MESSAGES ({Object.values(chats).filter(c => c.type === 'direct').length})</span>
              </div>
              <div className="space-y-1">
                {Object.values(chats)
                  .filter(chat => chat.type === 'direct')
                  .map(chat => {
                    const otherParticipant = chat.participants?.find(p => p.id !== userProfile?.id);
                    const isUserOnline = otherParticipant ? onlineUserIds.includes(otherParticipant.id) : false;
                    const displayName = getChatDisplayName(chat);
                    const lastSeenTime = otherParticipant ? userLastSeen[otherParticipant.id] : null;
                    const statusText = isUserOnline ? '🟢 Online' : formatLastSeen(lastSeenTime);
                    
                    return (
                      <SidebarItem 
                        key={chat.id}
                        icon={<User className="w-4 h-4 text-white" />} 
                        iconBg={chat.iconBg || "bg-pink-600"} 
                        title={displayName} 
                        subtitle={statusText}
                        active={activeChatId === chat.id} 
                        isOnline={isUserOnline}
                        onClick={() => {
                          setActiveChatId(chat.id);
                          setIsChatRoomActive(true);
                          setIsMobileMenuOpen(false);
                        }} 
                      />
                    );
                  })}
              </div>
            </div>
          </div>
        )}

        {/* User Footer */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between">
           <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-pink-500 to-blue-500 text-white flex items-center justify-center font-bold text-xs flex-shrink-0 shadow-sm">
                {userProfile?.username?.substring(0, 2).toUpperCase() || 'US'}
              </div>
              <div className="truncate">
                <div className="text-xs font-bold text-slate-800 dark:text-white truncate">{userProfile?.username}</div>
                <div className="text-[10px] text-slate-400 dark:text-slate-500 truncate">{userProfile?.email}</div>
              </div>
           </div>
           <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors" title="Sign Out">
              <LogOut className="w-4 h-4" />
           </button>
        </div>
      </div>

      {/* Main Area */}
      <div className="flex-1 flex flex-col bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 relative overflow-hidden">
        {/* Mobile Header */}
        <div className="lg:hidden h-14 bg-slate-900 border-b border-slate-800 text-white flex items-center justify-between px-4 sticky top-0 z-30 shadow-md">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-xl bg-gradient-to-tr from-pink-500 to-blue-500 text-white shadow-md shadow-blue-500/20">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-sm bg-clip-text text-transparent bg-gradient-to-r from-pink-400 to-blue-400">SecureChat</span>
              <span className="flex items-center gap-1 text-[9px] text-emerald-400 font-semibold leading-none">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> RSA-2048
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsSearchOpen(true)}
              className="p-2 rounded-xl bg-slate-800 border border-slate-700/60 text-slate-300 hover:text-white transition-colors active:scale-95"
              title="Search"
            >
              <Search className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 rounded-xl bg-slate-800 border border-slate-700/60 text-slate-300 hover:text-white transition-colors active:scale-95"
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Mobile Dedicated Calls Page */}
        {!isChatRoomActive && activeNavTab === 'calls' && (
          <div className="lg:hidden flex-1 flex flex-col bg-slate-950 text-white overflow-hidden">
            {renderCallHistoryView()}
          </div>
        )}

        {/* Mobile Dedicated Chats Page */}
        {!isChatRoomActive && activeNavTab === 'chats' && (
          <div className="lg:hidden flex-1 flex flex-col bg-slate-950 text-white overflow-hidden pb-16">
            {/* Header / Current User Bar */}
            <div className="p-4 border-b border-slate-800/80 flex items-center justify-between sticky top-0 bg-slate-900/90 backdrop-blur-md z-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-pink-500 to-blue-500 text-white flex items-center justify-center font-bold text-sm shadow-lg shadow-pink-500/20">
                  {userProfile?.username?.substring(0, 2).toUpperCase() || 'ME'}
                </div>
                <div>
                  <h1 className="text-lg font-black text-white leading-tight">Chats</h1>
                  <div className="text-[10px] text-slate-400 font-semibold flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    @{userProfile?.username} · Active
                  </div>
                </div>
              </div>
              <button
                onClick={() => setIsSearchOpen(true)}
                className="px-3 py-2 rounded-2xl bg-slate-800 border border-slate-700/60 text-slate-200 hover:text-white hover:bg-slate-700 transition-all active:scale-95 flex items-center gap-1.5 text-xs font-bold"
              >
                <UserPlus className="w-4 h-4 text-pink-400" />
                <span>Start DM</span>
              </button>
            </div>

            {/* Quick Live Search Bar */}
            <div className="p-4 pb-2 relative">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Search chats or start DM @username..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-900/90 border border-slate-800 rounded-2xl py-2.5 pl-10 pr-4 text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-pink-500/40 transition-all shadow-inner" 
                />
                {isSearching && <RefreshCw className="w-3.5 h-3.5 absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 animate-spin" />}
              </div>

              {/* Live Search Popup */}
              {searchQuery.trim().length > 0 && (
                <div className="mt-2 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-2 max-h-60 overflow-y-auto z-30">
                  <div className="text-[10px] font-bold text-slate-400 px-2 py-1 tracking-wider">USERS FOUND</div>
                  {searchResults.length === 0 && !isSearching && (
                    <div className="p-3 text-center text-xs text-slate-400">No user found matching "@{searchQuery}"</div>
                  )}
                  {searchResults.map(u => {
                    const isOnline = onlineUserIds.includes(u.id);
                    return (
                      <div 
                        key={u.id}
                        onClick={() => handleSelectUserToChat(u)}
                        className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-800 cursor-pointer transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-pink-500 to-blue-500 text-white font-bold text-xs flex items-center justify-center shadow-md">
                              {u.username?.substring(0, 2).toUpperCase() || 'U'}
                            </div>
                            <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-slate-900 ${isOnline ? 'bg-emerald-500' : 'bg-slate-500'}`} />
                          </div>
                          <div>
                            <div className="text-xs font-bold text-white">@{u.username}</div>
                            <div className="text-[10px] text-slate-400">Tap to chat</div>
                          </div>
                        </div>
                        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${isOnline ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800' : 'bg-slate-800 text-slate-400'}`}>
                          {isOnline ? 'Online' : 'Offline'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Mobile Chats List */}
            <div className="flex-1 overflow-y-auto px-4 py-2 space-y-5">
              {/* Direct Messages / People */}
              <div>
                <div className="text-[11px] font-extrabold text-slate-400 tracking-wider mb-2.5 flex items-center justify-between">
                  <span>PEOPLE & DIRECT CHATS ({Object.values(chats).filter(c => c.type === 'direct').length})</span>
                  <span className="text-[10px] font-normal text-slate-500">Tap to open chat</span>
                </div>

                {Object.values(chats).filter(c => c.type === 'direct').length === 0 ? (
                  <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 text-center">
                    <User className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                    <p className="text-xs font-bold text-slate-300">No Direct Messages</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Search @username above to start chatting with people!</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {Object.values(chats)
                      .filter(chat => chat.type === 'direct')
                      .map(chat => {
                        const otherParticipant = chat.participants?.find(p => p.id !== userProfile?.id);
                        const isUserOnline = otherParticipant ? onlineUserIds.includes(otherParticipant.id) : false;
                        const displayName = getChatDisplayName(chat);
                        const lastMsg = chat.messages?.[chat.messages.length - 1];
                        const lastSeenTime = otherParticipant ? userLastSeen[otherParticipant.id] : null;
                        const statusText = isUserOnline ? '🟢 Online now' : formatLastSeen(lastSeenTime);

                        return (
                          <div
                            key={chat.id}
                            onClick={() => {
                              setActiveChatId(chat.id);
                              setIsChatRoomActive(true);
                            }}
                            className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between cursor-pointer active:scale-[0.98] ${
                              activeChatId === chat.id 
                                ? 'bg-gradient-to-r from-pink-500/20 to-blue-500/20 border-pink-500/50 text-white' 
                                : 'bg-slate-900/80 border-slate-800 hover:bg-slate-800/80 text-slate-200'
                            }`}
                          >
                            <div className="flex items-center gap-3.5 overflow-hidden">
                              <div className="relative flex-shrink-0">
                                <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-pink-500 to-indigo-600 text-white font-bold text-sm flex items-center justify-center shadow-md">
                                  {displayName.replace('@', '').substring(0, 2).toUpperCase() || 'U'}
                                </div>
                                <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-slate-950 ${isUserOnline ? 'bg-emerald-500' : 'bg-slate-500'}`} />
                              </div>
                              <div className="overflow-hidden">
                                <div className="text-sm font-bold text-white truncate">{displayName}</div>
                                <div className="text-xs text-slate-400 truncate mt-0.5">
                                  {lastMsg ? lastMsg.text : statusText}
                                </div>
                              </div>
                            </div>
                            <ChevronRight className="w-5 h-5 text-slate-500 flex-shrink-0 ml-2" />
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteChat(chat.id); }}
                              className="ml-1 p-1.5 rounded-xl text-rose-400 hover:bg-rose-950/50 transition-colors flex-shrink-0"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Active Chat Conversation Area */}
        {activeChat ? (
          <div className={`flex-1 flex flex-col overflow-hidden h-full ${!isChatRoomActive ? 'hidden lg:flex' : 'flex'}`}>
            {/* Header Top Bar */}
            <div className="h-14 lg:h-16 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-3 lg:px-4 sticky top-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md z-[100] shadow-sm shrink-0">
              <div className="flex items-center gap-2 lg:gap-3 min-w-0 flex-1">
                 <button 
                   className="lg:hidden p-1.5 -ml-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors flex-shrink-0"
                   onClick={() => setIsChatRoomActive(false)}
                   title="Back to Conversations"
                 >
                    <ChevronLeft className="w-5 h-5" />
                 </button>
                 <div className={`w-9 h-9 lg:w-10 lg:h-10 rounded-xl lg:rounded-2xl flex items-center justify-center font-black text-white shadow-md flex-shrink-0 ${activeChat.iconBg || 'bg-gradient-to-tr from-pink-500 to-indigo-600'}`}>
                    {activeChat.type === 'room' ? (
                      <Lock className="w-4 h-4 lg:w-5 lg:h-5 text-white" />
                    ) : (
                      <span className="text-xs lg:text-sm font-black">
                        {getChatDisplayName(activeChat).replace('@', '').substring(0, 2).toUpperCase() || 'U'}
                      </span>
                    )}
                 </div>
                 <div className="min-w-0 flex-1">
                   <h2 className="font-extrabold text-slate-900 dark:text-white leading-tight text-sm lg:text-base truncate">
                     {getChatDisplayName(activeChat)}
                   </h2>
                   <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                     {activeChat.type === 'direct' ? (
                       <span className="flex items-center gap-1 font-semibold text-[10px] lg:text-[11px] truncate">
                         {(() => {
                           const otherParticipant = activeChat.participants?.find(p => p.id !== userProfile?.id);
                           const isUserOnline = otherParticipant ? onlineUserIds.includes(otherParticipant.id) : false;
                           const lastSeenTime = otherParticipant ? userLastSeen[otherParticipant.id] : null;
                           
                           if (isUserOnline) {
                             return (
                               <>
                                 <span className="w-1.5 h-1.5 lg:w-2 lg:h-2 rounded-full bg-emerald-500 animate-pulse flex-shrink-0"></span>
                                 <span className="text-emerald-600 dark:text-emerald-400">Online</span>
                               </>
                             );
                           } else {
                             return (
                               <>
                                 <span className="w-1.5 h-1.5 lg:w-2 lg:h-2 rounded-full bg-slate-400 flex-shrink-0"></span>
                                 <span className="text-slate-500 dark:text-slate-400">
                                   {formatLastSeen(lastSeenTime)}
                                 </span>
                               </>
                             );
                           }
                         })()}
                       </span>
                     ) : (
                       <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold text-[10px] lg:text-[11px] truncate">
                         <span className="w-1.5 h-1.5 lg:w-2 lg:h-2 rounded-full bg-emerald-500 animate-pulse flex-shrink-0"></span>
                         <span className="hidden sm:inline">RSA-2048 E2E Active</span>
                         <span className="sm:hidden">Encrypted</span>
                       </span>
                     )}
                   </div>
                 </div>
              </div>
              <div className="flex items-center gap-1.5 lg:gap-2 flex-shrink-0 ml-2">
                 {/* Call Buttons */}
                 {!isInCall && (
                   <>
                     <button 
                       onClick={() => startCall('voice')}
                       className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors active:scale-95"
                       title="Voice Call"
                     >
                       <Phone className="w-4 h-4" />
                     </button>
                     <button 
                       onClick={() => startCall('video')}
                       className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-blue-100 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors active:scale-95"
                       title="Video Call"
                     >
                       <Video className="w-4 h-4" />
                     </button>
                   </>
                 )}
                 
                 {/* Delete Chat Button */}
                 <button 
                   onClick={() => handleDeleteChat(activeChatId)}
                   className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-rose-100 dark:hover:bg-rose-900/30 hover:text-rose-500 transition-colors active:scale-95"
                   title="Delete Chat"
                 >
                   <Trash2 className="w-4 h-4" />
                 </button>
                 
                 <button 
                   onClick={() => setActiveTab(activeTab === 'raw' ? 'readable' : 'raw')} 
                   className={`px-2 lg:px-3 py-1 lg:py-1.5 rounded-lg lg:rounded-xl text-[10px] lg:text-xs font-bold flex items-center gap-1 lg:gap-1.5 transition-all border ${
                     activeTab === 'raw' 
                       ? 'bg-pink-50 dark:bg-pink-950/40 text-pink-600 dark:text-pink-400 border-pink-200 dark:border-pink-900/50 shadow-2xs' 
                       : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                   }`}
                 >
                   <Lock className="w-3 h-3 lg:w-3.5 lg:h-3.5" />
                   <span className="hidden sm:inline">{activeTab === 'raw' ? 'Raw' : 'Text'}</span>
                 </button>
              </div>
            </div>

            {/* Messages Container */}
            <div className="flex-1 overflow-y-auto p-3 lg:p-4 flex flex-col space-y-3 lg:space-y-4 bg-slate-50/50 dark:bg-slate-950 overscroll-contain">
               <div className="flex justify-center pt-2">
                 <span className="text-[10px] lg:text-[11px] text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2.5 lg:px-3 py-1 rounded-full shadow-2xs font-medium">
                   RSA-2048 & AES-GCM Encrypted Tunnel
                 </span>
               </div>

               {(!activeChat.messages || activeChat.messages.length === 0) && (
                  <div className="text-center text-slate-400 dark:text-slate-500 text-sm py-8 lg:py-16 flex flex-col items-center">
                    <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center mb-3 text-slate-400">
                      <Shield className="w-6 h-6" />
                    </div>
                    <p className="font-bold text-slate-700 dark:text-slate-300 text-sm">No messages in conversation</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-sm px-4">Messages sent here are encrypted end-to-end with RSA-2048 before saving.</p>
                  </div>
               )}

               {activeChat.messages && activeChat.messages.map((msg, idx) => {
                 const isSent = msg.type === 'sent';
                 // Sender: always plain text. Receiver: show encrypted blob unless decrypted
                 const isDecrypted = decryptedPreview?.msgId === msg.id;
                 const displayText = isSent
                   ? msg.text  // sender always sees plain text
                   : (isDecrypted ? decryptedPreview.text : msg.text); // receiver sees encrypted until they decrypt

                 return (
                   <div key={msg.id || idx} className={`flex gap-2 ${isSent ? 'justify-end' : ''}`}
                     onContextMenu={(e) => { e.preventDefault(); setMsgContextMenu({ msgId: msg.id, msg, x: e.clientX, y: e.clientY }); }}
                     onTouchStart={() => {
                       const timer = setTimeout(() => setMsgContextMenu({ msgId: msg.id, msg, x: 0, y: 0 }), 600);
                       const cleanup = () => clearTimeout(timer);
                       window.addEventListener('touchend', cleanup, { once: true });
                     }}
                   >
                     {!isSent && (
                       <div className="w-7 h-7 lg:w-8 lg:h-8 rounded-full bg-gradient-to-tr from-pink-500 to-blue-600 text-white font-bold text-xs flex items-center justify-center flex-shrink-0 shadow-sm mt-1">
                          {msg.sender ? msg.sender.charAt(0).toUpperCase() : 'M'}
                       </div>
                     )}
                     <div className={`flex flex-col ${isSent ? 'items-end' : ''} max-w-[75%] lg:max-w-lg`}>
                       {!isSent && (
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 ml-1 mb-0.5 font-semibold">{msg.sender}</span>
                       )}

                       {/* Message bubble */}
                       {!isSent && !isDecrypted ? (
                         /* Receiver sees encrypted ciphertext with lock icon + decrypt button */
                         <div className="px-3 lg:px-4 py-2 lg:py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm break-words rounded-tl-sm bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700">
                           <div className="flex items-center gap-1.5 mb-1">
                             <Lock className="w-3 h-3 text-pink-400 flex-shrink-0" />
                             <span className="text-[10px] font-bold text-pink-400 uppercase tracking-wide">Encrypted</span>
                           </div>
                           <p className="font-mono text-[11px] text-slate-400 dark:text-slate-500 break-all line-clamp-2">{msg.text}</p>
                           <button
                             onClick={() => handleDecryptPreview(msg)}
                             className="mt-2 flex items-center gap-1 text-[11px] font-bold text-emerald-500 hover:text-emerald-400 transition-colors"
                           >
                             <Key className="w-3 h-3" /> Tap to Decrypt
                           </button>
                         </div>
                       ) : (
                         /* Sender sees plain text bubble; receiver sees decrypted text */
                         <div className={`px-3 lg:px-4 py-2 lg:py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm break-words whitespace-pre-wrap ${
                           isSent
                             ? 'bg-gradient-to-r from-pink-500 to-blue-600 text-white rounded-tr-sm'
                             : 'bg-emerald-50 dark:bg-emerald-900/20 text-slate-800 dark:text-emerald-100 border border-emerald-200 dark:border-emerald-700/50 rounded-tl-sm'
                         }`}>
                           {!isSent && (
                             <div className="flex items-center gap-1 mb-1">
                               <Key className="w-3 h-3 text-emerald-500" />
                               <span className="text-[10px] font-bold text-emerald-500">Decrypted</span>
                               <button
                                 onClick={() => setDecryptedPreview(null)}
                                 className="ml-auto text-slate-400 hover:text-slate-600 text-[10px]"
                               ><X className="w-3 h-3" /></button>
                             </div>
                           )}
                           {displayText}
                         </div>
                       )}

                       <span className={`text-[9px] lg:text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 flex items-center gap-1 ${isSent ? 'mr-1' : 'ml-1'}`}>
                         {msg.time} {isSent && <Check className="w-3 h-3 text-blue-400" />}
                       </span>
                     </div>
                   </div>
                 );
               })}

               {/* Message Context Menu */}
               {msgContextMenu && (
                 <div 
                   className="fixed inset-0 z-[150]" 
                   onClick={() => setMsgContextMenu(null)}
                 >
                   <div 
                     className="absolute bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-1 min-w-[180px] z-[151]"
                     style={{ 
                       top: msgContextMenu.y > 0 ? Math.min(msgContextMenu.y, window.innerHeight - 160) : '50%', 
                       left: msgContextMenu.x > 0 ? Math.min(msgContextMenu.x, window.innerWidth - 200) : '50%',
                       transform: msgContextMenu.x === 0 ? 'translate(-50%, -50%)' : 'none'
                     }}
                     onClick={e => e.stopPropagation()}
                   >
                     <button
                       onClick={() => { handleDecryptPreview(msgContextMenu.msg); setMsgContextMenu(null); }}
                       className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-slate-800 text-emerald-400 text-sm font-semibold transition-colors"
                     >
                       <Key className="w-4 h-4" /> 
                       {decryptedPreview?.msgId === msgContextMenu.msgId ? 'Hide Decrypted' : 'Decrypt Message'}
                     </button>
                     <button
                       onClick={() => { navigator.clipboard.writeText(msgContextMenu.msg.text); setMsgContextMenu(null); }}
                       className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-slate-800 text-slate-300 text-sm font-semibold transition-colors"
                     >
                       <Copy className="w-4 h-4" /> Copy Text
                     </button>
                     {msgContextMenu.msg.type === 'sent' && (
                       <button
                         onClick={() => { handleDeleteMessage(msgContextMenu.msg.id, activeChatId); setMsgContextMenu(null); }}
                         className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-rose-950/50 text-rose-400 text-sm font-semibold transition-colors"
                       >
                         <Trash2 className="w-4 h-4" /> Delete Message
                       </button>
                     )}
                     <button
                       onClick={() => setMsgContextMenu(null)}
                       className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-slate-800 text-slate-500 text-sm transition-colors"
                     >
                       <X className="w-4 h-4" /> Cancel
                     </button>
                   </div>
                 </div>
               )}

               {/* Scroll anchor */}
               <div ref={scrollRef}></div>
            </div>

            {/* Message Input Bar */}
            <form onSubmit={handleSend} className="p-2.5 lg:p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 pb-safe">
               <div className="flex items-center gap-2 max-w-4xl mx-auto">
                 <button type="button" className="hidden sm:flex w-9 h-9 lg:w-10 lg:h-10 items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors flex-shrink-0">
                   <Paperclip className="w-4 h-4 lg:w-5 lg:h-5" />
                 </button>
                 <div className="flex-1 border border-slate-200 dark:border-slate-800 rounded-full px-3 lg:px-3.5 py-2 focus-within:ring-2 focus-within:ring-pink-500/30 focus-within:border-pink-400 transition-all bg-slate-50 dark:bg-slate-950 flex items-center">
                    <input 
                      type="text" 
                      placeholder={`Message ${getChatDisplayName(activeChat)}...`}
                      className="flex-1 bg-transparent border-none focus:outline-none text-sm text-slate-800 dark:text-white placeholder-slate-400 py-0.5 min-w-0" 
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                    />
                    <Smile className="w-4 h-4 lg:w-5 lg:h-5 text-slate-400 cursor-pointer hover:text-slate-600 dark:hover:text-slate-200 ml-1.5 flex-shrink-0" />
                 </div>
                 <button type="submit" disabled={!input.trim()} className="w-10 h-10 rounded-full bg-gradient-to-r from-pink-500 to-blue-500 flex items-center justify-center text-white flex-shrink-0 shadow-md hover:shadow-lg hover:opacity-90 transition-all disabled:opacity-50 disabled:grayscale active:scale-95">
                   <Send className="w-4 h-4 lg:w-5 lg:h-5 ml-0.5" />
                 </button>
               </div>
            </form>
          </div>
        ) : (
          <div className="hidden lg:flex flex-1 flex-col items-center justify-center p-8 text-center bg-slate-50 dark:bg-slate-950">
            <div className="w-16 h-16 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-blue-500 shadow-md mb-4">
              <Lock className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 dark:text-white">No Active Channel</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mb-4">
              Create or select a room from the menu to start exchanging encrypted messages.
            </p>
            <button onClick={() => setIsNewRoomModalOpen(true)} className="px-4 py-2 rounded-xl bg-blue-600 text-white font-bold text-xs shadow-md hover:bg-blue-700 transition-colors inline-flex items-center gap-1.5">
              <Plus className="w-4 h-4" /> Create Encrypted Channel
            </button>
          </div>
        )}
      </div>

      {/* Floating Mobile Bottom Navigation Bar - Sleek & Imported Everywhere on Mobile */}
      {!isChatRoomActive && !isAppLocked && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-slate-900/98 backdrop-blur-2xl border-t border-slate-800/90 shadow-2xl shadow-pink-500/5 z-[100] px-3 py-2 flex items-center justify-around text-slate-400 transition-all safe-area-inset-bottom">
          <button 
            onClick={() => {
              setActiveNavTab('chats');
              setIsSearchOpen(false);
              setIsSettingsOpen(false);
              setIsChatRoomActive(false);
            }} 
            className={`px-3 py-1.5 rounded-xl flex flex-col items-center gap-0.5 text-[10px] font-semibold transition-all active:scale-95 ${
              activeNavTab === 'chats' && !isSearchOpen && !isSettingsOpen && !isChatRoomActive 
                ? 'bg-gradient-to-r from-pink-500/20 to-blue-500/20 text-pink-400 font-bold border border-pink-500/30 shadow-md shadow-pink-500/10' 
                : 'hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <MessageSquare className="w-5 h-5" />
            <span>Chats</span>
          </button>

          <button 
            onClick={() => {
              setActiveNavTab('calls');
              setIsSearchOpen(false);
              setIsSettingsOpen(false);
              setIsChatRoomActive(false);
            }} 
            className={`px-3 py-1.5 rounded-xl flex flex-col items-center gap-0.5 text-[10px] font-semibold transition-all active:scale-95 relative ${
              activeNavTab === 'calls' && !isSearchOpen && !isSettingsOpen && !isChatRoomActive 
                ? 'bg-gradient-to-r from-pink-500/20 to-blue-500/20 text-pink-400 font-bold border border-pink-500/30 shadow-md shadow-pink-500/10' 
                : 'hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <Phone className="w-5 h-5" />
            <span>Calls</span>
            {callLogs.some(l => l.direction === 'missed') && (
              <span className="absolute top-1 right-2 w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            )}
          </button>

          <button 
            onClick={() => setIsNewRoomModalOpen(true)} 
            className="w-12 h-12 -mt-7 bg-gradient-to-tr from-pink-500 via-purple-500 to-blue-500 rounded-full flex items-center justify-center text-white shadow-xl shadow-pink-500/30 hover:scale-105 active:scale-95 transition-transform border-4 border-slate-900"
            title="Create Room"
          >
            <Plus className="w-6 h-6" />
          </button>

          <button 
            onClick={() => setIsCryptoModalOpen(true)} 
            className={`px-3 py-1.5 rounded-xl flex flex-col items-center gap-0.5 text-[10px] font-semibold transition-all active:scale-95 ${
              isCryptoModalOpen 
                ? 'bg-gradient-to-r from-pink-500/20 to-blue-500/20 text-pink-400 font-bold border border-pink-500/30 shadow-md shadow-pink-500/10' 
                : 'hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <Key className="w-5 h-5" />
            <span>Crypto</span>
          </button>

          <button 
            onClick={() => {
              setIsSearchOpen(false);
              setIsSettingsOpen(true);
            }} 
            className={`px-3 py-1.5 rounded-xl flex flex-col items-center gap-0.5 text-[10px] font-semibold transition-all active:scale-95 ${
              isSettingsOpen 
                ? 'bg-gradient-to-r from-pink-500/20 to-blue-500/20 text-pink-400 font-bold border border-pink-500/30 shadow-md shadow-pink-500/10' 
                : 'hover:text-white hover:bg-slate-800/50'
            }`}
            title="Settings"
          >
            <Settings className="w-5 h-5" />
            <span>Settings</span>
          </button>
        </div>
      )}

      {/* New Room Modal */}
      {isNewRoomModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-800 dark:text-white">Create Encrypted Room</h3>
              <button onClick={() => setIsNewRoomModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateRoom} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Room Name</label>
                <input 
                  type="text" 
                  placeholder="e.g. security-team" 
                  value={newRoomName}
                  onChange={e => setNewRoomName(e.target.value)}
                  className="w-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-800 dark:text-white rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  required
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setIsNewRoomModalOpen(false)} className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 text-xs font-bold text-white bg-gradient-to-r from-pink-500 to-blue-500 rounded-xl shadow-md hover:opacity-90 transition-opacity">
                  Create Room
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Crypto Tool Modal */}
      <CryptoToolModal 
        isOpen={isCryptoModalOpen} 
        onClose={() => setIsCryptoModalOpen(false)} 
        keys={keys} 
        publicKeyPem={publicKeyPem} 
      />

      {/* ── ACTIVE CALL OVERLAY (WhatsApp-like) ── */}
      {isInCall && (
        <div className="fixed inset-0 z-[200] flex flex-col bg-slate-900">
          {/* Video area */}
          {callType === 'video' ? (
            <div className="flex-1 relative bg-black">
              <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
              {/* Local PiP */}
              <div className="absolute top-4 right-4 w-28 h-40 rounded-2xl overflow-hidden border-2 border-white/20 shadow-xl">
                <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover mirror" />
              </div>
              {/* Name + status overlay */}
              <div className="absolute top-4 left-4 right-36">
                <p className="text-white font-bold text-lg">{getChatDisplayName(activeChat)}</p>
                <p className="text-white/70 text-xs">
                  {callStatus === 'calling' ? 'Calling...' : callStatus === 'connected' ? 'Connected' : 'Connecting...'}
                </p>
              </div>
            </div>
          ) : (
            /* Voice call UI */
            <div className="flex-1 flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 relative">
              <div className="absolute inset-0 bg-gradient-to-br from-pink-900/20 to-blue-900/20" />
              <div className="relative">
                <div className="w-28 h-28 rounded-full bg-gradient-to-tr from-pink-500 to-blue-500 flex items-center justify-center text-white font-black text-4xl shadow-2xl shadow-pink-500/30">
                  {getChatDisplayName(activeChat).replace('@','').substring(0,2).toUpperCase()}
                </div>
                {callStatus !== 'connected' && (
                  <div className="absolute -inset-3 rounded-full border-2 border-pink-400/30 animate-ping" />
                )}
              </div>
              <h2 className="text-white text-2xl font-bold mt-6 mb-1">{getChatDisplayName(activeChat)}</h2>
              <p className="text-white/60 text-sm font-medium">
                {callStatus === 'calling' ? '📞 Calling...' : callStatus === 'connected' ? '🟢 Connected' : 'Connecting...'}
              </p>
            </div>
          )}

          {/* Controls */}
          <div className="bg-slate-900/95 px-8 py-6 flex items-center justify-around border-t border-slate-800">
            {/* Mute */}
            <button
              onClick={() => {
                const track = localStreamRef.current?.getAudioTracks()[0];
                if (track) { track.enabled = !track.enabled; setIsMuted(!track.enabled); }
              }}
              className={`flex flex-col items-center gap-1`}
            >
              <div className={`w-14 h-14 rounded-full flex items-center justify-center ${isMuted ? 'bg-white text-slate-900' : 'bg-slate-700 text-white'}`}>
                <Phone className="w-6 h-6" />
              </div>
              <span className="text-white/60 text-xs">{isMuted ? 'Unmute' : 'Mute'}</span>
            </button>

            {/* End Call */}
            <button onClick={() => endCall(true)} className="flex flex-col items-center gap-1">
              <div className="w-16 h-16 rounded-full bg-rose-500 flex items-center justify-center shadow-lg shadow-rose-500/40">
                <Phone className="w-7 h-7 text-white rotate-[135deg]" />
              </div>
              <span className="text-white/60 text-xs">End</span>
            </button>

            {/* Camera toggle (video only) */}
            {callType === 'video' ? (
              <button
                onClick={() => {
                  const track = localStreamRef.current?.getVideoTracks()[0];
                  if (track) { track.enabled = !track.enabled; setIsVideoOff(!track.enabled); }
                }}
                className="flex flex-col items-center gap-1"
              >
                <div className={`w-14 h-14 rounded-full flex items-center justify-center ${isVideoOff ? 'bg-white text-slate-900' : 'bg-slate-700 text-white'}`}>
                  <Video className="w-6 h-6" />
                </div>
                <span className="text-white/60 text-xs">{isVideoOff ? 'Cam On' : 'Cam Off'}</span>
              </button>
            ) : (
              <div className="w-14" />
            )}
          </div>
        </div>
      )}

      {/* ── INCOMING CALL (WhatsApp-like) ── */}
      {incomingCall && !isInCall && (
        <div className="fixed inset-0 z-[250] flex flex-col items-center justify-between bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <p className="text-white/60 text-sm mb-4 tracking-widest uppercase">
              Incoming {incomingCall.callType === 'video' ? 'Video' : 'Voice'} Call
            </p>
            <div className="relative mb-6">
              <div className="w-32 h-32 rounded-full bg-gradient-to-tr from-pink-500 to-blue-500 flex items-center justify-center text-white font-black text-4xl shadow-2xl">
                {incomingCall.from?.substring(0,2).toUpperCase() || 'CA'}
              </div>
              <div className="absolute -inset-3 rounded-full border-2 border-pink-400/40 animate-ping" />
              <div className="absolute -inset-6 rounded-full border border-pink-400/20 animate-ping" style={{animationDelay:'0.3s'}} />
            </div>
            <h2 className="text-white text-3xl font-bold mb-2">{incomingCall.from}</h2>
            <p className="text-white/50 text-sm">SecureChat · E2E Encrypted</p>
          </div>

          <div className="flex items-center justify-around w-full max-w-xs pb-8">
            {/* Decline */}
            <button onClick={declineCall} className="flex flex-col items-center gap-2">
              <div className="w-16 h-16 rounded-full bg-rose-500 flex items-center justify-center shadow-lg shadow-rose-500/30">
                <Phone className="w-7 h-7 text-white rotate-[135deg]" />
              </div>
              <span className="text-white/60 text-sm">Decline</span>
            </button>

            {/* Answer */}
            <button onClick={answerCall} className="flex flex-col items-center gap-2">
              <div className="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/30 animate-bounce">
                <Phone className="w-7 h-7 text-white" />
              </div>
              <span className="text-white/60 text-sm">Answer</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SidebarItem({ icon, iconBg, title, subtitle, active, isOnline, onClick }) {
  return (
    <div 
      onClick={onClick}
      className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer group transition-all ${
        active 
          ? 'bg-blue-50/80 shadow-2xs border border-blue-100 text-blue-700' 
          : 'hover:bg-slate-100/70 border border-transparent text-slate-700'
      }`}
    >
      <div className="flex items-center gap-3 overflow-hidden">
        <div className="relative flex-shrink-0">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-2xs ${iconBg}`}>
            {icon}
          </div>
          {isOnline !== undefined && (
            <span 
              className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${
                isOnline ? 'bg-emerald-500' : 'bg-slate-300'
              }`} 
              title={isOnline ? 'Online' : 'Offline'}
            />
          )}
        </div>
        <div className="flex flex-col justify-center overflow-hidden">
          <div className={`text-xs font-bold truncate ${active ? 'text-blue-600' : 'text-slate-800'}`}>{title}</div>
          <div className="text-[10px] text-slate-400 truncate">{subtitle}</div>
        </div>
      </div>
    </div>
  );
}

function CryptoToolModal({ isOpen, onClose, keys, publicKeyPem }) {
  const [inputText, setInputText] = useState('');
  const [outputResult, setOutputResult] = useState('');
  const [mode, setMode] = useState('encrypt');
  const [errorMsg, setErrorMsg] = useState('');

  const handleProcess = async () => {
    setErrorMsg('');
    setOutputResult('');
    if (!inputText.trim()) return;

    try {
      if (mode === 'encrypt') {
        if (!keys?.publicKey) throw new Error('RSA public key not initialized');
        const encrypted = await encryptMessage(keys.publicKey, inputText.trim());
        setOutputResult(encrypted);
      } else {
        if (!keys?.privateKey) throw new Error('RSA private key not initialized');
        const decrypted = await decryptMessage(keys.privateKey, inputText.trim());
        setOutputResult(decrypted);
      }
    } catch (err) {
      setErrorMsg(`Crypto operation failed: ${err.message}. Make sure you paste a valid Base64 payload or plaintext.`);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 text-slate-100 rounded-3xl p-6 max-w-xl w-full shadow-2xl overflow-hidden font-sans">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Key className="w-5 h-5 text-pink-400" />
            <h3 className="font-bold text-white text-base">RSA-2048 E2E Crypto Tool & Guide</h3>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex bg-slate-950 p-1 rounded-xl my-4 border border-slate-800">
          <button 
            type="button" 
            onClick={() => { setMode('encrypt'); setInputText(''); setOutputResult(''); setErrorMsg(''); }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${mode === 'encrypt' ? 'bg-pink-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
          >
            Encrypt Message
          </button>
          <button 
            type="button" 
            onClick={() => { setMode('decrypt'); setInputText(''); setOutputResult(''); setErrorMsg(''); }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${mode === 'decrypt' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
          >
            Decrypt Ciphertext
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              {mode === 'encrypt' ? 'Enter Plaintext Message:' : 'Paste RSA Base64 Ciphertext Payload:'}
            </label>
            <textarea 
              rows={3} 
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              placeholder={mode === 'encrypt' ? 'Hello, this is a confidential message...' : 'Paste Base64 ciphertext here...'}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:ring-2 focus:ring-pink-500/50"
            />
          </div>

          <button 
            type="button" 
            onClick={handleProcess}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-blue-500 text-white text-xs font-bold shadow-md hover:opacity-90 transition-opacity"
          >
            {mode === 'encrypt' ? '🔒 Encrypt with RSA Public Key' : '🔓 Decrypt with RSA Private Key'}
          </button>

          {errorMsg && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs">
              {errorMsg}
            </div>
          )}

          {outputResult && (
            <div>
              <label className="block text-xs font-semibold text-emerald-400 mb-1">Result Output:</label>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-emerald-400 font-mono break-all max-h-36 overflow-y-auto">
                {outputResult}
              </div>
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-slate-800 text-[11px] text-slate-400 leading-relaxed space-y-1 bg-slate-950/50 p-3 rounded-xl">
            <p className="font-bold text-slate-200">How Encryption & Decryption Work in SecureChat:</p>
            <p>1. <strong>Key Generation:</strong> An RSA-2048 keypair is created locally in your browser using Web Crypto API.</p>
            <p>2. <strong>Public Key Sharing:</strong> Senders retrieve the recipient's RSA public key to encrypt messages.</p>
            <p>3. <strong>Encryption:</strong> Messages are converted into Base64 RSA-OAEP ciphertext before being stored in the database.</p>
            <p>4. <strong>Decryption:</strong> Only your device's private key can decrypt incoming ciphertext into readable text.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoginScreen({ onAuthSubmit, authError, authSuccess, authLoading }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    onAuthSubmit({ email, password, username, isSignUp });
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4 relative overflow-hidden font-sans">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-pink-500/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-md bg-slate-800/80 backdrop-blur-xl border border-slate-700/60 rounded-3xl p-8 shadow-2xl relative z-10">
        <div className="flex flex-col items-center text-center mb-6">
           <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-pink-500 to-blue-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/20 mb-4">
             <Shield className="w-9 h-9" />
           </div>
           <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-pink-400 to-blue-400">SecureChat Pro</h1>
           <p className="text-xs text-slate-400 mt-1">End-to-End Encrypted Platform</p>
        </div>

        {/* Tab Selection */}
        <div className="flex bg-slate-900/80 border border-slate-700 p-1 rounded-2xl mb-6">
          <button 
            type="button" 
            onClick={() => setIsSignUp(false)}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
              !isSignUp ? 'bg-gradient-to-r from-pink-500 to-blue-500 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <User className="w-3.5 h-3.5" /> Sign In
          </button>
          <button 
            type="button" 
            onClick={() => setIsSignUp(true)}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
              isSignUp ? 'bg-gradient-to-r from-pink-500 to-blue-500 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" /> Create Account
          </button>
        </div>

        {authError && (
          <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{authError}</span>
          </div>
        )}

        {authSuccess && (
          <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs flex items-center gap-2">
            <Check className="w-4 h-4 flex-shrink-0" />
            <span>{authSuccess}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isSignUp && (
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Username</label>
              <div className="relative">
                <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Choose a username" 
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="w-full bg-slate-900/90 border border-slate-700 rounded-xl py-3 pl-10 pr-4 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50" 
                  required
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Email Address</label>
            <div className="relative">
              <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="email" 
                placeholder="user@example.com" 
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-slate-900/90 border border-slate-700 rounded-xl py-3 pl-10 pr-4 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50" 
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type={showPassword ? "text" : "password"} 
                placeholder="••••••••••••" 
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-slate-900/90 border border-slate-700 rounded-xl py-3 pl-10 pr-11 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50" 
                required
              />
              <button 
                type="button" 
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors p-1 flex items-center justify-center cursor-pointer"
                title={showPassword ? "Hide Password" : "Show Password"}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button 
            type="submit" 
            disabled={authLoading} 
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-pink-500 to-blue-500 text-white text-xs font-bold shadow-lg hover:opacity-95 transition-opacity mt-2 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {authLoading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Processing...</span>
              </>
            ) : (
              <span>{isSignUp ? 'Create Encrypted Account' : 'Sign In'}</span>
            )}
          </button>
        </form>

        <div className="text-center mt-6 text-xs text-slate-400">
          {isSignUp ? 'Already registered?' : "Need a new account?"}{' '}
          <button type="button" onClick={() => setIsSignUp(!isSignUp)} className="text-pink-400 font-bold hover:underline">
            {isSignUp ? 'Sign In Here' : 'Create Account Here'}
          </button>
        </div>
      </div>
    </div>
  );
}

function UnconfiguredScreen() {
  return (
    <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4 font-sans">
      <div className="max-w-md w-full bg-slate-800 border border-slate-700 rounded-3xl p-8 shadow-2xl text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto mb-4">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Supabase Configuration Required</h2>
        <p className="text-xs text-slate-400 mb-6 leading-relaxed">
          Please add your Supabase credentials in your Vercel Project Environment Variables or local <code className="bg-slate-950 px-2 py-1 rounded text-pink-400 font-mono">.env.local</code>:
        </p>

        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 font-mono text-xs text-emerald-400 text-left mb-6 overflow-x-auto space-y-1">
          <div><span className="text-slate-500"># Vercel / Next.js / Vite standard names supported:</span></div>
          <div>NEXT_PUBLIC_SUPABASE_URL=<span className="text-slate-300">https://your-id.supabase.co</span></div>
          <div>NEXT_PUBLIC_SUPABASE_ANON_KEY=<span className="text-slate-300">your-anon-key</span></div>
          <div className="pt-2"><span className="text-slate-500"># Or standard Vite format:</span></div>
          <div>VITE_SUPABASE_URL=<span className="text-slate-300">https://your-id.supabase.co</span></div>
          <div>VITE_SUPABASE_ANON_KEY=<span className="text-slate-300">your-anon-key</span></div>
        </div>

        <p className="text-[11px] text-slate-500">
          Supported variable names: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY.
        </p>
      </div>
    </div>
  );
}

function SettingsPage({ userProfile, publicKeyPem, onClose, onLogout, onUpdateProfile, isDarkMode, onToggleDarkMode, onToggleAutoLock, chats, clearCache }) {
  const [darkMode, setDarkMode] = useState(isDarkMode ?? false);
  const [notifications, setNotifications] = useState(true);
  const [autoLock, setAutoLock] = useState(true);
  const [readReceipts, setReadReceipts] = useState(true);
  const [messagePreviews, setMessagePreviews] = useState(true);
  const [language, setLanguage] = useState('English (US)');
  
  const [showKeyInfo, setShowKeyInfo] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [savingStatus, setSavingStatus] = useState(''); // '', 'saving', 'saved', 'error'
  const [toastMessage, setToastMessage] = useState('');

  // Modals state
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [editUsername, setEditUsername] = useState(userProfile?.username || '');
  const [editProfileLoading, setEditProfileLoading] = useState(false);
  const [editProfileError, setEditProfileError] = useState('');

  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changePasswordLoading, setChangePasswordLoading] = useState(false);
  const [changePasswordError, setChangePasswordError] = useState('');
  const [changePasswordSuccess, setChangePasswordSuccess] = useState('');

  const [isLanguageOpen, setIsLanguageOpen] = useState(false);
  const [isStorageOpen, setIsStorageOpen] = useState(false);

  const [isDeleteAccountOpen, setIsDeleteAccountOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  // Sync internal state with isDarkMode prop
  useEffect(() => {
    if (typeof isDarkMode === 'boolean') {
      setDarkMode(isDarkMode);
    }
  }, [isDarkMode]);

  // Load settings from Supabase on mount
  useEffect(() => {
    async function loadSettings() {
      try {
        const settings = await fetchUserSettings();
        if (settings) {
          if (typeof settings.dark_mode === 'boolean') {
            setDarkMode(settings.dark_mode);
            if (onToggleDarkMode && settings.dark_mode !== isDarkMode) {
              onToggleDarkMode(settings.dark_mode);
            }
          }
          if (typeof settings.notifications === 'boolean') {
            setNotifications(settings.notifications);
          }
          if (typeof settings.auto_lock === 'boolean') {
            setAutoLock(settings.auto_lock);
            if (onToggleAutoLock) onToggleAutoLock(settings.auto_lock);
          }
          if (typeof settings.read_receipts === 'boolean') {
            setReadReceipts(settings.read_receipts);
          }
          if (typeof settings.message_previews === 'boolean') {
            setMessagePreviews(settings.message_previews);
          }
          if (settings.language) {
            setLanguage(settings.language);
          }
        }
      } catch (err) {
        console.error('Failed to load settings:', err);
      } finally {
        setSettingsLoading(false);
      }
    }
    loadSettings();
  }, []);

  // Persist a settings change to Supabase
  const persistSettings = async (newSettings) => {
    setSavingStatus('saving');
    try {
      await saveUserSettings(newSettings);
      setSavingStatus('saved');
      setTimeout(() => setSavingStatus(''), 1500);
    } catch (err) {
      console.error('Failed to save settings:', err);
      setSavingStatus('error');
      setTimeout(() => setSavingStatus(''), 2500);
    }
  };

  const handleToggle = (key, currentValue, setter) => {
    const newValue = !currentValue;
    setter(newValue);

    if (key === 'dark_mode' && onToggleDarkMode) onToggleDarkMode(newValue);
    if (key === 'auto_lock' && onToggleAutoLock) onToggleAutoLock(newValue);
    if (key === 'notifications' && newValue) {
      if ('Notification' in window && Notification.permission !== 'granted') {
        Notification.requestPermission();
      }
    }

    const newSettings = {
      dark_mode: key === 'dark_mode' ? newValue : darkMode,
      notifications: key === 'notifications' ? newValue : notifications,
      auto_lock: key === 'auto_lock' ? newValue : autoLock,
      read_receipts: key === 'read_receipts' ? newValue : readReceipts,
      message_previews: key === 'message_previews' ? newValue : messagePreviews,
      language: language,
    };
    persistSettings(newSettings);
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!editUsername.trim()) return;
    setEditProfileLoading(true);
    setEditProfileError('');
    try {
      const updated = await updateProfile(editUsername.trim());
      if (onUpdateProfile) {
        onUpdateProfile({ ...userProfile, username: editUsername.trim() });
      }
      setIsEditProfileOpen(false);
      showToast('Profile updated successfully!');
    } catch (err) {
      setEditProfileError(err.message || 'Failed to update profile.');
    } finally {
      setEditProfileLoading(false);
    }
  };

  const handleChangePasswordSubmit = async (e) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      setChangePasswordError('Password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setChangePasswordError('Passwords do not match.');
      return;
    }
    setChangePasswordLoading(true);
    setChangePasswordError('');
    try {
      await updateUserPassword(newPassword);
      setChangePasswordSuccess('Password updated successfully!');
      setTimeout(() => {
        setIsChangePasswordOpen(false);
        setNewPassword('');
        setConfirmPassword('');
        setChangePasswordSuccess('');
      }, 1500);
    } catch (err) {
      setChangePasswordError(err.message || 'Failed to change password.');
    } finally {
      setChangePasswordLoading(false);
    }
  };

  const handleSelectLanguage = (lang) => {
    setLanguage(lang);
    setIsLanguageOpen(false);
    persistSettings({
      dark_mode: darkMode,
      notifications: notifications,
      auto_lock: autoLock,
      read_receipts: readReceipts,
      message_previews: messagePreviews,
      language: lang,
    });
    showToast(`Language changed to ${lang}`);
  };

  const handleClearMessageCache = () => {
    if (clearCache) clearCache();
    showToast('Decrypted message cache cleared successfully!');
  };

  const handleDeleteAccountSubmit = async (e) => {
    e.preventDefault();
    if (deleteConfirmText.trim().toUpperCase() !== 'DELETE') {
      setDeleteError('Please type DELETE to confirm account deletion.');
      return;
    }
    setDeleteLoading(true);
    setDeleteError('');
    try {
      await deleteUserAccount();
      if (onLogout) onLogout();
    } catch (err) {
      setDeleteError(err.message || 'Failed to delete account.');
      setDeleteLoading(false);
    }
  };

  // Calculate local storage estimate
  const totalChannelsCount = chats ? Object.keys(chats).length : 0;
  let totalMessagesCount = 0;
  if (chats) {
    Object.values(chats).forEach(c => {
      if (c.messages) totalMessagesCount += c.messages.length;
    });
  }

  const ToggleSwitch = ({ enabled, onToggle }) => (
    <button
      type="button"
      onClick={onToggle}
      className={`relative w-11 h-6 rounded-full transition-all duration-300 flex-shrink-0 ${
        enabled
          ? 'bg-gradient-to-r from-pink-500 to-blue-500 shadow-md shadow-pink-500/20'
          : 'bg-slate-300 dark:bg-slate-700'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-300 ${
          enabled ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );

  const SettingsRow = ({ icon, iconColor, title, subtitle, right, onClick, danger }) => (
    <div
      onClick={onClick}
      className={`flex items-center justify-between py-3.5 px-1 ${
        onClick ? 'cursor-pointer active:bg-slate-50 dark:active:bg-slate-800/60 rounded-xl transition-colors' : ''
      } ${danger ? 'group' : ''}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
          danger
            ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-500 border border-rose-100 dark:border-rose-900/50'
            : `${iconColor || 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`
        }`}>
          {icon}
        </div>
        <div className="min-w-0">
          <div className={`text-sm font-semibold ${
            danger ? 'text-rose-600 dark:text-rose-400 group-hover:text-rose-700' : 'text-slate-800 dark:text-slate-100'
          }`}>{title}</div>
          {subtitle && <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">{subtitle}</div>}
        </div>
      </div>
      <div className="flex-shrink-0 ml-3">
        {right || (onClick && !danger && <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600" />)}
      </div>
    </div>
  );

  const SectionLabel = ({ children }) => (
    <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 tracking-wider uppercase px-1 pt-6 pb-2">{children}</div>
  );

  return (
    <div className="fixed inset-0 z-[60] bg-slate-50 dark:bg-slate-950 dark:text-slate-100 overflow-y-auto font-sans transition-colors pb-28">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[80] bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs font-bold px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-top-4">
          <Check className="w-4 h-4 text-emerald-400 dark:text-emerald-600" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-lg mx-auto flex items-center justify-between px-4 py-3.5">
          <button
            onClick={onClose}
            className="p-2 -ml-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold text-slate-800 dark:text-white">Settings</h1>
            {savingStatus === 'saving' && (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-blue-500 animate-pulse">
                <RefreshCw className="w-3 h-3 animate-spin" /> Syncing…
              </span>
            )}
            {savingStatus === 'saved' && (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-500">
                <Check className="w-3 h-3" /> Saved securely
              </span>
            )}
            {savingStatus === 'error' && (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-500">
                <Check className="w-3 h-3" /> Saved locally
              </span>
            )}
          </div>
          <div className="w-9" />
        </div>
      </div>

      <div className="max-w-lg mx-auto px-5 pb-32">
        {/* Loading State */}
        {settingsLoading ? (
          <div className="mt-20 flex flex-col items-center justify-center text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center shadow-xl relative">
              <RefreshCw className="w-6 h-6 text-pink-400 animate-spin" />
              <Shield className="w-3 h-3 text-blue-400 absolute inset-0 m-auto" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Synchronizing Security Preferences</p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">Decrypting user vault & keyring...</p>
            </div>
          </div>
        ) : (
        <>
        {/* Profile Card */}
        <div className="mt-6 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-5">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-pink-500 to-blue-500 text-white flex items-center justify-center font-bold text-xl shadow-lg shadow-blue-500/20 flex-shrink-0">
              {userProfile?.username?.substring(0, 2).toUpperCase() || 'US'}
            </div>
            <div className="min-w-0">
              <div className="text-lg font-bold text-slate-800 dark:text-white truncate">@{userProfile?.username}</div>
              <div className="text-xs text-slate-400 dark:text-slate-500 truncate">{userProfile?.email}</div>
              <div className="flex items-center gap-1.5 mt-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">Online · Encrypted</span>
              </div>
            </div>
          </div>
        </div>

        {/* Account Section */}
        <SectionLabel>Account</SectionLabel>
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm px-4 divide-y divide-slate-100 dark:divide-slate-800">
          <SettingsRow
            icon={<User className="w-4 h-4" />}
            iconColor="bg-blue-50 dark:bg-blue-950/40 text-blue-500 border border-blue-100 dark:border-blue-900/50"
            title="Edit Profile"
            subtitle={`Username: @${userProfile?.username || ''}`}
            onClick={() => {
              setEditUsername(userProfile?.username || '');
              setEditProfileError('');
              setIsEditProfileOpen(true);
            }}
          />
          <SettingsRow
            icon={<Lock className="w-4 h-4" />}
            iconColor="bg-violet-50 dark:bg-violet-950/40 text-violet-500 border border-violet-100 dark:border-violet-900/50"
            title="Change Password"
            subtitle="Update your account password"
            onClick={() => {
              setNewPassword('');
              setConfirmPassword('');
              setChangePasswordError('');
              setChangePasswordSuccess('');
              setIsChangePasswordOpen(true);
            }}
          />
          <SettingsRow
            icon={<Globe className="w-4 h-4" />}
            iconColor="bg-cyan-50 dark:bg-cyan-950/40 text-cyan-500 border border-cyan-100 dark:border-cyan-900/50"
            title="Language"
            subtitle={language}
            onClick={() => setIsLanguageOpen(true)}
          />
        </div>

        {/* Privacy & Security Section */}
        <SectionLabel>Privacy & Security</SectionLabel>
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm px-4 divide-y divide-slate-100 dark:divide-slate-800">
          <SettingsRow
            icon={<Fingerprint className="w-4 h-4" />}
            iconColor="bg-pink-50 dark:bg-pink-950/40 text-pink-500 border border-pink-100 dark:border-pink-900/50"
            title="Auto-Lock"
            subtitle={autoLock ? "App locks automatically when switching tabs" : "Auto-lock disabled"}
            right={<ToggleSwitch enabled={autoLock} onToggle={() => handleToggle('auto_lock', autoLock, setAutoLock)} />}
          />
          <SettingsRow
            icon={<Eye className="w-4 h-4" />}
            iconColor="bg-amber-50 dark:bg-amber-950/40 text-amber-500 border border-amber-100 dark:border-amber-900/50"
            title="Read Receipts"
            subtitle={readReceipts ? "Others can see when you've read messages" : "Read receipts hidden"}
            right={<ToggleSwitch enabled={readReceipts} onToggle={() => handleToggle('read_receipts', readReceipts, setReadReceipts)} />}
          />
          <SettingsRow
            icon={<Key className="w-4 h-4" />}
            iconColor="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-500 border border-emerald-100 dark:border-emerald-900/50"
            title="Encryption Keys"
            subtitle="View your RSA-2048 public key"
            onClick={() => setShowKeyInfo(!showKeyInfo)}
          />
        </div>

        {/* Public Key Reveal */}
        {showKeyInfo && (
          <div className="mt-3 bg-slate-900 border border-slate-700 rounded-2xl p-4 shadow-lg animate-in">
            <div className="flex items-center gap-2 mb-2">
              <Key className="w-4 h-4 text-pink-400" />
              <span className="text-xs font-bold text-slate-200">Your RSA-2048 Public Key</span>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-[10px] text-emerald-400 break-all max-h-28 overflow-y-auto leading-relaxed">
              {publicKeyPem || 'Key not yet generated...'}
            </div>
            <button
              onClick={() => {
                if (publicKeyPem) {
                  navigator.clipboard.writeText(publicKeyPem);
                  showToast('Public key copied to clipboard!');
                }
              }}
              className="mt-3 w-full py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center justify-center gap-1.5 hover:bg-slate-700 transition-colors"
            >
              <Copy className="w-3.5 h-3.5 text-pink-400" /> Copy Public Key
            </button>
          </div>
        )}

        {/* Notifications Section */}
        <SectionLabel>Notifications</SectionLabel>
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm px-4 divide-y divide-slate-100 dark:divide-slate-800">
          <SettingsRow
            icon={<Bell className="w-4 h-4" />}
            iconColor="bg-orange-50 dark:bg-orange-950/40 text-orange-500 border border-orange-100 dark:border-orange-900/50"
            title="Push Notifications"
            subtitle={notifications ? "Get notified for new messages" : "Notifications disabled"}
            right={<ToggleSwitch enabled={notifications} onToggle={() => handleToggle('notifications', notifications, setNotifications)} />}
          />
          <SettingsRow
            icon={<MessageSquare className="w-4 h-4" />}
            iconColor="bg-teal-50 dark:bg-teal-950/40 text-teal-500 border border-teal-100 dark:border-teal-900/50"
            title="Message Previews"
            subtitle={messagePreviews ? "Show message content in notification banners" : "Content hidden in notifications"}
            right={<ToggleSwitch enabled={messagePreviews} onToggle={() => handleToggle('message_previews', messagePreviews, setMessagePreviews)} />}
          />
        </div>

        {/* Appearance Section */}
        <SectionLabel>Appearance</SectionLabel>
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm px-4 divide-y divide-slate-100 dark:divide-slate-800">
          <SettingsRow
            icon={darkMode ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            iconColor={darkMode
              ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-500 border border-indigo-100 dark:border-indigo-900/50'
              : 'bg-yellow-50 dark:bg-yellow-950/40 text-yellow-500 border border-yellow-100 dark:border-yellow-900/50'
            }
            title="Dark Mode"
            subtitle={darkMode ? 'Dark theme active' : 'Light theme active'}
            right={<ToggleSwitch enabled={darkMode} onToggle={() => handleToggle('dark_mode', darkMode, setDarkMode)} />}
          />
        </div>

        {/* Storage Section */}
        <SectionLabel>Storage & Data</SectionLabel>
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm px-4 divide-y divide-slate-100 dark:divide-slate-800">
          <SettingsRow
            icon={<HardDrive className="w-4 h-4" />}
            iconColor="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700"
            title="Storage Usage"
            subtitle={`${totalChannelsCount} active channels · ${totalMessagesCount} cached messages`}
            onClick={() => setIsStorageOpen(true)}
          />
          <SettingsRow
            icon={<Database className="w-4 h-4" />}
            iconColor="bg-sky-50 dark:bg-sky-950/40 text-sky-500 border border-sky-100 dark:border-sky-900/50"
            title="Clear Message Cache"
            subtitle="Remove locally cached decrypted messages"
            onClick={handleClearMessageCache}
          />
        </div>

        {/* Danger Zone */}
        <SectionLabel>Danger Zone</SectionLabel>
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm px-4 divide-y divide-slate-100 dark:divide-slate-800">
          <SettingsRow
            icon={<LogOut className="w-4 h-4" />}
            danger
            title="Sign Out"
            subtitle="You will need to sign in again"
            onClick={onLogout}
          />
          <SettingsRow
            icon={<Trash2 className="w-4 h-4" />}
            danger
            title="Delete Account"
            subtitle="Permanently delete your account and data from Supabase"
            onClick={() => {
              setDeleteConfirmText('');
              setDeleteError('');
              setIsDeleteAccountOpen(true);
            }}
          />
        </div>

        {/* About Section */}
        <SectionLabel>About</SectionLabel>
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm px-4 pb-2 divide-y divide-slate-100 dark:divide-slate-800">
          <SettingsRow
            icon={<Shield className="w-4 h-4" />}
            iconColor="bg-gradient-to-tr from-pink-50 to-blue-50 text-pink-500 border border-pink-100 dark:border-pink-900/50"
            title="SecureChat Pro"
            subtitle="Version 1.0.0 · E2E Encrypted"
          />
          <div className="py-4 text-center">
            <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed">
              Built with RSA-2048 & AES-GCM encryption.<br />
              Your messages are encrypted end-to-end.<br />
              No one, not even us, can read them.
            </p>
            <div className="flex items-center justify-center gap-1.5 mt-3">
              <Lock className="w-3 h-3 text-emerald-500" />
              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">Zero-Knowledge Architecture</span>
            </div>
          </div>
        </div>

        {/* Bottom Spacing */}
        <div className="h-8" />
        </>
        )}
      </div>

      {/* EDIT PROFILE MODAL */}
      {isEditProfileOpen && (
        <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <User className="w-4 h-4 text-blue-500" /> Edit Profile
              </h3>
              <button onClick={() => setIsEditProfileOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Username</label>
                <input
                  type="text"
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-blue-500"
                  placeholder="Enter new username"
                  required
                />
              </div>
              {editProfileError && (
                <div className="text-xs text-rose-500 bg-rose-50 dark:bg-rose-950/40 p-2.5 rounded-xl border border-rose-200 dark:border-rose-900/50">
                  {editProfileError}
                </div>
              )}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditProfileOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editProfileLoading}
                  className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md transition-all disabled:opacity-50 flex items-center gap-1.5"
                >
                  {editProfileLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Save Profile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CHANGE PASSWORD MODAL */}
      {isChangePasswordOpen && (
        <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <Lock className="w-4 h-4 text-violet-500" /> Change Password
              </h3>
              <button onClick={() => setIsChangePasswordOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleChangePasswordSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-violet-500"
                  placeholder="Min 6 characters"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Confirm New Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-violet-500"
                  placeholder="Re-enter new password"
                  required
                />
              </div>
              {changePasswordError && (
                <div className="text-xs text-rose-500 bg-rose-50 dark:bg-rose-950/40 p-2.5 rounded-xl border border-rose-200 dark:border-rose-900/50">
                  {changePasswordError}
                </div>
              )}
              {changePasswordSuccess && (
                <div className="text-xs text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 p-2.5 rounded-xl border border-emerald-200 dark:border-emerald-900/50 flex items-center gap-1.5 font-semibold">
                  <Check className="w-4 h-4 text-emerald-500" /> {changePasswordSuccess}
                </div>
              )}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsChangePasswordOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={changePasswordLoading}
                  className="px-5 py-2 text-xs font-bold text-white bg-violet-600 hover:bg-violet-700 rounded-xl shadow-md transition-all disabled:opacity-50 flex items-center gap-1.5"
                >
                  {changePasswordLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
                  Update Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LANGUAGE SELECTOR MODAL */}
      {isLanguageOpen && (
        <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <Globe className="w-4 h-4 text-cyan-500" /> Select Language
              </h3>
              <button onClick={() => setIsLanguageOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-2">
              {['English (US)', 'Spanish (Español)', 'French (Français)', 'German (Deutsch)'].map((lang) => (
                <button
                  key={lang}
                  onClick={() => handleSelectLanguage(lang)}
                  className={`w-full py-3 px-4 rounded-xl text-left text-sm font-semibold flex items-center justify-between transition-colors ${
                    language === lang
                      ? 'bg-cyan-50 dark:bg-cyan-950/50 text-cyan-600 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-800'
                      : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <span>{lang}</span>
                  {language === lang && <Check className="w-4 h-4 text-cyan-500" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* STORAGE BREAKDOWN MODAL */}
      {isStorageOpen && (
        <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-slate-500" /> Storage Usage
              </h3>
              <button onClick={() => setIsStorageOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3 font-sans text-xs">
              <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 flex justify-between items-center">
                <span className="text-slate-600 dark:text-slate-400">Active Chat Channels</span>
                <span className="font-bold text-slate-800 dark:text-white">{totalChannelsCount}</span>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 flex justify-between items-center">
                <span className="text-slate-600 dark:text-slate-400">Cached Decrypted Messages</span>
                <span className="font-bold text-slate-800 dark:text-white">{totalMessagesCount}</span>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 flex justify-between items-center">
                <span className="text-slate-600 dark:text-slate-400">RSA-2048 Key Storage</span>
                <span className="font-bold text-emerald-500">2.4 KB (SPKI Base64)</span>
              </div>
              <div className="p-3 bg-pink-50 dark:bg-pink-950/40 rounded-xl border border-pink-200 dark:border-pink-900/50 text-[11px] text-pink-600 dark:text-pink-300">
                End-to-End encrypted data is stored locally in your browser memory and securely in Supabase Postgres.
              </div>
            </div>
            <button
              onClick={() => setIsStorageOpen(false)}
              className="mt-4 w-full py-2.5 rounded-xl bg-slate-800 text-white text-xs font-bold hover:bg-slate-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* DELETE ACCOUNT MODAL */}
      {isDeleteAccountOpen && (
        <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-rose-600 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-500" /> Delete Account
              </h3>
              <button onClick={() => setIsDeleteAccountOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
              This action is <strong className="text-rose-500">permanent and irreversible</strong>. All your profiles, encryption keys, settings, and participation in rooms will be deleted from Supabase.
            </p>
            <form onSubmit={handleDeleteAccountSubmit} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Type <span className="text-rose-500 font-mono">DELETE</span> to confirm:
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-rose-200 dark:border-rose-900/50 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-rose-500 font-mono"
                  placeholder="DELETE"
                  required
                />
              </div>
              {deleteError && (
                <div className="text-xs text-rose-500 bg-rose-50 dark:bg-rose-950/40 p-2.5 rounded-xl border border-rose-200 dark:border-rose-900/50">
                  {deleteError}
                </div>
              )}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsDeleteAccountOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={deleteLoading}
                  className="px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-md transition-all disabled:opacity-50 flex items-center gap-1.5"
                >
                  {deleteLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  Delete Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function SearchPage({ onClose, chats, onSelectChat, onStartDM }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all'); // 'all', 'users', 'channels'
  const [userResults, setUserResults] = useState([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const [startingDmId, setStartingDmId] = useState(null);

  // Debounced search for users in Supabase profiles
  useEffect(() => {
    if (!query.trim()) {
      setUserResults([]);
      setIsSearchingUsers(false);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearchingUsers(true);
      try {
        const results = await searchProfiles(query.trim());
        setUserResults(results || []);
      } catch (err) {
        console.error("Search profiles error:", err);
      } finally {
        setIsSearchingUsers(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  // Filter existing channels/rooms
  const channelResults = Object.values(chats || {}).filter(c => 
    c.name?.toLowerCase().includes(query.toLowerCase()) || 
    c.subtitle?.toLowerCase().includes(query.toLowerCase())
  );

  const handleUserClick = async (u) => {
    if (!onStartDM) return;
    setStartingDmId(u.id);
    try {
      await onStartDM(u);
      onClose();
    } catch (e) {
      console.error("Start DM error:", e);
    } finally {
      setStartingDmId(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-2xl z-[80] flex flex-col text-slate-100 font-sans overflow-hidden">
      {/* Top Search Bar */}
      <div className="p-4 border-b border-slate-800 bg-slate-900/90 sticky top-0 z-20 flex flex-col gap-3 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="flex-1 relative flex items-center">
            <Search className="w-5 h-5 text-pink-400 absolute left-3.5 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search users by @username, channels..."
              autoFocus
              className="w-full bg-slate-800/90 border border-slate-700/80 rounded-2xl py-3 pl-11 pr-10 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-pink-500/40 focus:border-pink-500 transition-all shadow-inner"
            />
            {query && (
              <button onClick={() => setQuery('')} className="absolute right-3.5 p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-700 transition-colors">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors border border-slate-700/60 flex-shrink-0"
          >
            Done
          </button>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          {[
            { id: 'all', label: 'All Results' },
            { id: 'users', label: 'Users Directory' },
            { id: 'channels', label: 'Encrypted Channels' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border whitespace-nowrap ${
                filter === tab.id
                  ? 'bg-gradient-to-r from-pink-500 to-blue-500 text-white border-transparent shadow-md shadow-pink-500/20'
                  : 'bg-slate-800/60 text-slate-400 border-slate-700/60 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 max-w-2xl w-full mx-auto space-y-6 pb-28">
        {!query.trim() ? (
          /* Empty Search State */
          <div className="space-y-6">
            <div>
              <div className="text-xs font-bold text-slate-400 tracking-wider mb-3 px-1">QUICK CONVERSATIONS</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {Object.values(chats || {}).slice(0, 4).map(chat => (
                  <div
                    key={chat.id}
                    onClick={() => { onSelectChat(chat.id); onClose(); }}
                    className="p-3 bg-slate-900/80 border border-slate-800 rounded-2xl flex items-center gap-3 cursor-pointer hover:bg-slate-800 hover:border-slate-700 transition-all shadow-sm"
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white shadow-sm ${chat.iconBg || 'bg-gradient-to-tr from-pink-500 to-blue-500'}`}>
                      {chat.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate">{chat.name}</div>
                      <div className="text-[10px] text-slate-400 truncate">{chat.subtitle || 'Channel'}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-6 rounded-3xl bg-slate-900/40 border border-slate-800/80 text-center flex flex-col items-center">
              <div className="w-14 h-14 rounded-2xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center text-pink-400 mb-3 shadow-lg shadow-pink-500/10">
                <Search className="w-7 h-7" />
              </div>
              <p className="text-sm font-bold text-slate-200">Global Encryption Directory</p>
              <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">
                Type any @username to discover user public keys and establish secure direct messaging.
              </p>
            </div>
          </div>
        ) : (
          /* Active Results */
          <div className="space-y-6">
            {/* Users Section */}
            {(filter === 'all' || filter === 'users') && (
              <div>
                <div className="text-xs font-bold text-slate-400 tracking-wider mb-2.5 px-1 flex items-center justify-between">
                  <span>USERS ({userResults.length})</span>
                  {isSearchingUsers && <RefreshCw className="w-3.5 h-3.5 text-pink-400 animate-spin" />}
                </div>

                {userResults.length === 0 && !isSearchingUsers ? (
                  <div className="text-xs text-slate-500 italic p-3 bg-slate-900/30 rounded-2xl border border-slate-800/40">
                    No registered users matching "@ {query}"
                  </div>
                ) : (
                  <div className="space-y-2">
                    {userResults.map(u => (
                      <div
                        key={u.id}
                        onClick={() => handleUserClick(u)}
                        className="p-3.5 bg-slate-900/80 border border-slate-800 rounded-2xl flex items-center justify-between hover:bg-slate-800 hover:border-slate-700 cursor-pointer transition-all shadow-sm"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-pink-500 to-blue-500 text-white flex items-center justify-center font-bold text-sm shadow-md">
                            {u.username ? u.username.substring(0, 2).toUpperCase() : 'US'}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-white truncate">@{u.username}</div>
                            <div className="text-[10px] text-slate-400 truncate">{u.email}</div>
                          </div>
                        </div>
                        <button
                          disabled={startingDmId === u.id}
                          className="px-3.5 py-1.5 rounded-xl bg-pink-500/10 hover:bg-pink-500/20 text-pink-400 border border-pink-500/30 font-bold text-xs flex items-center gap-1.5 transition-all"
                        >
                          {startingDmId === u.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <MessageSquare className="w-3.5 h-3.5" />}
                          <span>Chat</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Channels Section */}
            {(filter === 'all' || filter === 'channels') && (
              <div>
                <div className="text-xs font-bold text-slate-400 tracking-wider mb-2.5 px-1">
                  CHANNELS ({channelResults.length})
                </div>
                {channelResults.length === 0 ? (
                  <div className="text-xs text-slate-500 italic p-3 bg-slate-900/30 rounded-2xl border border-slate-800/40">
                    No channels matching "{query}"
                  </div>
                ) : (
                  <div className="space-y-2">
                    {channelResults.map(chat => (
                      <div
                        key={chat.id}
                        onClick={() => { onSelectChat(chat.id); onClose(); }}
                        className="p-3.5 bg-slate-900/80 border border-slate-800 rounded-2xl flex items-center justify-between hover:bg-slate-800 hover:border-slate-700 cursor-pointer transition-all shadow-sm"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white shadow-md ${chat.iconBg || 'bg-slate-800 border border-slate-700'}`}>
                            <Lock className="w-5 h-5 text-white" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-white truncate">{chat.name}</div>
                            <div className="text-[10px] text-slate-400 truncate">{chat.subtitle || 'Encrypted Channel'}</div>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
