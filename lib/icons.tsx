import {
  LayoutDashboard,
  Calendar,
  TrendingUp,
  Settings,
  ReceiptText,
  Landmark,
  Users,
  type LucideIcon,
  // KPI / sections
  Wallet,
  Banknote,
  CreditCard,
  Coins,
  ChefHat,
  CupSoda,
  Package,
  Home,
  Zap,
  Globe,
  Smartphone,
  Bike,
  Megaphone,
  ShoppingCart,
  FolderArchive,
  UserRound,
  Receipt,
  Tag,
  Percent,
  Calculator,
  PiggyBank,
  // status / actions
  Check,
  X,
  Circle,
  AlertCircle,
  AlertTriangle,
  ArrowUpToLine,
  Upload,
  FileSpreadsheet,
  Trash2,
  Plus,
  History,
  ArrowUpRight,
  ArrowDownRight,
  ArrowLeftRight,
  RefreshCw,
  Building2,
  ChartBar,
  ChartLine,
  Target,
  CalendarDays,
  CalendarRange,
  ClipboardCheck,
  CloudCog,
} from "lucide-react";

/** Single navigation icon table — keyed by route href */
export const NAV_ICONS: Record<string, LucideIcon> = {
  "/": LayoutDashboard,
  "/daily-pl": Calendar,
  "/monthly-pl": TrendingUp,
  "/closing": ClipboardCheck,
  "/cost-setup": Settings,
  "/pos-sales": ReceiptText,
  "/bank": Landmark,
  "/admin/users": Users,
  "/admin/businesses": Building2,
  "/admin/google": CloudCog,
};

/** Fixed cost category icons (matches FixedCostCategory.name) */
export const FIXED_CAT_ICONS: Record<string, LucideIcon> = {
  ค่าเช่า: Home,
  "ค่าไฟ + น้ำ": Zap,
  ค่าส่วนกลาง: Building2,
  "อินเทอร์เน็ต / โทรศัพท์": Globe,
  "Subscriptions (Monomax/Canva/etc)": Smartphone,
  "Platform GP (Lineman/Grab/Wokboy)": Bike,
  "Marketing / โฆษณา": Megaphone,
  "ซื้อของเข้าร้าน / Office": ShoppingCart,
  ค่าใช้จ่ายเบ็ดเตล็ด: FolderArchive,
};

/** Supplier-category icons */
export const SUPPLIER_CAT_ICONS: Record<
  "FOOD" | "BEVERAGE" | "PACKAGING",
  LucideIcon
> = {
  FOOD: ChefHat,
  BEVERAGE: CupSoda,
  PACKAGING: Package,
};

/** Common semantic icons used in pages — re-export so pages import from one place */
export {
  LayoutDashboard,
  Calendar,
  CalendarDays,
  CalendarRange,
  TrendingUp,
  Settings,
  ReceiptText,
  Landmark,
  Users,
  UserRound,
  Wallet,
  Banknote,
  CreditCard,
  Coins,
  ChefHat,
  CupSoda,
  Package,
  Home,
  Zap,
  Globe,
  Smartphone,
  Bike,
  Megaphone,
  ShoppingCart,
  FolderArchive,
  Receipt,
  Tag,
  Percent,
  Calculator,
  PiggyBank,
  Check,
  X,
  Circle,
  AlertCircle,
  AlertTriangle,
  ArrowUpToLine,
  Upload,
  FileSpreadsheet,
  Trash2,
  Plus,
  History,
  ArrowUpRight,
  ArrowDownRight,
  ArrowLeftRight,
  RefreshCw,
  Building2,
  ChartBar,
  ChartLine,
  Target,
};

export type { LucideIcon };

// ─── Reusable inline atoms ───

/** Small colored dot used for status (replaces 🟢🔵🟡🔴 emojis) */
export function StatusDot({
  tone,
  size = "md",
}: {
  tone: "emerald" | "sky" | "amber" | "red" | "slate";
  size?: "sm" | "md";
}) {
  const sz = size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2";
  const color = {
    emerald: "bg-emerald-500",
    sky: "bg-sky-500",
    amber: "bg-amber-500",
    red: "bg-red-500",
    slate: "bg-slate-300",
  }[tone];
  return (
    <span
      className={`inline-block rounded-full ${sz} ${color}`}
      aria-hidden="true"
    />
  );
}
