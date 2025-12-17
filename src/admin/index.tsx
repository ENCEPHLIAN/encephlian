import { useState, useEffect } from 'react';
import { AlertTriangle, Loader2, CheckCircle, Activity, XCircle, Save, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import EEGViewer, { decodeFloat32B64, decodeUint8B64 } from './EEGViewer';
import type { CanonicalMeta, NormalAbnormalResult } from './readApi';

const STORAGE_KEY_BASE = 'enceph_read_api_base';
const STORAGE_KEY_KEY = 'enceph_read_api_key';

// Fallback from env
const ENV_BASE = (import.meta.env.VITE_ENCEPH_READ_API_BASE || '').trim().replace(/\/+$/, '');
const ENV_KEY = (import.meta.env.VITE_ENCEPH_READ_API_KEY || '').trim();

interface WindowData {
  chunkShape: { n_channels: number; length: number };
  dtype: string;
  artifactShape?: { length: number };
  startSample: number;
  lengthSamples: number;
  samplePreview: number[];
}

export default function AdminReadApi() {
  // Connection settings
  const [apiBase, setApiBase] = useState('');
  const [apiKey, setApiKey] = useState('');
  
  const [studyId, setStudyId] = useState('TUH_CANON_001');
  const [startSample, setStartSample] = useState(0);
  const [lengthSamples, setLengthSamples] = useState(2500);
  
  const [meta, setMeta] = useState<CanonicalMeta | null>(null);
  const [normalAbnormal, setNormalAbnormal] = useState<NormalAbnormalResult | null>(null);
  const [signals, setSignals] = useState<Float32Array[]>([]);
  const [artifactMask, setArtifactMask] = useState<Uint8Array | undefined>();
  const [channelNames, setChannelNames] = useState<string[]>([]);
  const [samplingRate, setSamplingRate] = useState(250);
  const [windowData, setWindowData] = useState<WindowData | null>(null);
  
  const [spacing, setSpacing] = useState(40);
  const [downsampleFactor, setDownsampleFactor] = useState(2);
  
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [loadingWindow, setLoadingWindow] = useState(false);
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [healthResult, setHealthResult] = useState<{ status: number; body: string } | null>(null);

  // Initialize from localStorage or env
  useEffect(() => {
    const storedBase = localStorage.getItem(STORAGE_KEY_BASE);
    const storedKey = localStorage.getItem(STORAGE_KEY_KEY);
    setApiBase((storedBase ?? ENV_BASE).trim().replace(/\/+$/, ''));
    setApiKey((storedKey ?? ENV_KEY).trim());
  }, []);

  const normalizedBase = apiBase.trim().replace(/\/+$/, '');
  const configured = Boolean(normalizedBase);

  const getHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey.trim()) {
      headers['X-API-KEY'] = apiKey.trim();
    }
    return headers;
  };

  const handleSaveConnection = () => {
    const base = apiBase.trim().replace(/\/+$/, '');
    const key = apiKey.trim();
    localStorage.setItem(STORAGE_KEY_BASE, base);
    localStorage.setItem(STORAGE_KEY_KEY, key);
    toast.success('Connection settings saved');
  };

  // Compute bounds from meta with defensive checks
  const nSamples = meta?.n_samples ?? 0;
  const sRate = meta?.sampling_rate_hz ?? 250;
  const maxStart = nSamples > 0 ? nSamples - 1 : 0;
  const maxLength = nSamples > 0 ? Math.min(500000, nSamples - startSample) : 500000;
  
  // Enable window loading when meta has valid n_samples
  const canLoadWindow = Boolean(meta?.n_samples && meta.n_samples > 0);

  const handleTestHealth = async () => {
    if (!normalizedBase) {
      toast.error('Base URL is required');
      return;
    }
    setLoadingHealth(true);
    setHealthResult(null);
    try {
      const res = await fetch(`${normalizedBase}/health`, { headers: getHeaders() });
      const body = await res.text();
      setHealthResult({ status: res.status, body });
      if (res.ok) {
        toast.success(`Health check passed (HTTP ${res.status})`);
      } else {
        toast.error(`Health check failed (HTTP ${res.status})`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error';
      setHealthResult({ status: 0, body: msg });
      toast.error(msg);
    } finally {
      setLoadingHealth(false);
    }
  };

  const handleLoadMeta = async () => {
    if (!normalizedBase) {
      toast.error('Base URL is required');
      return;
    }
    setError(null);
    setLoadingMeta(true);
    setMeta(null);
    setNormalAbnormal(null);
    setSignals([]);
    setWindowData(null);
    
    try {
      const url = `${normalizedBase}/studies/${encodeURIComponent(studyId)}/meta?root=.`;
      const res = await fetch(url, { headers: getHeaders() });
      
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status}: ${body}`);
      }
      
      const json = await res.json();
      console.log('Meta response:', JSON.stringify(json, null, 2));
      
      // Handle both { meta: {...} } and direct {...} shapes
      const metaObj: CanonicalMeta = json.meta ?? json;
      const naObj: NormalAbnormalResult | null = json.normal_abnormal ?? null;
      
      if (typeof metaObj.n_samples !== 'number') {
        throw new Error('Invalid response: missing n_samples');
      }
      
      setMeta(metaObj);
      setNormalAbnormal(naObj);
      
      // Extract channel names
      const channels = metaObj.channel_map?.map(ch => ch.canonical_id) ?? [];
      setChannelNames(channels);
      setSamplingRate(metaObj.sampling_rate_hz ?? 250);
      
      // Reset window params
      setStartSample(0);
      setLengthSamples(Math.min((metaObj.sampling_rate_hz ?? 250) * 10, metaObj.n_samples));
      
      toast.success('Meta loaded successfully');
    } catch (err) {
      console.error('Load meta error:', err);
      const msg = err instanceof Error ? err.message : 'Failed to load meta';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoadingMeta(false);
    }
  };

  const handleLoadWindow = async () => {
    if (!normalizedBase) {
      toast.error('Base URL is required');
      return;
    }
    if (!meta?.n_samples) return;
    
    // Clamp values
    const clampedStart = Math.max(0, Math.min(startSample, meta.n_samples - 1));
    const clampedLength = Math.max(1, Math.min(lengthSamples, Math.min(500000, meta.n_samples - clampedStart)));
    
    setError(null);
    setLoadingWindow(true);
    setWindowData(null);
    
    try {
      const chunkUrl = `${normalizedBase}/studies/${encodeURIComponent(studyId)}/chunk?start=${clampedStart}&length=${clampedLength}`;
      const artifactUrl = `${normalizedBase}/studies/${encodeURIComponent(studyId)}/artifact?start=${clampedStart}&length=${clampedLength}`;
      
      const [chunkRes, artifactRes] = await Promise.all([
        fetch(chunkUrl, { headers: getHeaders() }),
        fetch(artifactUrl, { headers: getHeaders() }).catch(() => null),
      ]);
      
      if (!chunkRes.ok) {
        const body = await chunkRes.text();
        throw new Error(`Chunk HTTP ${chunkRes.status}: ${body}`);
      }
      
      const chunkData = await chunkRes.json();
      
      // Decode signals
      let decodedSignals: Float32Array[];
      try {
        decodedSignals = decodeFloat32B64(
          chunkData.data_b64,
          chunkData.n_channels,
          chunkData.length
        );
      } catch (decodeErr) {
        throw new Error(`Decode error: ${decodeErr instanceof Error ? decodeErr.message : 'unknown'}`);
      }
      
      setSignals(decodedSignals);
      
      // Get first 20 samples of channel 0 for preview
      const samplePreview = decodedSignals.length > 0 
        ? Array.from(decodedSignals[0].slice(0, 20))
        : [];
      
      // Build window data
      const wd: WindowData = {
        chunkShape: { n_channels: chunkData.n_channels, length: chunkData.length },
        dtype: 'float32',
        startSample: clampedStart,
        lengthSamples: clampedLength,
        samplePreview,
      };
      
      // Handle artifact
      if (artifactRes?.ok) {
        try {
          const artifactData = await artifactRes.json();
          if (artifactData?.mask_b64) {
            setArtifactMask(decodeUint8B64(artifactData.mask_b64));
            wd.artifactShape = { length: artifactData.length };
          } else {
            setArtifactMask(undefined);
          }
        } catch {
          setArtifactMask(undefined);
        }
      } else {
        setArtifactMask(undefined);
      }
      
      setWindowData(wd);
      toast.success('Window loaded successfully');
    } catch (err) {
      console.error('Load window error:', err);
      const msg = err instanceof Error ? err.message : 'Failed to load window';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoadingWindow(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Admin: EEG Read API</h1>
      </div>

      {/* Connection Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Connection
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex flex-col gap-2 flex-1 min-w-[250px]">
              <Label htmlFor="apiBase" className="text-xs text-muted-foreground">Read API Base URL</Label>
              <Input
                id="apiBase"
                value={apiBase}
                onChange={(e) => setApiBase(e.target.value)}
                placeholder="https://xxxxx.trycloudflare.com"
                className="font-mono text-sm"
              />
            </div>
            <div className="flex flex-col gap-2 w-48">
              <Label htmlFor="apiKey" className="text-xs text-muted-foreground">API Key</Label>
              <Input
                id="apiKey"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="(optional)"
                className="font-mono text-sm"
              />
            </div>
            <Button onClick={handleSaveConnection} variant="outline" size="sm">
              <Save className="h-4 w-4 mr-2" />
              Save
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestHealth}
              disabled={!configured || loadingHealth}
            >
              {loadingHealth ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Activity className="h-4 w-4 mr-2" />
              )}
              Test /health
            </Button>
          </div>
          
          {/* Health Result */}
          {healthResult && (
            <div className={`mt-3 p-2 rounded text-xs font-mono ${healthResult.status >= 200 && healthResult.status < 300 ? 'bg-green-500/10 border border-green-500/30' : 'bg-destructive/10 border border-destructive/30'}`}>
              <span className="font-semibold">HTTP {healthResult.status}:</span> {healthResult.body}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Warning if not configured */}
      {!configured && (
        <Alert variant="default" className="border-yellow-500/50 bg-yellow-500/10">
          <AlertTriangle className="h-4 w-4 text-yellow-500" />
          <AlertTitle>Base URL Not Set</AlertTitle>
          <AlertDescription className="text-xs">
            Enter a Base URL above to connect to the Read API.
          </AlertDescription>
        </Alert>
      )}

      {/* Error Box */}
      {error && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription className="font-mono text-xs whitespace-pre-wrap">{error}</AlertDescription>
        </Alert>
      )}

      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Query Parameters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex flex-col gap-2">
              <Label htmlFor="studyId" className="text-xs text-muted-foreground">Study ID</Label>
              <Input
                id="studyId"
                value={studyId}
                onChange={(e) => setStudyId(e.target.value)}
                className="w-48"
                placeholder="TUH_CANON_001"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="startSample" className="text-xs text-muted-foreground">Start (sample)</Label>
              <Input
                id="startSample"
                type="number"
                value={startSample}
                onChange={(e) => setStartSample(Math.max(0, Math.min(Number(e.target.value), maxStart)))}
                className="w-32"
                min={0}
                max={maxStart}
                disabled={!canLoadWindow}
              />
              {meta?.n_samples ? (
                <span className="text-xs text-muted-foreground">max: {maxStart.toLocaleString()}</span>
              ) : null}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="lengthSamples" className="text-xs text-muted-foreground">Length (samples)</Label>
              <Input
                id="lengthSamples"
                type="number"
                value={lengthSamples}
                onChange={(e) => setLengthSamples(Math.max(1, Math.min(Number(e.target.value), maxLength)))}
                className="w-32"
                min={1}
                max={maxLength}
                disabled={!canLoadWindow}
              />
              {meta?.n_samples ? (
                <span className="text-xs text-muted-foreground">
                  max: {maxLength.toLocaleString()} (~{(maxLength / sRate).toFixed(1)}s)
                </span>
              ) : null}
            </div>
            <Button onClick={handleLoadMeta} disabled={loadingMeta || !configured} variant="outline">
              {loadingMeta && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Load Meta
            </Button>
            <Button onClick={handleLoadWindow} disabled={loadingWindow || !canLoadWindow || !configured}>
              {loadingWindow && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Load Window
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Window Loaded Panel */}
      {windowData && (
        <Alert className="border-green-500/50 bg-green-500/10">
          <CheckCircle className="h-4 w-4 text-green-500" />
          <AlertTitle>Window Loaded</AlertTitle>
          <AlertDescription className="font-mono text-xs space-y-1">
            <div>
              <span className="text-muted-foreground">shape:</span> [{windowData.chunkShape.n_channels} × {windowData.chunkShape.length}]
              <span className="ml-2 text-muted-foreground">dtype:</span> {windowData.dtype}
              {windowData.artifactShape && <><span className="ml-2 text-muted-foreground">artifact:</span> [{windowData.artifactShape.length}] uint8</>}
            </div>
            <div>
              <span className="text-muted-foreground">start:</span> {windowData.startSample}
              <span className="ml-2 text-muted-foreground">length:</span> {windowData.lengthSamples}
            </div>
            {windowData.samplePreview.length > 0 && (
              <div>
                <span className="text-muted-foreground">ch0[0:20]:</span> [{windowData.samplePreview.map(v => v.toFixed(4)).join(', ')}]
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Meta Summary */}
      {meta && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              Study Metadata
              <Badge variant="outline" className="text-xs font-normal">
                {meta.study_id ?? studyId}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Channels:</span>{' '}
                <span className="font-mono">{meta.n_channels ?? '—'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Sampling Rate:</span>{' '}
                <span className="font-mono">{meta.sampling_rate_hz ?? '—'} Hz</span>
              </div>
              <div>
                <span className="text-muted-foreground">Samples:</span>{' '}
                <span className="font-mono">{meta.n_samples ? meta.n_samples.toLocaleString() : '—'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Duration:</span>{' '}
                <span className="font-mono">
                  {meta.n_samples && meta.sampling_rate_hz
                    ? (meta.n_samples / meta.sampling_rate_hz).toFixed(1) + 's'
                    : '—'}
                </span>
              </div>
            </div>
            
            {meta.channel_map && meta.channel_map.length > 0 && (
              <div className="mt-4">
                <span className="text-muted-foreground text-sm">First 8 Channels:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {meta.channel_map.slice(0, 8).map((ch, i) => (
                    <Badge key={i} variant="secondary" className="font-mono text-xs">
                      {ch.canonical_id}
                    </Badge>
                  ))}
                  {meta.channel_map.length > 8 && (
                    <Badge variant="outline" className="text-xs">+{meta.channel_map.length - 8} more</Badge>
                  )}
                </div>
              </div>
            )}

            {normalAbnormal && (
              <div className="mt-4">
                <span className="text-muted-foreground text-sm">Classification:</span>
                <Badge
                  variant={normalAbnormal.decision === 'normal' ? 'default' : 'destructive'}
                  className="ml-2"
                >
                  {normalAbnormal.decision}
                </Badge>
                <span className="text-xs text-muted-foreground ml-2">
                  (score: {normalAbnormal.score_abnormal?.toFixed(2) ?? '—'})
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* EEG Viewer */}
      {signals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">EEG Viewer</CardTitle>
          </CardHeader>
          <CardContent>
            <EEGViewer
              signals={signals}
              channelNames={channelNames}
              samplingRate={samplingRate}
              artifactMask={artifactMask}
              spacing={spacing}
              downsampleFactor={downsampleFactor}
              onSpacingChange={setSpacing}
              onDownsampleChange={setDownsampleFactor}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
