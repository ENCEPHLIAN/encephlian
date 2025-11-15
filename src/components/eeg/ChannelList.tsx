import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";

interface ChannelListProps {
  channelLabels: string[];
  visibleChannels: Set<number>;
  onToggleChannel: (index: number) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}

export function ChannelList({
  channelLabels,
  visibleChannels,
  onToggleChannel,
  onSelectAll,
  onDeselectAll,
}: ChannelListProps) {
  return (
    <div className="bg-card border border-border rounded-lg p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <Label className="text-sm font-semibold">Channels ({visibleChannels.size}/{channelLabels.length})</Label>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={onSelectAll} className="h-7 text-xs">
            All
          </Button>
          <Button variant="ghost" size="sm" onClick={onDeselectAll} className="h-7 text-xs">
            None
          </Button>
        </div>
      </div>
      
      <ScrollArea className="flex-1 -mx-2 px-2">
        <div className="space-y-2">
          {channelLabels.map((label, index) => (
            <div key={index} className="flex items-center space-x-2 py-1">
              <Checkbox
                id={`channel-${index}`}
                checked={visibleChannels.has(index)}
                onCheckedChange={() => onToggleChannel(index)}
              />
              <label
                htmlFor={`channel-${index}`}
                className="text-sm font-mono cursor-pointer flex-1"
              >
                {label}
              </label>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
