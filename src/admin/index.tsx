import { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import EEGViewer, { decodeFloat32B64, decodeUint8B64 } from './EEGViewer';
import {
  fetchStudyMeta,
  fetchStudyChunk,
  fetchArtifactMask,
  isApiConfigured,
  type StudyMeta,
} from './readApi';

export default function AdminReadApi() {
  const [studyId, setStudyId] = useState('TUH_CANON_001');
  const [startSample, setStartSample] = useState(0);
  const [lengthSamples, setLengthSamples] = useState(1280); // ~10s at 128Hz
  
  const [meta, setMeta] = useState<StudyMeta | null>(null);
  const [signals, setSignals] = useState<Float32Array[]>([]);
  const [artifactMask, setArtifactMask] = useState<Uint8Array | undefined>();
  const [channelNames, setChannelNames] = useState<string[]>([]);
  const [samplingRate, setSamplingRate] = useState(128);
  
  const [spacing, setSpacing] = useState(40);
  const [downsampleFactor, setDownsampleFactor] = useState(2);
  
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [loadingWindow, setLoadingWindow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const configured = isApiConfigured();

  // Compute bounds from meta - with defensive null checks
  const nSamples = meta?.n_samples ?? 0;
  const sRate = meta?.sampling_rate_hz ?? 128;
  const maxStart = nSamples > 0 ? nSamples - 1 : 0;
  const maxLength = nSamples > 0 ? Math.min(500000, nSamples - startSample) : 500000;

  const handleLoadMeta = async () => {
    setError(null);
    setLoadingMeta(true);
    setMeta(null);
    setSignals([]);
    try {
      const data = await fetchStudyMeta(studyId);
      console.log('Meta response:', JSON.stringify(data, null, 2));
      
      // Validate response has required fields
      if (!data || typeof data.n_samples !== 'number') {
        throw new Error(`Invalid meta response: missing n_samples. Got: ${JSON.stringify(data)}`);
      }
      if (!data.channel_names || !Array.isArray(data.channel_names)) {
        throw new Error(`Invalid meta response: missing channel_names`);
      }
      if (typeof data.sampling_rate_hz !== 'number') {
        throw new Error(`Invalid meta response: missing sampling_rate_hz`);
      }
      
      setMeta(data);
      setChannelNames(data.channel_names);
      setSamplingRate(data.sampling_rate_hz);
      // Reset window params to valid defaults
      setStartSample(0);
      setLengthSamples(Math.min(data.sampling_rate_hz * 10, data.n_samples)); // 10s default
    } catch (err) {
      console.error('Load meta error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load meta');
    } finally {
      setLoadingMeta(false);
    }
  };

  const handleLoadWindow = async () => {
    if (!meta) return;
    
    // Clamp values to valid range
    const clampedStart = Math.max(0, Math.min(startSample, meta.n_samples - 1));
    const clampedLength = Math.max(1, Math.min(lengthSamples, Math.min(500000, meta.n_samples - clampedStart)));
    
    setError(null);
    setLoadingWindow(true);
    try {
      // Fetch chunk and artifact in parallel
      const [chunkData, artifactData] = await Promise.all([
        fetchStudyChunk(studyId, clampedStart, clampedLength),
        fetchArtifactMask(studyId, clampedStart, clampedLength).catch(() => null),
      ]);
      
      const decodedSignals = decodeFloat32B64(
        chunkData.data_b64,
        chunkData.n_channels,
        chunkData.length
      );
      setSignals(decodedSignals);
      
      if (artifactData?.mask_b64) {
        setArtifactMask(decodeUint8B64(artifactData.mask_b64));
      } else {
        setArtifactMask(undefined);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load window');
    } finally {
      setLoadingWindow(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Admin: EEG Read API</h1>
      </div>

      {/* Security Warning Banner */}
      <Alert variant="destructive" className="border-destructive/50 bg-destructive/10">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Development Only</AlertTitle>
        <AlertDescription>
          This page uses the read-api key from environment variables. 
          <strong> Do not expose in production.</strong>
        </AlertDescription>
      </Alert>

      {!configured && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>API Not Configured</AlertTitle>
          <AlertDescription>
            Set <code className="bg-muted px-1 rounded">VITE_ENCEPH_READ_API_BASE</code> and{' '}
            <code className="bg-muted px-1 rounded">VITE_ENCEPH_READ_API_KEY</code> in your environment.
          </AlertDescription>
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
              <Label htmlFor="studyId" className="text-xs text-muted-foreground">
                Study ID
              </Label>
              <Input
                id="studyId"
                value={studyId}
                onChange={(e) => setStudyId(e.target.value)}
                className="w-48"
                placeholder="TUH_CANON_001"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="startSample" className="text-xs text-muted-foreground">
                Start (sample)
              </Label>
              <Input
                id="startSample"
                type="number"
                value={startSample}
                onChange={(e) => setStartSample(Math.max(0, Math.min(Number(e.target.value), maxStart)))}
                className="w-32"
                min={0}
                max={maxStart}
                disabled={!meta}
              />
              {meta && (
                <span className="text-xs text-muted-foreground">
                  max: {maxStart.toLocaleString()}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="lengthSamples" className="text-xs text-muted-foreground">
                Length (samples)
              </Label>
              <Input
                id="lengthSamples"
                type="number"
                value={lengthSamples}
                onChange={(e) => setLengthSamples(Math.max(1, Math.min(Number(e.target.value), maxLength)))}
                className="w-32"
                min={1}
                max={maxLength}
                disabled={!meta}
              />
              {meta && (
                <span className="text-xs text-muted-foreground">
                  max: {maxLength.toLocaleString()} (~{(maxLength / meta.sampling_rate_hz).toFixed(1)}s)
                </span>
              )}
            </div>
            <Button
              onClick={handleLoadMeta}
              disabled={loadingMeta || !configured}
              variant="outline"
            >
              {loadingMeta && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Load Meta
            </Button>
            <Button
              onClick={handleLoadWindow}
              disabled={loadingWindow || !meta || !configured}
            >
              {loadingWindow && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Load Window
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Meta Summary */}
      {meta && meta.n_samples !== undefined && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Study Metadata</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Channels:</span>{' '}
                <span className="font-mono">{meta.n_channels ?? 'N/A'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Sampling Rate:</span>{' '}
                <span className="font-mono">{meta.sampling_rate_hz ?? 'N/A'} Hz</span>
              </div>
              <div>
                <span className="text-muted-foreground">Samples:</span>{' '}
                <span className="font-mono">{meta.n_samples?.toLocaleString() ?? 'N/A'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Duration:</span>{' '}
                <span className="font-mono">
                  {meta.n_samples && meta.sampling_rate_hz 
                    ? (meta.n_samples / meta.sampling_rate_hz).toFixed(1) + 's'
                    : 'N/A'}
                </span>
              </div>
            </div>
            
            <div className="mt-4">
              <span className="text-muted-foreground text-sm">First 8 Channels:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {(meta.channel_names ?? []).slice(0, 8).map((ch, i) => (
                  <Badge key={i} variant="secondary" className="font-mono text-xs">
                    {ch}
                  </Badge>
                ))}
                {(meta.channel_names?.length ?? 0) > 8 && (
                  <Badge variant="outline" className="text-xs">
                    +{meta.channel_names.length - 8} more
                  </Badge>
                )}
              </div>
            </div>

            {meta.normal_abnormal && (
              <div className="mt-4">
                <span className="text-muted-foreground text-sm">Classification:</span>
                <Badge
                  variant={meta.normal_abnormal.decision === 'normal' ? 'default' : 'destructive'}
                  className="ml-2"
                >
                  {meta.normal_abnormal.decision}
                </Badge>
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
