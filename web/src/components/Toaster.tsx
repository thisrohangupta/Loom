import { useToasts } from "@/lib/toast";

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="animate-in slide-in-from-bottom-2 fade-in rounded-md bg-foreground px-4 py-2.5 text-sm text-background shadow-lg"
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
