/**
 * useRoom — Manages room lifecycle in Firestore
 * - Generates unique room IDs per meeting
 * - Tracks participants to detect when room is empty
 * - Expires room link when all participants leave
 * © Ken Baserecha
 */
import { useCallback } from 'react';
import {
  doc, setDoc, updateDoc, deleteDoc,
  getDoc, serverTimestamp, increment,
} from 'firebase/firestore';
import { db } from '../lib/firebase';          // db is Firestore | null
import { generateRoomId } from '../lib/utils';

export interface RoomData {
  roomId: string;
  title: string;
  createdAt: number;
  createdBy: string;
  active: boolean;
  participants: number;
  expiresAt?: number;
}

export function useRoom() {

  /** Create a brand-new room in Firestore */
  const createRoom = useCallback(async (hostName: string, title = 'My Meeting'): Promise<string> => {
    const roomId = generateRoomId();
    if (db) {   // ✅ TypeScript now knows db is a Firestore instance
      try {
        await setDoc(doc(db, 'rooms', roomId), {
          roomId,
          title,
          createdBy: hostName,
          createdAt: serverTimestamp(),
          active: true,
          participants: 0,
        });
      } catch (e) {
        console.warn('[Room] Firestore write failed:', e);
      }
    }
    return roomId;
  }, []);

  /** Check if a room is still active */
  const isRoomActive = useCallback(async (roomId: string): Promise<boolean> => {
    if (!db) return true;   // No Firestore → assume room is active (demo mode)
    try {
      const snap = await getDoc(doc(db, 'rooms', roomId));
      if (!snap.exists()) return false;
      return snap.data()?.active === true;
    } catch {
      return true;
    }
  }, []);

  /** Called when a user joins — increments participant count */
  const onJoin = useCallback(async (roomId: string) => {
    if (!db) return;
    try {
      await updateDoc(doc(db, 'rooms', roomId), {
        participants: increment(1),
        active: true,
      });
    } catch {}
  }, []);

  /** Called when a user leaves — decrements count; marks inactive if empty */
  const onLeave = useCallback(async (roomId: string) => {
    if (!db) return;
    try {
      const snap = await getDoc(doc(db, 'rooms', roomId));
      if (!snap.exists()) return;
      const current = snap.data()?.participants ?? 1;
      if (current <= 1) {
        // Last person left — expire the room
        await updateDoc(doc(db, 'rooms', roomId), {
          active: false,
          participants: 0,
          expiresAt: Date.now(),
        });
        console.log(`[Room] ${roomId} expired — all participants left`);
      } else {
        await updateDoc(doc(db, 'rooms', roomId), {
          participants: increment(-1),
        });
      }
    } catch {}
  }, []);

  return { createRoom, isRoomActive, onJoin, onLeave };
}