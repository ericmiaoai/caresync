import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import {
  Check, ChevronRight, Palette, Users, LogOut, Share2, Trash2, KeyRound, Eye, EyeOff, UserCircle, Camera, Heart, Pencil, Info,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { THEMES, type Theme } from "@/lib/theme";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/hooks/useAuth";
import { useCareCircle } from "@/hooks/useCareCircle";
import { useMembers } from "@/hooks/useMembers";
import { usePreferences, type PatientDisplay } from "@/hooks/usePreferences";
import { usePatient } from "@/hooks/usePatient";
import { can } from "@/lib/permissions";
import { PatientEditSheet } from "@/components/PatientEditSheet";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { compressToAvatar as compressAvatar } from "@/lib/imageUtils";
import { supabase } from "@/lib/supabaseClient";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — CareSync" },
      { name: "description", content: "Customize your CareSync experience." },
    ],
  }),
  component: SettingsPage,
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROLE_LABEL: Record<string, string> = {
  admin:        "Admin",
  collaborator: "Caregiver",
  viewer:       "Viewer",
};

const ROLE_DESCRIPTION: Record<string, string> = {
  admin:        "Full control — manages the care team, posts announcements, invites and removes members, and oversees the entire care plan.",
  collaborator: "Creates and assigns tasks and appointments, scans AVS documents, and can complete any task. Cannot manage team membership or post announcements.",
  viewer:       "Read-only access — stays informed on tasks, appointments, and updates without making any changes.",
};

const ROLE_DESCRIPTION_SHORT: Record<string, string> = {
  admin:        "Full control including team management",
  collaborator: "Creates and manages tasks & appointments",
  viewer:       "Read-only access",
};

function expiresIn(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const hours = Math.floor(diff / 3_600_000);
  if (hours > 0) return `${hours}h remaining`;
  const mins = Math.floor(diff / 60_000);
  return `${mins}m remaining`;
}

function avatarColor(name: string): string {
  const colors = [
    "bg-[var(--user-mom)]",
    "bg-[var(--user-nurse)]",
    "bg-[var(--user-sister)]",
    "bg-[var(--user-dad)]",
    "bg-[var(--user-admin)]",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return colors[Math.abs(h) % colors.length];
}

// ── Theme swatch ──────────────────────────────────────────────────────────────

const SWATCH_STYLE: Record<Theme, React.CSSProperties> = {
  black:            { background: "#0a0a0b" },
  gray:             { background: "radial-gradient(ellipse at 22% 20%, #3a3d47 0%, #22242c 50%, #111318 100%)" },
  light:            { background: "#f5f5f6" },
  blue:             { background: "linear-gradient(175deg, #3d6dd0 0%, #1e3a9e 45%, #0d1462 100%)" },
  sandstone:        { background: "radial-gradient(ellipse at 90% 5%, #5a4e3a 0%, #2e2820 40%, #141210 100%)" },
  indigo:           { background: "radial-gradient(ellipse at 20% 0%, #3d1f6e 0%, #1a0d3a 50%, #0a0514 100%)" },
  granite:          { background: "radial-gradient(ellipse at 96% 0%, #4a5a6e 0%, #252e38 20%, #151c24 50%, #080c10 100%)" },
};

function ThemeSwatch({
  id, label, theme, setTheme,
}: {
  id: Theme; label: string; theme: Theme; setTheme: (t: Theme) => void;
}) {
  const isActive = theme === id;
  const isLight  = id === "light";

  return (
    <button
      type="button"
      onClick={() => setTheme(id)}
      className={cn(
        "group flex flex-col items-center gap-2 rounded-xl p-2 transition-colors",
        "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isActive && "bg-accent",
      )}
    >
      <div
        className={cn(
          "relative h-20 w-full max-w-[88px] overflow-hidden rounded-lg border-2 transition-colors",
          isActive ? "border-primary" : "border-border",
        )}
        style={SWATCH_STYLE[id]}
      >
        <div className="absolute inset-x-3 top-3 flex flex-col gap-1.5">
          <div className="h-1.5 w-3/4 rounded-full opacity-30" style={{ background: isLight ? "#000" : "#fff" }} />
          <div className="h-1 w-1/2 rounded-full opacity-20"   style={{ background: isLight ? "#000" : "#fff" }} />
          <div className="mt-1 h-6 w-full rounded opacity-15"  style={{ background: isLight ? "#000" : "#fff" }} />
          <div className="h-4 w-full rounded opacity-10"        style={{ background: isLight ? "#000" : "#fff" }} />
        </div>
        {isActive && (
          <div className="absolute bottom-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary shadow-sm">
            <Check className="h-3 w-3" style={{ color: isLight ? "#fff" : "#0a0a0b" }} />
          </div>
        )}
      </div>
      <span className={cn("text-xs font-medium", isActive ? "text-foreground" : "text-muted-foreground")}>
        {label}
      </span>
    </button>
  );
}

// ── Settings row ──────────────────────────────────────────────────────────────

function SettingsRow({
  icon, label, subtitle, onClick, destructive,
}: {
  icon:        React.ReactNode;
  label:       string;
  subtitle?:   string;
  onClick:     () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-accent/50 active:bg-accent"
    >
      <span className={cn("shrink-0", destructive ? "text-destructive" : "text-muted-foreground")}>
        {icon}
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className={cn("text-sm font-medium", destructive ? "text-destructive" : "text-foreground")}>
          {label}
        </span>
        {subtitle && (
          <span className="mt-0.5 text-xs text-muted-foreground">{subtitle}</span>
        )}
      </div>
      {!destructive && <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "oklch(0.62 0.13 74)" }} />}
    </button>
  );
}

// Avatar compression now lives in src/lib/imageUtils.ts (shared with PatientEditSheet)

// ── Display-mode labels for the Care Recipient preference picker ─────────────
const PATIENT_DISPLAY_LABEL: Record<PatientDisplay, string> = {
  prominent: "Prominent — photo and details on My Day",
  minimal:   "Minimal — sidebar strip only",
  hidden:    "Hidden — Settings only",
};

// ── Main component ────────────────────────────────────────────────────────────

const INVITE_INPUT = "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";

function SettingsPage() {
  const { user, profile, signOut, updateProfile, refreshProfile } = useAuth();
  const { careCircleId, careCircleName, role, renameCircle } = useCareCircle(user?.id);
  const { theme, setTheme }              = useTheme();
  const { prefs, updatePrefs }           = usePreferences(user?.id);
  const isOnline                         = useOnlineStatus();
  const {
    members, pendingInvites, isLoading: membersLoading,
    generateInvite, revokeInvite, removeMember, updateMemberRole,
  } = useMembers(careCircleId);
  const { patient, updatePatient, uploadPhoto } = usePatient(careCircleId);

  const isAdmin           = role === "admin";
  const canEditPatient    = can(role, "manage_patient");
  const patientDisplay: PatientDisplay = prefs.patientDisplay ?? "prominent";

  // Circle rename inline edit
  const [editingCircleName,  setEditingCircleName]  = useState(false);
  const [circleNameDraft,    setCircleNameDraft]    = useState("");

  const handleCircleNameSave = async () => {
    const trimmed = circleNameDraft.trim();
    setEditingCircleName(false);
    if (!trimmed || trimmed === careCircleName) return;
    const { error } = await renameCircle(trimmed);
    if (error) toast.error("Failed to rename circle", { description: error });
  };

  // Sheet open states
  const [appearanceOpen,    setAppearanceOpen]    = useState(false);
  const [membersOpen,       setMembersOpen]       = useState(false);
  const [inviteOpen,        setInviteOpen]        = useState(false);
  const [passwordOpen,      setPasswordOpen]      = useState(false);
  const [patientEditOpen,   setPatientEditOpen]   = useState(false);
  const [displayPrefsOpen,  setDisplayPrefsOpen]  = useState(false);
  const [deleteOpen,         setDeleteOpen]         = useState(false);
  const [deleteLoading,      setDeleteLoading]      = useState(false);
  const [blockingCircles,    setBlockingCircles]    = useState<string[] | null>(null);
  const [deletePassword,     setDeletePassword]     = useState("");
  const [showDeletePassword, setShowDeletePassword] = useState(false);

  function formatCircleList(names: string[]): string {
    if (names.length === 0) return "a Care Circle";
    if (names.length === 1) return `"${names[0]}"`;
    if (names.length === 2) return `"${names[0]}" and "${names[1]}"`;
    const head = names.slice(0, -1).map((n) => `"${n}"`).join(", ");
    return `${head}, and "${names[names.length - 1]}"`;
  }

  async function handleDeleteAccount() {
    if (!user?.email || !deletePassword) return;
    setDeleteLoading(true);
    setBlockingCircles(null);

    // Verify the user's password before proceeding with deletion
    const { error: authErr } = await supabase.auth.signInWithPassword({
      email: user.email, password: deletePassword,
    });
    if (authErr) {
      toast.error("Incorrect password — please try again.");
      setDeleteLoading(false);
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const endpoint = import.meta.env.VITE_AVS_ENDPOINT
        ?.replace("process-avs", "delete-account")
        ?? "/.netlify/functions/delete-account";

      const res = await fetch(endpoint, {
        method:  "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      // 409 = sole-admin guardrail tripped
      if (res.status === 409) {
        const body = await res.json().catch(() => null);
        const names: string[] = (body?.circles ?? []).map((c: { name: string }) => c.name);
        setBlockingCircles(names);
        setDeleteLoading(false);
        return;
      }

      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(error ?? "Deletion failed");
      }

      await signOut();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      toast.error(msg);
      setDeleteLoading(false);
      setDeleteOpen(false);
    }
  }
  const [profileOpen,    setProfileOpen]    = useState(false);

  // Avatar upload state
  const avatarInputRef                          = useRef<HTMLInputElement>(null);
  const [avatarUrl,        setAvatarUrl]        = useState<string | null>(profile?.avatar_url ?? null);
  const [avatarBusy,       setAvatarBusy]       = useState(false);
  const [pendingBlob,      setPendingBlob]      = useState<Blob | null>(null);
  const [pendingPreviewUrl,setPendingPreviewUrl] = useState<string | null>(null);

  // Keep local avatarUrl in sync whenever the profile refreshes
  useEffect(() => {
    setAvatarUrl(profile?.avatar_url ?? null);
  }, [profile?.avatar_url]);

  // Edit profile form state
  const [editFirstName,  setEditFirstName]  = useState("");
  const [editLastName,   setEditLastName]   = useState("");
  const [profileBusy,    setProfileBusy]    = useState(false);

  // Password change state
  const [currentPwd,     setCurrentPwd]     = useState("");
  const [newPwd,         setNewPwd]         = useState("");
  const [confirmPwd,     setConfirmPwd]     = useState("");
  const [showCurrentPwd, setShowCurrentPwd] = useState(false);
  const [showNewPwd,     setShowNewPwd]     = useState(false);
  const [passwordBusy,   setPasswordBusy]   = useState(false);

  const pwdChecks = {
    length:    newPwd.length >= 8,
    uppercase: /[A-Z]/.test(newPwd),
    number:    /[0-9]/.test(newPwd),
  };
  const pwdValid = Object.values(pwdChecks).every(Boolean) && newPwd === confirmPwd && currentPwd.length > 0;

  // Invite form state
  const [inviteRole,    setInviteRole]    = useState("collaborator");
  const [invitePin,     setInvitePin]     = useState("");
  const [inviteBusy,    setInviteBusy]    = useState(false);
  const [inviteToken,   setInviteToken]   = useState<string | null>(null);

  const fullName = profile ? `${profile.first_name} ${profile.last_name}` : "…";
  const initials = profile
    ? `${profile.first_name[0]}${profile.last_name[0]}`.toUpperCase()
    : "?";

  // ── Invite handlers ──────────────────────────────────────────────────────

  const handleGenerateInvite = async () => {
    if (invitePin.length !== 4) return;
    setInviteBusy(true);
    const { token, error } = await generateInvite(inviteRole, invitePin);
    setInviteBusy(false);
    if (error) {
      toast.error("Failed to generate invite", { description: error });
    } else {
      setInviteToken(token);
    }
  };

  const handleShareInvite = async () => {
    if (!inviteToken) return;
    const url = `${window.location.origin}/join?code=${inviteToken}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join my care circle on CareSync",
          text:  `Use PIN: ${invitePin} to join my care circle. The link expires in 24 hours.`,
          url,
        });
      } catch {
        // User dismissed the share sheet — not an error
      }
    } else {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard");
    }
  };

  const handleRevokeInvite = async (token: string) => {
    const { error } = await revokeInvite(token);
    if (error) toast.error("Failed to revoke invite", { description: error });
    else toast.success("Invite revoked");
  };

  const handleRemoveMember = async (memberId: string, name: string) => {
    const { error } = await removeMember(memberId);
    if (error) toast.error("Failed to remove member", { description: error });
    else toast.success(`${name} removed`);
  };

  const closeInviteSheet = () => {
    setInviteOpen(false);
    setInvitePin("");
    setInviteToken(null);
    setInviteRole("collaborator");
  };

  const handleChangePassword = async () => {
    if (!pwdValid || !user?.email) return;
    setPasswordBusy(true);
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: user.email, password: currentPwd,
    });
    if (authError) {
      toast.error("Current password is incorrect");
      setPasswordBusy(false);
      return;
    }
    const { error: updateError } = await supabase.auth.updateUser({ password: newPwd });
    setPasswordBusy(false);
    if (updateError) {
      toast.error("Failed to update password", { description: updateError.message });
    } else {
      toast.success("Password updated");
      setPasswordOpen(false);
      setCurrentPwd(""); setNewPwd(""); setConfirmPwd("");
    }
  };

  const openProfileSheet = () => {
    setEditFirstName(profile?.first_name ?? "");
    setEditLastName(profile?.last_name ?? "");
    setProfileOpen(true);
  };

  const handleAvatarSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;

    // Reject HEIC — iOS auto-converts on mobile, this only catches desktop HEIC
    if (file.type === "image/heic" || file.type === "image/heif" ||
        file.name.toLowerCase().endsWith(".heic") || file.name.toLowerCase().endsWith(".heif")) {
      toast.error("HEIC photos aren't supported on desktop", {
        description: "On your iPhone, select the photo directly from your camera roll. On a Mac, open the photo in Preview and export as JPEG first.",
      });
      return;
    }

    // Guard against extremely large files
    if (file.size > 15 * 1024 * 1024) {
      toast.error("Photo is too large", { description: "Please choose a photo under 15 MB." });
      return;
    }

    setAvatarBusy(true);
    try {
      const blob       = await compressAvatar(file);
      const previewUrl = URL.createObjectURL(blob);
      setPendingBlob(blob);
      setPendingPreviewUrl(previewUrl);
    } catch (err: unknown) {
      toast.error("Could not process photo", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleAvatarCancel = () => {
    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    setPendingBlob(null);
    setPendingPreviewUrl(null);
  };

  const handleAvatarConfirm = async () => {
    if (!pendingBlob || !user) return;
    const blobToUpload = pendingBlob;
    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    setPendingBlob(null);
    setPendingPreviewUrl(null);
    setAvatarBusy(true);
    try {
      const path = `${user.id}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, blobToUpload, { contentType: "image/jpeg", upsert: true });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = `${data.publicUrl}?t=${Date.now()}`;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("profiles") as any)
        .update({ avatar_url: publicUrl })
        .eq("id", user.id);

      setAvatarUrl(publicUrl);
      await refreshProfile();
      window.dispatchEvent(new CustomEvent("caresync:profile-updated"));
      toast.success("Profile photo updated");
    } catch (err: unknown) {
      toast.error("Upload failed", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!editFirstName.trim() || !editLastName.trim()) return;
    setProfileBusy(true);
    const { error } = await updateProfile(editFirstName, editLastName);
    setProfileBusy(false);
    if (error) toast.error("Failed to update profile", { description: error });
    else { setProfileOpen(false); toast.success("Profile updated"); }
  };

  const handleUpdateRole = async (memberId: string, newRole: string) => {
    const { error } = await updateMemberRole(memberId, newRole);
    if (error) toast.error("Failed to update role", { description: error });
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">

      {/* Avatar confirmation dialog */}
      {pendingPreviewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xs rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <h2 className="mb-1 text-center text-base font-semibold text-foreground">Use this photo?</h2>
            <p className="mb-5 text-center text-sm text-muted-foreground">This will replace your current profile photo.</p>
            <div className="mb-6 flex justify-center">
              <img
                src={pendingPreviewUrl}
                alt="Preview"
                className="h-28 w-28 rounded-full object-cover ring-4 ring-border"
              />
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleAvatarCancel}
                className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAvatarConfirm}
                disabled={avatarBusy}
                className="flex-1 rounded-xl bg-foreground py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-80 disabled:opacity-50"
              >
                {avatarBusy ? "Uploading…" : "Use Photo"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Page header */}
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      </header>

      {/* Hidden file input for avatar upload */}
      <input
        ref={avatarInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/*"
        className="sr-only"
        onChange={handleAvatarSelect}
      />

      {/* Profile card — frosted glass */}
      <div className="mb-10 flex items-center gap-3 rounded-xl border border-white/10 bg-card/85 px-4 py-4 backdrop-blur-xl">
        {/* Tappable avatar */}
        <button
          type="button"
          aria-label="Change profile photo"
          disabled={avatarBusy}
          onClick={() => avatarInputRef.current?.click()}
          className="relative shrink-0 h-11 w-11 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={fullName}
              className="h-11 w-11 rounded-full object-cover"
            />
          ) : (
            <div className={cn(
              "flex h-11 w-11 items-center justify-center rounded-full text-sm font-semibold text-white",
              avatarColor(fullName),
            )}>
              {initials}
            </div>
          )}
          {/* Camera overlay */}
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 hover:opacity-100 transition-opacity">
            {avatarBusy
              ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
              : <Camera className="h-3.5 w-3.5 text-white" />
            }
          </div>
        </button>

        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{fullName}</p>
          <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
          <p className="mt-0.5 text-xs text-muted-foreground/60">Tap photo to change</p>
        </div>
      </div>

      {/* Care Recipient section — floating label */}
      {patient && (
        <>
          <p className="mb-1.5 px-1 text-sm font-semibold uppercase tracking-wider" style={{ color: "oklch(0.62 0.13 74)" }}>
            Care Recipient
          </p>
          <div className="mb-6 overflow-hidden rounded-xl border border-border bg-card divide-y divide-border">
            {/* Patient identity row — admin-only edit; info toast for other roles */}
            <button
              type="button"
              onClick={() => {
                if (canEditPatient) setPatientEditOpen(true);
                else toast.info("Only Admins can edit Care Recipient details.");
              }}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-accent/50 active:bg-accent"
            >
              {patient.avatar_url ? (
                <img
                  src={patient.avatar_url}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-border"
                />
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-foreground ring-1 ring-border">
                  {`${patient.first_name[0] ?? ""}${patient.last_name[0] ?? ""}`.toUpperCase()}
                </div>
              )}
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium text-foreground">
                  {patient.preferred_name?.trim() || `${patient.first_name} ${patient.last_name}`}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {patient.relationship?.trim() || (canEditPatient ? "Tap to add photo and details" : "—")}
                </span>
              </div>
              {canEditPatient
                ? <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "oklch(0.62 0.13 74)" }} />
                : <Info className="h-4 w-4 shrink-0 text-muted-foreground/60" />
              }
            </button>

            {/* Display preference row — available to all roles */}
            <SettingsRow
              icon={<Heart className="h-4 w-4" />}
              label="Display preference"
              subtitle={PATIENT_DISPLAY_LABEL[patientDisplay]}
              onClick={() => setDisplayPrefsOpen(true)}
            />
          </div>
        </>
      )}

      {/* Care Circle section — floating label */}
      <p className="mb-1.5 px-1 text-sm font-semibold uppercase tracking-wider" style={{ color: "oklch(0.62 0.13 74)" }}>
        Care Circle
      </p>
      <div className="mb-6 overflow-hidden rounded-xl border border-border bg-card">
        <SettingsRow
          icon={<Users className="h-4 w-4" />}
          label={careCircleName ?? "Members"}
          subtitle={membersLoading ? "Loading…" : `${members.length} member${members.length === 1 ? "" : "s"}`}
          onClick={() => setMembersOpen(true)}
        />
      </div>

      {/* Preferences section — floating label */}
      <p className="mb-1.5 px-1 text-sm font-semibold uppercase tracking-wider" style={{ color: "oklch(0.62 0.13 74)" }}>
        Preferences
      </p>
      <div className="mb-6 overflow-hidden rounded-xl border border-border bg-card">
        <SettingsRow
          icon={<Palette className="h-4 w-4" />}
          label="Appearance"
          subtitle={`${THEMES.length} themes`}
          onClick={() => setAppearanceOpen(true)}
        />
      </div>

      {/* Account section — floating label */}
      <p className="mb-1.5 px-1 text-sm font-semibold uppercase tracking-wider" style={{ color: "oklch(0.62 0.13 74)" }}>
        Account
      </p>
      <div className="overflow-hidden rounded-xl border border-white/10 bg-card/85 backdrop-blur-xl">
        <SettingsRow
          icon={<UserCircle className="h-4 w-4" />}
          label="Edit Profile"
          subtitle="Update your name and display initials"
          onClick={openProfileSheet}
        />
        <SettingsRow
          icon={<KeyRound className="h-4 w-4" />}
          label="Change Password"
          onClick={() => setPasswordOpen(true)}
        />
        <SettingsRow
          icon={<LogOut className="h-4 w-4" />}
          label="Sign Out"
          onClick={signOut}
          destructive
        />
      </div>

      {/* ── Danger Zone ── */}
      <div className="mt-8 rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-destructive/70">
          Danger Zone
        </p>
        <SettingsRow
          icon={<Trash2 className="h-4 w-4" />}
          label="Delete Account"
          subtitle="Permanently removes your account and all your data"
          onClick={() => setDeleteOpen(true)}
          destructive
        />
      </div>

      <p className="mt-6 text-center text-[11px] leading-relaxed text-muted-foreground/60">
        Your preferences are saved to your account and follow you across devices.
      </p>

      {/* ── Delete Account confirmation dialog ── */}
      <AlertDialog
        open={deleteOpen}
        onOpenChange={(o) => {
          setDeleteOpen(o);
          if (!o) {
            setBlockingCircles(null);
            setDeletePassword("");
            setShowDeletePassword(false);
          }
        }}
      >
        <AlertDialogContent>
          {blockingCircles ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Transfer Admin first</AlertDialogTitle>
                <AlertDialogDescription>
                  You're the only Admin of {formatCircleList(blockingCircles)}, and
                  there are other members in {blockingCircles.length > 1 ? "those circles" : "that circle"}.
                  <br /><br />
                  Open the Members list and change another member's role to{" "}
                  <strong>Admin</strong> — or remove the other members if you no longer
                  need {blockingCircles.length > 1 ? "those circles" : "the circle"} —
                  then come back here to delete your account.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogAction
                  onClick={() => {
                    setBlockingCircles(null);
                    setDeleteOpen(false);
                  }}
                >
                  Got it
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          ) : (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently deletes your account and removes you from all Care
                  Circles. Tasks you were assigned to will remain but become unassigned.
                  This action cannot be undone — your account and all associated data
                  cannot be recovered once deleted.
                </AlertDialogDescription>
              </AlertDialogHeader>
              {/* Password confirmation */}
              <div className="flex flex-col gap-1.5 py-2">
                <label className="text-sm font-medium text-foreground">
                  Enter your password to confirm
                </label>
                <div className="relative">
                  <input
                    type={showDeletePassword ? "text" : "password"}
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && deletePassword && !deleteLoading) handleDeleteAccount(); }}
                    placeholder="Your current password"
                    className={`${INVITE_INPUT} pr-10`}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowDeletePassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  >
                    {showDeletePassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleteLoading}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => { e.preventDefault(); handleDeleteAccount(); }}
                  disabled={deleteLoading || !deletePassword}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {deleteLoading ? "Deleting…" : "Yes, delete my account"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Edit Profile sheet ── */}
      <Sheet open={profileOpen} onOpenChange={(o) => { if (!o) setProfileOpen(false); }}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Edit Profile</SheetTitle>
          </SheetHeader>
          <div className="mt-6 flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">First name</label>
                <input
                  type="text"
                  value={editFirstName}
                  onChange={(e) => setEditFirstName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveProfile()}
                  placeholder="First"
                  autoFocus
                  className={INVITE_INPUT}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">Last name</label>
                <input
                  type="text"
                  value={editLastName}
                  onChange={(e) => setEditLastName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveProfile()}
                  placeholder="Last"
                  className={INVITE_INPUT}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Your initials and display name are derived from these fields and shown to all members of your care circle.
            </p>
            <Button
              className="w-full"
              onClick={handleSaveProfile}
              disabled={!editFirstName.trim() || !editLastName.trim() || profileBusy}
            >
              {profileBusy ? "Saving…" : "Save Changes"}
            </Button>
            <Button variant="outline" className="w-full" onClick={() => setProfileOpen(false)}>
              Cancel
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Appearance sheet ── */}
      <Sheet open={appearanceOpen} onOpenChange={setAppearanceOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Appearance</SheetTitle>
          </SheetHeader>
          <div className="mt-6">
            <p className="mb-1 text-sm font-medium text-foreground">Theme</p>
            <p className="mb-4 text-xs text-muted-foreground">
              Choose a background style for CareSync.
            </p>
            <div className="grid grid-cols-3 gap-2">
              {THEMES.map(({ id, label }) => (
                <ThemeSwatch key={id} id={id} label={label} theme={theme} setTheme={(t) => { setTheme(t); updatePrefs({ theme: t }); }} />
              ))}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Care Recipient display preference sheet ── */}
      <Sheet open={displayPrefsOpen} onOpenChange={setDisplayPrefsOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Care Recipient display</SheetTitle>
          </SheetHeader>
          <div className="mt-6 flex flex-col gap-2">
            <p className="mb-2 text-xs text-muted-foreground">
              Choose how prominently the Care Recipient appears in your daily views. This is a personal preference — other circle members aren't affected.
            </p>
            {(["prominent", "minimal", "hidden"] as const).map((mode) => {
              const isActive = patientDisplay === mode;
              const description = mode === "prominent"
                ? "Photo and details appear on My Day, plus a compact strip in the sidebar."
                : mode === "minimal"
                ? "Only a compact photo and name strip in the sidebar."
                : "Nothing on My Day or the sidebar. Still editable here in Settings.";
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => updatePrefs({ patientDisplay: mode })}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border p-4 text-left transition-colors",
                    isActive
                      ? "border-primary bg-accent/40"
                      : "border-border bg-card hover:bg-accent/20",
                  )}
                >
                  <div className={cn(
                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                    isActive ? "border-primary bg-primary" : "border-border",
                  )}>
                    {isActive && <Check className="h-3 w-3" style={{ color: "var(--primary-foreground)" }} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium capitalize text-foreground">{mode}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Patient (Care Recipient) edit sheet — admin only ── */}
      {patient && canEditPatient && (
        <PatientEditSheet
          open={patientEditOpen}
          onOpenChange={setPatientEditOpen}
          patient={patient}
          isOnline={isOnline}
          onSave={updatePatient}
          onUploadPhoto={uploadPhoto}
        />
      )}

      {/* ── Members sheet ── */}
      <Sheet open={membersOpen} onOpenChange={setMembersOpen}>
        <SheetContent className="flex flex-col overflow-hidden">
          <SheetHeader>
            <SheetTitle>Care Circle</SheetTitle>
            {careCircleName && (
              isAdmin ? (
                editingCircleName ? (
                  <input
                    autoFocus
                    value={circleNameDraft}
                    onChange={(e) => setCircleNameDraft(e.target.value)}
                    onBlur={handleCircleNameSave}
                    onKeyDown={(e) => {
                      if (e.key === "Enter")  handleCircleNameSave();
                      if (e.key === "Escape") setEditingCircleName(false);
                    }}
                    maxLength={60}
                    className="w-full rounded-md border border-ring bg-transparent px-2 py-0.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                ) : (
                  <button
                    onClick={() => { setCircleNameDraft(careCircleName); setEditingCircleName(true); }}
                    className="group flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                    title="Rename care circle"
                  >
                    <span>{careCircleName}</span>
                    <Pencil className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-60" />
                  </button>
                )
              ) : (
                <p className="text-xs text-muted-foreground">{careCircleName}</p>
              )
            )}
          </SheetHeader>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto py-4">

            {membersLoading ? (
              <div className="flex flex-col gap-2">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="h-14 animate-pulse rounded-xl bg-accent" />
                ))}
              </div>
            ) : (
              <>
                {/* Members list */}
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Members
                </p>
                <div className="mb-6 flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                  {members.map((m) => {
                    const name     = `${m.firstName} ${m.lastName}`.trim() || "Unknown";
                    const initials = name !== "Unknown"
                      ? `${m.firstName[0]}${m.lastName[0]}`.toUpperCase()
                      : "?";
                    const isSelf   = m.userId === user?.id;
                    return (
                      <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                        {m.avatarUrl ? (
                          <img
                            src={m.avatarUrl}
                            alt={name}
                            className="h-9 w-9 shrink-0 rounded-full object-cover"
                          />
                        ) : (
                          <div className={cn(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white",
                            avatarColor(name),
                          )}>
                            {initials}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">
                            {name}{isSelf && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}
                          </p>
                          {isAdmin && !isSelf ? (
                            <div>
                              <select
                                value={m.role}
                                onChange={(e) => handleUpdateRole(m.id, e.target.value)}
                                className="mt-0.5 rounded-md border border-border bg-transparent px-1.5 py-0.5 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                              >
                                <option value="admin">Admin</option>
                                <option value="collaborator">Caregiver</option>
                                <option value="viewer">Viewer</option>
                              </select>
                              <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground/70">
                                {ROLE_DESCRIPTION_SHORT[m.role]}
                              </p>
                            </div>
                          ) : (
                            <div>
                              <p className="text-xs text-muted-foreground">{ROLE_LABEL[m.role] ?? m.role}</p>
                              {isSelf && (
                                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground/70">
                                  {ROLE_DESCRIPTION_SHORT[m.role]}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                        {isAdmin && !isSelf && (
                          <button
                            onClick={() => handleRemoveMember(m.id, name)}
                            title={`Remove ${name}`}
                            className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Pending invites (admin only) */}
                {isAdmin && pendingInvites.length > 0 && (
                  <>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Pending Invites
                    </p>
                    <div className="mb-6 flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                      {pendingInvites.map((inv) => (
                        <div key={inv.id} className="flex items-center gap-3 px-4 py-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground">
                              {ROLE_LABEL[inv.role] ?? inv.role} invite
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {expiresIn(inv.expiresAt)}
                              {inv.attemptCount > 0 && ` · ${inv.attemptCount} failed attempt${inv.attemptCount > 1 ? "s" : ""}`}
                            </p>
                          </div>
                          {/* Re-share this invite */}
                          <button
                            title="Share link again"
                            onClick={async () => {
                              const url = `${window.location.origin}/join?code=${inv.inviteToken}`;
                              if (navigator.share) {
                                try { await navigator.share({ url, title: "Join my care circle on CareSync" }); }
                                catch { /* dismissed */ }
                              } else {
                                await navigator.clipboard.writeText(url);
                                toast.success("Link copied to clipboard");
                              }
                            }}
                            className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                          >
                            <Share2 className="h-4 w-4" />
                          </button>
                          <button
                            title="Revoke invite"
                            onClick={() => handleRevokeInvite(inv.inviteToken)}
                            className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          {/* Footer — invite button for admins */}
          {isAdmin && (
            <div className="shrink-0 border-t border-border px-4 py-4">
              <Button className="w-full" onClick={() => setInviteOpen(true)}>
                Invite Member
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Invite sheet (nested on top of members) ── */}
      <Sheet open={inviteOpen} onOpenChange={(o) => { if (!o) closeInviteSheet(); }}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Invite Someone New</SheetTitle>
          </SheetHeader>

          {inviteToken ? (
            /* ── Link generated — show share UI ── */
            <div className="mt-6 flex flex-col gap-5">
              <div className="rounded-xl border border-border bg-accent/40 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Invite link
                </p>
                <p className="break-all font-mono text-xs text-foreground">
                  {window.location.origin}/join?code={inviteToken}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-accent/40 p-4">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  PIN (share privately)
                </p>
                <p className="font-mono text-2xl font-bold tracking-[0.4em] text-foreground">
                  {invitePin}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Share the link and PIN with your invitee separately — anyone with both can join your care circle.
                The link expires in 24 hours.
              </p>
              <Button className="w-full gap-2" onClick={handleShareInvite}>
                <Share2 className="h-4 w-4" />
                Share link
              </Button>
              <Button variant="outline" className="w-full" onClick={closeInviteSheet}>
                Done
              </Button>
            </div>
          ) : (
            /* ── Invite form ── */
            <div className="mt-6 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className={INVITE_INPUT}
                >
                  <option value="collaborator">Caregiver</option>
                  <option value="viewer">Viewer</option>
                  <option value="admin">Admin</option>
                </select>
                {inviteRole && (
                  <p className="rounded-lg bg-accent/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                    {ROLE_DESCRIPTION[inviteRole]}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">PIN</label>
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={4}
                  value={invitePin}
                  onChange={(e) => setInvitePin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="4 digits, e.g. 7391"
                  className={`${INVITE_INPUT} font-mono tracking-widest`}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  Your invitee will need this PIN to join. Share it separately from the link.
                </p>
              </div>
              <Button
                className="w-full"
                onClick={handleGenerateInvite}
                disabled={invitePin.length !== 4 || inviteBusy}
              >
                {inviteBusy ? "Generating…" : "Generate Invite Link"}
              </Button>
              <Button variant="outline" className="w-full" onClick={closeInviteSheet}>
                Cancel
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Change Password sheet ── */}
      <Sheet open={passwordOpen} onOpenChange={(o) => {
        if (!o) { setCurrentPwd(""); setNewPwd(""); setConfirmPwd(""); setShowCurrentPwd(false); setShowNewPwd(false); }
        setPasswordOpen(o);
      }}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Change Password</SheetTitle>
          </SheetHeader>
          <div className="mt-6 flex flex-col gap-4">
            {/* Current password */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">Current Password</label>
              <div className="relative">
                <input
                  type={showCurrentPwd ? "text" : "password"}
                  value={currentPwd}
                  onChange={(e) => setCurrentPwd(e.target.value)}
                  placeholder="Enter current password"
                  className={`${INVITE_INPUT} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPwd((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {showCurrentPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* New password */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">New Password</label>
              <div className="relative">
                <input
                  type={showNewPwd ? "text" : "password"}
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  placeholder="Enter new password"
                  className={`${INVITE_INPUT} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPwd((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {showNewPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {/* Live complexity feedback */}
              {newPwd.length > 0 && (
                <ul className="mt-1 flex flex-col gap-1">
                  {([
                    [pwdChecks.length,    "At least 8 characters"],
                    [pwdChecks.uppercase, "At least one uppercase letter"],
                    [pwdChecks.number,    "At least one number"],
                  ] as [boolean, string][]).map(([ok, label]) => (
                    <li key={label} className={cn("flex items-center gap-1.5 text-xs", ok ? "text-green-500" : "text-muted-foreground")}>
                      <Check className={cn("h-3 w-3", !ok && "opacity-0")} />
                      {label}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Confirm password */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">Confirm New Password</label>
              <input
                type="password"
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
                placeholder="Re-enter new password"
                className={INVITE_INPUT}
              />
              {confirmPwd.length > 0 && newPwd !== confirmPwd && (
                <p className="text-xs text-destructive">Passwords do not match</p>
              )}
            </div>

            <Button
              className="w-full"
              onClick={handleChangePassword}
              disabled={!pwdValid || passwordBusy}
            >
              {passwordBusy ? "Updating…" : "Update Password"}
            </Button>
            <Button variant="outline" className="w-full" onClick={() => setPasswordOpen(false)}>
              Cancel
            </Button>
          </div>
        </SheetContent>
      </Sheet>

    </div>
  );
}
