import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = () => {
  const url = import.meta.env.VITE_SUPABASE_URL || '';
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  // Reject empty, placeholder, or template values
  if (!url || !key) return false;
  if (url.includes('your-project-id') || url.includes('placeholder') || key.includes('placeholder')) return false;
  return true;
};
export const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseAnonKey || 'placeholder');

/* =====================================================================
   1. AUTHENTICATION QUERIES
   ===================================================================== */

export async function signUpUser(email, password, username) {
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

  // After sign-up, update the profile with the username
  if (data.user) {
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ username: username || email.split('@')[0] })
      .eq('id', data.user.id);
    // Ignore profile update errors (e.g. profile not created yet by trigger)
    if (profileError) console.warn('Profile update after signup:', profileError.message);
  }

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

/**
 * Fetch the profile username for the current user.
 */
export async function getCurrentUsername() {
  const user = await getCurrentUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', user.id)
    .single();
  if (error || !data) return user.email ? user.email.split('@')[0] : 'User';
  return data.username || user.email.split('@')[0];
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

/* =====================================================================
   2. USER & CONTACT PROFILE QUERIES
   ===================================================================== */

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

/* =====================================================================
   3. CHAT ROOMS & PARTICIPATION QUERIES
   ===================================================================== */

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
  if (!user) throw new Error('Not authenticated');

  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .insert({
      name: roomName,
      type: roomName ? 'room' : 'direct',
    })
    .select()
    .single();

  if (roomError) throw roomError;

  const allParticipantIds = Array.from(new Set([user.id, ...participantIds]));
  const participantsInsert = allParticipantIds.map(uid => ({
    room_id: room.id,
    user_id: uid,
  }));

  const { error: joinError } = await supabase
    .from('room_participants')
    .insert(participantsInsert);

  if (joinError) throw joinError;

  return room;
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

/* =====================================================================
   4. MESSAGING & REAL-TIME QUERIES
   ===================================================================== */

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
