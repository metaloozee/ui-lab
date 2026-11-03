import { Banner, BannerDescription, BannerTitle } from "@/components/ui/banner";

const statuses = [
  { status: "default", title: "Draft saved", description: "Your changes are stored locally." },
  { status: "info", title: "New version ready", description: "Reload to pick up the update." },
  { status: "success", title: "Published", description: "Everyone can see the latest version." },
  { status: "warning", title: "Storage almost full", description: "Remove unused files soon." },
  { status: "error", title: "Upload failed", description: "Check your connection and try again." },
] as const;

export function StatusBanners() {
  return (
    <div className="flex flex-col gap-2 p-3">
      {statuses.map(({ status, title, description }) => (
        <Banner key={status} status={status} contrast="high">
          <BannerTitle>{title}</BannerTitle>
          <BannerDescription>{description}</BannerDescription>
        </Banner>
      ))}
    </div>
  );
}
