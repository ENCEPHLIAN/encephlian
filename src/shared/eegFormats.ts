/**
 * Canonical list of EEG file formats the platform accepts.
 *
 * Single source of truth for upload validation. Both StudyUploadWizard (Pilot
 * entry point) and Studies.tsx (Internal entry point) MUST import from here
 * so the two never drift. The previous bug — Internal users could not upload
 * .e files even though the Wizard accepted them — happened because Studies.tsx
 * had its own hardcoded ['.edf', '.bdf'] list that nobody knew about.
 */

// Vendor-native formats with documented adapters in apps/aplane/adapters.py.
export const NATIVE_EXTENSIONS: string[] = [
  ".edf", ".bdf",                       // universal interchange
  ".e",   ".erd", ".ncs",               // Natus / NicoletOne / Xltek (single-char!)
  ".lay",                               // Persyst (paired with .dat)
  ".vhdr",                              // Brain Products BrainVision
  ".cnt",                               // Compumedics Neuroscan / ANT Neuro
  ".set",                               // EEGLAB
  ".mff", ".raw",                       // EGI / Philips dense-array
  ".dap", ".rs3", ".cef",               // Compumedics Curry
  ".mefd",                              // MEF3 (Mayo)
  ".gdf",                               // GDF / BioSig
  ".nwb",                               // Neurodata Without Borders
];

// Indian-market vendors that export to EDF (RMS, Clarity, Allengers, BPL,
// Skanray, Nihon Kohden). Their proprietary native formats remain unsupported
// without vendor SDKs but their EDF exports are accepted via NATIVE.
export const PROPRIETARY_EXTENSIONS: string[] = [".nk", ".21e", ".rms", ".cle"];

export const ALL_ACCEPTED_EXTENSIONS: string[] = [
  ...NATIVE_EXTENSIONS,
  ...PROPRIETARY_EXTENSIONS,
];

/**
 * Returns the lowercased extension of a filename including the leading dot,
 * or null if the name has no extension. Handles the `.e` single-char case
 * correctly because we slice from the LAST dot, not split.
 */
export function fileExtension(name: string): string | null {
  const idx = name.lastIndexOf(".");
  if (idx < 0 || idx === name.length - 1) return null;
  return name.slice(idx).toLowerCase();
}

export function isAcceptedExtension(name: string): boolean {
  const ext = fileExtension(name);
  return !!ext && ALL_ACCEPTED_EXTENSIONS.includes(ext);
}

// Human-readable label used in upload-help tooltips / drop-zone hints.
export const ACCEPTED_FORMATS_LABEL =
  "EDF, BDF, Natus (.e/.erd/.ncs), Persyst (.lay), BrainVision (.vhdr), " +
  "Neuroscan/ANT (.cnt), EEGLAB (.set), EGI/Philips (.mff), Curry, MEF3, " +
  "GDF, NWB, Nihon Kohden, RMS, Clarity";
