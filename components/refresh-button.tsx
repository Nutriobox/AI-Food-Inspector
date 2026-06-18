"use client";

import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function RefreshButton() {
  const [spinning, setSpinning] = useState(false);
  const qc = useQueryClient();
  return (
    <button
      onClick={async () => {
        if (spinning) return;
        setSpinning(true);
        await qc.invalidateQueries();
        setTimeout(() => {
          setSpinning(false);
          toast.success("Data refreshed");
        }, 400);
      }}
      className="inline-flex items-center gap-2 px-3 py-2 rounded-btn bg-ink text-white text-xs font-medium hover:opacity-90 focus-ring"
    >
      <RefreshCw className={cn("h-4 w-4", spinning && "animate-spin")} />
      Refresh Data
    </button>
  );
}