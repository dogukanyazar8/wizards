import { Button } from "@wizards/ui";

export function Variants() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button>Join channel</Button>
      <Button variant="outline">Cancel</Button>
    </div>
  );
}

export function Sizes() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="sm">Small</Button>
      <Button size="default">Default</Button>
      <Button size="lg">Large</Button>
    </div>
  );
}

export function Disabled() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button disabled>Sending…</Button>
      <Button variant="outline" disabled>
        Unavailable
      </Button>
    </div>
  );
}
