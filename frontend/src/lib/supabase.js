import { createClient } from '@supabase/supabase-js';

const getEnvVar = (varNames) => {
  for (const name of varNames) {
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[name]) {
      return import.meta.env[name];
    }
    if (typeof process !== 'undefined' && process.env && process.env[name]) {
      return process.env[name];
    }
  }
  return '';
};

const rawSupabaseUrl = getEnvVar([
  'VITE_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_URL',
]);

export const supabaseUrl = rawSupabaseUrl
  ? rawSupabaseUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
  : '';

export const supabaseAnonKey = getEnvVar([
  'VITE_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_ANON_KEY',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_PUBLISHABLE_KEY',
]);

export const isSupabaseConfigured = () => Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder'
);

export async function signUpUser(email, password, username = '') {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username: username || email.split('@')[0],
      },
    },
  });
  if (error) throw error;
  return data;
}

export async function signInUser(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
}

export async function signOutUser() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) return null;
  return user;
}

export async function updateProfile(username, publicKeyBase64) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('profiles')
    .update({
      username: username,
      public_key: publicKeyBase64,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getProfileByUsername(username) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, public_key')
    .eq('username', username)
    .single();

  if (error) throw error;
  return data;
}

export async function searchProfiles(searchString = '') {
  let query = supabase
    .from('profiles')
    .select('id, username, public_key, created_at');

  if (searchString) {
    query = query.ilike('username', `%${searchString}%`);
  }

  const { data, error } = await query.order('username', { ascending: true });
  if (error) throw error;
  return data;
}

export async function fetchUserRooms() {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');

  const { data: participation, error: partError } = await supabase
    .from('room_participants')
    .select('room_id')
    .eq('user_id', user.id);

  if (partError) throw partError;
  if (!participation || participation.length === 0) return [];

  const roomIds = participation.map(p => p.room_id);

  const { data: rooms, error: roomsError } = await supabase
    .from('rooms')
    .select(`
      id,
      name,
      type,
      created_at,
      participants:room_participants(
        user:profiles(id, username, public_key)
      )
    `)
    .in('id', roomIds);

  if (roomsError) throw roomsError;
  return rooms;
}

export async function createRoom(roomName, participantIds = []) {
  const user = await getCurrentUser();
  const currentUserId = user?.id;

  const newRoomId = crypto.randomUUID();
  const roomType = roomName ? 'room' : 'direct';

  const { error: roomError } = await supabase
    .from('rooms')
    .insert({
      id: newRoomId,
      name: roomName,
      type: roomType,
    });

  if (roomError) throw roomError;

  const rawIds = currentUserId ? [currentUserId, ...participantIds] : [...participantIds];
  const allParticipantIds = Array.from(new Set(rawIds.filter(Boolean)));

  if (allParticipantIds.length > 0) {
    const participantsInsert = allParticipantIds.map(uid => ({
      room_id: newRoomId,
      user_id: uid,
    }));

    const { error: joinError } = await supabase
      .from('room_participants')
      .insert(participantsInsert);

    if (joinError) console.warn("Participant link note:", joinError.message);
  }

  return { id: newRoomId, name: roomName, type: roomType };
}

export async function addParticipant(roomId, targetUserId) {
  const { data, error } = await supabase
    .from('room_participants')
    .insert({
      room_id: roomId,
      user_id: targetUserId,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function leaveRoom(roomId) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('room_participants')
    .delete()
    .eq('room_id', roomId)
    .eq('user_id', user.id);

  if (error) throw error;
}

export async function sendEncryptedMessage(roomId, encryptedPayload) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('messages')
    .insert({
      room_id: roomId,
      sender_id: user.id,
      encrypted_content: encryptedPayload,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function fetchRoomMessages(roomId, limit = 50) {
  const { data, error } = await supabase
    .from('messages')
    .select(`
      id,
      encrypted_content,
      created_at,
      sender:profiles(username)
    `)
    .eq('room_id', roomId)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) throw error;
  return data;
}

export function subscribeToMessages(roomId, onNewMessage) {
  return supabase
    .channel(`room:${roomId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `room_id=eq.${roomId}`,
      },
      (payload) => {
        onNewMessage(payload.new);
      }
    )
    .subscribe();
}

export async function startDirectMessage(targetUserId, targetUsername) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');

  const existingRooms = await fetchUserRooms();
  const existingDirect = existingRooms?.find(r => 
    r.type === 'direct' && 
    r.participants?.some(p => p.user?.id === targetUserId)
  );

  if (existingDirect) {
    return existingDirect;
  }

  return await createRoom(targetUsername ? `@${targetUsername}` : 'Direct Message', [targetUserId]);
}

export function subscribeToPresence(userId, username, onPresenceChange) {
  const channel = supabase.channel('online-users', {
    config: {
      presence: {
        key: userId,
      },
    },
  });

  channel
    .on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      const onlineUserIds = Object.keys(state);
      onPresenceChange(onlineUserIds);
    })
    .on('presence', { event: 'join' }, () => {
      const state = channel.presenceState();
      onPresenceChange(Object.keys(state));
    })
    .on('presence', { event: 'leave' }, () => {
      const state = channel.presenceState();
      onPresenceChange(Object.keys(state));
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({
          user_id: userId,
          username: username,
          online_at: new Date().toISOString(),
        });
      }
    });

  return channel;
}

export async function uploadEncryptedAttachment(roomId, encryptedFileBlob, fileName) {
  const filePath = `${roomId}/${Date.now()}_${fileName}`;

  const { data, error } = await supabase.storage
    .from('attachments')
    .upload(filePath, encryptedFileBlob, {
      cacheControl: '3600',
      upsert: false,
    });

  if (error) throw error;

  const { data: urlData } = supabase.storage
    .from('attachments')
    .getPublicUrl(data.path);

  return urlData.publicUrl;
}

export async function updateUserPassword(newPassword) {
  const { data, error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
  return data;
}

export async function deleteUserAccount() {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');

  const { error: profileError } = await supabase
    .from('profiles')
    .delete()
    .eq('id', user.id);
  
  if (profileError) console.warn('Profile deletion notice:', profileError);

  await supabase.auth.signOut();
}

const DEFAULT_SETTINGS = {
  dark_mode: false,
  notifications: true,
  auto_lock: true,
  read_receipts: true,
  message_previews: true,
  language: 'English (US)',
};

export function getLocalSettings() {
  try {
    const cached = localStorage.getItem('app_user_settings');
    return cached ? JSON.parse(cached) : {};
  } catch (e) {
    return {};
  }
}

export function saveLocalSettings(settings) {
  try {
    const existing = getLocalSettings();
    const merged = { ...existing, ...settings };
    localStorage.setItem('app_user_settings', JSON.stringify(merged));
    return merged;
  } catch (e) {
    console.warn('Failed to persist local settings:', e);
  }
}

export async function fetchUserSettings() {
  const local = getLocalSettings();
  try {
    const user = await getCurrentUser();
    if (!user) return { ...DEFAULT_SETTINGS, ...local };

    const { data, error } = await supabase
      .from('user_settings')
      .select('dark_mode, notifications, auto_lock, read_receipts, message_previews, language')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error || !data) {
      return { ...DEFAULT_SETTINGS, ...local };
    }

    const merged = { ...DEFAULT_SETTINGS, ...local, ...data };
    saveLocalSettings(merged);
    return merged;
  } catch (err) {
    console.warn('Supabase settings fetch error, using local fallback:', err);
    return { ...DEFAULT_SETTINGS, ...local };
  }
}

export async function saveUserSettings(settings) {
  saveLocalSettings(settings);

  try {
    const user = await getCurrentUser();
    if (!user) return settings;

    const payload = {
      user_id: user.id,
      dark_mode: settings.dark_mode ?? false,
      notifications: settings.notifications ?? true,
      auto_lock: settings.auto_lock ?? true,
      read_receipts: settings.read_receipts ?? true,
      message_previews: settings.message_previews ?? true,
      language: settings.language || 'English (US)',
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('user_settings')
      .upsert(payload, { onConflict: 'user_id' })
      .select()
      .maybeSingle();

    if (error) {
      console.warn("Supabase settings sync note (saved locally):", error);
      return settings;
    }

    return data || settings;
  } catch (err) {
    console.warn("saveUserSettings fallback to local storage:", err);
    return settings;
  }
}
