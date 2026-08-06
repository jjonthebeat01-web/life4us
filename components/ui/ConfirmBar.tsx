import { Button } from "./Button";

export function ConfirmBar({
  isOwner,
  ownerLabel,
  ready,
  label,
  onConfirm,
}: {
  isOwner: boolean;
  ownerLabel: string;
  ready: boolean;
  label: string;
  onConfirm: () => void;
}) {
  if (isOwner) {
    return (
      <div>
        <Button onClick={onConfirm} disabled={!ready}>
          {label}
        </Button>
        {!ready && (
          <p className="mt-3 text-center text-xs font-semibold uppercase tracking-[0.24em] text-flash-pink">
            waiting on your partner
          </p>
        )}
      </div>
    );
  }
  return (
    <div>
      <p className="text-center text-xs font-semibold uppercase tracking-[0.24em] text-flash-pink">
        waiting on {ownerLabel}, session owner
      </p>
    </div>
  );
}
