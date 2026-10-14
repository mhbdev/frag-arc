"use client";

import * as React from "react";
import Image from "next/image";
import { cn } from "@frag-arc/ui/lib/utils";

interface FragArcLogoProps {
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
  className?: string;
  showText?: boolean;
  withGlow?: boolean;
}

const sizeMap = {
  xs: { box: "size-6", img: 24, text: "text-xs" },
  sm: { box: "size-8", img: 32, text: "text-sm" },
  md: { box: "size-10", img: 40, text: "text-base" },
  lg: { box: "size-12", img: 48, text: "text-lg" },
  xl: { box: "size-16", img: 64, text: "text-xl" },
  "2xl": { box: "size-24", img: 96, text: "text-3xl" },
};

export function FragArcLogo({
  size = "md",
  className,
  showText = false,
  withGlow = false,
}: FragArcLogoProps) {
  const current = sizeMap[size];

  return (
    <div className={cn("inline-flex items-center gap-2.5", className)}>
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl flex items-center justify-center bg-[#090d16] border border-cyan-500/20 shadow-md shrink-0 transition-transform hover:scale-105",
          current.box,
          withGlow && "shadow-[0_0_25px_rgba(6,182,212,0.35)] ring-1 ring-cyan-500/40"
        )}
      >
        <Image
          src="/logo.png"
          alt="FragArc Brand Mark"
          width={current.img}
          height={current.img}
          className="object-cover w-full h-full"
          priority
        />
      </div>

      {showText && (
        <div className="flex flex-col">
          <span
            className={cn(
              "font-extrabold tracking-tight bg-gradient-to-r from-foreground via-foreground to-foreground/70 bg-clip-text",
              current.text
            )}
          >
            Frag<span className="text-primary font-black">Arc</span>
          </span>
          <span className="text-[10px] -mt-1 font-mono text-muted-foreground uppercase tracking-widest">
            Layer 1 Bidirectional
          </span>
        </div>
      )}
    </div>
  );
}

export default FragArcLogo;
