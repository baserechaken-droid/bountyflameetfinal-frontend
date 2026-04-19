import { useCallback } from 'react';
import {
  doc,
  setDoc,
  updateDoc,
  getDoc,
  serverTimestamp,
  increment,
} from 'firebase/firestore';

import { db, isFirebaseConfigured } from '../lib/firebase';
import { generateRoomId } from '../lib/utils';

export function useRoom() {

  const getDb = () => {
    if (!db || !isFirebaseConfigured) {
      throw new Error('Firebase not initialized');
    }
    return db;
  };

  const createRoom = useCallback(async (hostName: string, title = 'My Meeting') => {
    const roomId = generateRoomId();

    try {
      const firestore = getDb();

      await setDoc(doc(firestore, 'rooms', roomId), {
        roomId,
        title,
        createdBy: hostName,
        createdAt: serverTimestamp(),
        active: true,
        participants: 0,
      });

    } catch (e) {
      console.warn(e);
    }

    return roomId;
  }, []);

  const isRoomActive = useCallback(async (roomId: string) => {
    try {
      const firestore = getDb();
      const snap = await getDoc(doc(firestore, 'rooms', roomId));

      if (!snap.exists()) return false;
      return snap.data()?.active === true;

    } catch {
      return true;
    }
  }, []);

  const onJoin = useCallback(async (roomId: string) => {
    try {
      const firestore = getDb();

      await updateDoc(doc(firestore, 'rooms', roomId), {
        participants: increment(1),
        active: true,
      });

    } catch {}
  }, []);

  const onLeave = useCallback(async (roomId: string) => {
    try {
      const firestore = getDb();
      const roomRef = doc(firestore, 'rooms', roomId);

      const snap = await getDoc(roomRef);
      if (!snap.exists()) return;

      const current = snap.data()?.participants ?? 0;

      if (current <= 1) {
        await updateDoc(roomRef, {
          active: false,
          participants: 0,
          expiresAt: Date.now(),
        });
      } else {
        await updateDoc(roomRef, {
          participants: increment(-1),
        });
      }

    } catch {}
  }, []);

  return {
    createRoom,
    isRoomActive,
    onJoin,
    onLeave,
  };
}
