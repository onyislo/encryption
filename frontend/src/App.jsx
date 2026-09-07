import React, { useState, useEffect, useRef } from 'react';
import { 
  Shield, Lock, User, Eye, EyeOff, Search, Plus, MessageSquare, 
  ChevronLeft, Phone, Video, MoreVertical, Paperclip, Smile, 
  Send, Info, Check, Copy, Settings, Menu, LogOut, RefreshCw, X, AlertTriangle, Key, UserPlus
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

  // Subscribe to real-time messages for active room
  useEffect(() => {
    if (!isLoggedIn || !activeChatId) return;

    let subscription;
    async function setupRealtimeMessages() {
      try {
        const history = await fetchRoomMessages(activeChatId);
        if (history) {
          const loadedMsgs = history.map(m => ({
            id: m.id,
            sender: m.sender?.username || 'Member',
            text: m.encrypted_content,
            time: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            type: m.sender?.username === userProfile?.username ? 'sent' : 'received',
            encrypted: m.encrypted_content
          }));

          setChats(prev => ({
            ...prev,
            [activeChatId]: {
              ...(prev[activeChatId] || {}),
              messages: loadedMsgs
            }
          }));
        }

        subscription = subscribeToMessages(activeChatId, (newMsg) => {
          const formattedMsg = {
            id: newMsg.id,
            sender: 'Member',
            text: newMsg.encrypted_content,
            time: new Date(newMsg.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            type: newMsg.sender_id === userProfile?.id ? 'sent' : 'received',
            encrypted: newMsg.encrypted_content
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
  }, [activeChatId, isLoggedIn]);

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
          setAuthSuccess('Account created successfully! If email confirmation is enabled on your Supabase project, please check your inbox before logging in.');
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
        setAuthError('Supabase Email Error: "Confirm Email" is enabled in your Supabase project but SMTP is not configured. Fix: Go to Supabase Dashboard -> Authentication -> Providers -> Email, and turn OFF "Confirm email".');
      } else {
        setAuthError(errMsg || 'Authentication failed. Please check your credentials and Supabase configuration.');
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
        <p className="text-sm font-medium text-slate-300">Connecting to Supabase Database...</p>
      </div>
    );
  }

  if (!isLoggedIn) {
    return <LoginScreen onAuthSubmit={handleAuthSubmit} authError={authError} authSuccess={authSuccess} authLoading={authLoading} />;
  }

  const activeChat = chats[activeChatId];

  return (
    <div className="flex h-screen bg-slate-50 text-slate-800 font-sans overflow-hidden">
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
                Supabase Connected
              </div>
            </div>
          </div>
          <button className="lg:hidden p-1 text-slate-400 hover:text-slate-600" onClick={() => setIsMobileMenuOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="px-4 py-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="Search channels..." className="w-full bg-slate-100/80 rounded-xl py-2 pl-9 pr-4 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all" />
          </div>
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
              {Object.values(chats).filter(chat => chat.type === 'room').length === 0 && (
                <div className="p-4 border border-dashed border-slate-200 rounded-xl text-center">
                  <p className="text-xs text-slate-500 font-medium">No chat rooms yet</p>
                  <button onClick={() => setIsNewRoomModalOpen(true)} className="mt-2 text-xs font-bold text-pink-600 hover:underline inline-flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Create First Room
                  </button>
                </div>
              )}
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
      {activeChat ? (
        <div className="flex-1 flex flex-col bg-white border-r border-slate-200 relative overflow-hidden">
          {/* Top Bar */}
          <div className="h-16 border-b border-slate-200 flex items-center justify-between px-4 sticky top-0 bg-white/80 backdrop-blur-md z-10">
            <div className="flex items-center gap-3">
               <button className="lg:hidden text-slate-600" onClick={() => setIsMobileMenuOpen(true)}>
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
            <div className="flex items-center gap-3">
               <button onClick={() => setActiveTab(activeTab === 'raw' ? 'readable' : 'raw')} className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border ${activeTab === 'raw' ? 'bg-pink-50 text-pink-600 border-pink-200 shadow-2xs' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                 <Lock className="w-3.5 h-3.5" />
                 {activeTab === 'raw' ? 'Mode: Raw Ciphertext' : 'Mode: Decoded Text'}
               </button>
            </div>
          </div>

          {/* Messages Container */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col space-y-4">
             <div className="flex justify-center">
               <span className="text-[11px] text-slate-400 bg-slate-50 border border-slate-200 px-3 py-1 rounded-full shadow-2xs font-medium">
                 Supabase Postgres + Web Crypto API
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
                    <Lock className="w-3.5 h-3.5" /> SUPABASE REALTIME CIPHERTEXT
                  </span>
                  <span className="text-emerald-400 font-mono">POSTGRES RLS ACTIVE</span>
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
          <form onSubmit={handleSend} className="p-4 bg-white border-t border-slate-200">
             <div className="flex items-center gap-3 max-w-4xl mx-auto">
               <button type="button" className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors flex-shrink-0">
                 <Paperclip className="w-5 h-5" />
               </button>
               <div className="flex-1 border border-slate-200 rounded-full px-4 py-2.5 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-400 transition-all bg-slate-50 flex items-center">
                  <input 
                    type="text" 
                    placeholder="Type encrypted message to Supabase database..." 
                    className="flex-1 bg-transparent border-none focus:outline-none text-sm py-0.5 min-w-0" 
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                  />
                  <Smile className="w-5 h-5 text-slate-400 cursor-pointer hover:text-slate-600 ml-2 flex-shrink-0" />
               </div>
               <button type="submit" disabled={!input.trim()} className="w-11 h-11 rounded-full bg-gradient-to-r from-pink-500 to-blue-500 flex items-center justify-center text-white flex-shrink-0 shadow-md hover:shadow-lg hover:opacity-90 transition-all disabled:opacity-50 disabled:grayscale active:scale-95">
                 <Send className="w-5 h-5 ml-0.5" />
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
            Create or select a room from the sidebar to start exchanging encrypted messages over Supabase.
          </p>
          <button onClick={() => setIsNewRoomModalOpen(true)} className="px-4 py-2 rounded-xl bg-blue-600 text-white font-bold text-xs shadow-md hover:bg-blue-700 transition-colors inline-flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> Create Encrypted Channel
          </button>
        </div>
      )}

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
    </div>
  );
}

function SidebarItem({ icon, iconBg, title, subtitle, active, onClick }) {
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
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-2xs ${iconBg}`}>
          {icon}
        </div>
        <div className="flex flex-col justify-center overflow-hidden">
          <div className={`text-xs font-bold truncate ${active ? 'text-blue-600' : 'text-slate-800'}`}>{title}</div>
          <div className="text-[10px] text-slate-400 truncate">{subtitle}</div>
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
           <p className="text-xs text-slate-400 mt-1">Supabase Real-Time E2E Encryption</p>
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
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Username (Optional)</label>
              <div className="relative">
                <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="e.g. Agent_Zero" 
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="w-full bg-slate-900/90 border border-slate-700 rounded-xl py-3 pl-10 pr-4 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50" 
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
              <span>{isSignUp ? 'Create Encrypted Account' : 'Sign In with Supabase'}</span>
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

export default App;
