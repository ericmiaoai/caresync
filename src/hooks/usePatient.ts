/**
 * usePatient.ts
 * =============
 * Fetches and manages the single Patient (Care Recipient) record for a
 * given care circle. Mirrors the realtime + visibility-refetch + optimistic-update
 * pattern used by useTasks, useMembers, and useCalendarEvents.
 *
 * One patient per circle is the current model. If a circle has multiple
 * patient rows for any reason, this hook returns the earliest-created one.
 */

import { useState, useEffect, useCallback, useId } from "react";
import { supabase } from "@/lib/supabaseClient";
import { setChannelStatus } from "@/lib/realtimeSyncStore";
import { useReportLoading } from "@/lib/routeReadiness";
import type { Patient } from "@/lib/database.types";

export interface PatientUpdate {
  firstName?:     string | null;
  lastName?:      string | null;
  dateOfBirth?:   string | null;
  preferredName?: string | null;
  relationship?:  string | null;
  about?:         string | null;
  avatarUrl?:     string | null;
}

interface UsePatientReturn {
  patient:       Patient | null;
  isLoading:     boolean;
  error:         string | null;
  updatePatient: (patch: PatientUpdate) => Promise<{ error: string | null }>;
  uploadPhoto:   (blob: Blob) => Promise<{ error: string | null; url?: string }>;
}

export function usePatient(careCircleId: string | null | undefined): UsePatientReturn {
  // Per-instance unique ID so that multiple consumers (SideNav + a route page)
  // each get their own Supabase realtime channel. Without this, the second
  // hook to mount throws "cannot add postgres_changes callbacks after subscribe"
  // because supabase.channel(key) returns the same channel for the same key.
  const instanceId = useId();
  const [patient,   setPatient]   = useState<Patient | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error,     setError]     = useState<string | null>(null);

  // Report loading state to the route-readiness store (see lib/routeReadiness).
  useReportLoading(isLoading);

  const fetchPatient = useCallback(async (silent = false) => {
    if (!careCircleId) {
      // Keep isLoading=true while careCircleId resolves. Setting it to false
      // here causes a brief flash of the empty state during route mount,
      // before the real fetch runs with a valid circleId.
      return;
    }
    if (!silent) setIsLoading(true);
    setError(null);

    const { data, error: sbError } = await supabase
      .from("patients")
      .select("*")
      .eq("care_circle_id", careCircleId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (sbError) {
      setError(sbError.message);
      setPatient(null);
    } else {
      setPatient((data as Patient | null) ?? null);
    }
    setIsLoading(false);
  }, [careCircleId]);

  useEffect(() => { fetchPatient(); }, [fetchPatient]);

  // Realtime subscription — keeps every circle member in sync after an admin edit.
  useEffect(() => {
    if (!careCircleId) return;
    // Channel key includes instanceId so SideNav and route pages don't share
    // the same Supabase channel (which would throw on the second .on() call).
    const channelKey = `patient_rt_${careCircleId}_${instanceId}`;
    const channel = supabase
      .channel(channelKey)
      .on("postgres_changes", {
        event:  "*",
        schema: "public",
        table:  "patients",
        filter: `care_circle_id=eq.${careCircleId}`,
      }, () => { fetchPatient(true); })
      .subscribe((status, err) => {
        if (status === "SUBSCRIBED") {
          setChannelStatus(channelKey, true);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setChannelStatus(channelKey, false);
          console.error(`[usePatient] Realtime channel error (${status}):`, err);
        }
      });
    return () => {
      setChannelStatus(channelKey, true);
      supabase.removeChannel(channel);
    };
  }, [careCircleId, instanceId, fetchPatient]);

  // Refetch when the tab regains focus — covers cases where the user edits on
  // another device and returns to this one.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") fetchPatient(true);
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [fetchPatient]);

  // Listen for in-tab patient updates dispatched by the edit sheet
  // (mirrors the caresync:profile-updated pattern used for user avatars).
  useEffect(() => {
    const handler = () => fetchPatient(true);
    window.addEventListener("caresync:patient-updated", handler);
    return () => window.removeEventListener("caresync:patient-updated", handler);
  }, [fetchPatient]);

  const updatePatient = useCallback(async (patch: PatientUpdate): Promise<{ error: string | null }> => {
    if (!patient) return { error: "No patient record found for this care circle." };

    const dbPatch: Record<string, string | null> = {};
    if (patch.firstName     !== undefined) dbPatch.first_name     = patch.firstName;
    if (patch.lastName      !== undefined) dbPatch.last_name      = patch.lastName;
    if (patch.dateOfBirth   !== undefined) dbPatch.date_of_birth  = patch.dateOfBirth;
    if (patch.preferredName !== undefined) dbPatch.preferred_name = patch.preferredName;
    if (patch.relationship  !== undefined) dbPatch.relationship   = patch.relationship;
    if (patch.about         !== undefined) dbPatch.about          = patch.about;
    if (patch.avatarUrl     !== undefined) dbPatch.avatar_url     = patch.avatarUrl;

    // Optimistic local update
    setPatient((prev) => prev ? { ...prev, ...dbPatch } as Patient : prev);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: sbError } = await (supabase.from("patients") as any)
      .update(dbPatch)
      .eq("id", patient.id);
    if (sbError) {
      // Rollback on error by refetching the canonical row
      await fetchPatient(true);
      return { error: sbError.message };
    }
    // Notify other components in the same tab
    window.dispatchEvent(new CustomEvent("caresync:patient-updated"));
    return { error: null };
  }, [patient, fetchPatient]);

  const uploadPhoto = useCallback(async (blob: Blob): Promise<{ error: string | null; url?: string }> => {
    if (!patient) return { error: "No patient record found." };
    const path = `patient-${patient.id}.jpg`;
    const { error: upErr } = await supabase.storage
      .from("avatars")
      .upload(path, blob, { contentType: "image/jpeg", upsert: true });
    if (upErr) return { error: upErr.message };
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    const publicUrl = `${data.publicUrl}?t=${Date.now()}`;
    const { error: dbErr } = await updatePatient({ avatarUrl: publicUrl });
    if (dbErr) return { error: dbErr };
    return { error: null, url: publicUrl };
  }, [patient, updatePatient]);

  return { patient, isLoading, error, updatePatient, uploadPhoto };
}
