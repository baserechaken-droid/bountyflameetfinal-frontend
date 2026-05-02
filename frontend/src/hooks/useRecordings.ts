/**
 * useRecordings — list / delete a user's cloud recordings
 * © Ken Baserecha — Boutyflameet
 *
 * Recordings live in two places:
 *   1. Google Cloud Storage  (the .webm bytes)
 *   2. Firestore document at users/{uid}/recordings/{auto}
 *
 * Listing reads from Firestore (cheap, ordered, indexable).
 * Deleting removes both the Firestore doc AND the GCS object.
 */
import { useEffect, useState, useCallback } from 'react';
import { db, isFirebaseConfigured } from '../lib/firebase';

export interface CloudRecording {
  id:         string;
  filename:   string;
  bytes:      number;
  roomId:     string | null;
  title:      string | null;
  objectPath: string;        // "/objects/uploads/<id>"
  servingUrl: string;        // "/api/storage/objects/uploads/<id>"
  createdAt:  number | null; // ms epoch, null while pending
}

export function useRecordings(userUid: string | undefined) {
  const [items, setItems]     = useState<CloudRecording[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isFirebaseConfigured || !db || !userUid) {
      setItems([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { collection, query, orderBy, getDocs, limit } = await import('firebase/firestore');
      const q = query(
        collection(db, 'users', userUid, 'recordings'),
        orderBy('createdAt', 'desc'),
        limit(50),
      );
      const snap = await getDocs(q);
      const out: CloudRecording[] = snap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        const created = data['createdAt'] as { toMillis?: () => number } | undefined;
        return {
          id:         d.id,
          filename:   String(data['filename'] ?? 'recording.webm'),
          bytes:      Number(data['bytes'] ?? 0),
          roomId:     (data['roomId'] as string | null) ?? null,
          title:      (data['title'] as string | null) ?? null,
          objectPath: String(data['objectPath'] ?? ''),
          servingUrl: String(data['servingUrl'] ?? ''),
          createdAt:  created?.toMillis ? created.toMillis() : null,
        };
      });
      setItems(out);
    } catch (e: any) {
      console.warn('[Recordings] list failed:', e?.message || e);
      setError(e?.message || 'Failed to load recordings');
    } finally {
      setLoading(false);
    }
  }, [userUid]);

  useEffect(() => { void load(); }, [load]);

  const remove = useCallback(
    async (rec: CloudRecording): Promise<boolean> => {
      if (!isFirebaseConfigured || !db || !userUid) return false;
      try {
        // 1) Best-effort delete the GCS object — even if this fails (e.g.
        //    object already gone) we still wipe the Firestore record so
        //    the UI stays consistent.
        if (rec.objectPath?.startsWith('/objects/')) {
          try {
            const sub = rec.objectPath.replace(/^\/objects\//, '');
            await fetch(`/api/storage/objects/${sub}`, { method: 'DELETE' });
          } catch (e: any) {
            console.warn('[Recordings] cloud delete failed:', e?.message || e);
          }
        }
        // 2) Delete the Firestore doc.
        const { doc, deleteDoc } = await import('firebase/firestore');
        await deleteDoc(doc(db, 'users', userUid, 'recordings', rec.id));
        setItems((cur) => cur.filter((r) => r.id !== rec.id));
        return true;
      } catch (e: any) {
        console.warn('[Recordings] delete failed:', e?.message || e);
        return false;
      }
    },
    [userUid],
  );

  return { items, loading, error, reload: load, remove, isAvailable: isFirebaseConfigured };
}
