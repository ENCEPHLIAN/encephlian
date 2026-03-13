

## EEG Viewer — Hyper-Functional Audit & Plan

### Current State Assessment

The EEG Viewer has solid bones: WebGL rendering via Three.js with min/max envelope, binary chunk fetching, segment overlays, artifact visualization, and a sidebar. But several built components are **not wired**, and multiple controls are **noops**. Here's the gap analysis:

### Problems Found (First Principles — What's Broken)

| # | Issue | Severity | Root Cause |
|---|-------|----------|------------|
| 1 | **Keyboard nav (P/N) not wired** — sidebar shows hints but no `keydown` handler exists | High | Missing event listener |
| 2 | **Montage selector not connected** — `MontageSelector` + `applyMontage()` exist but viewer never uses them | High | Dead code |
| 3 | **Channel group toggle not connected** — `ChannelGroupList` component exists, never rendered in viewer | High | Dead code |
| 4 | **Playback speed is a noop** — hardcoded `playbackSpeed={1}`, `onPlaybackSpeedChange={() => {}}` | Medium | Incomplete wiring |
| 5 | **Export is a noop** — `onExport={() => {}}` | Medium | Placeholder |
| 6 | **Cache never evicted** — `cacheRef` grows unbounded during long sessions | Medium | Missing eviction |
| 7 | **WebGL DOM leak** — `innerHTML = ""` + createElement every draw call for labels/artifacts | Medium | Perf debt |
| 8 | **No click-to-seek on waveform** — `onTimeClick` prop exists on WebGL viewer but never passed from page | Low | Missing prop |

### Non-Essential (Remove from Scope)

Per Elon's approach — cut what doesn't serve the current state:
- **`EEGCanvas.tsx`** — duplicate Canvas2D renderer, unused. Dead weight.
- **`useEEGChunkCache.ts`** — alternative chunk cache hook, unused (viewer has its own inline cache). Dead weight.
- **`mne-wrapper.ts`** — placeholder with zero implementation. Dead weight.

### Plan (7 changes, zero new features)

**1. Wire keyboard navigation (P/N segment jumping)**
Add `useEffect` with `keydown` listener in `EEGViewer.tsx` that calls `navigateToSegment` for P(rev)/N(ext).

**2. Wire montage selector**
Add montage state + `MontageSelector` to the viewer toolbar. Apply `applyMontage()` to `renderSignals` before passing to WebGL viewer. Labels update accordingly.

**3. Wire channel group toggle**
Add `ChannelGroupList` to the sidebar (or a collapsible panel). Map group visibility to `visibleChannels` set passed to the WebGL renderer.

**4. Wire playback speed**
Add `playbackSpeed` state. Multiply `dt` by `playbackSpeed` in the playback `tick()` function.

**5. Wire click-to-seek on waveform**
Pass `onTimeClick` to `WebGLEEGViewer` — when user clicks the waveform, seek cursor to that position.

**6. Wire export (annotation JSON download)**
Export current annotations + segments as a JSON blob download.

**7. Delete dead files + add cache eviction**
- Delete `EEGCanvas.tsx`, `useEEGChunkCache.ts`, `mne-wrapper.ts`
- Add cache eviction: keep max 20 entries, evict oldest by insertion order

### Architecture After Changes

```text
EEGViewer.tsx (page)
├── Toolbar: [Meta badges] [Montage selector] [Artifact/Segment toggles]
├── EEGControls: [Play/Pause] [Skip] [Timeline] [Window] [Amplitude] [Speed] [Export]
├── WebGL canvas (click-to-seek enabled)
│   └── WebGLEEGViewer.tsx (signals go through applyMontage first)
├── SegmentSidebar (keyboard P/N wired)
└── ChannelGroupList (maps to visibleChannels)
```

### What Does NOT Change
- Read API client architecture (fully portable)
- Binary chunk fetch + reshape logic
- Three.js rendering engine
- Segment overlay rendering
- All type definitions

