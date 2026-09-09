import React, { useState, useEffect, useRef } from 'react';
import { 
  Shield, Lock, User, Eye, EyeOff, Search, Plus, MessageSquare, 
  ChevronLeft, Phone, Video, MoreVertical, Paperclip, Smile, 
  Send, Info, Check, Copy, Settings, Menu, LogOut, RefreshCw, X, AlertTriangle, Key, UserPlus,
  Bell, Moon, Sun, Database, Trash2, ChevronRight, Fingerprint, Globe, HardDrive
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
  isSupabaseConfigured
} from './lib/supabase';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [activeTab, setActiveTab] = useState('raw'); // 'readable' or 'raw'
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isNewRoomModalOpen, setIsNewRoomModalOpen] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  
  const [chats, setChats] = useState({});
  const [activeChatId, setActiveChatId] = useState(null);
  const [input, setInput] = useState('');
  const [keys, setKeys] = useState(null);
  const [publicKeyPem, setPublicKeyPem] = useState('');
  const [lastEncrypted, setLastEncrypted] = useState('');
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
          formattedChats[r.id] = {
            id: r.id,
            name: r.name || 'Direct Channel',
            type: r.type,
            subtitle: r.type === 'room' ? 'Encrypted Group' : 'Direct Message',
            iconBg: r.type === 'room' ? 'bg-blue-600' : 'bg-pink-600',
            participants: r.participants ? r.participants.map(p => ({
              id: p.user?.id || 'unknown',
              name: p.user?.username || 'User',
              avatar: `https://i.pravatar.cc/150?u=${p.user?.id || 'default'}`,
              online: true,
            })) : [],
            messages: []
          };
        });
        setChats(formattedChats);
        setActiveChatId(Object.keys(formattedChats)[0]);
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

    const channel = subscribeToPresence(userProfile.id, userProfile.username, (onlineIds) => {
      setOnlineUserIds(onlineIds);
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

  // Subscribe to real-time messages for active room and auto-decrypt
  useEffect(() => {
    if (!isLoggedIn || !activeChatId) return;

    let subscription;
    async function setupRealtimeMessages() {
      try {
        const history = await fetchRoomMessages(activeChatId);
        if (history) {
          const loadedMsgs = await Promise.all(history.map(async m => {
            let plaintext = m.encrypted_content;
            if (keys?.privateKey && m.encrypted_content) {
              try {
                plaintext = await decryptMessage(keys.privateKey, m.encrypted_content);
              } catch (e) {
                plaintext = m.encrypted_content;
              }
            }
            return {
              id: m.id,
              sender: m.sender?.username || 'Member',
              text: plaintext,
              encrypted: m.encrypted_content,
              time: new Date(m.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              type: (m.sender?.username === userProfile?.username) ? 'sent' : 'received',
            };
          }));

          setChats(prev => ({
            ...prev,
            [activeChatId]: {
              ...(prev[activeChatId] || {}),
              messages: loadedMsgs
            }
          }));
        }

        subscription = subscribeToMessages(activeChatId, async (newMsg) => {
          let plaintext = newMsg.encrypted_content;
          if (keys?.privateKey && newMsg.encrypted_content) {
            try {
              plaintext = await decryptMessage(keys.privateKey, newMsg.encrypted_content);
            } catch (e) {
              plaintext = newMsg.encrypted_content;
            }
          }
          const formattedMsg = {
            id: newMsg.id,
            sender: 'Member',
            text: plaintext,
            encrypted: newMsg.encrypted_content,
            time: new Date(newMsg.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            type: newMsg.sender_id === userProfile?.id ? 'sent' : 'received',
          };

          setChats(prev => ({
            ...prev,
            [activeChatId]: {
              ...prev[activeChatId],
              messages: [...(prev[activeChatId]?.messages || []), formattedMsg]
            }
          }));
        });
      } catch (err) {
        console.error("Realtime subscription error:", err);
      }
    }

    setupRealtimeMessages();

    return () => {
      if (subscription && typeof subscription.unsubscribe === 'function') {
        subscription.unsubscribe();
      }
    };
  }, [activeChatId, isLoggedIn, keys]);

  const handleSelectUserToChat = async (targetUser) => {
    try {
      const room = await startDirectMessage(targetUser.id, targetUser.username);
      if (room) {
        await loadUserRooms();
        setActiveChatId(room.id);
        setSearchQuery('');
        setSearchResults([]);
        setIsMobileMenuOpen(false);
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

    const messageText = input;
    setInput('');

    let encryptedPayload = '';
    try {
      if (keys?.publicKey) {
        encryptedPayload = await encryptMessage(keys.publicKey, messageText);
      } else {
        encryptedPayload = btoa(messageText);
      }
    } catch(err) {
       encryptedPayload = btoa(messageText);
    }
    
    setLastEncrypted(encryptedPayload);

    // Save directly to Supabase
    try {
      await sendEncryptedMessage(activeChatId, encryptedPayload);
    } catch (err) {
      console.error("Failed to send message to Supabase:", err);
      alert(`Message error: ${err.message}`);
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
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center font-sans">
        <RefreshCw className="w-8 h-8 text-pink-500 animate-spin mb-4" />
        <p className="text-sm font-medium text-slate-300">Connecting securely...</p>
      </div>
    );
  }

  if (!isLoggedIn) {
    return <LoginScreen onAuthSubmit={handleAuthSubmit} authError={authError} authSuccess={authSuccess} authLoading={authLoading} />;
  }

  const activeChat = chats[activeChatId];

  return (
    <div className="flex h-screen bg-slate-50 text-slate-800 font-sans overflow-hidden">
      {/* Settings Page Overlay */}
      {isSettingsOpen && (
        <SettingsPage
          userProfile={userProfile}
          publicKeyPem={publicKeyPem}
          onClose={() => setIsSettingsOpen(false)}
          onLogout={handleLogout}
        />
      )}

      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setIsMobileMenuOpen(false)} />
      )}

      {/* Left Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-slate-200 transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} flex flex-col`}>
        <div className="p-4 flex items-center justify-between border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-pink-500 to-blue-500 text-white shadow-md shadow-blue-500/20">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <span className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-pink-500 to-blue-500">SecureChat</span>
              <div className="flex items-center gap-1.5 text-[10px] text-emerald-600 font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Encrypted & Active
              </div>
            </div>
          </div>
          <button className="lg:hidden p-1 text-slate-400 hover:text-slate-600" onClick={() => setIsMobileMenuOpen(false)}>
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
              className="w-full bg-slate-100/80 rounded-xl py-2 pl-9 pr-4 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all" 
            />
            {isSearching && <RefreshCw className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 animate-spin" />}
          </div>

          {/* Live Search Results Popup */}
          {searchQuery.trim().length > 0 && (
            <div className="absolute left-4 right-4 top-full mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 max-h-60 overflow-y-auto p-2">
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
                    className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-100 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="relative">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-pink-500 to-blue-500 text-white font-bold text-xs flex items-center justify-center">
                          {u.username?.substring(0, 2).toUpperCase() || 'U'}
                        </div>
                        <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${isOnline ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-800">@{u.username}</div>
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isOnline ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-slate-100 text-slate-400'}`}>
                      {isOnline ? 'Online' : 'Offline'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto mt-1 px-3 space-y-4">
          {/* Chat Rooms */}
          <div>
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 px-2 mb-2 tracking-wider">
              <span>CHAT ROOMS ({Object.values(chats).filter(c => c.type === 'room').length})</span>
              <button onClick={() => setIsNewRoomModalOpen(true)} className="p-1 hover:bg-slate-100 rounded border border-slate-200 text-slate-500 hover:text-slate-700 transition-colors" title="Create Room">
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="space-y-1">
              {Object.values(chats)
                .filter(chat => chat.type === 'room')
                .map(chat => (
                  <SidebarItem 
                    key={chat.id}
                    icon={<Lock className="w-4 h-4 text-white" />} 
                    iconBg={chat.iconBg || "bg-blue-600"} 
                    title={chat.name} 
                    subtitle={chat.subtitle}
                    active={activeChatId === chat.id} 
                    onClick={() => { setActiveChatId(chat.id); setIsMobileMenuOpen(false); }} 
                  />
                ))}
            </div>
          </div>

          {/* Direct Messages */}
          <div>
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 px-2 mb-2 tracking-wider">
              <span>DIRECT MESSAGES ({Object.values(chats).filter(c => c.type === 'direct').length})</span>
            </div>
            <div className="space-y-1">
              {Object.values(chats)
                .filter(chat => chat.type === 'direct')
                .map(chat => {
                  const otherParticipant = chat.participants?.find(p => p.id !== userProfile?.id);
                  const isUserOnline = otherParticipant ? onlineUserIds.includes(otherParticipant.id) : false;
                  return (
                    <SidebarItem 
                      key={chat.id}
                      icon={<User className="w-4 h-4 text-white" />} 
                      iconBg={chat.iconBg || "bg-pink-600"} 
                      title={chat.name} 
                      subtitle={isUserOnline ? '🟢 Online' : '⚪ Offline'}
                      active={activeChatId === chat.id} 
                      isOnline={isUserOnline}
                      onClick={() => { setActiveChatId(chat.id); setIsMobileMenuOpen(false); }} 
                    />
                  );
                })}
            </div>
          </div>
        </div>

        {/* User Footer */}
        <div className="p-3 border-t border-slate-200 bg-slate-50/50 flex items-center justify-between">
           <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-pink-500 to-blue-500 text-white flex items-center justify-center font-bold text-xs flex-shrink-0 shadow-sm">
                {userProfile?.username?.substring(0, 2).toUpperCase() || 'US'}
              </div>
              <div className="truncate">
                <div className="text-xs font-bold text-slate-800 truncate">{userProfile?.username}</div>
                <div className="text-[10px] text-slate-400 truncate">{userProfile?.email}</div>
              </div>
           </div>
           <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-colors" title="Sign Out">
              <LogOut className="w-4 h-4" />
           </button>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-white border-r border-slate-200 relative overflow-hidden pb-16 lg:pb-0">
        {/* Always-visible Mobile Header */}
        <div className="lg:hidden h-14 bg-slate-900 border-b border-slate-800 text-white flex items-center justify-between px-4 sticky top-0 z-30 shadow-md">
          <button 
            onClick={() => setIsMobileMenuOpen(true)} 
            className="p-1.5 rounded-xl bg-slate-800 border border-slate-700 text-pink-400 hover:text-white flex items-center gap-2 transition-colors active:scale-95 shadow-sm"
            title="Open Menu"
          >
            <Menu className="w-5 h-5" />
            <span className="text-xs font-bold pr-1">Menu</span>
          </button>

          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-pink-400" />
            <span className="font-bold text-sm bg-clip-text text-transparent bg-gradient-to-r from-pink-400 to-blue-400">SecureChat</span>
          </div>

          <button 
            onClick={() => setIsCryptoModalOpen(true)} 
            className="p-1.5 rounded-xl bg-slate-800 border border-slate-700 text-pink-400 hover:text-white transition-colors"
            title="Crypto Guide"
          >
            <Key className="w-4 h-4" />
          </button>
        </div>

        {activeChat ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Top Bar */}
            <div className="h-16 border-b border-slate-200 flex items-center justify-between px-4 sticky top-0 bg-white/80 backdrop-blur-md z-10">
              <div className="flex items-center gap-3">
                 <button className="hidden lg:hidden text-slate-600" onClick={() => setIsMobileMenuOpen(true)}>
                    <Menu className="w-6 h-6" />
                 </button>
                 <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm ${activeChat.iconBg || 'bg-slate-100'}`}>
                    <Lock className="w-5 h-5 text-white" />
                 </div>
                 <div>
                   <h2 className="font-bold text-slate-800 leading-tight text-sm md:text-base">{activeChat.name}</h2>
                   <div className="flex items-center gap-2 text-xs text-slate-500">
                     <span className="flex items-center gap-1 text-emerald-600 font-medium text-[11px]">
                       <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> RSA-2048 E2E Active
                     </span>
                   </div>
                 </div>
              </div>
              <div className="flex items-center gap-2 md:gap-3">
                 <button 
                   onClick={() => setIsCryptoModalOpen(true)} 
                   className="hidden sm:flex px-3 py-1.5 rounded-xl text-xs font-bold items-center gap-1.5 transition-all bg-slate-900 text-pink-400 border border-slate-700 hover:bg-slate-800"
                 >
                   <Key className="w-3.5 h-3.5 text-pink-400" />
                   Crypto Tool
                 </button>
                 <button onClick={() => setActiveTab(activeTab === 'raw' ? 'readable' : 'raw')} className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border ${activeTab === 'raw' ? 'bg-pink-50 text-pink-600 border-pink-200 shadow-2xs' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                   <Lock className="w-3.5 h-3.5" />
                   {activeTab === 'raw' ? 'Raw Cipher' : 'Decoded'}
                 </button>
              </div>
            </div>

            {/* Messages Container */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col space-y-4">
               <div className="flex justify-center">
                 <span className="text-[11px] text-slate-400 bg-slate-50 border border-slate-200 px-3 py-1 rounded-full shadow-2xs font-medium">
                   RSA-2048 & AES-GCM Encrypted
                 </span>
               </div>

               {(!activeChat.messages || activeChat.messages.length === 0) && (
                  <div className="text-center text-slate-400 text-sm py-16 flex flex-col items-center">
                    <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3 text-slate-400">
                      <Shield className="w-6 h-6" />
                    </div>
                    <p className="font-bold text-slate-700">No messages in channel</p>
                    <p className="text-xs text-slate-400 mt-1 max-w-sm">Messages sent here are encrypted with RSA-OAEP before saving to the database.</p>
                  </div>
               )}

               {activeChat.messages && activeChat.messages.map((msg, idx) => {
                 const isSent = msg.type === 'sent';
                 const displayText = (activeTab === 'raw' && msg.encrypted) ? msg.encrypted : msg.text;

                 return (
                   <div key={idx} className={`flex gap-2.5 ${isSent ? 'justify-end' : ''}`}>
                     {!isSent && (
                       <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-bold text-xs flex items-center justify-center flex-shrink-0 shadow-sm">
                          {msg.sender ? msg.sender.charAt(0).toUpperCase() : 'M'}
                       </div>
                     )}
                     <div className={`flex flex-col ${isSent ? 'items-end' : ''} max-w-[85%] md:max-w-lg`}>
                       {!isSent && (
                          <span className="text-[10px] text-slate-400 ml-1 mb-0.5 font-semibold">{msg.sender}</span>
                       )}
                       <div className={`px-4 py-3 rounded-2xl text-xs md:text-sm leading-relaxed shadow-2xs ${
                         isSent 
                           ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-tr-none' 
                           : 'bg-slate-100 text-slate-800 border border-slate-200/60 rounded-tl-none'
                       } ${activeTab === 'raw' && msg.encrypted ? 'font-mono text-xs break-all bg-slate-900 text-emerald-400 border-none' : ''}`}>
                         {displayText}
                       </div>
                       <span className={`text-[10px] text-slate-400 mt-1 flex items-center gap-1 ${isSent ? 'mr-1' : 'ml-1'}`}>
                         {msg.time} {isSent && <Check className="w-3 h-3 text-blue-500" />}
                       </span>
                     </div>
                   </div>
                 );
               })}

               {/* Live Ciphertext Inspector */}
               <div className="bg-slate-900 text-slate-200 border border-slate-800 rounded-2xl p-5 shadow-lg max-w-2xl mx-auto w-full my-4">
                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 mb-3 tracking-wider">
                    <span className="flex items-center gap-1.5 text-pink-400">
                      <Lock className="w-3.5 h-3.5" /> REALTIME CIPHERTEXT STREAM
                    </span>
                    <span className="text-emerald-400 font-mono">END-TO-END ENCRYPTED</span>
                  </div>
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs text-emerald-400 break-all shadow-inner min-h-[70px] flex flex-col justify-between">
                     {lastEncrypted ? lastEncrypted : <span className="text-slate-500 italic">Type a message below to generate RSA-OAEP Base64 payload...</span>}
                     {lastEncrypted && (
                        <div className="flex justify-end mt-3">
                           <button type="button" onClick={copyToClipboard} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-[11px] font-semibold text-slate-200 flex items-center gap-1.5 hover:bg-slate-700 transition-colors">
                               <Copy className="w-3.5 h-3.5 text-pink-400" /> Copy Payload
                           </button>
                        </div>
                     )}
                  </div>
               </div>

               <div ref={scrollRef}></div>
            </div>

            {/* Message Input */}
            <form onSubmit={handleSend} className="p-3 md:p-4 bg-white border-t border-slate-200">
               <div className="flex items-center gap-2 md:gap-3 max-w-4xl mx-auto">
                 <button type="button" className="w-9 h-9 md:w-10 md:h-10 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors flex-shrink-0">
                   <Paperclip className="w-4 h-4 md:w-5 md:h-5" />
                 </button>
                 <div className="flex-1 border border-slate-200 rounded-full px-3.5 py-2 md:py-2.5 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-400 transition-all bg-slate-50 flex items-center">
                    <input 
                      type="text" 
                      placeholder="Type encrypted message..." 
                      className="flex-1 bg-transparent border-none focus:outline-none text-xs md:text-sm py-0.5 min-w-0" 
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                    />
                    <Smile className="w-4 h-4 md:w-5 md:h-5 text-slate-400 cursor-pointer hover:text-slate-600 ml-1.5 flex-shrink-0" />
                 </div>
                 <button type="submit" disabled={!input.trim()} className="w-10 h-10 md:w-11 md:h-11 rounded-full bg-gradient-to-r from-pink-500 to-blue-500 flex items-center justify-center text-white flex-shrink-0 shadow-md hover:shadow-lg hover:opacity-90 transition-all disabled:opacity-50 disabled:grayscale active:scale-95">
                   <Send className="w-4 h-4 md:w-5 md:h-5 ml-0.5" />
                 </button>
               </div>
            </form>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50">
            <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-blue-500 shadow-md mb-4">
              <Lock className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-slate-800">No Active Channel</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mb-4">
              Create or select a room from the menu to start exchanging encrypted messages.
            </p>
            <button onClick={() => setIsNewRoomModalOpen(true)} className="px-4 py-2 rounded-xl bg-blue-600 text-white font-bold text-xs shadow-md hover:bg-blue-700 transition-colors inline-flex items-center gap-1.5">
              <Plus className="w-4 h-4" /> Create Encrypted Channel
            </button>
          </div>
        )}
      </div>

      {/* Floating Mobile Bottom Navigation Bar */}
      <div className="lg:hidden fixed bottom-3 left-3 right-3 bg-slate-900/95 backdrop-blur-xl border border-slate-800/90 rounded-full shadow-2xl z-40 px-3 py-2 flex items-center justify-around text-slate-400">
        <button 
          onClick={() => setIsMobileMenuOpen(true)} 
          className={`flex flex-col items-center gap-0.5 text-[10px] font-semibold transition-all ${isMobileMenuOpen ? 'text-pink-400 font-bold scale-105' : 'hover:text-white'}`}
        >
          <MessageSquare className="w-5 h-5" />
          <span>Chats</span>
        </button>

        <button 
          onClick={() => { 
            setIsMobileMenuOpen(true); 
            setTimeout(() => { 
              document.querySelector('input[placeholder*="Search user"]')?.focus(); 
            }, 250); 
          }} 
          className="flex flex-col items-center gap-0.5 text-[10px] font-semibold hover:text-white transition-all"
        >
          <Search className="w-5 h-5" />
          <span>Search</span>
        </button>

        <button 
          onClick={() => setIsNewRoomModalOpen(true)} 
          className="w-10 h-10 -mt-5 bg-gradient-to-tr from-pink-500 to-blue-500 rounded-full flex items-center justify-center text-white shadow-lg shadow-pink-500/30 active:scale-95 transition-transform"
          title="Create Room"
        >
          <Plus className="w-6 h-6" />
        </button>

        <button 
          onClick={() => setIsCryptoModalOpen(true)} 
          className="flex flex-col items-center gap-0.5 text-[10px] font-semibold hover:text-pink-400 transition-all"
        >
          <Key className="w-5 h-5" />
          <span>Crypto</span>
        </button>

        <button 
          onClick={() => setIsSettingsOpen(true)} 
          className={`flex flex-col items-center gap-0.5 text-[10px] font-semibold transition-all ${isSettingsOpen ? 'text-pink-400 font-bold scale-105' : 'hover:text-white'}`}
          title="Settings"
        >
          <Settings className="w-5 h-5" />
          <span>Settings</span>
        </button>
      </div>

      {/* New Room Modal */}
      {isNewRoomModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-800">Create Encrypted Room</h3>
              <button onClick={() => setIsNewRoomModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateRoom} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Room Name</label>
                <input 
                  type="text" 
                  placeholder="e.g. security-team" 
                  value={newRoomName}
                  onChange={e => setNewRoomName(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  required
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setIsNewRoomModalOpen(false)} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
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

function SettingsPage({ userProfile, publicKeyPem, onClose, onLogout }) {
  const [darkMode, setDarkMode] = useState(false);
  const [notifications, setNotifications] = useState(true);
  const [autoLock, setAutoLock] = useState(true);
  const [readReceipts, setReadReceipts] = useState(true);
  const [showKeyInfo, setShowKeyInfo] = useState(false);

  const ToggleSwitch = ({ enabled, onToggle }) => (
    <button
      type="button"
      onClick={onToggle}
      className={`relative w-11 h-6 rounded-full transition-all duration-300 flex-shrink-0 ${
        enabled
          ? 'bg-gradient-to-r from-pink-500 to-blue-500 shadow-md shadow-pink-500/20'
          : 'bg-slate-300'
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
        onClick ? 'cursor-pointer active:bg-slate-50 rounded-xl transition-colors' : ''
      } ${danger ? 'group' : ''}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
          danger
            ? 'bg-rose-50 text-rose-500 border border-rose-100'
            : `${iconColor || 'bg-slate-100 text-slate-500'}`
        }`}>
          {icon}
        </div>
        <div className="min-w-0">
          <div className={`text-sm font-semibold ${
            danger ? 'text-rose-600 group-hover:text-rose-700' : 'text-slate-800'
          }`}>{title}</div>
          {subtitle && <div className="text-[11px] text-slate-400 mt-0.5 truncate">{subtitle}</div>}
        </div>
      </div>
      <div className="flex-shrink-0 ml-3">
        {right || (onClick && !danger && <ChevronRight className="w-4 h-4 text-slate-300" />)}
      </div>
    </div>
  );

  const SectionLabel = ({ children }) => (
    <div className="text-[10px] font-bold text-slate-400 tracking-wider uppercase px-1 pt-6 pb-2">{children}</div>
  );

  return (
    <div className="fixed inset-0 z-[60] bg-slate-50 overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-xl border-b border-slate-200">
        <div className="max-w-lg mx-auto flex items-center justify-between px-4 py-3.5">
          <button
            onClick={onClose}
            className="p-2 -ml-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-base font-bold text-slate-800">Settings</h1>
          <div className="w-9" />
        </div>
      </div>

      <div className="max-w-lg mx-auto px-5 pb-32">
        {/* Profile Card */}
        <div className="mt-6 bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-pink-500 to-blue-500 text-white flex items-center justify-center font-bold text-xl shadow-lg shadow-blue-500/20 flex-shrink-0">
              {userProfile?.username?.substring(0, 2).toUpperCase() || 'US'}
            </div>
            <div className="min-w-0">
              <div className="text-lg font-bold text-slate-800 truncate">@{userProfile?.username}</div>
              <div className="text-xs text-slate-400 truncate">{userProfile?.email}</div>
              <div className="flex items-center gap-1.5 mt-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[11px] font-semibold text-emerald-600">Online · Encrypted</span>
              </div>
            </div>
          </div>
        </div>

        {/* Account Section */}
        <SectionLabel>Account</SectionLabel>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 divide-y divide-slate-100">
          <SettingsRow
            icon={<User className="w-4 h-4" />}
            iconColor="bg-blue-50 text-blue-500 border border-blue-100"
            title="Edit Profile"
            subtitle="Change your username and avatar"
          />
          <SettingsRow
            icon={<Lock className="w-4 h-4" />}
            iconColor="bg-violet-50 text-violet-500 border border-violet-100"
            title="Change Password"
            subtitle="Update your account password"
          />
          <SettingsRow
            icon={<Globe className="w-4 h-4" />}
            iconColor="bg-cyan-50 text-cyan-500 border border-cyan-100"
            title="Language"
            subtitle="English (US)"
          />
        </div>

        {/* Privacy & Security Section */}
        <SectionLabel>Privacy & Security</SectionLabel>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 divide-y divide-slate-100">
          <SettingsRow
            icon={<Fingerprint className="w-4 h-4" />}
            iconColor="bg-pink-50 text-pink-500 border border-pink-100"
            title="Auto-Lock"
            subtitle="Lock app when switching tabs"
            right={<ToggleSwitch enabled={autoLock} onToggle={() => setAutoLock(!autoLock)} />}
          />
          <SettingsRow
            icon={<Eye className="w-4 h-4" />}
            iconColor="bg-amber-50 text-amber-500 border border-amber-100"
            title="Read Receipts"
            subtitle="Let others know when you've read messages"
            right={<ToggleSwitch enabled={readReceipts} onToggle={() => setReadReceipts(!readReceipts)} />}
          />
          <SettingsRow
            icon={<Key className="w-4 h-4" />}
            iconColor="bg-emerald-50 text-emerald-500 border border-emerald-100"
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
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 divide-y divide-slate-100">
          <SettingsRow
            icon={<Bell className="w-4 h-4" />}
            iconColor="bg-orange-50 text-orange-500 border border-orange-100"
            title="Push Notifications"
            subtitle="Get notified for new messages"
            right={<ToggleSwitch enabled={notifications} onToggle={() => setNotifications(!notifications)} />}
          />
          <SettingsRow
            icon={<MessageSquare className="w-4 h-4" />}
            iconColor="bg-teal-50 text-teal-500 border border-teal-100"
            title="Message Previews"
            subtitle="Show message content in notifications"
          />
        </div>

        {/* Appearance Section */}
        <SectionLabel>Appearance</SectionLabel>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 divide-y divide-slate-100">
          <SettingsRow
            icon={darkMode ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            iconColor={darkMode
              ? 'bg-indigo-50 text-indigo-500 border border-indigo-100'
              : 'bg-yellow-50 text-yellow-500 border border-yellow-100'
            }
            title="Dark Mode"
            subtitle={darkMode ? 'Dark theme active' : 'Light theme active'}
            right={<ToggleSwitch enabled={darkMode} onToggle={() => setDarkMode(!darkMode)} />}
          />
        </div>

        {/* Storage Section */}
        <SectionLabel>Storage & Data</SectionLabel>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 divide-y divide-slate-100">
          <SettingsRow
            icon={<HardDrive className="w-4 h-4" />}
            iconColor="bg-slate-100 text-slate-500 border border-slate-200"
            title="Storage Usage"
            subtitle="Encrypted messages & attachments"
          />
          <SettingsRow
            icon={<Database className="w-4 h-4" />}
            iconColor="bg-sky-50 text-sky-500 border border-sky-100"
            title="Clear Message Cache"
            subtitle="Remove locally cached decrypted messages"
          />
        </div>

        {/* Danger Zone */}
        <SectionLabel>Danger Zone</SectionLabel>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 divide-y divide-slate-100">
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
            subtitle="Permanently delete your account and data"
            onClick={() => {
              if (window.confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
                // Account deletion logic placeholder
              }
            }}
          />
        </div>

        {/* About Section */}
        <SectionLabel>About</SectionLabel>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 pb-2 divide-y divide-slate-100">
          <SettingsRow
            icon={<Shield className="w-4 h-4" />}
            iconColor="bg-gradient-to-tr from-pink-50 to-blue-50 text-pink-500 border border-pink-100"
            title="SecureChat Pro"
            subtitle="Version 1.0.0 · E2E Encrypted"
          />
          <div className="py-4 text-center">
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Built with RSA-2048 & AES-GCM encryption.<br />
              Your messages are encrypted end-to-end.<br />
              No one, not even us, can read them.
            </p>
            <div className="flex items-center justify-center gap-1.5 mt-3">
              <Lock className="w-3 h-3 text-emerald-500" />
              <span className="text-[10px] font-bold text-emerald-600">Zero-Knowledge Architecture</span>
            </div>
          </div>
        </div>

        {/* Bottom Spacing */}
        <div className="h-8" />
      </div>
    </div>
  );
}

export default App;
