import { Button } from "@/components/ui/button";

type PrimaryButtonProps = { primary: string; secondary: string };

export function PrimaryButton({ primary, secondary }: PrimaryButtonProps) {
  return (
    <div className="flex size-full items-center justify-center gap-2">
      <Button variant="tertiary">{secondary}</Button>
      <Button>{primary}</Button>
    </div>
  );
}
