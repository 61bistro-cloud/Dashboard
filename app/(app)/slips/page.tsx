import { redirect } from "next/navigation";
import {
  ScanLine,
  Inbox,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentBusiness } from "@/lib/business";
import { fmtTHB } from "@/lib/fiscal";
import { findCandidates } from "@/lib/slip-match";
import { PageHeader } from "@/components/page-header";
import { SlipUpload } from "./_components/slip-upload";
import { SlipReview, type SlipDTO } from "./_components/slip-review";

export const maxDuration = 30;

const ACTIVE = ["PENDING", "REVIEW", "UNMATCHED", "FAILED"];

type SlipRow = {
  id: number;
  status: string;
  extractStatus: string;
  extractError: string | null;
  amount: number | null;
  transferAt: Date | null;
  senderName: string | null;
  bankName: string | null;
  ref: string | null;
  confidence: number | null;
  accountId: number | null;
  matchedTxId: number | null;
  note: string | null;
};

function serialize(s: SlipRow): SlipDTO {
  return {
    id: s.id,
    status: s.status,
    extractStatus: s.extractStatus,
    extractError: s.extractError,
    amount: s.amount,
    date: s.transferAt ? s.transferAt.toISOString().slice(0, 10) : "",
    time: s.transferAt ? s.transferAt.toISOString().slice(11, 16) : "",
    senderName: s.senderName,
    bankName: s.bankName,
    ref: s.ref,
    confidence: s.confidence,
    accountId: s.accountId,
    matchedTxId: s.matchedTxId,
    note: s.note,
    imageUrl: `/api/slip/${s.id}`,
  };
}

export default async function SlipsPage() {
  const session = await auth();
  if (!session) redirect("/sign-in");
  if (session.user.role !== "OWNER" && session.user.role !== "ACCOUNTANT") {
    redirect("/");
  }
  const business = await getCurrentBusiness();
  if (!business) {
    return (
      <div className="p-8">
        <PageHeader icon={ScanLine} title="ตรวจสลิป" />
        <p className="mt-4 text-red-600">
          คุณยังไม่ได้รับสิทธิ์เข้าถึงธุรกิจใดๆ — ติดต่อเจ้าของร้าน
        </p>
      </div>
    );
  }

  const aiOn = !!process.env.ANTHROPIC_API_KEY;

  const [accounts, categories, queue, recent, grouped] = await Promise.all([
    prisma.bankAccount.findMany({
      where: { businessId: business.id, active: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
    prisma.transactionCategory.findMany({
      where: { businessId: business.id, active: true },
      orderBy: [{ kind: "asc" }, { sortOrder: "asc" }],
      select: { id: true, name: true, kind: true },
    }),
    prisma.slip.findMany({
      where: { businessId: business.id, status: { in: ACTIVE } },
      orderBy: { createdAt: "desc" },
      take: 60,
    }),
    prisma.slip.findMany({
      where: {
        businessId: business.id,
        status: { in: ["CONFIRMED", "REJECTED"] },
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
    prisma.slip.groupBy({
      by: ["status"],
      where: { businessId: business.id },
      _count: { _all: true },
    }),
  ]);

  const counts: Record<string, number> = {};
  for (const g of grouped) counts[g.status] = g._count._all;

  // Candidate statement rows for each queued slip (+ ensure the current match is listed).
  const reviewData = await Promise.all(
    queue.map(async (s) => {
      let cands = await findCandidates(business.id, {
        accountId: s.accountId,
        amount: s.amount,
        transferAt: s.transferAt,
      });
      if (s.matchedTxId && !cands.find((c) => c.id === s.matchedTxId)) {
        const tx = await prisma.bankTransaction.findFirst({
          where: { id: s.matchedTxId, businessId: business.id },
          include: { account: { select: { name: true } } },
        });
        if (tx) {
          cands = [
            {
              id: tx.id,
              date: tx.date,
              deposit: tx.deposit,
              withdraw: tx.withdraw,
              description: tx.description,
              accountId: tx.accountId,
              accountName: tx.account.name,
              alreadyLinked: false,
            },
            ...cands,
          ];
        }
      }
      return {
        slip: serialize(s),
        candidates: cands.map((c) => ({
          id: c.id,
          label: `${c.date.toISOString().slice(0, 10)} · ${
            c.deposit > 0
              ? "ฝาก " + fmtTHB(c.deposit)
              : "ถอน " + fmtTHB(c.withdraw)
          } · ${c.description.slice(0, 36)} (${c.accountName})`,
          alreadyLinked: c.alreadyLinked,
        })),
      };
    })
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1000px] mx-auto space-y-6">
      <PageHeader
        icon={ScanLine}
        title="ตรวจสลิป"
        description={`${business.name} — อ่านสลิปโอนเงิน ตรวจกับ statement แล้วยืนยัน`}
      />

      {/* Summary chips */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
        <Chip
          icon={Inbox}
          label="รอตรวจ"
          value={(counts.REVIEW ?? 0) + (counts.PENDING ?? 0)}
          tone="sky"
        />
        <Chip
          icon={AlertTriangle}
          label="ยังไม่พบ statement"
          value={counts.UNMATCHED ?? 0}
          tone="amber"
        />
        <Chip
          icon={XCircle}
          label="อ่านไม่ได้"
          value={counts.FAILED ?? 0}
          tone="red"
        />
        <Chip
          icon={CheckCircle2}
          label="ยืนยันแล้ว"
          value={counts.CONFIRMED ?? 0}
          tone="emerald"
        />
      </div>

      <SlipUpload accounts={accounts} aiOn={aiOn} />

      {/* Review queue */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">
          คิวตรวจสลิป {reviewData.length > 0 && `(${reviewData.length})`}
        </h2>
        {reviewData.length === 0 ? (
          <p className="rounded-card border border-hairline bg-surface/40 px-5 py-8 text-center text-sm text-muted">
            ไม่มีสลิปที่รอตรวจ — อัปโหลดสลิปด้านบนเพื่อเริ่ม
          </p>
        ) : (
          reviewData.map((d) => (
            <SlipReview
              key={d.slip.id}
              slip={d.slip}
              candidates={d.candidates}
              accounts={accounts}
              categories={categories}
              aiOn={aiOn}
            />
          ))
        )}
      </section>

      {/* Recent decisions */}
      {recent.length > 0 && (
        <section className="rounded-card border border-hairline bg-canvas overflow-hidden">
          <header className="border-b border-hairline-soft px-5 py-3">
            <h2 className="text-sm font-semibold">ประวัติล่าสุด</h2>
          </header>
          <ul className="divide-y divide-hairline-soft text-xs">
            {recent.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-5 py-2">
                <a
                  href={`/api/slip/${s.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-ink/70 underline whitespace-nowrap"
                >
                  ดูรูป
                </a>
                <span
                  className={
                    "rounded-pill px-2 py-0.5 font-medium " +
                    (s.status === "CONFIRMED"
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-neutral-100 text-neutral-600")
                  }
                >
                  {s.status === "CONFIRMED" ? "ยืนยันแล้ว" : "ปฏิเสธ"}
                </span>
                <span className="flex-1 tabular-nums">
                  {s.amount != null ? fmtTHB(s.amount) : "-"}
                  {s.transferAt
                    ? ` · ${s.transferAt.toISOString().slice(0, 10)}`
                    : ""}
                  {s.bankName ? ` · ${s.bankName}` : ""}
                </span>
                <span className="text-muted">{s.confirmedByName ?? "—"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Chip({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Inbox;
  label: string;
  value: number;
  tone: "sky" | "amber" | "red" | "emerald";
}) {
  const cls = {
    sky: "text-sky-600",
    amber: "text-amber-600",
    red: "text-red-600",
    emerald: "text-emerald-600",
  }[tone];
  return (
    <div className="rounded-card border border-hairline bg-canvas px-3 py-2.5 flex items-center gap-2.5">
      <Icon className={`h-5 w-5 ${cls}`} strokeWidth={1.75} />
      <div>
        <div className="text-lg font-semibold tabular-nums leading-none">
          {value}
        </div>
        <div className="text-xs text-muted mt-0.5">{label}</div>
      </div>
    </div>
  );
}
