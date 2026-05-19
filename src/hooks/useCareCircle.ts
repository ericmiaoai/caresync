/**
 * useCareCircle.ts
 * ================
 * Provides the current user's active Care Circle context.
 * Every data query in the app depends on the careCircleId returned here.
 *
 * Returns null for careCircleId when the user has not yet joined or
 * created a Care Circle — this triggers the onboarding redirect in __root.tsx.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { CareCircleRole } from "@/lib/database.types";
import { setChannelStatus } from "@/lib/realtimeSyncStore";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface CareCircleContext {
  careCircleId:   string | null;
  careCircleName: string | null;
  role:           CareCircleRole | null;
  isLoading:      boolean;
  refetch:        () => void;
  renameCircle:   (name: string) => Promise<{ error: string | null }>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useCareCircle(userId: string | null | undefined): CareCircleContext {
  const [careCircleId,   setCareCircleId]   = useState<string | null>(null);
  const [careCircleName, setCareCircleName] = useState<string | null>(null);
  const [role,           setRole]           = useState<CareCircleRole | null>(null);
  const [isLoading,      setIsLoading]      = useState(true);
  // Unique suffix per hook instance — prevents channel name collisions when
  // multiple components (e.g. __root.tsx + a route) call useCareCircle simultaneously.
  const instanceId = useRef(Math.random().toString(36).slice(2, 9));

  const fetchCareCircle = useCallback(async () => {
    if (!userId) {
      setCareCircleId(null);
      setCareCircleName(null);
      setRole(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    // Find the first care circle this user belongs to.
    // We join care_circle_members → care_circles in one query.
    const { data, error } = await supabase
      .from("care_circle_members")
      .select(`
        role,
        care_circles (
          id,
          name
        )
      `)
      .eq("user_id", userId)
      .limit(1)
      .single();

    if (error || !data) {
      // No membership found — user needs onboarding
      setCareCircleId(null);
      setCareCircleName(null);
      setRole(null);
    } else {
      // Supabase can't infer nested join types without Relationships in Database — cast explicitly
      const row = data as unknown as { role: CareCircleRole; care_circles: { id: string; name: string } | null };
      const circle = row.care_circles;
      setCareCircleId(circle?.id ?? null);
      setCareCircleName(circle?.name ?? null);
      setRole(row.role);
    }

    setIsLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchCareCircle();
  }, [fetchCareCircle]);

  // Re-fetch when THIS user's membership row is updated (e.g. an admin changes their role).
  // This ensures permission-gated UI (Post update button, task management, etc.)
  // reflects the new role immediately without requiring a page refresh.
  useEffect(() => {
    if (!userId) return;
    const channelKey = `my_membership_rt_${userId}_${instanceId.current}`;
    const channel = supabase
      .channel(channelKey)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "care_circle_members",
        filter: `user_id=eq.${userId}`,
      }, () => {
        fetchCareCircle();
      })
      .subscribe((status, err) => {
        if (status === "SUBSCRIBED") {
          setChannelStatus(channelKey, true);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setChannelStatus(channelKey, false);
          console.error(`[useCareCircle] Realtime channel error (${status}):`, err);
        }
      });
    return () => {
      setChannelStatus(channelKey, true);
      supabase.removeChannel(channel);
    };
  }, [userId, fetchCareCircle]);

  const renameCircle = useCallback(async (name: string): Promise<{ error: string | null }> => {
    if (!careCircleId) return { error: "No care circle found." };
    // Optimistic update
    setCareCircleName(name);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: sbError } = await (supabase.from("care_circles") as any)
      .update({ name })
      .eq("id", careCircleId);
    if (sbError) {
      // Rollback
      await fetchCareCircle();
      return { error: sbError.message };
    }
    return { error: null };
  }, [careCircleId, fetchCareCircle]);

  return { careCircleId, careCircleName, role, isLoading, refetch: fetchCareCircle, renameCircle };
}
