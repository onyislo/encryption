import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Shield, Lock, User, Eye, EyeOff, Search, Plus, MessageSquare, ChevronLeft, Phone, Video, MoreVertical, Paperclip, Smile, Send, Info, Check, CheckCheck, Copy, Settings, Menu, AlertTriangle, X } from 'lucide-react';
import { generateKeyPair, exportPublicKey, encryptMessage } from './utils/crypto';
import { isSupabaseConfigured, signInUser, signUpUser, getCurrentUser, fetchUserRooms, fetchRoomMessages, sendEncryptedMessage, subscribeToMessages, updateProfile, searchProfiles, createRoom } from './lib/supabaseQueries';

const initialChats = {};

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState('');
  const [activeTab, setActiveTab] = useState('raw');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [chats, setChats] = useState({});
  const [activeChatId, setActiveChatId] = useState(null);
  const [input, setInput] = useState('');
  const [keys, setKeys] = useState(null);
  const [cryptoError, setCryptoError] = useState(false);
  const [lastEncrypted, setLastEncrypted] = useState("");
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check auth session on load
  useEffect(() => {
    async function checkAuth() {
      if (!isSupabaseConfigured()) {
        setLoading(false);
        return;
      }
      try {
        const user = await getCurrentUser();
        if (user) {
          setCurrentUser(user);
          setUsername(user.email ? user.email.split('@')[0] : 'User');
          setIsLoggedIn(true);
        }
      } catch (err) {
        console.error("Auth check failed:", err);
      } finally {
        setLoading(false);
      }
    }
    checkAuth();
  }, []);

  // Fetch rooms when logged in
  useEffect(() => {
    if (!isLoggedIn || !isSupabaseConfigured()) return;

    async function loadRooms() {
      try {
        const dbRooms = await fetchUserRooms();
        const chatMap = {};
        dbRooms.forEach(room => {
          chatMap[room.id] = {
            id: room.id,
            name: room.name || 'Direct Message',
            type: room.type,
            messages: [],
            participants: room.participants ? room.participants.map(p => ({
              id: p.user?.id,
              name: p.user?.username || 'User',
              avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${p.user?.username || 'user'}`
            })) : []
          };
        });
        setChats(chatMap);
        if (dbRooms.length > 0 && !activeChatId) {
          setActiveChatId(dbRooms[0].id);
        }
      } catch (err) {
        console.error("Failed to load rooms:", err);
      }
    }
    loadRooms();
  }, [isLoggedIn]);

  // Fetch messages and subscribe to realtime for active chat
  useEffect(() => {
    if (!activeChatId || !isSupabaseConfigured()) return;

    let subscription = null;
    async function loadMessages() {
      try {
        const msgs = await fetchRoomMessages(activeChatId);
        const formatted = msgs.map(m => ({
          id: m.id,
          text: m.encrypted_content, // default payload
          encrypted: m.encrypted_content,
          time: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          type: m.sender?.username === username ? 'sent' : 'received',
          sender: m.sender?.username || 'User'
        }));

        setChats(prev => ({
          ...prev,
          [activeChatId]: {
            ...prev[activeChatId],
            messages: formatted
          }
        }));
      } catch (err) {
        console.error("Failed to load messages:", err);
      }

      try {
        subscription = subscribeToMessages(activeChatId, (newMsg) => {
          setChats(prev => {
            if (!prev[activeChatId]) return prev;
            const msgObj = {
              id: newMsg.id,
              text: newMsg.encrypted_content,
              encrypted: newMsg.encrypted_content,
              time: new Date(newMsg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              type: 'received',
              sender: 'Peer'
            };
            return {
              ...prev,
              [activeChatId]: {
                ...prev[activeChatId],
                messages: [...(prev[activeChatId].messages || []), msgObj]
              }
            };
          });
        });
      } catch (err) {
        console.error("Subscription error:", err);
      }
    }

    loadMessages();

    return () => {
      if (subscription && subscription.unsubscribe) {
        subscription.unsubscribe();
      }
    };
  }, [activeChatId]);
  
  const scrollRef = useRef(null);

  // Toast helper
  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    async function initCrypto() {
      try {
        if (!window.crypto?.subtle) {
          throw new Error('Web Crypto API is not available in this browser.');
        }
        const keyPair = await generateKeyPair();
        setKeys(keyPair);
      } catch (err) {
        console.error("Crypto Init Failed:", err);
        setCryptoError(true);
      }
    }
    initCrypto();
  }, []);

  useEffect(() => {
    // Scroll to bottom when messages change
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chats, activeChatId]);

  const handleLogin = (name) => {
    setUsername(name || 'Ghost');
    setIsLoggedIn(true);
  };

  const handleSend = async (e) => {
    if (e) e.preventDefault();
    if (!input.trim() || !activeChatId) return;

    const messageText = input;
    setInput('');

    let encryptedPayload = '';
    try {
      if (keys) {
        encryptedPayload = await encryptMessage(keys.publicKey, messageText);
      } else {
        encryptedPayload = btoa(unescape(encodeURIComponent(messageText)));
      }
    } catch(err) {
      console.error('Encryption failed:', err);
      encryptedPayload = btoa(unescape(encodeURIComponent(messageText)));
    }
    
    setLastEncrypted(encryptedPayload);

    const newMessage = {
      id: Date.now(),
      text: messageText,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      type: 'sent',
      encrypted: encryptedPayload
    };

    // Save to Supabase if configured
    if (isSupabaseConfigured()) {
      try {
        await sendEncryptedMessage(activeChatId, encryptedPayload);
      } catch (err) {
        console.error("Failed to send message to Supabase:", err);
        showToast("Failed to save to database: " + err.message, "error");
      }
    }

    setChats(prev => {
      if (!prev[activeChatId]) return prev;
      return {
        ...prev,
        [activeChatId]: {
          ...prev[activeChatId],
          messages: [...(prev[activeChatId].messages || []), newMessage]
        }
      };
    });
  };

  const copyToClipboard = async () => {
    if (!lastEncrypted) {
      showToast('Nothing to copy yet — send a message first.', 'error');
      return;
    }
    try {
      await navigator.clipboard.writeText(lastEncrypted);
      showToast('Encrypted text copied to clipboard!');
    } catch (err) {
      console.error('Clipboard write failed:', err);
      showToast('Failed to copy — please copy manually.', 'error');
    }
  };

  // Safely resolve activeChat — activeChatId might point to a stale/deleted chat
  const activeChat = activeChatId ? (chats[activeChatId] || null) : null;

  if (!isLoggedIn) {
    return <LoginScreen onLogin={handleLogin} />
  }

  if (cryptoError) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
        <div className="bg-white border border-red-100 rounded-3xl shadow-xl p-10 max-w-sm w-full text-center">
          <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Encryption Unavailable</h2>
          <p className="text-sm text-slate-500 mb-6">
            Your browser does not support the Web Crypto API required for end-to-end encryption.
            Please use a modern browser (Chrome, Firefox, Edge, Safari) over HTTPS.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="w-full py-3 rounded-2xl bg-gradient-to-r from-pink-500 to-blue-500 text-white font-bold text-sm hover:opacity-90 transition-all"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50 text-slate-800 font-sans overflow-hidden" role="application">
      {/* Toast Notification */}
      {toast && (
        <div
          role="alert"
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 px-5 py-3 rounded-2xl shadow-xl text-sm font-medium transition-all animate-fade-in-down ${
            toast.type === 'error'
              ? 'bg-red-500 text-white'
              : 'bg-slate-800 text-white'
          }`}
        >
          {toast.type === 'error'
            ? <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            : <Check className="w-4 h-4 flex-shrink-0" />
          }
          {toast.message}
          <button onClick={() => setToast(null)} className="ml-2 opacity-70 hover:opacity-100">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setIsMobileMenuOpen(false)} />
      )}

      {/* Left Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-slate-200 transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} flex flex-col`}>
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-8 h-8 text-pink-500" />
            <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-pink-500 to-blue-500">SecureChat</span>
          </div>
          <button className="lg:hidden" onClick={() => setIsMobileMenuOpen(false)}>
            <Menu className="w-6 h-6 text-slate-500" />
          </button>
        </div>
        
        <div className="px-4 py-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="Search chats or users..." className="w-full bg-slate-100 rounded-full py-2 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto mt-2">
          {/* Chat Rooms */}
          <div className="px-4 mb-4 mt-2">
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 mb-2 tracking-wider">
              <span>CHAT ROOMS</span>
              <Plus className="w-4 h-4 cursor-pointer hover:text-slate-600" />
            </div>
            <div className="space-y-1">
              {Object.values(chats)
                .filter(chat => chat.type === 'room')
                .map(chat => (
                  <SidebarItem 
                    key={chat.id}
                    icon={<Lock className="w-4 h-4 text-white" />} 
                    iconBg={chat.iconBg || "bg-blue-500"} 
                    title={chat.name} 
                    subtitle={chat.subtitle}
                    active={activeChatId === chat.id} 
                    onClick={() => { setActiveChatId(chat.id); setIsMobileMenuOpen(false); }} 
                  />
                ))}
              {Object.values(chats).filter(chat => chat.type === 'room').length === 0 && (
                <div className="text-[11px] text-slate-400 p-2 italic text-center">No active chat rooms</div>
              )}
            </div>
          </div>
          {/* Direct Messages */}
          <div className="px-4">
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 mb-2 tracking-wider">
              <span>DIRECT MESSAGES</span>
              <Plus className="w-4 h-4 cursor-pointer hover:text-slate-600" />
            </div>
            <div className="space-y-1">
              {Object.values(chats)
                .filter(chat => chat.type === 'direct')
                .map(chat => (
                  <SidebarItem 
                    key={chat.id}
                    avatar={chat.avatar} 
                    title={chat.name} 
                    subtitle={chat.online ? "Online" : "Offline"} 
                    online={chat.online} 
                    active={activeChatId === chat.id} 
                    onClick={() => { setActiveChatId(chat.id); setIsMobileMenuOpen(false); }} 
                  />
                ))}
              {Object.values(chats).filter(chat => chat.type === 'direct').length === 0 && (
                <div className="text-[11px] text-slate-400 p-2 italic text-center">No active DMs</div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Nav inside sidebar */}
        <div className="p-4 border-t border-slate-200 flex justify-around">
           <div className="relative cursor-pointer">
              <MessageSquare className="w-6 h-6 text-pink-500" />
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-pink-500 rounded-full flex items-center justify-center text-[8px] text-white font-bold border-2 border-white">5</div>
           </div>
           <User className="w-6 h-6 text-slate-400 cursor-pointer hover:text-slate-600" />
           <Settings className="w-6 h-6 text-slate-400 cursor-pointer hover:text-slate-600" />
        </div>
      </div>

      {/* Main Content Area */}
      {activeChat ? (
        <>
          {/* Main Chat Area */}
          <div className="flex-1 flex flex-col bg-white border-r border-slate-200 relative">
            {/* Header */}
            <div className="h-16 border-b border-slate-200 flex items-center justify-between px-4 sticky top-0 bg-white z-10">
              <div className="flex items-center gap-3">
                 <button className="lg:hidden" onClick={() => setIsMobileMenuOpen(true)}>
                    <Menu className="w-6 h-6 text-slate-600" />
                 </button>
                 <ChevronLeft className="w-5 h-5 text-slate-500 hidden sm:block cursor-pointer" />
                 {activeChat.avatar ? (
                    <img src={activeChat.avatar} alt="Avatar" className="w-10 h-10 rounded-full" />
                 ) : (
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${activeChat.iconBg || 'bg-slate-100'}`}>
                       {activeChat.id === 'security' ? <Lock className="w-5 h-5 text-white" /> : <MessageSquare className="w-5 h-5 text-slate-500" />}
                    </div>
                 )}
                 <div>
                   <h2 className="font-semibold text-slate-800 leading-tight">{activeChat.name}</h2>
                   {activeChat.type === 'direct' && (
                     <span className={`text-xs flex items-center gap-1 ${activeChat.online ? 'text-green-500' : 'text-slate-400'}`}>
                       <span className={`w-2 h-2 rounded-full ${activeChat.online ? 'bg-green-500' : 'bg-slate-400'}`}></span> {activeChat.status}
                     </span>
                   )}
                   {activeChat.type === 'room' && (
                     <span className="text-xs text-slate-500">
                       {(activeChat.participants || []).length} members
                     </span>
                   )}
                 </div>
              </div>
              <div className="flex items-center gap-4 text-slate-400">
                 <Search className="w-5 h-5 cursor-pointer hover:text-slate-600" />
                 <Phone className="w-5 h-5 cursor-pointer hover:text-slate-600" />
                 <Video className="w-5 h-5 cursor-pointer hover:text-slate-600" />
                 <MoreVertical className="w-5 h-5 cursor-pointer hover:text-slate-600" />
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col space-y-4">
               <div className="flex justify-center">
                 <span className="text-xs text-slate-400 bg-white border border-slate-200 px-4 py-1 rounded-full shadow-sm">Today</span>
               </div>

               {activeChat.messages.length === 0 && (
                  <div className="text-center text-slate-400 text-sm py-10">
                    No messages yet. Start a secure conversation.
                  </div>
               )}

               {activeChat.messages.map((msg, idx) => {
                 if (msg.type === 'system') {
                    return (
                       <div key={idx} className="flex justify-center my-2">
                         <span className="text-xs text-slate-400 bg-slate-50 px-3 py-1 rounded-full">{msg.text}</span>
                       </div>
                    );
                 }

                 const isSent = msg.type === 'sent';

                 // If activeTab is 'raw', show encrypted text if available, otherwise show readable
                 const displayText = (activeTab === 'raw' && msg.encrypted) ? msg.encrypted.substring(0, 50) + "..." : msg.text;

                 return (
                   <div key={idx} className={`flex gap-2 ${isSent ? 'justify-end' : ''}`}>
                     {!isSent && activeChat.type === 'direct' && (
                       <img src={activeChat.avatar} alt="Avatar" className="w-8 h-8 rounded-full flex-shrink-0" />
                     )}
                     {!isSent && activeChat.type === 'room' && (
                       <img src="https://i.pravatar.cc/150?img=11" alt="Avatar" className="w-8 h-8 rounded-full flex-shrink-0" />
                     )}
                     <div className={`flex flex-col ${isSent ? 'items-end' : ''}`}>
                       {!isSent && activeChat.type === 'room' && (
                          <span className="text-[10px] text-slate-400 ml-1 mb-0.5">{msg.sender}</span>
                       )}
                       
                       {msg.attachment && (
                          <div className={`border p-3 rounded-2xl max-w-[80%] md:max-w-md w-72 mb-1 ${isSent ? 'bg-blue-50 border-blue-100 rounded-tr-none' : 'bg-slate-100 border-slate-200 rounded-tl-none'}`}>
                            <div className={`flex items-center gap-3 bg-white p-2.5 rounded-xl border shadow-sm ${isSent ? 'border-blue-100/50' : 'border-slate-200/50'}`}>
                              <div className="w-10 h-10 bg-pink-100 rounded-xl flex items-center justify-center text-pink-500 flex-shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                </svg>
                              </div>
                              <div className="overflow-hidden">
                                <div className="text-sm font-medium text-slate-700 truncate">{msg.attachment.name}</div>
                                <div className="text-xs text-slate-400 mt-0.5">{msg.attachment.size}</div>
                              </div>
                            </div>
                          </div>
                       )}

                       <div className={`px-4 py-3 rounded-2xl text-sm text-slate-700 max-w-[80%] md:max-w-md ${isSent ? 'bg-blue-50 border border-blue-100 rounded-tr-none' : 'bg-slate-100 border border-slate-200 rounded-tl-none'} ${activeTab === 'raw' && msg.encrypted ? 'font-mono text-xs break-all' : ''}`}>
                         {displayText}
                       </div>
                       <span className={`text-[10px] text-slate-400 mt-1 ${isSent ? 'mr-1' : 'ml-1'}`}>
                         {msg.time} {isSent && <CheckCheck className="w-3 h-3 text-blue-400" />}
                       </span>
                     </div>
                   </div>
                 );
               })}

               <div className="flex justify-center my-6 relative">
                 <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t border-slate-100"></div>
                 <span className="text-xs font-semibold text-slate-500 bg-white px-3 flex items-center gap-1.5 relative z-10">
                   <Lock className="w-3.5 h-3.5" /> Encryption: ON
                 </span>
               </div>

               {/* View Mode Toggle */}
               <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm max-w-2xl mx-auto w-full mb-4">
                  <div className="text-[10px] font-bold text-slate-400 mb-3 tracking-wider">VIEW MODE</div>
                  <div className="flex bg-slate-50 border border-slate-100 rounded-xl p-1 mb-4">
                     <button type="button" onClick={() => setActiveTab('readable')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'readable' ? 'bg-white shadow-sm text-slate-800 border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>
                       <span className="border border-current rounded px-1.5 text-[10px] font-bold">A</span> Decoded (Readable)
                     </button>
                     <button type="button" onClick={() => setActiveTab('raw')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'raw' ? 'bg-gradient-to-r from-pink-500 to-blue-500 text-white shadow-md border-none' : 'text-slate-500 hover:text-slate-700'}`}>
                       <span className="font-mono font-bold tracking-widest text-[10px]">{'</>'}</span> Encrypted (Raw)
                     </button>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 font-mono text-sm text-slate-600 break-all relative shadow-inner leading-relaxed">
                     {lastEncrypted}
                     <div className="flex justify-end mt-4">
                        <button type="button" onClick={copyToClipboard} className="bg-white border border-slate-200 rounded-lg px-4 py-2 text-xs font-semibold text-slate-600 flex items-center gap-2 shadow-sm hover:bg-slate-50 hover:text-slate-800 transition-colors active:scale-95">
                            <Copy className="w-3.5 h-3.5" /> Copy Encrypted Text
                        </button>
                     </div>
                  </div>
               </div>

               <div ref={scrollRef}></div>
            </div>

            {/* Input Area */}
            <form onSubmit={handleSend} className="p-4 bg-white border-t border-slate-200">
               <div className="flex items-center gap-3 max-w-4xl mx-auto">
                 <button type="button" className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors flex-shrink-0">
                   <Paperclip className="w-5 h-5" />
                 </button>
                 <div className="flex-1 border border-slate-200 rounded-full px-4 py-2 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-300 transition-all bg-slate-50 flex items-center">
                    <input 
                      type="text" 
                      placeholder="Type an encrypted message..." 
                      className="flex-1 bg-transparent border-none focus:outline-none text-sm py-1 min-w-0" 
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                    />
                    <Smile className="w-5 h-5 text-slate-400 cursor-pointer hover:text-slate-600 ml-2 flex-shrink-0" />
                 </div>
                 <button type="submit" disabled={!input.trim()} className="w-11 h-11 rounded-full bg-gradient-to-r from-pink-500 to-blue-500 flex items-center justify-center text-white flex-shrink-0 shadow-md hover:shadow-lg hover:opacity-90 transition-all disabled:opacity-50 disabled:grayscale active:scale-90">
                   <Send className="w-5 h-5 ml-1" />
                 </button>
               </div>
            </form>
          </div>

          {/* Right Sidebar (Hidden on mobile and tablet) */}
          <div className="hidden xl:flex w-80 bg-slate-50 flex-col overflow-y-auto">
             {/* Fake Window Controls */}
             <div className="h-10 flex justify-end items-center gap-2 px-4 border-b border-transparent">
                <div className="w-3 h-3 rounded-full bg-slate-300 cursor-pointer hover:bg-slate-400"></div>
                <div className="w-3 h-3 rounded-full bg-slate-300 cursor-pointer hover:bg-slate-400"></div>
                <div className="w-3 h-3 rounded-full bg-slate-300 cursor-pointer hover:bg-slate-400"></div>
             </div>
             
             <div className="p-5 space-y-5">
                {/* Encryption Status Card */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6 text-center shadow-sm">
                   <div className="text-[10px] font-bold text-slate-400 mb-5 text-left tracking-wider">ENCRYPTION STATUS</div>
                   <div className="w-20 h-20 mx-auto mb-4 relative">
                     <div className="absolute inset-0 bg-gradient-to-tr from-pink-500 to-blue-500 rounded-full opacity-10 blur-xl"></div>
                     <Shield className="w-full h-full text-blue-500 relative z-10" />
                     <div className="absolute inset-0 flex items-center justify-center z-20">
                       <div className="bg-white rounded-full p-0.5">
                         <Check className="w-5 h-5 text-pink-500" />
                       </div>
                     </div>
                   </div>
                   <h3 className="font-bold text-slate-800 text-sm">End-to-End Encrypted</h3>
                   <p className="text-xs text-slate-500 mt-1 mb-4">Your messages are secure</p>
                   <span className="bg-green-50 text-green-600 border border-green-200 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">Active</span>
                </div>

                {/* Key Strength Card */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                   <div className="flex items-center justify-between mb-5">
                     <div className="text-[10px] font-bold text-slate-400 tracking-wider">KEY STRENGTH</div>
                     <Info className="w-4 h-4 text-slate-400 cursor-pointer hover:text-slate-600" />
                   </div>
                   <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden mb-2">
                     <div className="h-full w-full bg-gradient-to-r from-pink-500 to-blue-500"></div>
                   </div>
                   <div className="text-right text-[10px] font-bold text-green-500 mb-5 tracking-wider">Very Strong</div>
                   
                   <div className="space-y-3 text-xs text-slate-500 mb-5">
                     <div className="flex justify-between items-center">
                       <span>Algorithm:</span>
                       <span className="font-medium text-slate-700">AES-256</span>
                     </div>
                     <div className="flex justify-between items-center">
                       <span>Key Size:</span>
                       <span className="font-medium text-slate-700">256 bit</span>
                     </div>
                     <div className="flex justify-between items-center">
                       <span>Updated:</span>
                       <span className="font-medium text-slate-700">Today, 10:20 AM</span>
                     </div>
                   </div>
                   <button className="w-full py-2.5 border border-blue-200 text-blue-600 rounded-xl text-xs font-bold hover:bg-blue-50 transition-colors">
                     View Details
                   </button>
                </div>

                {/* Participants */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                   <div className="text-[10px] font-bold text-slate-400 mb-4 tracking-wider">PARTICIPANTS ({(activeChat.participants || []).length})</div>
                   <div className="space-y-4">
                     {activeChat.participants.map(p => (
                       <Participant key={p.id} avatar={p.avatar} name={p.name} status={p.status} online={p.online} />
                     ))}
                   </div>
                   <button className="w-full mt-6 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors flex items-center justify-center gap-2">
                     <Settings className="w-4 h-4" /> Group Settings
                   </button>
                </div>
             </div>
          </div>
        </>
      ) : (
        <div className="flex-1 flex flex-col bg-slate-50 relative">
          {/* Mobile Top Header for fallback */}
          <div className="h-16 border-b border-slate-200 flex items-center px-4 bg-white lg:hidden">
             <button type="button" className="lg:hidden" onClick={() => setIsMobileMenuOpen(true)}>
                <Menu className="w-6 h-6 text-slate-600" />
             </button>
             <span className="text-sm font-semibold text-slate-700 ml-3">SecureChat</span>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-20 h-20 bg-white border border-slate-200 rounded-3xl flex items-center justify-center text-blue-500 shadow-md mb-6 relative">
              <div className="absolute inset-0 bg-gradient-to-tr from-pink-500 to-blue-500 rounded-3xl opacity-5 blur-lg"></div>
              <Shield className="w-10 h-10 relative z-10" />
              <Lock className="w-4 h-4 text-pink-500 absolute bottom-5 right-5 z-20" />
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Secure Link Established</h2>
            <p className="text-sm text-slate-500 max-w-sm">
              Select a contact or channel from the sidebar to begin exchanging end-to-end encrypted messages.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function SidebarItem({ icon, iconBg, avatar, title, subtitle, badge, dot, online, active, onClick }) {
  return (
    <div 
      onClick={onClick}
      className={`flex items-center justify-between p-2 rounded-xl cursor-pointer group transition-colors ${active ? 'bg-blue-50/50 shadow-sm border border-blue-100/50' : 'hover:bg-slate-50 border border-transparent'}`}
    >
      <div className="flex items-center gap-3">
        {avatar ? (
           <div className="relative">
             <img src={avatar} alt={title} className="w-10 h-10 rounded-full" />
             {online !== undefined && (
                <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white ${online ? 'bg-green-500' : 'bg-slate-300'}`}></div>
             )}
           </div>
        ) : (
           <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconBg}`}>
             {icon}
           </div>
        )}
        <div className="flex flex-col justify-center">
          <div className={`text-[13px] font-semibold ${active ? 'text-blue-600' : 'text-slate-800'}`}>{title}</div>
          <div className="text-[11px] text-slate-500 truncate w-36">{subtitle}</div>
        </div>
      </div>
      {badge && (
        <div className="w-5 h-5 bg-pink-500 rounded-full flex items-center justify-center text-[10px] text-white font-bold ml-2 shadow-sm shadow-pink-500/20">
          {badge}
        </div>
      )}
      {dot && (
        <div className="w-2 h-2 bg-blue-500 rounded-full ml-2"></div>
      )}
    </div>
  );
}

function Participant({ avatar, name, status, online }) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative">
        <img src={avatar} alt={name} className="w-8 h-8 rounded-full" />
      </div>
      <div>
        <div className="text-xs font-semibold text-slate-800">{name}</div>
        <div className={`text-[10px] flex items-center gap-1 mt-0.5 ${online ? 'text-green-500' : 'text-slate-400'}`}>
           <div className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-green-500' : 'bg-slate-300'}`}></div>
           {status}
        </div>
      </div>
    </div>
  );
}

function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoginError('');

    if (!email.trim() || !email.includes('@')) {
      setLoginError('Please enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setLoginError('Password must be at least 6 characters.');
      return;
    }

    setSubmitting(true);
    try {
      if (isSupabaseConfigured()) {
        if (isSignUp) {
          const res = await signUpUser(email.trim(), password);
          if (res.user) {
            onLogin(email.split('@')[0]);
          }
        } else {
          const res = await signInUser(email.trim(), password);
          if (res.user) {
            onLogin(email.split('@')[0]);
          }
        }
      } else {
        // Fallback for UI preview if env is not configured yet
        onLogin(email.split('@')[0]);
      }
    } catch (err) {
      console.error("Auth error:", err);
      setLoginError(err.message || "Authentication failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex font-sans relative overflow-hidden">
      {/* Background decorations for login */}
      <div className="absolute bottom-0 left-0 w-full md:w-1/2 h-1/2 bg-gradient-to-t from-pink-500/10 via-blue-500/5 to-transparent flex items-end opacity-50">
         <svg viewBox="0 0 1440 320" className="w-full text-white" fill="currentColor">
            <path fillOpacity="1" d="M0,288L48,272C96,256,192,224,288,197.3C384,171,480,149,576,165.3C672,181,768,235,864,250.7C960,267,1056,245,1152,224C1248,203,1344,181,1392,170.7L1440,160L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"></path>
         </svg>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6 relative z-10 w-full md:w-1/2">
        <div className="w-full max-w-sm">
           <div className="flex flex-col items-center mb-10">
             <div className="relative w-24 h-24 mb-4 flex items-center justify-center">
                <svg width="0" height="0">
                  <linearGradient id="shield-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop stopColor="#ec4899" offset="0%" />
                    <stop stopColor="#3b82f6" offset="100%" />
                  </linearGradient>
                </svg>
                <Shield className="w-24 h-24 text-transparent stroke-[1.5]" style={{ stroke: 'url(#shield-gradient)', fill: 'none' }} />
                <Lock className="w-8 h-8 text-pink-500 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 mt-0.5" />
             </div>
             <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-pink-500 to-blue-500 mb-1">SecureChat</h1>
             <p className="text-xs text-slate-500 font-medium tracking-wide">Private. Encrypted. Protected.</p>
           </div>

           <div className="text-center mb-8">
             <h2 className="text-xl font-bold text-slate-800">Welcome Back</h2>
             <p className="text-sm text-slate-500 mt-1">Sign in to continue</p>
           </div>

           <form className="space-y-4" onSubmit={handleSubmit}>
             <div className="relative">
               <User className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
               <input 
                 type="text" 
                 placeholder="Email address" 
                 value={email}
                 onChange={e => setEmail(e.target.value)}
                 className="w-full border border-slate-200 rounded-2xl py-3.5 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 hover:border-slate-300 transition-colors" 
               />
             </div>
             <div className="relative">
               <Lock className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
               <input type="password" placeholder="Password" className="w-full border border-slate-200 rounded-2xl py-3.5 pl-12 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 hover:border-slate-300 transition-colors" />
               <Eye className="w-5 h-5 absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 cursor-pointer hover:text-slate-600" />
             </div>
             
             <div className="flex items-center justify-between text-xs px-1 py-1">
                <label className="flex items-center gap-2 text-slate-600 cursor-pointer">
                  <input type="checkbox" className="rounded border-slate-300 text-blue-500 focus:ring-blue-500" />
                  Remember me
                </label>
                <a href="#" className="text-blue-500 font-medium hover:underline">Forgot password?</a>
             </div>

             <button type="submit" className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-pink-500 to-blue-500 text-white font-bold shadow-lg shadow-blue-500/30 hover:opacity-90 hover:shadow-xl transition-all mt-4">
               {submitting ? "Processing..." : (isSignUp ? "Create Account" : "Sign In")}
             </button>
           </form>

           <div className="text-center mt-8 text-sm text-slate-600">
             {isSignUp ? "Already have an account?" : "No account?"} <button type="button" onClick={() => { setIsSignUp(!isSignUp); setLoginError(""); }} className="text-pink-500 font-bold hover:underline ml-1">{isSignUp ? "Sign In" : "Create one"}</button>
           </div>
        </div>
      </div>
      
      {/* Abstract large lock for desktop */}
      <div className="hidden md:flex flex-1 relative bg-slate-50 items-center justify-center overflow-hidden border-l border-slate-100">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-tr from-pink-500/5 to-blue-500/10 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-blue-500/5 to-transparent"></div>
          <Lock className="w-96 h-96 text-slate-200/50 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
      </div>
    </div>
  );
}

export default App;
