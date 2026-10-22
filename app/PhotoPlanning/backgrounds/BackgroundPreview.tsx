"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";

const backgrounds = [
  { name: "White", color: "#FFFFFF", description: "The current background, for comparison." },
  { name: "Warm ivory", color: "#F5F1E8", description: "A warm, paper-like backdrop that complements the sunrise colors." },
  { name: "Soft sage", color: "#EAF0E9", description: "A quiet green backdrop inspired by the outdoors." },
  { name: "Pale blue", color: "#EAF0F8", description: "A cool, airy backdrop that echoes the sky." },
];

export default function BackgroundPreview({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState(1);
  const background = backgrounds[selected];

  return (
    <main
      className="min-h-screen px-4 py-6 text-gray-900 sm:px-8 motion-safe:transition-colors motion-safe:duration-300"
      style={{ backgroundColor: background.color }}
    >
      <div className="mx-auto max-w-[1040px]">
        <Link href="/PhotoPlanning" className="mb-4 inline-block text-xs text-gray-600 hover:text-gray-900">
          ← Back to photo planner
        </Link>
        <section aria-label="Background color preview" className="mb-8 rounded-2xl border border-black/10 bg-white/75 p-4 sm:p-5">
          <h1 className="text-sm font-semibold">Try a background</h1>
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Background colors">
            {backgrounds.map((option, index) => (
              <button
                key={option.name}
                type="button"
                aria-pressed={selected === index}
                onClick={() => setSelected(index)}
                className={`flex min-h-11 items-center gap-2 rounded-full border px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 ${selected === index ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 bg-white text-gray-700 hover:border-gray-500"}`}
              >
                <span aria-hidden="true" className="h-5 w-5 rounded-full border border-black/15" style={{ backgroundColor: option.color }} />
                {option.name}
              </button>
            ))}
          </div>
          <p aria-live="polite" className="mt-3 text-xs leading-5 text-gray-600">
            <span className="font-mono">{background.color}</span> · {background.description}
          </p>
        </section>
        {children}
      </div>
    </main>
  );
}
