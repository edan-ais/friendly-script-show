import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";

type Props = {
  onApply: (lines: string[], perLineSec: number) => void;
};

export function ScriptImporter({ onApply }: Props) {
  const [script, setScript] = useState("");
  const [perLine, setPerLine] = useState(3);
  return (
    <div className="space-y-3 p-4 text-white">
      <h3 className="text-sm font-semibold">Script → Segments</h3>
      <p className="text-xs text-white/50">
        Each non-empty line becomes one video segment with that line as its subtitle.
      </p>
      <Textarea
        rows={8}
        value={script}
        onChange={(e) => setScript(e.target.value)}
        placeholder={"Welcome to my video\nToday we're going to learn..."}
        className="bg-white/5 font-mono text-sm"
      />
      <div>
        <Label className="text-xs uppercase tracking-wide text-white/50">
          Default seconds per line: {perLine}s
        </Label>
        <Slider min={1} max={10} step={0.5} value={[perLine]} onValueChange={([v]) => setPerLine(v)} />
      </div>
      <Button
        className="w-full"
        disabled={!script.trim()}
        onClick={() => {
          onApply(script.split(/\r?\n/), perLine);
          setScript("");
        }}
      >
        Generate segments
      </Button>
    </div>
  );
}
