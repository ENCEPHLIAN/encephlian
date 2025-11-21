import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChannelGroup, CHANNEL_COLORS, groupChannels } from "@/lib/eeg/channel-groups";
import { filterStandardChannels } from "@/lib/eeg/standard-channels";

interface ChannelGroupListProps {
  channelLabels: string[];
  visibleGroups: Set<ChannelGroup>;
  onToggleGroup: (group: ChannelGroup) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}

export function ChannelGroupList({
  channelLabels,
  visibleGroups,
  onToggleGroup,
  onSelectAll,
  onDeselectAll,
}: ChannelGroupListProps) {
  // Filter to only standard 10-20 channels
  const standardChannelIndices = filterStandardChannels(channelLabels);
  const standardLabels = standardChannelIndices.map(i => channelLabels[i]);
  
  // Group the standard channels
  const groups = groupChannels(standardLabels);
  
  // Count channels per group
  const groupCounts = new Map<ChannelGroup, number>();
  groups.forEach((indices, group) => {
    groupCounts.set(group, indices.length);
  });

  // Order groups anatomically (front to back)
  const orderedGroups: ChannelGroup[] = ["frontal", "central", "temporal", "occipital"];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Channel Groups</CardTitle>
        <div className="flex gap-2 mt-2">
          <Button variant="outline" size="sm" onClick={onSelectAll} className="flex-1">
            All
          </Button>
          <Button variant="outline" size="sm" onClick={onDeselectAll} className="flex-1">
            None
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pb-3">
        <ScrollArea className="h-[calc(100vh-280px)]">
          <div className="space-y-3">
            {orderedGroups.map((group) => {
              const count = groupCounts.get(group) || 0;
              if (count === 0) return null;
              
              const color = CHANNEL_COLORS[group];
              const isChecked = visibleGroups.has(group);

              return (
                <div
                  key={group}
                  className="flex items-start space-x-2 p-3 rounded-lg border transition-colors"
                  style={{
                    backgroundColor: isChecked ? color.bg : 'transparent',
                    borderColor: color.stroke,
                  }}
                >
                  <Checkbox
                    id={group}
                    checked={isChecked}
                    onCheckedChange={() => onToggleGroup(group)}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <Label
                      htmlFor={group}
                      className="text-sm font-medium cursor-pointer"
                      style={{ color: isChecked ? color.stroke : 'inherit' }}
                    >
                      {color.label}
                    </Label>
                    <div className="flex items-center gap-2 mt-1">
                      <div
                        className="w-8 h-1 rounded-full"
                        style={{ backgroundColor: color.stroke }}
                      />
                      <span className="text-xs text-muted-foreground">
                        {count} channels
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
