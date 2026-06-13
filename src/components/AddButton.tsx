import { Plus } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import type { Theme } from "@/lib/theme";

const SHADOW: Record<Theme, string> = {
  black:            "6px 6px 16px rgba(0,0,0,0.90), -4px -4px 10px rgba(255,255,255,0.13), inset 0 1px 0 rgba(255,255,255,0.11)",
  gray:             "5px 5px 14px rgba(0,0,0,0.65), -4px -4px 10px rgba(255,255,255,0.16), inset 0 1px 0 rgba(255,255,255,0.13)",
  light:            "6px 6px 16px #b4b4b6, -6px -6px 16px #ffffff, inset 0 1px 0 rgba(255,255,255,0.95)",
  ocean:            "6px 6px 16px #c2c2dc, -6px -6px 16px #ffffff, inset 0 1px 0 rgba(255,255,255,0.95)",
  sandstone:        "10px 12px 28px rgba(0,0,0,0.70), -6px -6px 14px rgba(255,255,255,0.05), inset 0 1px 0 rgba(255,255,255,0.10)",
  sunset:           "6px 6px 16px #cbb2bd, -6px -6px 16px #ffffff, inset 0 1px 0 rgba(255,255,255,0.95)",
  granite:          "0 12px 32px -4px rgba(0,0,0,0.80), 0 4px 8px rgba(0,0,0,0.55), -3px -3px 10px rgba(255,255,255,0.05), inset 0 2px 0 rgba(185, 148, 54, 0.55)",
};

interface AddButtonProps {
  onClick:   () => void;
  disabled?: boolean;
  label?:    string;
}

export function AddButton({ onClick, disabled = false, label = "Add" }: AddButtonProps) {
  const { theme } = useTheme();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-12 w-12 items-center justify-center rounded-full bg-card text-muted-foreground transition-all active:scale-95 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
      style={{ boxShadow: SHADOW[theme] }}
    >
      <Plus className="h-5 w-5" />
    </button>
  );
}
