/**
 * PatientEditSheet.tsx
 * ====================
 * Admin-only edit form for the Care Recipient. Lets admins:
 *   - Upload / replace the patient photo (256×256 JPEG, compressed in browser)
 *   - Set a preferred name (display name throughout the app)
 *   - Set a relationship label (e.g. "Father", "Aunt")
 *   - Write a short About blurb (≤ 200 chars, non-medical guidance shown inline)
 *
 * Reuses the standard avatar-confirm pattern from Settings: select → preview →
 * confirm uploads, cancel discards. All other field edits commit on Save.
 */

import { useState, useEffect, useRef } from "react";
import { Camera } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { compressToAvatar } from "@/lib/imageUtils";
import { cn } from "@/lib/utils";
import type { Patient } from "@/lib/database.types";
import type { PatientUpdate } from "@/hooks/usePatient";

const INPUT = "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";

const ABOUT_MAX = 200;

interface PatientEditSheetProps {
  open:          boolean;
  onOpenChange:  (open: boolean) => void;
  patient:       Patient;
  isOnline?:     boolean;
  onSave:        (patch: PatientUpdate) => Promise<{ error: string | null }>;
  onUploadPhoto: (blob: Blob) => Promise<{ error: string | null; url?: string }>;
}

export function PatientEditSheet({
  open, onOpenChange, patient, isOnline = true, onSave, onUploadPhoto,
}: PatientEditSheetProps) {
  const [firstName,     setFirstName]     = useState("");
  const [lastName,      setLastName]      = useState("");
  const [dateOfBirth,   setDateOfBirth]   = useState("");
  const [preferredName, setPreferredName] = useState("");
  const [relationship,  setRelationship]  = useState("");
  const [about,         setAbout]         = useState("");
  const [submitting,    setSubmitting]    = useState(false);
  const [uploading,     setUploading]     = useState(false);

  // Photo flow: select → blob+preview → confirm-uploads / cancel-discards
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingBlob,    setPendingBlob]    = useState<Blob | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);

  // Reset form whenever the sheet opens
  useEffect(() => {
    if (open) {
      setFirstName(patient.first_name         ?? "");
      setLastName(patient.last_name           ?? "");
      setDateOfBirth(patient.date_of_birth    ?? "");
      setPreferredName(patient.preferred_name ?? "");
      setRelationship(patient.relationship    ?? "");
      setAbout(patient.about                  ?? "");
      // Clear any stale photo preview
      if (pendingPreview) URL.revokeObjectURL(pendingPreview);
      setPendingBlob(null);
      setPendingPreview(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, patient.id]);

  // Cleanup preview URL on unmount
  useEffect(() => () => {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
  }, [pendingPreview]);

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = "";  // allow re-selecting the same file later
    if (!file) return;
    if (!isOnline) { toast.error("You're offline — reconnect to upload."); return; }
    if (file.size > 15 * 1024 * 1024) {
      toast.error("Photo is too large", { description: "Please choose a photo under 15 MB." });
      return;
    }
    try {
      const blob       = await compressToAvatar(file);
      const previewUrl = URL.createObjectURL(blob);
      if (pendingPreview) URL.revokeObjectURL(pendingPreview);
      setPendingBlob(blob);
      setPendingPreview(previewUrl);
    } catch (err) {
      toast.error("Could not process photo", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    }
  };

  const handlePhotoCancel = () => {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingBlob(null);
    setPendingPreview(null);
  };

  const handlePhotoConfirm = async () => {
    if (!pendingBlob) return;
    if (!isOnline) { toast.error("You're offline — reconnect to upload."); return; }
    setUploading(true);
    const { error } = await onUploadPhoto(pendingBlob);
    setUploading(false);
    if (error) {
      toast.error("Upload failed", { description: error });
      return;
    }
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingBlob(null);
    setPendingPreview(null);
    toast.success("Photo updated");
  };

  const handleSave = async () => {
    if (!isOnline) { toast.error("You're offline — reconnect to make changes."); return; }
    if (!firstName.trim() || !lastName.trim()) return;  // legal name required
    if (about.length > ABOUT_MAX) return;
    setSubmitting(true);
    const { error } = await onSave({
      firstName:     firstName.trim(),
      lastName:      lastName.trim(),
      dateOfBirth:   dateOfBirth || null,
      preferredName: preferredName.trim() || null,
      relationship:  relationship.trim()  || null,
      about:         about.trim()         || null,
    });
    setSubmitting(false);
    if (error) toast.error("Failed to save", { description: error });
    else { onOpenChange(false); toast.success("Care recipient updated"); }
  };

  const currentPhotoUrl = pendingPreview ?? patient.avatar_url;
  const initials = `${patient.first_name[0] ?? ""}${patient.last_name[0] ?? ""}`.toUpperCase();
  const aboutRemaining = ABOUT_MAX - about.length;
  const aboutOver      = about.length > ABOUT_MAX;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Edit Care Recipient</SheetTitle>
        </SheetHeader>

        {/* Hidden file input */}
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/*"
          className="sr-only"
          onChange={handlePhotoSelect}
        />

        <div className="mt-6 flex flex-col gap-5">
          {/* Photo */}
          <div className="flex items-start gap-4">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="relative h-20 w-20 shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Change patient photo"
            >
              {currentPhotoUrl ? (
                <img src={currentPhotoUrl} alt="" className="h-20 w-20 rounded-full object-cover ring-2 ring-border" />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-accent text-xl font-semibold text-foreground ring-2 ring-border">
                  {initials}
                </div>
              )}
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity hover:opacity-100">
                {uploading
                  ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  : <Camera className="h-5 w-5 text-white" />
                }
              </div>
            </button>

            <div className="flex flex-1 flex-col justify-center gap-2">
              {pendingBlob ? (
                <>
                  <Button onClick={handlePhotoConfirm} disabled={uploading}>
                    {uploading ? "Uploading…" : "Save new photo"}
                  </Button>
                  <Button variant="outline" onClick={handlePhotoCancel} disabled={uploading}>
                    Discard
                  </Button>
                </>
              ) : (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Tap the photo to choose a new one. We'll crop it to a square automatically.
                </p>
              )}
            </div>
          </div>

          {/* ── Legal information ── */}
          <div className="flex flex-col gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Legal Information
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">First name</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="First"
                  maxLength={60}
                  className={INPUT}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">Last name</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Last"
                  maxLength={60}
                  className={INPUT}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">
                Date of birth
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">(optional)</span>
              </label>
              <input
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                className={INPUT}
              />
            </div>
            <p className="text-xs text-muted-foreground/70">
              Legal name is used to verify identity when scanning AVS documents.
            </p>
          </div>

          <div className="border-t border-border" />

          {/* ── Display information ── */}
          <div className="flex flex-col gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Display
            </p>

          {/* Preferred name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">
              Preferred name
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">(optional)</span>
            </label>
            <input
              type="text"
              value={preferredName}
              onChange={(e) => setPreferredName(e.target.value)}
              placeholder={`e.g. ${firstName || patient.first_name}, Dad, Grandma`}
              maxLength={40}
              className={INPUT}
            />
            <p className="text-xs text-muted-foreground/70">
              Shown throughout the app. Leave blank to use the legal name.
            </p>
          </div>

          {/* Relationship */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">
              Relationship
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">(optional)</span>
            </label>
            <input
              type="text"
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
              placeholder="e.g. Father, Aunt, Mother-in-law"
              maxLength={60}
              className={INPUT}
            />
          </div>

          {/* About */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">
                About
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">(optional)</span>
              </label>
              <span className={cn(
                "text-xs tabular-nums",
                aboutOver ? "text-destructive" : aboutRemaining <= 20 ? "text-[var(--warning)]" : "text-muted-foreground/70",
              )}>
                {about.length} / {ABOUT_MAX}
              </span>
            </div>
            <textarea
              value={about}
              onChange={(e) => setAbout(e.target.value.slice(0, ABOUT_MAX))}
              placeholder="A short, personal intro — hobbies, personality, things to know…"
              rows={4}
              maxLength={ABOUT_MAX}
              className={`${INPUT} resize-none`}
            />
            <p className="text-xs text-muted-foreground/70">
              Keep this personal and non-medical. Allergies, conditions, and medications belong in tasks — not here.
            </p>
          </div>
          </div>{/* end Display section */}
        </div>

        <SheetFooter className="mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={submitting || aboutOver || !firstName.trim() || !lastName.trim()}>
            {submitting ? "Saving…" : "Save Changes"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
