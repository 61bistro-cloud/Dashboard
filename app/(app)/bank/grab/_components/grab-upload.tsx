"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Upload, CheckCircle2 } from "lucide-react";
import { useUi } from "@/lib/i18n/use-ui";
import { fmtTHB } from "@/lib/fiscal";
import { importGrabCsv } from "../actions";
type Preview = NonNullable<
  Awaited<ReturnType<typeof importGrabCsv>>["preview"]
>;
export function GrabUpload({
  businessId,
  monthId,
  connected,
}: {
  businessId: number;
  monthId: number;
  connected: boolean;
}) {
  const { ui } = useUi(),
    router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Preview | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [message, setMessage] = useState(""),
    [pending, start] = useTransition();
  function submit(mode: "preview" | "commit") {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setMessage("grab.size");
      return;
    }
    const form = new FormData();
    form.set("file", file);
    form.set("businessId", String(businessId));
    form.set("monthId", String(monthId));
    form.set("mode", mode);
    if (mode === "commit" && preview) {
      form.set("token", preview.token);
      form.set("confirmed", String(confirmed));
    }
    setMessage("");
    start(async () => {
      try {
        const result = await importGrabCsv(form);
        if (!result.ok) {
          setMessage(result.message);
          return;
        }
        if (result.preview) {
          setPreview(result.preview);
          setConfirmed(false);
        } else {
          setMessage(
            ui("grab.saved {v0} {v1}", {
              v0: result.saved ?? 0,
              v1: result.duplicateCount ?? 0,
            })
          );
          setPreview(null);
          setConfirmed(false);
          if (fileRef.current) fileRef.current.value = "";
          router.refresh();
        }
      } catch {
        setMessage("grab.failed");
      }
    });
  }
  return (
    <section className="rounded-card border border-hairline bg-canvas p-4 sm:p-5 space-y-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Upload className="h-4 w-4" />
        {ui("grab.upload")}
      </h2>
      <p className="text-xs leading-6 text-muted">{ui("grab.uploadHelp")}</p>
      {!connected && (
        <p className="text-sm text-amber-600">
          {ui("grab.connect")}{" "}
          <Link className="underline" href="/admin/google">
            {ui("grab.connections")}
          </Link>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          aria-label={ui("grab.file")}
          disabled={pending}
          onChange={() => {
            setPreview(null);
            setConfirmed(false);
            setMessage("");
          }}
          className="max-w-full min-w-0 text-xs file:mr-3 file:rounded-input file:border file:border-hairline file:bg-surface file:px-3 file:py-2"
        />
        <button
          type="button"
          disabled={pending}
          onClick={() => submit("preview")}
          className="rounded-pill border border-hairline px-4 py-2 text-xs disabled:opacity-50"
        >
          {ui(pending ? "grab.working" : "grab.preview")}
        </button>
      </div>
      {preview && (
        <div
          className="rounded-input border border-hairline bg-surface p-4 space-y-3"
          data-testid="grab-preview"
        >
          <p className="font-medium text-sm break-words">{preview.storeName}</p>
          <p className="text-xs text-muted break-all">
            {ui("grab.storeId")}: {preview.storeId}
          </p>
          <p className="text-xs">
            {preview.from} — {preview.to} ·{" "}
            {ui("grab.previewCount {v0} {v1} {v2}", {
              v0: preview.summary.count,
              v1: preview.newCount,
              v2: preview.duplicateCount,
            })}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            {[
              ["grab.sales", preview.summary.sales],
              ["grab.gp", preview.summary.gp],
              ["grab.net", preview.summary.net],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-xs text-muted">{ui(String(label))}</p>
                <strong>{fmtTHB(Number(value) / 100)}</strong>
              </div>
            ))}
          </div>
          <label className="flex items-start gap-2 text-xs leading-6">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              disabled={pending}
              className="mt-1.5"
            />
            {ui("grab.confirm")}
          </label>
          <button
            type="button"
            disabled={pending || !confirmed || !connected}
            onClick={() => submit("commit")}
            className="inline-flex items-center gap-2 rounded-pill bg-ink text-canvas px-4 py-2 text-xs disabled:opacity-40"
          >
            <CheckCircle2 className="h-4 w-4" />
            {ui("grab.import")}
          </button>
        </div>
      )}
      {message && (
        <p role="status" className="text-sm break-words">
          {ui(message)}
        </p>
      )}
    </section>
  );
}
