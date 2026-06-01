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

// ────────────────────────────────────────────────────────────────────────────
// Multi-file vendor bundle detection
// ────────────────────────────────────────────────────────────────────────────
//
// Several vendors split one recording session across multiple files that
// MUST be uploaded together. MNE finds siblings by extension when given
// the entry file, so as long as we put all the files in the same blob folder
// the canonical pipeline handles them. We detect bundles client-side so the
// wizard creates ONE study per bundle instead of N broken single-file
// studies.

export type BundleVendor =
  | "nihon_kohden"
  | "brainvision"
  | "persyst"
  | "natus_neuroworks"
  | "curry";

interface BundleRule {
  vendor: BundleVendor;
  entryExt: string;       // The file MNE opens — must be present in the bundle
  siblingExts: string[];  // Other files required (any subset must match by stem)
  optionalExts: string[]; // Other files allowed (carried along if present)
}

const BUNDLE_RULES: BundleRule[] = [
  // Nihon Kohden — .EEG is the binary signal, .21E is electrode/montage,
  // .PNT is patient info. Without .21E channel labels become unrecoverable.
  {
    vendor: "nihon_kohden",
    entryExt: ".eeg",
    siblingExts: [".21e", ".pnt"],
    optionalExts: [".log", ".11d", ".cmt", ".cn2"],
  },
  // BrainVision — .vhdr is the ASCII header, .eeg is binary data, .vmrk
  // is markers. All three required by MNE.
  {
    vendor: "brainvision",
    entryExt: ".vhdr",
    siblingExts: [".eeg", ".vmrk"],
    optionalExts: [],
  },
  // Persyst — .lay is the ASCII metadata, .dat is the binary signal.
  {
    vendor: "persyst",
    entryExt: ".lay",
    siblingExts: [".dat"],
    optionalExts: [],
  },
  // Natus NeuroWorks (newer than .e files). MNE doesn't read these natively
  // today, but if the user drops the bundle we keep them together so a
  // future vendor adapter can pick them up.
  {
    vendor: "natus_neuroworks",
    entryExt: ".erd",
    siblingExts: [".etc", ".ent", ".stc", ".snc"],
    optionalExts: [".epo", ".eto"],
  },
  // Compumedics Curry — .dap is the data pointer, .rs3 + .cef are siblings
  {
    vendor: "curry",
    entryExt: ".dap",
    siblingExts: [".rs3", ".cef"],
    optionalExts: [],
  },
];

export interface DetectedBundle {
  vendor: BundleVendor;
  stem: string;            // shared filename root
  entryFile: File;         // the file MNE will open
  siblingFiles: File[];    // co-uploaded files
  allFiles: File[];        // entry + siblings, full upload set
}

/**
 * Group a list of files into bundles vs loose single-file studies.
 *
 * Returns:
 *   bundles: DetectedBundle[]    — each becomes ONE study
 *   loose:   File[]              — each becomes its own study (legacy path)
 *
 * Algorithm: for each file, get its stem (filename without extension).
 * Group by stem. For each stem-group with 2+ files, try each bundle rule
 * to see if the entry + all required siblings are present. If so, group
 * matched files (entry + siblings + optionals) as a bundle. Anything else
 * in the stem-group falls through to `loose`.
 */
export function detectBundles(files: File[]): {
  bundles: DetectedBundle[];
  loose: File[];
} {
  const stemMap = new Map<string, File[]>();
  for (const f of files) {
    const stem = stripExt(f.name).toLowerCase();
    if (!stemMap.has(stem)) stemMap.set(stem, []);
    stemMap.get(stem)!.push(f);
  }

  const bundles: DetectedBundle[] = [];
  const loose: File[] = [];

  for (const [stem, group] of stemMap) {
    if (group.length < 2) {
      loose.push(...group);
      continue;
    }
    // Build extension → File map for this stem-group
    const byExt = new Map<string, File>();
    for (const f of group) {
      const ext = fileExtension(f.name);
      if (ext) byExt.set(ext.toLowerCase(), f);
    }

    let matched: DetectedBundle | null = null;
    for (const rule of BUNDLE_RULES) {
      const entry = byExt.get(rule.entryExt);
      if (!entry) continue;
      const siblings = rule.siblingExts.map(ext => byExt.get(ext)).filter(Boolean) as File[];
      if (siblings.length < rule.siblingExts.length) continue;  // missing required
      const optionals = rule.optionalExts
        .map(ext => byExt.get(ext))
        .filter(Boolean) as File[];
      matched = {
        vendor: rule.vendor,
        stem,
        entryFile: entry,
        siblingFiles: [...siblings, ...optionals],
        allFiles: [entry, ...siblings, ...optionals],
      };
      break;
    }

    if (matched) {
      bundles.push(matched);
      const usedNames = new Set(matched.allFiles.map(f => f.name));
      for (const f of group) {
        if (!usedNames.has(f.name)) loose.push(f);
      }
    } else {
      loose.push(...group);
    }
  }

  return { bundles, loose };
}

function stripExt(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx > 0 ? name.slice(0, idx) : name;
}

export const BUNDLE_VENDOR_LABEL: Record<BundleVendor, string> = {
  nihon_kohden: "Nihon Kohden",
  brainvision: "BrainVision",
  persyst: "Persyst",
  natus_neuroworks: "Natus NeuroWorks",
  curry: "Curry",
};
