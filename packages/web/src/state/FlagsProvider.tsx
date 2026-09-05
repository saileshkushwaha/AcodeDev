import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  loadFlags,
  isOn,
  enumOf,
  toggleFlag,
  setFlagOverride,
  resetAllFlags,
  onFlagsChange,
  listFlags,
  type FlagSpec,
} from '@acode/core';

export interface FlagView {
  spec: FlagSpec;
  value: unknown;
  overridden: boolean;
}

interface FlagsContextValue {
  /** Boolean flag helper; re-renders when the flag changes. */
  flag: (key: string) => boolean;
  /** Enum/string flag helper; re-renders when the flag changes. */
  flagEnum: <T extends string>(key: string) => T;
  /** Every flag (with effective value + override state) for the settings UI. */
  all: () => FlagView[];
  /** Toggle a boolean flag's override. */
  toggle: (key: string) => void;
  /** Set a typed override; pass undefined to clear. */
  set: (key: string, value: unknown | undefined) => void;
  /** Restore all flags to defaults. */
  resetAll: () => void;
}

const FlagsContext = createContext<FlagsContextValue | null>(null);

/**
 * React bridge over the core flags registry. Subscribes to registry changes so
 * any toggle in the Flags screen (or an override applied elsewhere) propagates
 * immediately to every consumer via context.
 */
export function FlagsProvider({ children }: { children: React.ReactNode }) {
  const [, tick] = useState(0);

  useEffect(() => {
    loadFlags();
    const off = onFlagsChange(() => tick((x) => x + 1));
    return off;
  }, []);

  const value: FlagsContextValue = {
    flag: (key) => isOn(key),
    flagEnum: <T extends string>(key: string) => enumOf<T>(key),
    all: () => listFlags(),
    toggle: (key) => toggleFlag(key),
    set: (key, v) => {
      const { setFlagOverride } = require('@acode/core') as typeof import('@acode/core');
      setFlagOverride(key, v);
    },
    resetAll: () => resetAllFlags(),
  };

  return <FlagsContext.Provider value={value}>{children}</FlagsContext.Provider>;
}

export function useFlags(): FlagsContextValue {
  const ctx = useContext(FlagsContext);
  if (!ctx) throw new Error('useFlags must be used within FlagsProvider');
  return ctx;
}
