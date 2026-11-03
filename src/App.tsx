import { Agentation } from "agentation";
import { useState } from "react";

import { Canvas } from "@/canvas/canvas";
import { ErrorBoundary } from "@/canvas/error-boundary";
import { readLayout } from "@/canvas/layout-storage";
import { canvasEntries } from "@/canvas/registry";
import { FluidProvider } from "@/lib/fluid-provider";
import { icons } from "@/lib/icons";

export function App() {
  const [{ shape, density }] = useState(() => readLayout(new Set()).preferences);

  return (
    <FluidProvider shape={shape} size={density} icons={icons}>
      <Canvas entries={canvasEntries} />
      {import.meta.env.DEV && (
        // It reads localStorage unguarded, which would otherwise blank the app when storage is blocked.
        <ErrorBoundary fallback={null}>
          <Agentation />
        </ErrorBoundary>
      )}
    </FluidProvider>
  );
}
