import { Badge, badgeColors } from "@/components/ui/badge";

const colors = Object.keys(badgeColors) as (keyof typeof badgeColors)[];

export function BadgeColors() {
  return (
    <div className="flex flex-wrap content-center items-center justify-center gap-1.5 p-3 size-full">
      {colors.map((color) => (
        <Badge key={color} color={color} variant="dot">
          {color}
        </Badge>
      ))}
    </div>
  );
}
