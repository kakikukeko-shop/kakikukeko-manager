"use client";

import React, {
  ChangeEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { supabase } from "@/lib/supabase";
import SafeModal from "../../components/SafeModal";
import ImportCertificatePanel from "../../components/ImportCertificatePanel";

type PurchaseRow = {
  id: string;
  created_at: string;
  supplier: string | null;
  purchase_date: string | null;
  payment_met: string | null;
  card_name: string | null;
  currency: string | null;
  fx_rate: number | null;
  total_foreign: number | null;
  total_amount: number | null;
  memo: string | null;
  points_used?: number;
  points_earned?: number;
};

type PurchasePaymentRow = {
  id: string;
  created_at: string;
  purchase_id: string;
  payment_date: string | null;
  payment_method: string | null;
  card_name: string | null;
  currency: string | null;
  foreign_amount: number | null;
  krw_amount: number | null;
  fx_rate: number | null;
  memo: string | null;
};

type DraftPayment = {
  key: string;
  payment_date: string;
  payment_method: string;
  card_name: string;
  currency: string;
  currency_custom: string;
  foreign_amount: string;
  krw_amount: string;
  memo: string;
};

type DraftPurchaseCost = {
  key: string;
  cost_type: string;
  currency: string;
  currency_custom: string;
  foreign_amount: string;
  krw_amount: string;
  vendor_name: string;
  cost_date: string;
  memo: string;
};

type ProductType = "피규어" | "가챠" | "랜덤박스" | "기타";

const PRODUCT_TYPE_OPTIONS: ProductType[] = [
  "피규어",
  "가챠",
  "랜덤박스",
  "기타",
];

type PurchaseItemRow = {
  id: string;
  created_at: string;
  purchase_id: string;
  item_name: string | null;
  qty: number | null;
  foreign_total: number | null;
  foreign_unit_price: number | null;
  unit_price: number | null;
  line_total: number | null;
  memo: string | null;
  is_preorder: boolean | null;
  product_type: ProductType | null;
};

type PurchaseCostRow = {
  id: string;
  created_at: string;
  purchase_id: string | null;
  cost_type: string | null;
  amount: number | null;
  currency: string | null;
  fx_rate: number | null;
  memo: string | null;
  vendor_name: string | null;
  cost_date?: string | null;
};

type CostAllocationRow = {
  purchase_cost_id: string;
  purchase_item_id: string;
  allocated_amount: number | null;
};

type ArrivalRow = {
  purchase_item_id: string;
  arrived_qty: number | null;
};

type VendorRow = {
  id: string;
  created_at: string;
  name: string | null;
  is_product_supplier: boolean | null;
  is_forwarder: boolean | null;
  is_carry_in: boolean | null;
  is_customs_broker: boolean | null;
  is_active: boolean | null;
};

type VendorWalletTopupRow = {
  id: string;
  created_at: string;
  vendor_name: string;
  currency: string;
  topup_date: string;
  foreign_amount: number;
  krw_amount: number;
  fx_rate: number;
  remaining_foreign: number;
  memo: string | null;
};

type WalletQuotePart = {
  topupId: string;
  foreign: number;
  krw: number;
  fxRate: number;
};

type WalletQuote = {
  ok: boolean;
  balance: number;
  needed: number;
  productKRW: number;
  shippingKRW: number;
  feeKRW: number;
  totalKRW: number;
  productParts: WalletQuotePart[];
  shippingParts: WalletQuotePart[];
  feeParts: WalletQuotePart[];
};

type FileRow = {
  id: string;
  purchase_id: string | null;
  item_id: string | null;
  cost_id: string | null;
  file_type: string | null;
  file_name: string | null;
  file_path: string | null;
  created_at: string;
};

type DraftItem = {
  id?: string;
  key: string;
  item_name: string;
  qty: string;
  foreign_unit_price: string;
  foreign_total: string;
  memo: string;
  is_preorder: boolean;
  product_type: ProductType;
  photoFile?: File | null;
  existingPhotoPath?: string | null;
};

type ItemAllocationView = {
  cost_id?: string | null;
  cost_type: string | null;
  amount_krw: number;
  created_at: string;
  memo: string | null;
  vendor_name: string | null;
  related_item_names: string[];
  cost_date?: string | null;
};

type DraftPreviewRow = {
  key: string;
  qty: number;
  isBlank: boolean;
  enteredForeign: number;
  previewForeignTotal: number;
  previewForeignUnit: number;
  previewKRWTotal: number;
  previewKRWUnit: number;
};

type RefundItemEdit = {
  item_name: string;
  next_qty: string;
};

type RefundMetaItem = {
  item_id: string;
  original_name: string;
  original_qty: number;
  original_foreign_total: number;
  original_line_total: number;
  original_foreign_unit_price: number;
  original_unit_price: number;
  override_name: string;
  override_qty: number;
};

const REFUND_META_HEADER = "[환불 상세]";

function stripRefundMetaDetail(raw: string | null | undefined) {
  const text = String(raw ?? "").trim();
  if (!text) return "";

  // 환불 내부 메타(JSON)는 저장용이며 화면에는 보이지 않게 한다.
  // 예전 데이터처럼 앞뒤에 안내문이 섞여 있어도 [환불 상세]부터
  // JSON 객체 끝까지 찾아 안전하게 제거한다.
  const markerIndex = text.indexOf(REFUND_META_HEADER);
  if (markerIndex < 0) return text;

  const before = text.slice(0, markerIndex).trim();
  const afterHeader = text
    .slice(markerIndex + REFUND_META_HEADER.length)
    .trimStart();

  if (!afterHeader.startsWith("{")) {
    return before;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  let endIndex = -1;

  for (let i = 0; i < afterHeader.length; i += 1) {
    const ch = afterHeader[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        endIndex = i + 1;
        break;
      }
    }
  }

  // JSON이 깨진 예전 데이터도 내부 메타가 노출되지 않도록 숨긴다.
  if (endIndex < 0) return before;

  const after = afterHeader.slice(endIndex).replace(/^\s+/, "").trim();
  return [before, after].filter(Boolean).join("\n\n").trim();
}

type RefundKind = "product" | "price_adjustment";

function parseRefundMeta(memo: string | null | undefined): {
  items: RefundMetaItem[];
  kind: RefundKind;
} {
  const text = (memo ?? "").trim();
  if (!text.startsWith(REFUND_META_HEADER))
    return { items: [] as RefundMetaItem[], kind: "product" };

  const payload = text.split("\n\n")[0].replace(REFUND_META_HEADER, "").trim();
  if (!payload) return { items: [] as RefundMetaItem[], kind: "product" };

  try {
    const parsed = JSON.parse(payload);
    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    return {
      kind: parsed?.kind === "price_adjustment" ? "price_adjustment" : "product",
      items: items
        .map((item: any) => ({
          item_id: String(item?.item_id ?? ""),
          original_name: String(item?.original_name ?? ""),
          original_qty: Math.max(1, Math.floor(n(item?.original_qty))),
          original_foreign_total: ceil4(n(item?.original_foreign_total)),
          original_line_total: ceil4(n(item?.original_line_total)),
          original_foreign_unit_price: ceil4(
            n(item?.original_foreign_unit_price),
          ),
          original_unit_price: ceil4(n(item?.original_unit_price)),
          override_name: String(item?.override_name ?? ""),
          override_qty: Math.max(0, Math.floor(n(item?.override_qty))),
        }))
        .filter((item: RefundMetaItem) => item.item_id),
    };
  } catch {
    return { items: [] as RefundMetaItem[], kind: "product" };
  }
}

function getRefundMetaItemIds(memo: string | null | undefined) {
  return parseRefundMeta(memo)
    .items.map((item) => item.item_id)
    .filter(Boolean);
}

function buildRefundMetaItems(
  selectedItems: PurchaseItemRow[],
  refundMap: Record<string, RefundItemEdit>,
  existingMemo?: string | null,
): RefundMetaItem[] {
  const existing = new Map<string, RefundMetaItem>(
    parseRefundMeta(existingMemo).items.map(
      (item: RefundMetaItem): [string, RefundMetaItem] => [item.item_id, item],
    ),
  );

  return selectedItems.map((it) => {
    const edit = refundMap[it.id];
    const prev = existing.get(it.id);
    const originalQty =
      prev?.original_qty ?? Math.max(1, Math.floor(n(it.qty)));
    const originalForeignUnit =
      prev?.original_foreign_unit_price ??
      (n(it.foreign_unit_price) > 0
        ? n(it.foreign_unit_price)
        : ceil4(n(it.foreign_total) / Math.max(1, Math.floor(n(it.qty)))));
    const originalUnitPrice =
      prev?.original_unit_price ??
      (n(it.unit_price) > 0
        ? n(it.unit_price)
        : ceil4(n(it.line_total) / Math.max(1, Math.floor(n(it.qty)))));

    return {
      item_id: it.id,
      original_name: prev?.original_name ?? String(it.item_name ?? ""),
      original_qty: originalQty,
      original_foreign_total:
        prev?.original_foreign_total ??
        ceil4(originalForeignUnit * originalQty),
      original_line_total:
        prev?.original_line_total ?? ceil4(originalUnitPrice * originalQty),
      original_foreign_unit_price: ceil4(originalForeignUnit),
      original_unit_price: ceil4(originalUnitPrice),
      override_name: edit?.item_name?.trim() || String(it.item_name ?? ""),
      override_qty: Math.max(0, Math.floor(n(edit?.next_qty ?? it.qty))),
    } as RefundMetaItem;
  });
}

function buildRefundMemo(
  baseMemo: string,
  items: RefundMetaItem[],
  kind: RefundKind = "product",
) {
  const detail = `${REFUND_META_HEADER}
${JSON.stringify({ kind, items }, null, 2)}`;
  const cleanedBase = stripRefundMetaDetail(baseMemo);
  return cleanedBase
    ? `${detail}

${cleanedBase}`
    : detail;
}

function getRefundLossInfo(
  selectedItems: PurchaseItemRow[],
  refundMap: Record<string, RefundItemEdit>,
  actualRefundKRW: number,
  existingMemo?: string | null,
) {
  const existing = new Map<string, RefundMetaItem>(
    parseRefundMeta(existingMemo).items.map(
      (item): [string, RefundMetaItem] => [item.item_id, item],
    ),
  );

  const rows = selectedItems.map((it) => {
    const prev = existing.get(it.id);
    const currentQty = Math.max(0, Math.floor(n(it.qty)));
    const originalQty = prev?.original_qty ?? currentQty;
    const originalUnitKRW =
      prev?.original_unit_price ??
      (n(it.unit_price) > 0
        ? n(it.unit_price)
        : currentQty > 0
          ? ceil4(n(it.line_total) / currentQty)
          : 0);
    const edit = refundMap[it.id];
    const nextQty = Math.max(0, Math.floor(n(edit?.next_qty ?? currentQty)));
    const refundQty = Math.max(0, originalQty - nextQty);
    const targetKRW = ceil4(originalUnitKRW * refundQty);

    return {
      item_id: it.id,
      refund_qty: refundQty,
      target_krw: targetKRW,
    };
  });

  const targetKRW = ceil4(rows.reduce((acc, row) => acc + row.target_krw, 0));
  const actualKRW = ceil4(Math.max(0, actualRefundKRW));
  const lossKRW = ceilInt(Math.max(0, targetKRW - actualKRW));
  const profitKRW = ceilInt(Math.max(0, actualKRW - targetKRW));

  // 양수면 차손(환불 처리한 해당 상품의 남은 원가에 더해짐), 음수면 차익(해당 상품 원가에서 차감됨)
  const adjustmentKRW = ceilInt(targetKRW - actualKRW);

  return { rows, targetKRW, actualKRW, lossKRW, profitKRW, adjustmentKRW };
}

function buildRefundSummaryMemo(
  baseMemo: string,
  items: RefundMetaItem[],
  info: ReturnType<typeof getRefundLossInfo>,
  kind: RefundKind = "product",
) {
  const summary = [
    `환불 대상 원가:${Math.round(info.targetKRW)}`,
    `실제 환불금액:${Math.round(info.actualKRW)}`,
    `환불 차손:${Math.round(info.lossKRW)}`,
    `환불 차익:${Math.round(info.profitKRW)}`,
    `환불 원가조정:${Math.round(info.adjustmentKRW)}`,
  ].join("\n");

  const memo = baseMemo?.trim() ? `${summary}\n\n${baseMemo.trim()}` : summary;
  return buildRefundMemo(memo, items, kind);
}

function parseRefundSummaryMemo(memo: string | null | undefined) {
  const raw = stripRefundMetaDetail(memo);
  const getNum = (label: string) => {
    const m = raw.match(new RegExp(`${label}:\\s*(-?[0-9.,]+)`));
    if (!m) return 0;
    return n(String(m[1]).replace(/,/g, ""));
  };

  const legacyOverRefundKRW = getNum("초과 환불");
  const profitKRW = getNum("환불 차익") || legacyOverRefundKRW;
  const adjustmentFromMemo = getNum("환불 원가조정");

  return {
    targetKRW: getNum("환불 대상 원가"),
    actualKRW: getNum("실제 환불금액"),
    lossKRW: getNum("환불 차손"),
    profitKRW,
    adjustmentKRW:
      adjustmentFromMemo !== 0
        ? adjustmentFromMemo
        : getNum("환불 차손") > 0
          ? getNum("환불 차손")
          : profitKRW > 0
            ? -profitKRW
            : 0,
  };
}

type RefundItemAdjustment = {
  item_id: string;
  target_krw: number;
  actual_refund_krw: number;
  adjustment_krw: number;
};

/**
 * 환불 차손/차익은 같은 매입의 다른 상품으로 퍼뜨리지 않는다.
 * 환불 처리한 상품 행에만 배분해서, 부분환불이면 남은 그 상품의 단가만 올라가거나 내려간다.
 */
function getRefundItemAdjustments(
  selectedItems: PurchaseItemRow[],
  refundMap: Record<string, RefundItemEdit>,
  actualRefundKRW: number,
  existingMemo?: string | null,
): RefundItemAdjustment[] {
  const info = getRefundLossInfo(
    selectedItems,
    refundMap,
    actualRefundKRW,
    existingMemo,
  );

  if (info.rows.length === 0) return [];

  // 한 번에 여러 상품을 환불한 경우에만 실제 환불금액을 각 상품의
  // "환불 대상 원가" 비율로 나눠 계산한다. 한 상품만 선택하면 전액이 그 상품에만 적용된다.
  const actualParts = distributeByWeightsCeilIntSigned(
    Math.round(info.actualKRW),
    info.rows.map((row) => Math.max(0, row.target_krw)),
  );

  const rows = info.rows
    .map((row, idx) => {
      const edit = refundMap[row.item_id];
      const nextQty = Math.max(0, Math.floor(n(edit?.next_qty)));

      return {
        item_id: row.item_id,
        target_krw: row.target_krw,
        actual_refund_krw: actualParts[idx] ?? 0,
        adjustment_krw:
          nextQty > 0
            ? Math.round(row.target_krw) - (actualParts[idx] ?? 0)
            : 0,
      };
    })
    // 전체환불되어 남은 수량이 0인 상품에는 차손·차익을 원가로 붙이지 않는다.
    // 차손·차익 금액 자체는 purchase_costs의 환불 기록에 남아 대시보드 손익에 반영된다.
    .filter((row) => row.adjustment_krw !== 0);

  return rows;
}

async function restoreRefundAdjustedItemsFromMemo(
  memo: string | null | undefined,
) {
  const parsed = parseRefundMeta(memo);
  for (const item of parsed.items) {
    const upd = await supabase
      .from("purchase_items")
      .update({
        item_name: item.original_name || null,
        qty: item.original_qty,
        foreign_total: item.original_foreign_total,
        line_total: item.original_line_total,
        foreign_unit_price: item.original_foreign_unit_price,
        unit_price: item.original_unit_price,
      })
      .eq("id", item.item_id);
    if (upd.error) throw upd.error;
  }
}

const STORAGE_BUCKET = "purchase-files";
const PURCHASE_DRAFT_STORAGE_KEY = "kakikukeko-purchase-draft-v2";
const SHIPPING_REALLOCATION_DONE_KEY =
  "kakikukeko-shipping-reallocation-by-quantity-v1";

const CURRENCY_OPTIONS = [
  { value: "KRW", label: "KRW(원)" },
  { value: "USD", label: "USD(달러)" },
  { value: "JPY", label: "JPY(엔)" },
  { value: "CNY", label: "CNY(위안)" },
  { value: "EUR", label: "EUR(유로)" },
  { value: "직접입력", label: "직접입력" },
] as const;

const COST_TYPE_OPTIONS = [
  "배송비(거래처)",
  "배송비(배대지)",
  "수수료",
  "관부과세",
  "잔금",
  "카드할인",
  "할인/쿠폰",
  "기타",
  "환불",
] as const;

const PURCHASE_SORT_OPTIONS = [
  { value: "recent", label: "최근순" },
  { value: "oldest", label: "오래된순" },
  { value: "name", label: "이름순" },
  { value: "amount_desc", label: "총원화 큰순" },
  { value: "amount_asc", label: "총원화 작은순" },
] as const;

const PURCHASE_FILTER_OPTIONS = [
  { value: "all", label: "전체 보기" },
  { value: "unreceived", label: "미입고만 보기" },
  { value: "refund_pending", label: "환불 진행중만 보기" },
  { value: "refunded", label: "환불상품만 보기" },
] as const;

const ITEM_SORT_OPTIONS = [
  { value: "amount_desc", label: "원화합계 높은순" },
  { value: "amount_asc", label: "원화합계 낮은순" },
  { value: "name", label: "이름순" },
  { value: "final_unit_desc", label: "최종단가 높은순" },
  { value: "final_unit_asc", label: "최종단가 낮은순" },
  { value: "qty_desc", label: "수량 많은순" },
  { value: "qty_asc", label: "수량 작은순" },
] as const;

const RELATED_COST_SORT_OPTIONS = [
  { value: "date_desc", label: "날짜 최신순" },
  { value: "date_asc", label: "날짜 오래된순" },
  { value: "amount_desc", label: "금액 높은순" },
  { value: "amount_asc", label: "금액 낮은순" },
  { value: "name", label: "이름순" },
] as const;

function normalizeCostType(raw: string | null | undefined) {
  const v = String(raw ?? "").trim();
  if (!v) return "";
  if (v === "배송비") return "배송비(거래처)";
  if (v === "관부과세및 배송비") return "관부과세";
  return v;
}

function getCostReceiptFileType(costType: string | null | undefined) {
  const type = normalizeCostType(costType);
  if (type === "관부과세") return "관부과세영수증";
  if (type === "잔금") return "잔금비용영수증";
  if (type === "카드할인" || type === "할인/쿠폰") return "카드할인증빙";
  if (type === "기타") return "기타비용영수증";
  if (type === "환불") return "환불증빙";
  if (type === "배송비(거래처)" || type === "배송비(배대지)")
    return "배송비영수증";
  return "추가비용영수증";
}

function isImportDocCostType(costType: string | null | undefined) {
  return normalizeCostType(costType) === "관부과세";
}

function n(v: any): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function ceilInt(v: number) {
  return Math.ceil(v);
}

function round4(v: number) {
  return Math.round(v * 10000) / 10000;
}

function ceil4(v: number) {
  return Math.ceil(v * 10000) / 10000;
}

function fmtKRW(v: number) {
  return `${Math.round(v).toLocaleString("ko-KR")}원`;
}

function fmtNum(v: number) {
  return Number.isFinite(v) ? v.toLocaleString("ko-KR", { maximumFractionDigits: 4 }) : "0";
}

function fmtDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("ko-KR");
  } catch {
    return iso;
  }
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "미입력";
  return iso;
}

function normalizeCurrencyCode(raw: string | null | undefined) {
  const v = (raw ?? "").trim().toUpperCase();
  if (v === "RMB") return "CNY";
  return v;
}

function normalizeCurrencySelectValue(raw: string | null | undefined) {
  const normalized = normalizeCurrencyCode(raw);
  const builtIn = CURRENCY_OPTIONS.map((x) => x.value);
  if (builtIn.includes(normalized as any)) return normalized;
  if (!raw) return "USD";
  return "직접입력";
}

function currencyValue(sel: string, custom: string) {
  if (sel === "직접입력") return custom.trim().toUpperCase();
  return normalizeCurrencyCode(sel);
}

function currencyLabel(raw: string | null | undefined) {
  const normalized = normalizeCurrencyCode(raw);
  const found = CURRENCY_OPTIONS.find((x) => x.value === normalized);
  if (found) return found.label;
  return raw?.trim() || "미입력";
}

function calcFxRate(totalKRW: number, totalForeign: number) {
  if (totalKRW > 0 && totalForeign > 0) return totalKRW / totalForeign;
  return 0;
}

function toKRW(amount: number, cur: string, fxRate: number) {
  if (normalizeCurrencyCode(cur) === "KRW") return amount;
  return amount * fxRate;
}

function formatDateInput(raw: string) {
  let v = raw.replace(/[^0-9]/g, "").slice(0, 8);
  if (v.length >= 5) v = `${v.slice(0, 4)}-${v.slice(4)}`;
  if (v.length >= 8) v = `${v.slice(0, 7)}-${v.slice(7)}`;
  return v;
}

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function stripCustomsMemoDetail(raw: string | null | undefined) {
  const text = (raw ?? "").trim();
  if (!text) return "";
  if (!text.startsWith("[관부과세 상세]")) return text;

  const parts = text.split("\n\n");
  if (parts.length <= 1) return "";
  return parts.slice(1).join("\n\n").trim();
}

function buildCustomsMemo(
  baseMemo: string,
  duty: string,
  vat: string,
  customsFee: string,
) {
  const detail = [
    "[관부과세 상세]",
    `관세:${n(duty)}`,
    `부가세:${n(vat)}`,
    `통관수수료:${n(customsFee)}`,
  ].join("\n");

  const cleanedBase = stripCustomsMemoDetail(baseMemo);
  return cleanedBase
    ? `${detail}

${cleanedBase}`
    : detail;
}

function parseCustomsMemo(memo: string | null | undefined) {
  const raw = memo ?? "";

  const getNum = (label: string) => {
    const m = raw.match(new RegExp(`${label}:\s*([0-9.,]+)`));
    if (!m) return "";
    return String(n(String(m[1]).replace(/,/g, "")));
  };

  return {
    duty: getNum("관세"),
    vat: getNum("부가세"),
    customsFee: getNum("통관수수료"),
  };
}

function customsTotal(duty: string, vat: string, customsFee: string) {
  return n(duty) + n(vat) + n(customsFee);
}

function formatCustomsDetailInline(memo: string | null | undefined) {
  const parsed = parseCustomsMemo(memo);
  const parts: string[] = [];
  if (n(parsed.duty) > 0) parts.push(`관세 ${fmtKRW(n(parsed.duty))}`);
  if (n(parsed.vat) > 0) parts.push(`부가세 ${fmtKRW(n(parsed.vat))}`);
  if (n(parsed.customsFee) > 0)
    parts.push(`통관수수료 ${fmtKRW(n(parsed.customsFee))}`);
  return parts.join(" / ");
}


const COMBINED_PAYMENT_META_HEADER = "[상품배송비 함께결제]";
const INCLUDED_SHIPPING_MEMO_HEADER = "[상품과 함께 결제한 배송비]";

type CombinedPaymentMeta = {
  enabled: boolean;
  product_foreign: number;
  shipping_foreign: number;
  fee_foreign: number;
  total_foreign: number;
  product_krw: number;
  shipping_krw: number;
  fee_krw: number;
  shipping_vendor: string;
};

function parseCombinedPaymentMeta(
  raw: string | null | undefined,
): CombinedPaymentMeta | null {
  const text = String(raw ?? "");
  const markerIndex = text.indexOf(COMBINED_PAYMENT_META_HEADER);
  if (markerIndex < 0) return null;

  const after = text
    .slice(markerIndex + COMBINED_PAYMENT_META_HEADER.length)
    .trimStart();
  const firstLine = after.split("\n")[0]?.trim();
  if (!firstLine) return null;

  try {
    const parsed = JSON.parse(firstLine);
    return {
      enabled: !!parsed?.enabled,
      product_foreign: Math.max(0, n(parsed?.product_foreign)),
      shipping_foreign: Math.max(0, n(parsed?.shipping_foreign)),
      fee_foreign: Math.max(0, n(parsed?.fee_foreign)),
      total_foreign: Math.max(0, n(parsed?.total_foreign)),
      product_krw: Math.max(0, Math.round(n(parsed?.product_krw))),
      shipping_krw: Math.max(0, Math.round(n(parsed?.shipping_krw))),
      fee_krw: Math.max(0, Math.round(n(parsed?.fee_krw))),
      shipping_vendor: String(parsed?.shipping_vendor ?? ""),
    };
  } catch {
    return null;
  }
}

function stripCombinedPaymentMeta(raw: string | null | undefined) {
  const text = String(raw ?? "").trim();
  const markerIndex = text.indexOf(COMBINED_PAYMENT_META_HEADER);
  if (markerIndex < 0) return text;

  const before = text.slice(0, markerIndex).trim();
  const after = text
    .slice(markerIndex + COMBINED_PAYMENT_META_HEADER.length)
    .trimStart();
  const lines = after.split("\n");
  lines.shift();
  const rest = lines.join("\n").trim();

  return [before, rest].filter(Boolean).join("\n\n").trim();
}

function buildCombinedPaymentMemo(
  baseMemo: string,
  meta: CombinedPaymentMeta | null,
) {
  const cleaned = stripCombinedPaymentMeta(baseMemo);
  if (!meta?.enabled) return cleaned || null;

  const detail = `${COMBINED_PAYMENT_META_HEADER}\n${JSON.stringify(meta)}`;
  return cleaned ? `${detail}\n\n${cleaned}` : detail;
}

function normalizeName(v?: string | null) {
  return String(v ?? "")
    .trim()
    .toLowerCase();
}

function distributeByWeightsCeil(total: number, weights: number[]) {
  const safeTotal = Math.max(0, ceil4(total));
  const safeWeights = weights.map((w) => Math.max(0, n(w)));
  const weightSum = safeWeights.reduce((acc, w) => acc + w, 0);

  if (safeWeights.length === 0) return [] as number[];

  if (safeTotal <= 0) {
    return safeWeights.map(() => 0);
  }

  if (weightSum <= 0) {
    const evenWeight = safeWeights.map(() => 1);
    return distributeByWeightsCeil(safeTotal, evenWeight);
  }

  const result = safeWeights.map((w) => ceil4((safeTotal * w) / weightSum));
  const sum = round4(result.reduce((acc, v) => acc + v, 0));
  const diff = round4(sum - safeTotal);

  if (Math.abs(diff) <= 0.0001) return result;

  let targetIdx = 0;
  let maxWeight = -1;
  safeWeights.forEach((w, idx) => {
    if (w > maxWeight) {
      maxWeight = w;
      targetIdx = idx;
    }
  });

  result[targetIdx] = ceil4(Math.max(0, result[targetIdx] - diff));

  const fixedSum = round4(result.reduce((acc, v) => acc + v, 0));
  const remain = round4(safeTotal - fixedSum);

  if (Math.abs(remain) > 0.0001) {
    result[targetIdx] = ceil4(result[targetIdx] + remain);
  }

  return result.map((v) => ceil4(v));
}

function distributeByWeightsCeilIntSigned(total: number, weights: number[]) {
  const sign = total < 0 ? -1 : 1;
  const safeTotal = Math.max(0, Math.round(Math.abs(total)));
  const safeWeights = weights.map((w) => Math.max(0, n(w)));
  const weightSum = safeWeights.reduce((acc, w) => acc + w, 0);

  if (safeWeights.length === 0) return [] as number[];
  if (safeTotal <= 0) return safeWeights.map(() => 0);

  if (weightSum <= 0) {
    return distributeByWeightsCeilIntSigned(
      sign * safeTotal,
      safeWeights.map(() => 1),
    );
  }

  const result = safeWeights.map((w) => Math.ceil((safeTotal * w) / weightSum));
  const sum = result.reduce((acc, v) => acc + v, 0);
  const diff = sum - safeTotal;

  let targetIdx = 0;
  let maxWeight = -1;
  safeWeights.forEach((w, idx) => {
    if (w > maxWeight) {
      maxWeight = w;
      targetIdx = idx;
    }
  });

  result[targetIdx] = Math.max(0, result[targetIdx] - diff);
  const fixedSum = result.reduce((acc, v) => acc + v, 0);
  const remain = safeTotal - fixedSum;
  if (remain !== 0) result[targetIdx] += remain;

  return result.map((v) => v * sign);
}

function signedCostAmountByType(costType: string, amount: number) {
  const normalized = normalizeCostType(costType);
  const absolute = Math.abs(amount);
  return normalized === "카드할인" || normalized === "할인/쿠폰"
    ? -absolute
    : absolute;
}

function isShippingCostType(costType: string | null | undefined) {
  const normalized = normalizeCostType(costType);
  return (
    normalized === "배송비(거래처)" ||
    normalized === "배송비(배대지)"
  );
}

type CostAllocationBasis = "auto" | "quantity" | "amount";

const COST_ALLOCATION_BASIS_META_RE =
  /\[추가비용 배분기준:(auto|quantity|amount)\]/;

function parseCostAllocationBasis(
  memo: string | null | undefined,
): CostAllocationBasis {
  const match = String(memo ?? "").match(COST_ALLOCATION_BASIS_META_RE);
  const value = match?.[1];
  return value === "quantity" || value === "amount" ? value : "auto";
}

function hasCostAllocationBasisMeta(memo: string | null | undefined) {
  return COST_ALLOCATION_BASIS_META_RE.test(String(memo ?? ""));
}

function stripCostAllocationBasisMeta(raw: string | null | undefined) {
  return String(raw ?? "")
    .replace(COST_ALLOCATION_BASIS_META_RE, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildCostAllocationBasisMemo(
  baseMemo: string | null | undefined,
  basis: CostAllocationBasis,
) {
  const cleaned = stripCostAllocationBasisMeta(baseMemo);
  const meta = `[추가비용 배분기준:${basis}]`;
  return cleaned ? `${cleaned}\n\n${meta}` : meta;
}

function getEffectiveCostAllocationBasis(
  costType: string | null | undefined,
  basis: CostAllocationBasis,
): Exclude<CostAllocationBasis, "auto"> {
  if (basis === "quantity" || basis === "amount") return basis;
  return isShippingCostType(costType) ? "quantity" : "amount";
}

function getCostAllocationBasisLabel(
  costType: string | null | undefined,
  basis: CostAllocationBasis,
) {
  const effective = getEffectiveCostAllocationBasis(costType, basis);
  if (basis === "auto") {
    return `자동(${effective === "quantity" ? "수량비율" : "금액비율"})`;
  }
  return effective === "quantity" ? "수량비율" : "금액비율";
}

function getCostAllocationWeights(
  costType: string | null | undefined,
  rows: Array<{
    qty?: number | null;
    line_total?: number | null;
    foreign_total?: number | null;
  }>,
  basis: CostAllocationBasis = "auto",
) {
  const effective = getEffectiveCostAllocationBasis(costType, basis);
  if (effective === "quantity") {
    return rows.map((row) => Math.max(0, n(row.qty)));
  }

  return rows.map((row) => {
    const lineTotal = Math.max(0, n(row.line_total));
    return lineTotal > 0 ? lineTotal : Math.max(0, n(row.foreign_total));
  });
}

type ResolvedCostForeignRow = {
  item_id: string;
  item_name: string;
  qty: number;
  was_blank: boolean;
  entered_foreign_total: number;
  foreign_total: number;
};

function resolveCostForeignTotals(
  selectedItems: PurchaseItemRow[],
  foreignMap: Record<string, string>,
  totalForeign: number,
) {
  const rows: ResolvedCostForeignRow[] = selectedItems.map((it) => {
    const raw = String(foreignMap[it.id] ?? "").trim();
    return {
      item_id: it.id,
      item_name: it.item_name ?? "(이름 없음)",
      qty: Math.max(1, n(it.qty)),
      was_blank: raw === "",
      entered_foreign_total: ceil4(Math.max(0, n(raw))),
      foreign_total: 0,
    };
  });

  if (rows.length === 0) {
    return {
      ok: false as const,
      message: "배분할 상품을 1개 이상 선택해줘.",
      rows: [] as ResolvedCostForeignRow[],
    };
  }

  const total = ceil4(Math.max(0, totalForeign));
  if (total <= 0) {
    return {
      ok: false as const,
      message: "외화 총액을 입력해줘.",
      rows: [] as ResolvedCostForeignRow[],
    };
  }

  const blankIdx = rows
    .map((row, idx) => (row.was_blank ? idx : -1))
    .filter((idx) => idx >= 0);
  const filledIdx = rows
    .map((row, idx) => (!row.was_blank ? idx : -1))
    .filter((idx) => idx >= 0);

  if (filledIdx.length === 0) {
    const distributed = distributeByWeightsCeil(
      total,
      rows.map((r) => Math.max(1, r.qty)),
    );
    distributed.forEach((value, idx) => {
      rows[idx].foreign_total = value;
    });
    return { ok: true as const, message: "", rows };
  }

  if (blankIdx.length > 0) {
    const filledSum = round4(
      filledIdx.reduce((acc, idx) => acc + rows[idx].entered_foreign_total, 0),
    );
    const remain = round4(total - filledSum);

    if (remain < -0.0001) {
      return {
        ok: false as const,
        message: `입력한 상품 외화총합이 외화 총액보다 커. 외화 총액(${fmtNum(total)}) 안에서 맞춰줘.`,
        rows: [] as ResolvedCostForeignRow[],
      };
    }

    filledIdx.forEach((idx) => {
      rows[idx].foreign_total = rows[idx].entered_foreign_total;
    });
    const distributed = distributeByWeightsCeil(
      remain,
      blankIdx.map((idx) => Math.max(1, rows[idx].qty)),
    );
    blankIdx.forEach((idx, order) => {
      rows[idx].foreign_total = distributed[order];
    });
    return { ok: true as const, message: "", rows };
  }

  const enteredSum = round4(
    rows.reduce((acc, row) => acc + row.entered_foreign_total, 0),
  );
  if (Math.abs(enteredSum - total) <= 0.0001) {
    rows.forEach((row) => {
      row.foreign_total = row.entered_foreign_total;
    });
    return { ok: true as const, message: "", rows };
  }

  const distributed = distributeByWeightsCeil(
    total,
    rows.map((r) => Math.max(0, r.entered_foreign_total)),
  );
  distributed.forEach((value, idx) => {
    rows[idx].foreign_total = value;
  });
  return { ok: true as const, message: "", rows };
}

function buildCostItemForeignMapFromAllocations(
  selectedItems: PurchaseItemRow[],
  allocationRows: CostAllocationRow[],
  totalForeign: number,
) {
  const rows = selectedItems.map((it) => {
    const alloc = allocationRows.find((a) => a.purchase_item_id === it.id);
    return {
      item_id: it.id,
      weight: Math.abs(n(alloc?.allocated_amount)),
    };
  });

  const distributed = distributeByWeightsCeil(
    Math.max(0, totalForeign),
    rows.map((row) => row.weight),
  );
  const next: Record<string, string> = {};
  rows.forEach((row, idx) => {
    next[row.item_id] = distributed[idx] > 0 ? String(distributed[idx]) : "";
  });
  return next;
}

function getCostInputLabel(costType: string) {
  const normalized = normalizeCostType(costType);
  if (normalized === "환불") return "환불증빙";
  if (normalized === "관부과세") return "관부과세영수증";
  if (normalized === "잔금") return "잔금비용영수증";
  if (normalized === "카드할인" || normalized === "할인/쿠폰")
    return "할인/쿠폰 증빙";
  if (normalized === "기타") return "기타비용영수증";
  if (normalized === "수수료") return "수수료 증빙";
  return "배송비영수증";
}

function resolveDraftForeignTotals(
  rawDraftItems: DraftItem[],
  totalForeign: number,
) {
  const cleaned = rawDraftItems
    .map((d) => ({
      ...d,
      item_name: d.item_name.trim(),
      qty: Math.max(1, n(d.qty)),
      foreign_total_raw: d.foreign_total.trim(),
      foreign_total_num: Math.max(0, n(d.foreign_total)),
      memo: d.memo.trim(),
    }))
    .filter((d) => d.item_name.length > 0);

  const rows = cleaned.map((d) => ({
    id: d.id,
    key: d.key,
    item_name: d.item_name,
    qty: d.qty,
    foreign_total: ceil4(d.foreign_total_num),
    entered_foreign_total: ceil4(d.foreign_total_num),
    was_blank: d.foreign_total_raw === "",
    memo: d.memo,
    is_preorder: d.is_preorder,
    product_type: d.product_type,
    photoFile: d.photoFile,
    existingPhotoPath: d.existingPhotoPath,
  }));

  if (rows.length === 0) {
    return {
      ok: false as const,
      message: "상품을 1개 이상 입력해야 해.",
      rows: [],
    };
  }

  const total = ceil4(totalForeign);
  if (total <= 0) {
    return {
      ok: false as const,
      message: "외화 총액을 입력해줘.",
      rows: [],
    };
  }

  const blankIdx = rows
    .map((row, idx) => (row.was_blank ? idx : -1))
    .filter((idx) => idx >= 0);

  const filledIdx = rows
    .map((row, idx) => (!row.was_blank ? idx : -1))
    .filter((idx) => idx >= 0);

  // 1) 전부 미입력 → 수량대비 배분
  if (filledIdx.length === 0) {
    const weights = rows.map((r) => Math.max(1, r.qty));
    const distributed = distributeByWeightsCeil(total, weights);

    distributed.forEach((value, idx) => {
      rows[idx].foreign_total = value;
    });

    return {
      ok: true as const,
      message: "",
      rows,
    };
  }

  // 2) 일부만 입력 → 남은 금액을 빈칸만 수량대비 배분
  if (blankIdx.length > 0) {
    const filledSum = round4(
      filledIdx.reduce((acc, idx) => acc + rows[idx].foreign_total, 0),
    );
    const remain = round4(total - filledSum);

    if (remain < -0.0001) {
      return {
        ok: false as const,
        message: `입력한 상품 외화총합이 외화 총액보다 커. 외화 총액(${fmtNum(total)}) 안에서 맞춰줘.`,
        rows: [],
      };
    }

    const weights = blankIdx.map((idx) => Math.max(1, rows[idx].qty));
    const distributed = distributeByWeightsCeil(remain, weights);

    blankIdx.forEach((idx, order) => {
      rows[idx].foreign_total = distributed[order];
    });

    return {
      ok: true as const,
      message: "",
      rows,
    };
  }

  // 3) 전부 입력한 경우에는 인보이스 상품총액과 달라도 입력값을 그대로 유지한다.
  // 차이는 상품금액을 억지로 보정하지 않고 배송비에서 더하거나 뺀다.
  rows.forEach((row) => {
    row.foreign_total = row.entered_foreign_total;
  });

  return {
    ok: true as const,
    message: "",
    rows,
  };
}

function computeDraftForeignTotals(
  rawDraftItems: DraftItem[],
  totalForeign: number,
) {
  const resolved = resolveDraftForeignTotals(rawDraftItems, totalForeign);

  if (!resolved.ok) {
    return {
      ok: false as const,
      message: resolved.message,
      rows: [] as {
        id?: string;
        key: string;
        item_name: string;
        qty: number;
        foreign_total: number;
        memo: string;
        is_preorder: boolean;
        product_type: ProductType;
        photoFile?: File | null;
        existingPhotoPath?: string | null;
      }[],
    };
  }

  const result = resolved.rows.map((r) => ({
    id: r.id,
    key: r.key,
    item_name: r.item_name,
    qty: r.qty,
    foreign_total: ceil4(r.foreign_total),
    memo: r.memo,
    is_preorder: r.is_preorder,
    product_type: r.product_type,
    photoFile: r.photoFile,
    existingPhotoPath: r.existingPhotoPath,
  }));

  return { ok: true as const, message: "", rows: result };
}

function computeDraftPreviewRows(
  rawDraftItems: DraftItem[],
  totalForeign: number,
  totalKRW: number,
) {
  const fx = calcFxRate(totalKRW, totalForeign);
  const resolved = resolveDraftForeignTotals(rawDraftItems, totalForeign);

  if (!resolved.ok) {
    return {
      rows: [] as DraftPreviewRow[],
      previewForeignSum: 0,
      diff: ceil4(totalForeign),
      fx,
      hasNamedItems: false,
    };
  }

  const rows: DraftPreviewRow[] = resolved.rows.map((r) => {
    const foreignTotal = ceil4(r.foreign_total);
    const foreignUnit = r.qty > 0 ? ceil4(foreignTotal / r.qty) : 0;
    const krwTotal = ceil4(foreignTotal * fx);
    const krwUnit = r.qty > 0 ? ceil4(krwTotal / r.qty) : 0;

    return {
      key: r.key,
      qty: r.qty,
      isBlank: r.was_blank,
      enteredForeign: ceil4(r.entered_foreign_total),
      previewForeignTotal: foreignTotal,
      previewForeignUnit: foreignUnit,
      previewKRWTotal: krwTotal,
      previewKRWUnit: krwUnit,
    };
  });

  const previewForeignSum = round4(
    rows.reduce((acc, r) => acc + r.previewForeignTotal, 0),
  );
  const diff = round4(ceil4(totalForeign) - previewForeignSum);

  return {
    rows,
    previewForeignSum,
    diff,
    fx,
    hasNamedItems: rows.length > 0,
  };
}

function buildRefundItemEditMap(
  ids: string[],
  allItems: PurchaseItemRow[],
  existingMemo?: string | null,
) {
  const itemMap = new Map(allItems.map((it) => [it.id, it]));
  const existing = new Map<string, RefundMetaItem>(
    parseRefundMeta(existingMemo).items.map(
      (item): [string, RefundMetaItem] => [item.item_id, item],
    ),
  );
  const next: Record<string, RefundItemEdit> = {};

  ids.forEach((id) => {
    const it = itemMap.get(id);
    const prev = existing.get(id);
    if (!it && !prev) return;

    next[id] = {
      item_name:
        prev?.override_name || it?.item_name || prev?.original_name || "",
      next_qty: String(
        Math.max(0, prev?.override_qty ?? Math.floor(n(it?.qty))),
      ),
    };
  });

  return next;
}
async function updateRefundAdjustedItems(
  selectedItems: PurchaseItemRow[],
  refundMap: Record<string, RefundItemEdit>,
  existingMemo?: string | null,
) {
  const existing = new Map<string, RefundMetaItem>(
    parseRefundMeta(existingMemo).items.map(
      (item): [string, RefundMetaItem] => [item.item_id, item],
    ),
  );

  for (const it of selectedItems) {
    const edit = refundMap[it.id];
    if (!edit) continue;

    const prev = existing.get(it.id);
    const baselineQty =
      prev?.original_qty ?? Math.max(0, Math.floor(n(it.qty)));
    const nextQty = Math.max(0, Math.floor(n(edit.next_qty)));

    const foreignUnit =
      prev?.original_foreign_unit_price ??
      (n(it.foreign_unit_price) > 0
        ? n(it.foreign_unit_price)
        : baselineQty > 0
          ? ceil4(n(it.foreign_total) / baselineQty)
          : 0);
    const unitKRW =
      prev?.original_unit_price ??
      (n(it.unit_price) > 0
        ? n(it.unit_price)
        : baselineQty > 0
          ? ceil4(n(it.line_total) / baselineQty)
          : 0);
    const nextForeignTotal = ceil4(foreignUnit * nextQty);
    const nextLineTotal = ceil4(unitKRW * nextQty);

    // 수량이 0이어도 삭제하지 않는다.
    // 환불한 상품명과 이력을 매입관리에서 계속 확인할 수 있게 유지한다.
    const upd = await supabase
      .from("purchase_items")
      .update({
        item_name:
          edit.item_name.trim() || prev?.original_name || it.item_name || null,
        qty: nextQty,
        foreign_total: nextForeignTotal,
        foreign_unit_price: foreignUnit,
        unit_price: unitKRW,
        line_total: nextLineTotal,
      })
      .eq("id", it.id);
    if (upd.error) throw upd.error;
  }
}

/**
 * 환불 뒤 공동 추가비용은 기존 배분을 그대로 두지 않고 완전히 다시 계산한다.
 *
 * 1) 환불 상품의 상품금액은 "원래 상품 전체금액 - 환불 대상 상품금액"으로 줄어든다.
 * 2) 남은 수량이 있는 상품만 배분 대상에 포함한다.
 * 3) 각 상품의 "개당 상품금액 × 남은 수량"을 다시 계산한다.
 * 4) 각 비용에 저장된 배분기준을 유지한다. 기존 비용은 자동 기준(배송비=수량, 그 외=금액)을 쓴다.
 *
 * 환불 차익/차손(cost_type=환불)은 다른 상품으로 퍼뜨리지 않고
 * 환불 처리한 해당 상품에만 유지한다.
 */
function isSharedRefundReallocationCostType(
  costType: string | null | undefined,
) {
  const normalized = normalizeCostType(costType);
  return (
    normalized === "배송비(거래처)" ||
    normalized === "배송비(배대지)" ||
    normalized === "관부과세" ||
    normalized === "수수료" ||
    normalized === "잔금" ||
    normalized === "기타" ||
    normalized === "카드할인" ||
    normalized === "할인/쿠폰"
  );
}

async function rebalanceSharedCostsAfterRefund(
  changedItemIds: string[],
  _allCosts: PurchaseCostRow[],
  _allAllocations: CostAllocationRow[],
) {
  if (!changedItemIds.length) return;
  const result = await supabase.rpc("rebalance_costs_after_refund", { p_item_ids: [...new Set(changedItemIds)] });
  if (result.error) throw result.error;
}

function ItemSelectionManager({
  title,
  selectedItems,
  allItems,
  purchaseMap,
  selectedIds,
  onRemove,
  onAdd,
}: {
  title: string;
  selectedItems: PurchaseItemRow[];
  allItems: PurchaseItemRow[];
  purchaseMap: Map<string, PurchaseRow>;
  selectedIds: string[];
  onRemove: (id: string) => void;
  onAdd: (id: string) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");

  const addableItems = useMemo(() => {
    const selectedSet = new Set(selectedIds);
    const q = search.trim().toLowerCase();

    return allItems.filter((it) => {
      if (selectedSet.has(it.id)) return false;
      // 전체환불된 수량 0 상품은 새 비용 배분 대상에 다시 넣지 않는다.
      if (Math.max(0, n(it.qty)) <= 0) return false;
      if (!q) return true;

      const name = (it.item_name ?? "").toLowerCase();
      const memo = (it.memo ?? "").toLowerCase();
      const supplier = (
        purchaseMap.get(it.purchase_id)?.supplier ?? ""
      ).toLowerCase();

      return name.includes(q) || memo.includes(q) || supplier.includes(q);
    });
  }, [allItems, purchaseMap, search, selectedIds]);

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontWeight: 900 }}>
          {title}({selectedItems.length}개)
        </div>
        <button
          type="button"
          onClick={() => setPickerOpen((prev) => !prev)}
          style={{
            border: "1px solid #ddd",
            background: "#fff",
            color: "#111",
            padding: "8px 12px",
            borderRadius: 10,
            cursor: "pointer",
            fontWeight: 800,
            fontSize: 12,
          }}
        >
          {pickerOpen ? "추가창 닫기" : "+ 상품 추가"}
        </button>
      </div>

      {selectedItems.length === 0 ? (
        <div
          style={{
            border: "1px dashed #ddd",
            borderRadius: 14,
            padding: 14,
            background: "#fafafa",
            fontSize: 12,
            color: "#6b7280",
          }}
        >
          선택된 상품 없음
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gap: 8,
            maxHeight: 220,
            overflowY: "auto",
            border: "1px solid #e5e7eb",
            borderRadius: 14,
            padding: 10,
            background: "#fafafa",
          }}
        >
          {selectedItems.map((it) => (
            <div
              key={it.id}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 8,
                alignItems: "start",
                border: "1px solid #ececf3",
                borderRadius: 12,
                background: "#fff",
                padding: "10px 12px",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 900 }}>
                  {it.item_name ?? "(이름 없음)"}
                </div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  매입:{" "}
                  {purchaseMap.get(it.purchase_id)?.supplier ?? "(거래처 없음)"}{" "}
                  / 수량 {fmtNum(n(it.qty))} / 상품 원화합계{" "}
                  {fmtKRW(n(it.line_total))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onRemove(it.id)}
                style={{
                  border: "1px solid #fecaca",
                  background: "#fff",
                  color: "#dc2626",
                  padding: "6px 8px",
                  borderRadius: 10,
                  cursor: "pointer",
                  fontWeight: 800,
                  fontSize: 12,
                  flexShrink: 0,
                  minWidth: 0,
                  width: "fit-content",
                }}
              >
                제거
              </button>
            </div>
          ))}
        </div>
      )}

      {pickerOpen && (
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 14,
            background: "#fff",
            padding: 12,
            display: "grid",
            gap: 10,
          }}
        >
          <input
            style={{
              border: "1px solid #d9d9e6",
              borderRadius: 12,
              padding: "10px 12px",
              outline: "none",
              fontSize: 14,
              background: "#fff",
              width: "100%",
              color: "#111",
              boxSizing: "border-box",
            }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="상품명 / 메모 / 거래처 검색"
          />

          <div
            style={{
              display: "grid",
              gap: 8,
              maxHeight: 260,
              overflowY: "auto",
              border: "1px solid #f0f0f5",
              borderRadius: 12,
              padding: 8,
              background: "#fafafa",
            }}
          >
            {addableItems.length === 0 ? (
              <div style={{ fontSize: 12, color: "#6b7280", padding: 8 }}>
                추가할 수 있는 상품이 없어.
              </div>
            ) : (
              addableItems.map((it) => (
                <div
                  key={it.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: 8,
                    alignItems: "start",
                    border: "1px solid #ececf3",
                    borderRadius: 12,
                    background: "#fff",
                    padding: "10px 12px",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 900 }}>
                      {it.item_name ?? "(이름 없음)"}
                    </div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>
                      매입:{" "}
                      {purchaseMap.get(it.purchase_id)?.supplier ??
                        "(거래처 없음)"}{" "}
                      / 수량 {fmtNum(n(it.qty))} / 상품 원화합계{" "}
                      {fmtKRW(n(it.line_total))}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onAdd(it.id)}
                    style={{
                      border: "1px solid #6d28d9",
                      background: "#6d28d9",
                      color: "#fff",
                      padding: "6px 8px",
                      borderRadius: 10,
                      cursor: "pointer",
                      fontWeight: 800,
                      fontSize: 12,
                      flexShrink: 0,
                      minWidth: 0,
                      width: "fit-content",
                    }}
                  >
                    추가
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}


function allocateExactKRW(total: number, weights: number[]) {
  const amount = Math.max(0, Math.round(total));
  const positive = weights.map((v) => Math.max(0, n(v)));
  const sum = positive.reduce((a,b) => a+b, 0);
  if (!positive.length) return [];
  const raw = positive.map((w) => amount * (sum > 0 ? w / sum : 1 / positive.length));
  const parts = raw.map(Math.floor);
  const order = raw.map((v,i) => ({i, fraction:v-parts[i]})).sort((a,b) => b.fraction-a.fraction || a.i-b.i);
  let remaining = amount - parts.reduce((a,b) => a+b,0);
  for (let i=0; i<remaining; i++) parts[order[i % order.length].i] += 1;
  return parts;
}

function pointPaymentParts(product: number, shipping: number, fee: number, points: number) {
  const gross = round4(product + shipping + fee);
  const net = Math.max(0, round4(gross - points));
  if (gross <= 0) return { product: 0, shipping: 0, fee: 0, net: 0 };
  let p = round4(product * net / gross);
  let sh = round4(shipping * net / gross);
  let f = round4(net - p - sh);
  if (f < 0) { if (p >= sh) p = round4(p + f); else sh = round4(sh + f); f = 0; }
  return { product: p, shipping: sh, fee: f, net };
}

function quoteVendorWalletFIFO(
  topups: VendorWalletTopupRow[],
  vendorName: string,
  currency: string,
  productForeign: number,
  shippingForeign: number,
  feeForeign: number,
): WalletQuote {
  const vendor = normalizeName(vendorName);
  const cur = normalizeCurrencyCode(currency);
  const productNeed = Math.max(0, round4(productForeign));
  const shippingNeed = Math.max(0, round4(shippingForeign));
  const feeNeed = Math.max(0, round4(feeForeign));
  const needed = round4(productNeed + shippingNeed + feeNeed);

  const lots = topups
    .filter(
      (row) =>
        normalizeName(row.vendor_name) === vendor &&
        normalizeCurrencyCode(row.currency) === cur &&
        n(row.remaining_foreign) > 0,
    )
    .sort((a, b) => {
      const dateDiff = String(a.topup_date || "").localeCompare(
        String(b.topup_date || ""),
      );
      if (dateDiff !== 0) return dateDiff;

      const createdDiff = String(a.created_at || "").localeCompare(
        String(b.created_at || ""),
      );
      if (createdDiff !== 0) return createdDiff;

      return String(a.id).localeCompare(String(b.id));
    })
    .map((row) => ({
      ...row,
      remaining: Math.max(0, n(row.remaining_foreign)),
    }));

  const balance = round4(
    lots.reduce((sum, row) => sum + row.remaining, 0),
  );

  if (needed <= 0 || balance + 0.0001 < needed) {
    return {
      ok: false,
      balance,
      needed,
      productKRW: 0,
      shippingKRW: 0,
      feeKRW: 0,
      totalKRW: 0,
      productParts: [],
      shippingParts: [],
      feeParts: [],
    };
  }

  const consumePreview = (amount: number) => {
    let left = round4(amount);
    const parts: WalletQuotePart[] = [];

    for (const lot of lots) {
      if (left <= 0.0001) break;
      if (lot.remaining <= 0) continue;

      const take = round4(Math.min(left, lot.remaining));
      const krw = Math.round(take * n(lot.fx_rate));

      parts.push({
        topupId: lot.id,
        foreign: take,
        krw,
        fxRate: n(lot.fx_rate),
      });

      lot.remaining = round4(lot.remaining - take);
      left = round4(left - take);
    }

    return {
      left,
      parts,
      krw: parts.reduce((sum, part) => sum + part.krw, 0),
    };
  };

  // 상품 → 배송비 → 수수료 순서로 같은 충전잔액을 FIFO 차감한다.
  const product = consumePreview(productNeed);
  const shipping = consumePreview(shippingNeed);
  const fee = consumePreview(feeNeed);

  return {
    ok:
      product.left <= 0.0001 &&
      shipping.left <= 0.0001 &&
      fee.left <= 0.0001,
    balance,
    needed,
    productKRW: product.krw,
    shippingKRW: shipping.krw,
    feeKRW: fee.krw,
    totalKRW: product.krw + shipping.krw + fee.krw,
    productParts: product.parts,
    shippingParts: shipping.parts,
    feeParts: fee.parts,
  };
}

export default function DocumentsPage() {
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [purchasePayments, setPurchasePayments] = useState<PurchasePaymentRow[]>([]);
  const [items, setItems] = useState<PurchaseItemRow[]>([]);
  const [costs, setCosts] = useState<PurchaseCostRow[]>([]);
  const [allocations, setAllocations] = useState<CostAllocationRow[]>([]);
  const [arrivals, setArrivals] = useState<ArrivalRow[]>([]);
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [pointSettings, setPointSettings] = useState<{vendor_key:string;currency:string;foreign_per_point:number}[]>([]);
  const [pointRows, setPointRows] = useState<{vendor_name:string;amount:number}[]>([]);
  const [fPointsUsed, setFPointsUsed] = useState("");
  const [fPointsEarned, setFPointsEarned] = useState("");
  const [walletTopups, setWalletTopups] = useState<VendorWalletTopupRow[]>([]);
  const [files, setFiles] = useState<FileRow[]>([]);

  const [selectedPurchaseId, setSelectedPurchaseId] = useState<string | null>(
    null,
  );
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [costItemForeignMap, setCostItemForeignMap] = useState<
    Record<string, string>
  >({});
  const [editCostItemForeignMap, setEditCostItemForeignMap] = useState<
    Record<string, string>
  >({});
  const [refundItemEditMap, setRefundItemEditMap] = useState<
    Record<string, RefundItemEdit>
  >({});
  const [editRefundItemEditMap, setEditRefundItemEditMap] = useState<
    Record<string, RefundItemEdit>
  >({});
  const [itemSearch, setItemSearch] = useState("");
  const [purchaseSearch, setPurchaseSearch] = useState("");
  const [purchaseSort, setPurchaseSort] =
    useState<(typeof PURCHASE_SORT_OPTIONS)[number]["value"]>("recent");
  const [purchaseViewFilter, setPurchaseViewFilter] =
    useState<(typeof PURCHASE_FILTER_OPTIONS)[number]["value"]>("all");
  const [itemSort, setItemSort] =
    useState<(typeof ITEM_SORT_OPTIONS)[number]["value"]>("amount_desc");
  const [relatedCostSort, setRelatedCostSort] =
    useState<(typeof RELATED_COST_SORT_OPTIONS)[number]["value"]>("date_desc");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [shippingReallocationDone, setShippingReallocationDone] = useState(
    () =>
      typeof window !== "undefined" &&
      window.localStorage.getItem(SHIPPING_REALLOCATION_DONE_KEY) === "done",
  );
  const costAllocationMigrationRunningRef = useRef(false);

  const [buyModalOpen, setBuyModalOpen] = useState(false);
  const [buyMode, setBuyMode] = useState<"create" | "edit">("create");
  const [editingPurchaseId, setEditingPurchaseId] = useState<string | null>(
    null,
  );
  const [buyDirty, setBuyDirty] = useState(false);
  const [buyDraftNotice, setBuyDraftNotice] = useState("");

  const [costModalOpen, setCostModalOpen] = useState(false);
  const [costDirty, setCostDirty] = useState(false);

  const [costEditModalOpen, setCostEditModalOpen] = useState(false);
  const [editingCost, setEditingCost] = useState<PurchaseCostRow | null>(null);
  const [ecType, setEcType] = useState("배송비(거래처)");
  const [ecAllocationBasis, setEcAllocationBasis] =
    useState<CostAllocationBasis>("auto");
  const [ecAmount, setEcAmount] = useState("");
  const [ecTotalForeign, setEcTotalForeign] = useState("");
  const [ecTotalKRW, setEcTotalKRW] = useState("");
  const [ecCurrency, setEcCurrency] = useState("KRW");
  const [ecCurrencyCustom, setEcCurrencyCustom] = useState("");
  const [ecFxRate, setEcFxRate] = useState("1");
  const [ecMemo, setEcMemo] = useState("");
  const [ecVendorName, setEcVendorName] = useState("");
  const [ecDate, setEcDate] = useState("");
  const [ecSelectedItemIds, setEcSelectedItemIds] = useState<string[]>([]);
  const [ecReceiptFile, setEcReceiptFile] = useState<File | null>(null);
  const [ecImportDocFile, setEcImportDocFile] = useState<File | null>(null);
  const [ecExistingReceiptPath, setEcExistingReceiptPath] = useState<
    string | null
  >(null);
  const [ecExistingImportDocPath, setEcExistingImportDocPath] = useState<
    string | null
  >(null);
  const [costEditDirty, setCostEditDirty] = useState(false);

  const [itemDetailOpen, setItemDetailOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<PurchaseItemRow | null>(null);
  const [detailAlloc, setDetailAlloc] = useState<ItemAllocationView[]>([]);
  const [expandedAllocationKeys, setExpandedAllocationKeys] = useState<string[]>([]);
  const draftProductListRef = useRef<HTMLDivElement | null>(null);
  const [detailQtyInput, setDetailQtyInput] = useState("");

  function toggleAllocationList(key: string) {
    setExpandedAllocationKeys((keys) => keys.includes(key)
      ? keys.filter((value) => value !== key)
      : [...keys, key]);
  }

  function renderRelatedAllocationItems(allocation: ItemAllocationView) {
    return (
      <div style={{ maxHeight: 220, overflowY: "auto", padding: 10, background: "#f8f9fc", borderRadius: 10, fontSize: 12, lineHeight: 1.6 }}>
        <div style={{ padding: "6px 8px", background: "#ede9fe", color: "#5b21b6", borderRadius: 6, fontWeight: 800, overflowWrap: "anywhere" }}>
          {detailItem?.item_name || "(이름 없음)"} · 현재 상품
        </div>
        {allocation.related_item_names.map((name, index) => (
          <div key={index} style={{ padding: "6px 8px", borderBottom: "1px solid #e5e7eb", overflowWrap: "anywhere" }}>{name}</div>
        ))}
      </div>
    );
  }
  const [detailQtySaving, setDetailQtySaving] = useState(false);

  const [fSupplier, setFSupplier] = useState("");
  const [fPurchaseDate, setFPurchaseDate] = useState("");
  const [fPaymentMet, setFPaymentMet] = useState("카드");
  const [fCardName, setFCardName] = useState("");
  const [fCurrency, setFCurrency] = useState("USD");
  const [fCurrencyCustom, setFCurrencyCustom] = useState("");
  const [fTotalForeign, setFTotalForeign] = useState("");
  const [fTotalForeignManuallyEdited, setFTotalForeignManuallyEdited] =
    useState(false);
  const [manualPaymentForeignKeys, setManualPaymentForeignKeys] = useState<
    string[]
  >([]);
  const [fShippingIncluded, setFShippingIncluded] = useState(false);
  const [fFeeIncluded, setFFeeIncluded] = useState(false);
  const [fShippingForeign, setFShippingForeign] = useState("");
  const [fFeeForeign, setFFeeForeign] = useState("");
  const [fCombinedForeign, setFCombinedForeign] = useState("");
  const [fShippingVendor, setFShippingVendor] = useState("");
  const [fTotalKRW, setFTotalKRW] = useState("");
  const [fMemo, setFMemo] = useState("");
  const [fUseWallet, setFUseWallet] = useState(false);
  const [draftPayments, setDraftPayments] = useState<DraftPayment[]>([
    {
      key: crypto.randomUUID(),
      payment_date: "",
      payment_method: "카드",
      card_name: "",
      currency: "USD",
      currency_custom: "",
      foreign_amount: "",
      krw_amount: "",
      memo: "",
    },
  ]);
  const [draftPurchaseCosts, setDraftPurchaseCosts] = useState<DraftPurchaseCost[]>([]);
  const [purchaseReceiptFile, setPurchaseReceiptFile] = useState<File | null>(
    null,
  );
  const [existingPurchaseReceiptPath, setExistingPurchaseReceiptPath] =
    useState<string | null>(null);
  const [draftItems, setDraftItems] = useState<DraftItem[]>([
    {
      key: crypto.randomUUID(),
      item_name: "",
      qty: "1",
      foreign_unit_price: "",
      foreign_total: "",
      memo: "",
      is_preorder: false,
      product_type: "기타",
      photoFile: null,
      existingPhotoPath: null,
    },
  ]);

  const [cType, setCType] = useState("배송비(거래처)");
  const [cAllocationBasis, setCAllocationBasis] =
    useState<CostAllocationBasis>("auto");
  const [cUseWallet, setCUseWallet] = useState(false);
  const [processingHistoryOpen, setProcessingHistoryOpen] = useState(false);
  const [historyTargets, setHistoryTargets] = useState<Array<{ cost_id: string; item_id: string }>>([]);
  const [cancellationRows, setCancellationRows] = useState<Array<{ id: string; created_at: string; action_kind: string; source_id: string; reason: string; effects: any; snapshot?: any }>>([]);
  const cancellationBusyRef = useRef(false);
  const [cancelPopup, setCancelPopup] = useState<{ kind: "cost" | "purchase"; id: string; title: string; products: string[]; details?: string[]; effects?: any; error?: string } | null>(null);
  const [cancelReason, setCancelReason] = useState("잘못 입력해서 취소");
  const [cancelPopupBusy, setCancelPopupBusy] = useState(false);
  const [editPointOpen, setEditPointOpen] = useState(false);
  const [editPointBusy, setEditPointBusy] = useState(false);
  const [editPointSource, setEditPointSource] = useState<{ purchaseId: string; vendor: string; ids: string[]; products: string[]; currency: string; rate: number; wallet: number; points: number; usedPoints: number; available: Record<string, number> } | null>(null);
  const [editPointAmount, setEditPointAmount] = useState("");
  const [editPointDate, setEditPointDate] = useState("");
  const [editPointType, setEditPointType] = useState("상품");
  const [editPointError, setEditPointError] = useState("");
  const [editPointQuote, setEditPointQuote] = useState<{ signature: string; krw: number; currency: string; rate: number; foreign: number } | null>(null);
  const editPointBusyRef = useRef(false);
  const editPointRequestRef = useRef<{ signature: string; id: string } | null>(null);
  const [cPointMode, setCPointMode] = useState(false);
  const [cPointAmount, setCPointAmount] = useState("");
  const [cPointUsageType, setCPointUsageType] = useState("상품");
  const [cPointQuote, setCPointQuote] = useState<{ signature: string; krw: number; balance: number; vendor: string; currency: string; foreign: number; rate: number } | null>(null);
  const cPointRequestRef = useRef<{ signature: string; id: string } | null>(null);
  const cPointBusyRef = useRef(false);
  const isCostPointUse = cType === "할인/쿠폰" && cPointMode;
  const [cAmount, setCAmount] = useState("");
  const [cTotalForeign, setCTotalForeign] = useState("");
  const [cTotalKRW, setCTotalKRW] = useState("");
  const [cCurrency, setCCurrency] = useState("KRW");
  const [cCurrencyCustom, setCCurrencyCustom] = useState("");
  const [cFxRate, setCFxRate] = useState("1");
  const [cMemo, setCMemo] = useState("");
  const [cVendorName, setCVendorName] = useState("");
  const [cDate, setCDate] = useState("");
  const cPointSignature = JSON.stringify([selectedItemIds.slice().sort(), cPointAmount, cDate, cPointUsageType]);
  const [costReceiptFile, setCostReceiptFile] = useState<File | null>(null);
  const [costImportDocFile, setCostImportDocFile] = useState<File | null>(null);

  const [cDutyAmount, setCDutyAmount] = useState("");
  const [cVatAmount, setCVatAmount] = useState("");
  const [cCustomsFeeAmount, setCCustomsFeeAmount] = useState("");

  const [ecDutyAmount, setEcDutyAmount] = useState("");
  const [ecVatAmount, setEcVatAmount] = useState("");
  const [ecCustomsFeeAmount, setEcCustomsFeeAmount] = useState("");
  const [cShippingAmount, setCShippingAmount] = useState("");
  const [cRefundKind, setCRefundKind] = useState<RefundKind>("product");
  const [ecRefundKind, setEcRefundKind] = useState<RefundKind>("product");

  const productTableWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (cType !== "관부과세") return;
    if (n(cDutyAmount) <= 0 && n(cVatAmount) <= 0) {
      if (cCustomsFeeAmount !== "") setCCustomsFeeAmount("");
      return;
    }
    const autoFee = Math.max(
      0,
      Math.round(n(cTotalKRW) - n(cDutyAmount) - n(cVatAmount)),
    );
    const next = String(autoFee);
    if (cCustomsFeeAmount !== next) setCCustomsFeeAmount(next);
  }, [cType, cDutyAmount, cVatAmount, cTotalKRW, cCustomsFeeAmount]);

  useEffect(() => {
    if (ecType !== "관부과세") return;
    if (n(ecDutyAmount) <= 0 && n(ecVatAmount) <= 0) {
      if (ecCustomsFeeAmount !== "") setEcCustomsFeeAmount("");
      return;
    }
    const autoFee = Math.max(
      0,
      Math.round(n(ecTotalKRW) - n(ecDutyAmount) - n(ecVatAmount)),
    );
    const next = String(autoFee);
    if (ecCustomsFeeAmount !== next) setEcCustomsFeeAmount(next);
  }, [ecType, ecDutyAmount, ecVatAmount, ecTotalKRW, ecCustomsFeeAmount]);

  const purchaseMap = useMemo(() => {
    const map = new Map<string, PurchaseRow>();
    for (const p of purchases) map.set(p.id, p);
    return map;
  }, [purchases]);

  const itemMap = useMemo(() => {
    const map = new Map<string, PurchaseItemRow>();
    for (const it of items) map.set(it.id, it);
    return map;
  }, [items]);

  const selectedPurchase = useMemo(
    () => purchases.find((p) => p.id === selectedPurchaseId) ?? null,
    [purchases, selectedPurchaseId],
  );

  const itemsByPurchase = useMemo(() => {
    const map = new Map<string, PurchaseItemRow[]>();
    for (const it of items) {
      if (!map.has(it.purchase_id)) map.set(it.purchase_id, []);
      map.get(it.purchase_id)!.push(it);
    }
    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      map.set(k, arr);
    }
    return map;
  }, [items]);

  const editingPurchase = useMemo(
    () =>
      editingPurchaseId
        ? purchases.find((purchase) => purchase.id === editingPurchaseId) ?? null
        : null,
    [editingPurchaseId, purchases],
  );

  const editingPurchaseHasRefund = useMemo(() => {
    if (buyMode !== "edit" || !editingPurchaseId) return false;

    const purchaseItemIds = new Set(
      (itemsByPurchase.get(editingPurchaseId) ?? []).map((item) => item.id),
    );

    return costs.some((cost) => {
      if (normalizeCostType(cost.cost_type) !== "환불") return false;
      if (cost.purchase_id === editingPurchaseId) return true;

      return parseRefundMeta(cost.memo).items.some((meta) =>
        purchaseItemIds.has(meta.item_id),
      );
    });
  }, [buyMode, editingPurchaseId, itemsByPurchase, costs]);

  const editingCombinedPaymentMeta = useMemo(
    () => parseCombinedPaymentMeta(editingPurchase?.memo),
    [editingPurchase],
  );

  const arrivedQtyByItem = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of arrivals) {
      map.set(
        row.purchase_item_id,
        (map.get(row.purchase_item_id) ?? 0) + Math.max(0, n(row.arrived_qty)),
      );
    }
    return map;
  }, [arrivals]);

  const filesByItem = useMemo(() => {
    const map = new Map<string, FileRow[]>();
    for (const f of files) {
      if (!f.item_id) continue;
      if (!map.has(f.item_id)) map.set(f.item_id, []);
      map.get(f.item_id)!.push(f);
    }
    return map;
  }, [files]);

  const filesByPurchase = useMemo(() => {
    const map = new Map<string, FileRow[]>();
    for (const f of files) {
      if (!f.purchase_id) continue;
      if (!map.has(f.purchase_id)) map.set(f.purchase_id, []);
      map.get(f.purchase_id)!.push(f);
    }
    return map;
  }, [files]);

  const filesByCost = useMemo(() => {
    const map = new Map<string, FileRow[]>();
    for (const f of files) {
      if (!f.cost_id) continue;
      if (!map.has(f.cost_id)) map.set(f.cost_id, []);
      map.get(f.cost_id)!.push(f);
    }
    return map;
  }, [files]);

  const selectedPurchaseItems = useMemo(() => {
    if (!selectedPurchaseId) return [];
    return itemsByPurchase.get(selectedPurchaseId) ?? [];
  }, [itemsByPurchase, selectedPurchaseId]);

  const selectedPurchaseItemIds = useMemo(
    () => new Set(selectedPurchaseItems.map((it) => it.id)),
    [selectedPurchaseItems],
  );

  const visibleItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    const base = q ? items : selectedPurchaseItems;

    if (!q) return base;

    return base.filter((it) => {
      const p = purchaseMap.get(it.purchase_id);
      const name = (it.item_name ?? "").toLowerCase();
      const memo = (it.memo ?? "").toLowerCase();
      const supplier = (p?.supplier ?? "").toLowerCase();

      return name.includes(q) || memo.includes(q) || supplier.includes(q);
    });
  }, [itemSearch, items, selectedPurchaseItems, purchaseMap]);

  const visibleItemKinds = useMemo(() => visibleItems.length, [visibleItems]);

  const visibleItemQtySum = useMemo(
    () => visibleItems.reduce((acc, it) => acc + Math.max(0, n(it.qty)), 0),
    [visibleItems],
  );

  const visibleSelectableItemIds = useMemo(
    () =>
      visibleItems
        .filter((item) => Math.max(0, n(item.qty)) > 0)
        .map((item) => item.id),
    [visibleItems],
  );

  const allVisibleItemsSelected = useMemo(
    () =>
      visibleSelectableItemIds.length > 0 &&
      visibleSelectableItemIds.every((id) => selectedItemIds.includes(id)),
    [visibleSelectableItemIds, selectedItemIds],
  );

  const someVisibleItemsSelected = useMemo(
    () =>
      visibleSelectableItemIds.some((id) => selectedItemIds.includes(id)) &&
      !allVisibleItemsSelected,
    [visibleSelectableItemIds, selectedItemIds, allVisibleItemsSelected],
  );

  const searchedSortedPurchases = useMemo(() => {
    const q = purchaseSearch.trim().toLowerCase();

    let list = purchases.filter((p) => {
      if (!q) return true;
      const supplier = (p.supplier ?? "").toLowerCase();
      const payment = (p.payment_met ?? "").toLowerCase();
      const card = (p.card_name ?? "").toLowerCase();
      const date = (p.purchase_date ?? "").toLowerCase();
      return (
        supplier.includes(q) ||
        payment.includes(q) ||
        card.includes(q) ||
        date.includes(q)
      );
    });

    list = [...list].sort((a, b) => {
      if (purchaseSort === "recent") {
        if (a.purchase_date && b.purchase_date)
          return a.purchase_date < b.purchase_date ? 1 : -1;
        if (a.purchase_date && !b.purchase_date) return -1;
        if (!a.purchase_date && b.purchase_date) return 1;
        return a.created_at < b.created_at ? 1 : -1;
      }

      if (purchaseSort === "oldest") {
        if (a.purchase_date && b.purchase_date)
          return a.purchase_date > b.purchase_date ? 1 : -1;
        if (a.purchase_date && !b.purchase_date) return -1;
        if (!a.purchase_date && b.purchase_date) return 1;
        return a.created_at > b.created_at ? 1 : -1;
      }

      if (purchaseSort === "name") {
        return (a.supplier ?? "").localeCompare(b.supplier ?? "", "ko-KR");
      }

      if (purchaseSort === "amount_desc") {
        return n(b.total_amount) - n(a.total_amount);
      }

      if (purchaseSort === "amount_asc") {
        return n(a.total_amount) - n(b.total_amount);
      }

      return 0;
    });

    return list;
  }, [purchases, purchaseSearch, purchaseSort]);

  const selectedItems = useMemo(() => {
    const set = new Set(selectedItemIds);
    return items.filter((it) => set.has(it.id));
  }, [items, selectedItemIds]);

  const editSelectedItems = useMemo(() => {
    const set = new Set(ecSelectedItemIds);
    return items.filter((it) => set.has(it.id));
  }, [items, ecSelectedItemIds]);

  const costAllocationPreview = useMemo(
    () =>
      resolveCostForeignTotals(
        selectedItems,
        costItemForeignMap,
        n(cTotalForeign),
      ),
    [selectedItems, costItemForeignMap, cTotalForeign],
  );

  const editCostAllocationPreview = useMemo(
    () =>
      resolveCostForeignTotals(
        editSelectedItems,
        editCostItemForeignMap,
        n(ecTotalForeign),
      ),
    [editSelectedItems, editCostItemForeignMap, ecTotalForeign],
  );

  const selectedItemsLineTotalSum = useMemo(() => {
    return selectedItems.reduce((acc, it) => acc + n(it.line_total), 0);
  }, [selectedItems]);

  const allocationSumByItem = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of allocations) {
      map.set(
        a.purchase_item_id,
        (map.get(a.purchase_item_id) ?? 0) + n(a.allocated_amount),
      );
    }
    return map;
  }, [allocations]);

  // 저장된 배분금액을 비용 종류별로 합산한다. 할인 등 음수도 그대로 표시한다.
  const allocationDetailsByItem = useMemo(() => {
    const costById = new Map(costs.map((cost) => [cost.id, cost]));
    const result = new Map<string, Map<string, number>>();
    for (const allocation of allocations) {
      const cost = costById.get(allocation.purchase_cost_id);
      const label = normalizeCostType(cost?.cost_type) || "항목 미확인";
      const rows = result.get(allocation.purchase_item_id) ?? new Map<string, number>();
      rows.set(label, (rows.get(label) ?? 0) + n(allocation.allocated_amount));
      result.set(allocation.purchase_item_id, rows);
    }
    return result;
  }, [allocations, costs]);

  function renderAllocationDetails(itemId: string, qty: number, total: number) {
    const rows = Array.from(allocationDetailsByItem.get(itemId) ?? [])
      .filter(([, amount]) => amount !== 0);
    return (
      <div style={{ fontSize: 11, lineHeight: 1.6, overflowWrap: "anywhere" }}>
        {rows.length === 0 ? <div style={{ color: "#6b7280" }}>추가비용 없음</div> : rows.map(([label, amount]) => (
          <div key={label}>{label}: {fmtKRW(amount)}</div>
        ))}
        <div style={{ fontWeight: 800 }}>합계 {fmtKRW(total)}</div>
        <div style={{ color: "#6b7280" }}>
          {qty > 0 ? `개당 ${fmtKRW(ceilInt(total / qty))}` : "전체환불 · 개당 계산 제외"}
        </div>
      </div>
    );
  }

  const sortedVisibleItems = useMemo(() => {
    const list = [...visibleItems];

    list.sort((a, b) => {
      if (itemSort === "name") {
        return (a.item_name ?? "").localeCompare(b.item_name ?? "", "ko-KR");
      }

      if (itemSort === "amount_desc") return n(b.line_total) - n(a.line_total);
      if (itemSort === "amount_asc") return n(a.line_total) - n(b.line_total);

      if (itemSort === "qty_desc") return n(b.qty) - n(a.qty);
      if (itemSort === "qty_asc") return n(a.qty) - n(b.qty);

      const finalUnitA =
        n(a.qty) > 0
          ? Math.ceil(
              (n(a.line_total) + (allocationSumByItem.get(a.id) ?? 0)) /
                n(a.qty),
            )
          : 0;
      const finalUnitB =
        n(b.qty) > 0
          ? Math.ceil(
              (n(b.line_total) + (allocationSumByItem.get(b.id) ?? 0)) /
                n(b.qty),
            )
          : 0;

      if (itemSort === "final_unit_desc") return finalUnitB - finalUnitA;
      if (itemSort === "final_unit_asc") return finalUnitA - finalUnitB;

      return 0;
    });

    return list;
  }, [visibleItems, itemSort, allocationSumByItem]);

  const costTypeMap = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const c of costs) map.set(c.id, c.cost_type ?? null);
    return map;
  }, [costs]);

  const itemCostBadgeMap = useMemo(() => {
    const map = new Map<string, { costId: string; label: string }[]>();

    for (const a of allocations) {
      const normalized = normalizeCostType(costTypeMap.get(a.purchase_cost_id));
      if (!normalized) continue;
      // 환불 진행중은 전용 상태 배지로 따로 보여주므로 추가비용 배지에는 중복 표시하지 않는다.
      if (normalized === "환불 진행중") continue;

      const prev = map.get(a.purchase_item_id) ?? [];
      if (!prev.some((x) => x.label == normalized)) {
        prev.push({ costId: a.purchase_cost_id, label: normalized });
        map.set(a.purchase_item_id, prev);
      }
    }

    return map;
  }, [allocations, costTypeMap]);

  const hasBalanceByItem = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const a of allocations) {
      const type = costTypeMap.get(a.purchase_cost_id);
      if (normalizeCostType(type) === "잔금") map.set(a.purchase_item_id, true);
    }
    return map;
  }, [allocations, costTypeMap]);

  const refundPendingItemIds = useMemo(() => {
    const set = new Set<string>();
    for (const cost of costs) {
      if (normalizeCostType(cost.cost_type) !== "환불 진행중") continue;
      for (const allocation of allocations) {
        if (allocation.purchase_cost_id === cost.id) {
          set.add(allocation.purchase_item_id);
        }
      }
    }
    return set;
  }, [costs, allocations]);

  const itemRefundStatusMap = useMemo(() => {
    const map = new Map<string, "전체환불" | "부분환불">();

    for (const cost of costs) {
      if (normalizeCostType(cost.cost_type) !== "환불") continue;

      for (const meta of parseRefundMeta(cost.memo).items) {
        const currentItem = itemMap.get(meta.item_id);
        const isFullRefund = n(currentItem?.qty) <= 0 || meta.override_qty <= 0;

        if (isFullRefund) {
          map.set(meta.item_id, "전체환불");
        } else if (!map.has(meta.item_id)) {
          map.set(meta.item_id, "부분환불");
        }
      }
    }

    return map;
  }, [costs, itemMap]);

  // 예전 버전은 전체환불 시 purchase_items 행을 삭제했기 때문에
  // 환불 상세 메모에 남아 있는 원래 상품 정보를 바탕으로 수량 0 상품을 다시 만들 수 있다.
  const legacyRefundRestoreCandidates = useMemo(() => {
    const existingItemIds = new Set(items.map((item) => item.id));
    const candidateMap = new Map<
      string,
      { cost: PurchaseCostRow; meta: RefundMetaItem }
    >();

    const refundCosts = [...costs]
      .filter((cost) => normalizeCostType(cost.cost_type) === "환불")
      .sort((a, b) => {
        const aKey = `${a.cost_date ?? ""}-${a.created_at}`;
        const bKey = `${b.cost_date ?? ""}-${b.created_at}`;
        return aKey.localeCompare(bKey);
      });

    for (const cost of refundCosts) {
      if (!cost.purchase_id) continue;

      for (const meta of parseRefundMeta(cost.memo).items) {
        if (!meta.item_id || existingItemIds.has(meta.item_id)) continue;

        // 같은 상품이 여러 번 환불된 이력이 있으면 가장 마지막 상태로 복구한다.
        candidateMap.set(meta.item_id, { cost, meta });
      }
    }

    return Array.from(candidateMap.values());
  }, [costs, items]);

  const purchaseRefundSummaryMap = useMemo(() => {
    type RefundSummary = {
      fullCount: number;
      partialCount: number;
      unknownCount: number;
    };

    // 환불 상세 메모의 원래 상품 ID를 기준으로 마지막 환불 상태를 집계한다.
    // 예전 전체환불 상품은 purchase_items에서 삭제됐어도, 여기서는 환불 이력을 그대로 보여줄 수 있다.
    const statusByPurchase = new Map<
      string,
      Map<string, "전체환불" | "부분환불">
    >();
    const unknownByPurchase = new Map<string, number>();

    const refundCosts = [...costs]
      .filter((cost) => normalizeCostType(cost.cost_type) === "환불")
      .sort((a, b) => {
        const aKey = `${a.cost_date ?? ""}-${a.created_at}`;
        const bKey = `${b.cost_date ?? ""}-${b.created_at}`;
        return aKey.localeCompare(bKey);
      });

    for (const cost of refundCosts) {
      if (!cost.purchase_id) continue;

      const metas = parseRefundMeta(cost.memo).items;
      if (metas.length === 0) {
        unknownByPurchase.set(
          cost.purchase_id,
          (unknownByPurchase.get(cost.purchase_id) ?? 0) + 1,
        );
        continue;
      }

      if (!statusByPurchase.has(cost.purchase_id)) {
        statusByPurchase.set(cost.purchase_id, new Map());
      }

      const itemStatusMap = statusByPurchase.get(cost.purchase_id)!;
      for (const meta of metas) {
        const key = meta.item_id || `${cost.id}-${meta.original_name}`;
        itemStatusMap.set(
          key,
          meta.override_qty <= 0 ? "전체환불" : "부분환불",
        );
      }
    }

    const result = new Map<string, RefundSummary>();
    const purchaseIds = new Set([
      ...statusByPurchase.keys(),
      ...unknownByPurchase.keys(),
    ]);

    for (const purchaseId of purchaseIds) {
      const summary: RefundSummary = {
        fullCount: 0,
        partialCount: 0,
        unknownCount: unknownByPurchase.get(purchaseId) ?? 0,
      };

      for (const status of statusByPurchase.get(purchaseId)?.values() ?? []) {
        if (status === "전체환불") summary.fullCount += 1;
        else summary.partialCount += 1;
      }

      result.set(purchaseId, summary);
    }

    return result;
  }, [costs]);

  const itemPhotoMap = useMemo(() => {
    const map = new Map<string, string>();
    const imageFiles = files.filter(
      (f) => f.file_type === "상품사진" && f.item_id && f.file_path,
    );

    for (const f of imageFiles) {
      if (!f.item_id || !f.file_path) continue;
      if (map.has(f.item_id)) continue;
      const { data } = supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(f.file_path);
      map.set(f.item_id, data.publicUrl);
    }
    return map;
  }, [files]);

  const purchaseCardCounts = useMemo(() => {
    const map = new Map<
      string,
      {
        itemKinds: number;
        hasUnreceived: boolean;
        unreceivedQty: number;
        refundPendingCount: number;
      }
    >();

    for (const p of purchases) {
      const its = itemsByPurchase.get(p.id) ?? [];
      const unreceivedQty = its.reduce((sum, item) => {
        // 전체환불 상품은 현재 qty 값이 남아 있어도 미입고로 잡지 않는다.
        if (itemRefundStatusMap.get(item.id) === "전체환불") return sum;
        const total = Math.max(0, n(item.qty));
        const arrived = Math.max(0, arrivedQtyByItem.get(item.id) ?? 0);
        return sum + Math.max(0, total - arrived);
      }, 0);

      const refundPendingCount = its.reduce(
        (sum, item) => sum + (refundPendingItemIds.has(item.id) ? 1 : 0),
        0,
      );

      map.set(p.id, {
        itemKinds: its.length,
        hasUnreceived: unreceivedQty > 0,
        unreceivedQty,
        refundPendingCount,
      });
    }
    return map;
  }, [
    purchases,
    itemsByPurchase,
    arrivedQtyByItem,
    itemRefundStatusMap,
    refundPendingItemIds,
  ]);

  const filteredPurchases = useMemo(() => {
    if (purchaseViewFilter === "unreceived") {
      return searchedSortedPurchases.filter(
        (purchase) => purchaseCardCounts.get(purchase.id)?.hasUnreceived,
      );
    }

    if (purchaseViewFilter === "refund_pending") {
      return searchedSortedPurchases.filter(
        (purchase) =>
          (purchaseCardCounts.get(purchase.id)?.refundPendingCount ?? 0) > 0,
      );
    }

    if (purchaseViewFilter === "refunded") {
      return searchedSortedPurchases.filter((purchase) =>
        costs.some(
          (cost) =>
            normalizeCostType(cost.cost_type) === "환불" &&
            cost.purchase_id === purchase.id,
        ),
      );
    }

    return searchedSortedPurchases;
  }, [searchedSortedPurchases, purchaseViewFilter, purchaseCardCounts, costs]);

  const vendorUsageCountMap = useMemo(() => {
    const map = new Map<string, number>();

    for (const p of purchases) {
      const key = normalizeName(p.supplier);
      if (key) map.set(key, (map.get(key) ?? 0) + 1);
    }

    for (const c of costs) {
      const key = normalizeName(c.vendor_name);
      if (key) map.set(key, (map.get(key) ?? 0) + 1);
    }

    return map;
  }, [purchases, costs]);

  const supplierVendorOptions = useMemo(() => {
    return vendors
      .filter((v) => !!v.is_product_supplier && !!v.name?.trim())
      .sort((a, b) => {
        const usageDiff =
          (vendorUsageCountMap.get(normalizeName(b.name)) ?? 0) -
          (vendorUsageCountMap.get(normalizeName(a.name)) ?? 0);
        if (usageDiff !== 0) return usageDiff;
        return (a.name ?? "").localeCompare(b.name ?? "", "ko-KR");
      });
  }, [vendors, vendorUsageCountMap]);

  const includedShippingVendorOptions = useMemo(() => {
    return vendors
      .filter(
        (v) =>
          !!v.name?.trim() &&
          (!!v.is_product_supplier || !!v.is_forwarder || !!v.is_carry_in),
      )
      .sort((a, b) => {
        const usageDiff =
          (vendorUsageCountMap.get(normalizeName(b.name)) ?? 0) -
          (vendorUsageCountMap.get(normalizeName(a.name)) ?? 0);
        if (usageDiff !== 0) return usageDiff;
        return (a.name ?? "").localeCompare(b.name ?? "", "ko-KR");
      });
  }, [vendors, vendorUsageCountMap]);

  const costVendorOptions = useMemo(() => {
    let filtered = vendors;

    if (cType === "배송비(거래처)" || cType === "잔금") {
      filtered = vendors.filter((v) => !!v.is_product_supplier);
    } else if (cType === "배송비(배대지)") {
      filtered = vendors.filter((v) => !!v.is_forwarder || !!v.is_carry_in);
    } else if (cType === "관부과세") {
      filtered = vendors.filter(
        (v) => !!v.is_forwarder || !!v.is_carry_in || !!v.is_customs_broker,
      );
    }

    return filtered
      .filter((v) => !!v.name?.trim())
      .sort((a, b) => {
        const usageDiff =
          (vendorUsageCountMap.get(normalizeName(b.name)) ?? 0) -
          (vendorUsageCountMap.get(normalizeName(a.name)) ?? 0);
        if (usageDiff !== 0) return usageDiff;
        return (a.name ?? "").localeCompare(b.name ?? "", "ko-KR");
      });
  }, [vendors, cType, vendorUsageCountMap]);

  const editCostVendorOptions = useMemo(() => {
    let filtered = vendors;

    if (ecType === "배송비(거래처)" || ecType === "잔금") {
      filtered = vendors.filter((v) => !!v.is_product_supplier);
    } else if (ecType === "배송비(배대지)") {
      filtered = vendors.filter((v) => !!v.is_forwarder || !!v.is_carry_in);
    } else if (ecType === "관부과세") {
      filtered = vendors.filter(
        (v) => !!v.is_forwarder || !!v.is_carry_in || !!v.is_customs_broker,
      );
    }

    return filtered
      .filter((v) => !!v.name?.trim())
      .sort((a, b) => {
        const usageDiff =
          (vendorUsageCountMap.get(normalizeName(b.name)) ?? 0) -
          (vendorUsageCountMap.get(normalizeName(a.name)) ?? 0);
        if (usageDiff !== 0) return usageDiff;
        return (a.name ?? "").localeCompare(b.name ?? "", "ko-KR");
      });
  }, [vendors, ecType, vendorUsageCountMap]);

  const paymentKRWSum = useMemo(
    () =>
      draftPayments.reduce(
        (sum, row) => sum + Math.max(0, n(row.krw_amount)),
        0,
      ),
    [draftPayments],
  );

  const paymentForeignSum = useMemo(() => {
    const productCurrency = normalizeCurrencyCode(
      currencyValue(fCurrency, fCurrencyCustom),
    );

    return round4(
      draftPayments.reduce((sum, row) => {
        const paymentCurrency = normalizeCurrencyCode(
          currencyValue(row.currency, row.currency_custom),
        );
        if (!productCurrency || paymentCurrency !== productCurrency) return sum;

        return (
          sum +
          (paymentCurrency === "KRW"
            ? Math.max(0, n(row.krw_amount))
            : Math.max(0, n(row.foreign_amount)))
        );
      }, 0),
    );
  }, [draftPayments, fCurrency, fCurrencyCustom]);

  // Different currencies must never be added or subtracted as raw amounts.
  const hasCrossCurrencyPayments = draftPayments.some((payment) =>
    normalizeCurrencyCode(currencyValue(payment.currency, payment.currency_custom)) !==
    normalizeCurrencyCode(currencyValue(fCurrency, fCurrencyCustom)),
  );

  const paymentPrimary = useMemo(
    () => draftPayments.find((row) => n(row.krw_amount) > 0) ?? draftPayments[0] ?? null,
    [draftPayments],
  );

  const enteredDraftItemForeignSum = useMemo(
    () =>
      round4(
        draftItems.reduce((sum, item) => {
          // 상품명 입력 전이라도 수량과 개당 외화가격을 적으면
          // 인보이스 상품총액과 결제 외화금액이 바로 자동계산되게 한다.
          const qty = Math.max(0, n(item.qty));
          const unit = Math.max(0, n(item.foreign_unit_price));
          const enteredTotal = Math.max(0, n(item.foreign_total));
          const lineTotal =
            unit > 0 ? round4(qty * unit) : enteredTotal;
          return sum + lineTotal;
        }, 0),
      ),
    [draftItems],
  );

  const purchasePaymentComposition = useMemo(() => {
    const invoiceProductForeign = Math.max(0, n(fTotalForeign));
    const enteredProductForeign = Math.max(0, enteredDraftItemForeignSum);
    const actualProductForeign =
      enteredProductForeign > 0
        ? enteredProductForeign
        : invoiceProductForeign;
    const actualCombinedForeign =
      fUseWallet && (fShippingIncluded || fFeeIncluded)
        ? Math.max(
            0,
            paymentForeignSum ||
              n(fCombinedForeign) ||
              round4(
                actualProductForeign +
                  (fShippingIncluded
                    ? Math.max(0, n(fShippingForeign))
                    : 0) +
                  (fFeeIncluded
                    ? Math.max(0, n(fFeeForeign))
                    : 0),
              ),
          )
        : fShippingIncluded
          ? hasCrossCurrencyPayments
            ? round4(actualProductForeign + Math.max(0, n(fShippingForeign)))
            : Math.max(0, paymentForeignSum || n(fCombinedForeign))
          : editingPurchaseHasRefund
            ? Math.max(
                0,
                paymentForeignSum ||
                  n(editingPurchase?.total_foreign) ||
                  actualProductForeign,
              )
            : Math.max(0, paymentForeignSum || actualProductForeign);

    // 환불된 매입은 현재 남은 상품금액과 최초 결제금액이 달라지는 게 정상이다.
    // 이 경우 배송비/원화배분/평균환율은 환불 전 원결제 기준을 유지한다.
    if (editingPurchaseHasRefund) {
      const originalShippingForeign = fShippingIncluded
        ? Math.max(
            0,
            n(fShippingForeign) ||
              n(editingCombinedPaymentMeta?.shipping_foreign),
          )
        : 0;
      const totalKRW = Math.max(0, Math.round(paymentKRWSum));
      const originalProductForeign = Math.max(
        0,
        n(editingCombinedPaymentMeta?.product_foreign) ||
          invoiceProductForeign ||
          actualProductForeign,
      );
      const originalShippingKRW = fShippingIncluded
        ? Math.max(0, Math.round(n(editingCombinedPaymentMeta?.shipping_krw)))
        : 0;
      const originalProductKRW = fShippingIncluded
        ? Math.max(
            0,
            Math.round(
              n(editingCombinedPaymentMeta?.product_krw) ||
                Math.max(0, totalKRW - originalShippingKRW),
            ),
          )
        : totalKRW;

      return {
        invoiceProductForeign,
        productForeign: actualProductForeign,
        shippingForeign: originalShippingForeign,
        combinedForeign: actualCombinedForeign,
        productKRW: originalProductKRW,
        shippingKRW: originalShippingKRW,
        productFx:
          calcFxRate(originalProductKRW, originalProductForeign) ||
          Math.max(0, n(editingPurchase?.fx_rate)),
      };
    }

    // 인보이스와 상품입력합계의 차이는 상품을 보정하지 않고 배송비에서 흡수한다.
    const calculatedShippingForeign = fShippingIncluded
      ? Math.max(
          0,
          round4(actualCombinedForeign - actualProductForeign),
        )
      : 0;
    const totalKRW = Math.max(0, Math.round(paymentKRWSum));

    if (
      !fShippingIncluded ||
      actualCombinedForeign <= 0 ||
      actualProductForeign <= 0
    ) {
      return {
        invoiceProductForeign,
        productForeign: actualProductForeign,
        shippingForeign: 0,
        combinedForeign: actualCombinedForeign || actualProductForeign,
        productKRW: totalKRW,
        shippingKRW: 0,
        productFx: calcFxRate(totalKRW, actualProductForeign),
      };
    }

    const productKRW = Math.round(
      (totalKRW * actualProductForeign) / actualCombinedForeign,
    );
    const shippingKRW = totalKRW - productKRW;

    return {
      invoiceProductForeign,
      productForeign: actualProductForeign,
      shippingForeign: calculatedShippingForeign,
      combinedForeign: actualCombinedForeign,
      productKRW,
      shippingKRW,
      productFx: calcFxRate(productKRW, actualProductForeign),
    };
  }, [
    fTotalForeign,
    enteredDraftItemForeignSum,
    hasCrossCurrencyPayments,
    fUseWallet,
    fShippingIncluded,
    fFeeIncluded,
    fShippingForeign,
    fFeeForeign,
    fCombinedForeign,
    paymentForeignSum,
    paymentKRWSum,
    editingPurchaseHasRefund,
    editingCombinedPaymentMeta,
    editingPurchase,
  ]);

  // 상품명·수량·개당 외화가격을 입력하면 상품 합계를 자동으로 계산하고,
  // 사용자가 직접 고치기 전까지 인보이스 상품총액과 결제 외화금액도 자동으로 맞춘다.
  useEffect(() => {
    if (fTotalForeignManuallyEdited) return;
    if (enteredDraftItemForeignSum <= 0) return;

    const nextProductForeign = String(enteredDraftItemForeignSum);
    setFTotalForeign(nextProductForeign);

    if (fUseWallet && (fShippingIncluded || fFeeIncluded)) {
      const shipping = fShippingIncluded
        ? Math.max(0, n(fShippingForeign))
        : 0;
      const fee = fFeeIncluded
        ? Math.max(0, n(fFeeForeign))
        : 0;

      setFCombinedForeign(
        String(round4(enteredDraftItemForeignSum + shipping + fee)),
      );
    } else if (fShippingIncluded) {
      const shipping = Math.max(0, n(fShippingForeign));
      setFCombinedForeign(
        String(round4(enteredDraftItemForeignSum + shipping)),
      );
    } else {
      setFCombinedForeign(nextProductForeign);
    }
  }, [
    enteredDraftItemForeignSum,
    fTotalForeignManuallyEdited,
    fShippingIncluded,
    fShippingForeign,
    fUseWallet,
    fFeeIncluded,
    fFeeForeign,
  ]);

  useEffect(() => {
    if (draftPayments.length !== 1 || fUseWallet) return;
    const payment = draftPayments[0];
    if (manualPaymentForeignKeys.includes(payment.key)) return;

    const paymentCurrency = currencyValue(
      payment.currency,
      payment.currency_custom,
    );
    if (normalizeCurrencyCode(paymentCurrency) === "KRW") return;
    if (normalizeCurrencyCode(paymentCurrency) !== normalizeCurrencyCode(currencyValue(fCurrency, fCurrencyCustom))) return;

    const autoForeign = fUseWallet
      ? Math.max(
          0,
          round4(
            Math.max(
              0,
              enteredDraftItemForeignSum || n(fTotalForeign),
            ) +
              (fShippingIncluded
                ? Math.max(0, n(fShippingForeign))
                : 0) +
              (fFeeIncluded
                ? Math.max(0, n(fFeeForeign))
                : 0),
          ),
        )
      : fShippingIncluded
        ? Math.max(0, n(fCombinedForeign))
        : Math.max(0, n(fTotalForeign));
    if (autoForeign <= 0) return;

    const nextValue = String(round4(autoForeign));
    if (payment.foreign_amount === nextValue) return;

    setDraftPayments((prev) =>
      prev.map((row) =>
        row.key === payment.key
          ? { ...row, foreign_amount: nextValue }
          : row,
      ),
    );
  }, [
    draftPayments,
    manualPaymentForeignKeys,
    fCurrency,
    fCurrencyCustom,
    fUseWallet,
    fShippingIncluded,
    fFeeIncluded,
    fShippingForeign,
    fFeeForeign,
    fCombinedForeign,
    fTotalForeign,
    enteredDraftItemForeignSum,
  ]);

  useEffect(() => {
    if (!fShippingIncluded) return;
    if (fUseWallet || hasCrossCurrencyPayments) return;
    if (editingPurchaseHasRefund) return;
    if (paymentForeignSum <= 0) return;

    const nextCombined = round4(paymentForeignSum);
    const actualProductForeign =
      enteredDraftItemForeignSum > 0
        ? enteredDraftItemForeignSum
        : Math.max(0, n(fTotalForeign));
    const nextShipping = Math.max(
      0,
      round4(nextCombined - actualProductForeign),
    );

    if (Math.abs(n(fCombinedForeign) - nextCombined) > 0.0001) {
      setFCombinedForeign(String(nextCombined));
    }
    if (Math.abs(n(fShippingForeign) - nextShipping) > 0.0001) {
      setFShippingForeign(String(nextShipping));
    }
  }, [
    fShippingIncluded,
    fUseWallet,
    hasCrossCurrencyPayments,
    editingPurchaseHasRefund,
    paymentForeignSum,
    fTotalForeign,
    enteredDraftItemForeignSum,
    fCombinedForeign,
    fShippingForeign,
  ]);



  const supplierWalletLots = useMemo(() => {
    const vendorKey = normalizeName(fSupplier);
    if (!vendorKey) return [] as VendorWalletTopupRow[];

    return walletTopups
      .filter(
        (row) =>
          normalizeName(row.vendor_name) === vendorKey &&
          Math.max(0, n(row.remaining_foreign)) > 0,
      )
      .sort((a, b) => {
        const d = String(a.topup_date || "").localeCompare(
          String(b.topup_date || ""),
        );
        if (d !== 0) return d;
        return String(a.created_at || "").localeCompare(
          String(b.created_at || ""),
        );
      });
  }, [walletTopups, fSupplier]);

  const supplierWalletCurrencySummaries = useMemo(() => {
    const map = new Map<
      string,
      {
        currency: string;
        balance: number;
        totalOriginal: number;
        lots: VendorWalletTopupRow[];
      }
    >();

    for (const row of supplierWalletLots) {
      const currency = normalizeCurrencyCode(row.currency);
      if (!currency) continue;

      const prev = map.get(currency) ?? {
        currency,
        balance: 0,
        totalOriginal: 0,
        lots: [],
      };

      prev.balance += Math.max(0, n(row.remaining_foreign));
      prev.totalOriginal += Math.max(0, n(row.foreign_amount));
      prev.lots.push(row);
      map.set(currency, prev);
    }

    return Array.from(map.values()).sort((a, b) =>
      a.currency.localeCompare(b.currency),
    );
  }, [supplierWalletLots]);

  function loadVendorWalletCurrency(currency: string) {
    const normalized = normalizeCurrencyCode(currency);
    if (!normalized) return;

    const builtIn = CURRENCY_OPTIONS.find((x) => x.value === normalized);
    if (builtIn && builtIn.value !== "직접입력") {
      setFCurrency(builtIn.value);
      setFCurrencyCustom("");
    } else {
      setFCurrency("직접입력");
      setFCurrencyCustom(normalized);
    }

    setFUseWallet(true);
    setFPaymentMet("충전잔액");

    if (fShippingIncluded || fFeeIncluded) {
      const productForeign =
        enteredDraftItemForeignSum > 0
          ? enteredDraftItemForeignSum
          : Math.max(0, n(fTotalForeign));
      const shippingForeign = fShippingIncluded
        ? Math.max(0, n(fShippingForeign))
        : 0;
      const feeForeign = fFeeIncluded
        ? Math.max(0, n(fFeeForeign))
        : 0;

      setFCombinedForeign(
        String(round4(productForeign + shippingForeign + feeForeign)),
      );
    }
    setManualPaymentForeignKeys([]);
    setDraftPayments((prev) => {
      const current = prev[0];
      return [
        {
          key: current?.key || crypto.randomUUID(),
          payment_date: current?.payment_date || "",
          payment_method: "충전잔액",
          card_name: `${fSupplier.trim()} 외화잔액`,
          currency:
            builtIn && builtIn.value !== "직접입력"
              ? builtIn.value
              : "직접입력",
          currency_custom:
            builtIn && builtIn.value !== "직접입력" ? "" : normalized,
          foreign_amount: current?.foreign_amount || "",
          krw_amount: current?.krw_amount || "",
          memo: `거래처관리 충전잔액 불러오기 · ${normalized}`,
        },
      ];
    });
    setBuyDirty(true);
  }

  const walletCurrency = normalizeCurrencyCode(
    currencyValue(fCurrency, fCurrencyCustom),
  );

  const walletProductForeign = Math.max(
    0,
    enteredDraftItemForeignSum || n(fTotalForeign),
  );

  const walletShippingForeign = fShippingIncluded
    ? Math.max(0, n(fShippingForeign))
    : 0;

  const walletFeeForeign = fUseWallet && fFeeIncluded
    ? Math.max(0, n(fFeeForeign))
    : 0;

  const pointBalance = pointRows.filter((row) => normalizeName(row.vendor_name) === normalizeName(fSupplier)).reduce((sum,row) => sum+n(row.amount),0);
  const pointSetting = pointSettings.find(row => row.vendor_key === String(fSupplier || '').trim().toLowerCase());
  const pointCurrencyMatches = !!pointSetting && pointSetting.currency === walletCurrency;
  const pointRuleLabel = pointSetting ? `1점 = ${Number(pointSetting.foreign_per_point).toLocaleString('ko-KR', {maximumFractionDigits:4})} ${pointSetting.currency}` : '거래처관리에서 포인트 환산 기준을 먼저 저장하세요';
  const appliedPoints = fUseWallet && buyMode === "create" && pointCurrencyMatches ? Math.max(0,n(fPointsUsed)) : 0;
  const appliedPointForeign = round4(appliedPoints * n(pointSetting?.foreign_per_point));
  const pointNetParts = pointPaymentParts(walletProductForeign, walletShippingForeign, walletFeeForeign, appliedPointForeign);
  const fullyPointPaid = fUseWallet && buyMode === "create" && appliedPoints > 0 && pointNetParts.net === 0;
  const walletQuote = useMemo(
    () => {
      const quoted = quoteVendorWalletFIFO(walletTopups, fSupplier, walletCurrency, pointNetParts.product, pointNetParts.shipping, pointNetParts.fee);
      return fullyPointPaid ? { ...quoted, ok: true } : quoted;
    },
    [
      walletTopups,
      fSupplier,
      walletCurrency,
      walletProductForeign,
      walletShippingForeign,
      walletFeeForeign,
      appliedPoints,
      appliedPointForeign,
      fullyPointPaid,
    ],
  );


  const costWalletCurrency = normalizeCurrencyCode(
    currencyValue(cCurrency, cCurrencyCustom),
  );

  const costWalletEligible =
    isShippingCostType(cType) || normalizeCostType(cType) === "수수료";

  const costWalletQuote = useMemo(() => {
    const foreign = Math.max(0, n(cTotalForeign));
    return quoteVendorWalletFIFO(
      walletTopups,
      cVendorName,
      costWalletCurrency,
      0,
      isShippingCostType(cType) ? foreign : 0,
      normalizeCostType(cType) === "수수료" ? foreign : 0,
    );
  }, [
    walletTopups,
    cVendorName,
    costWalletCurrency,
    cType,
    cTotalForeign,
  ]);

  const costWalletKRW = isShippingCostType(cType)
    ? costWalletQuote.shippingKRW
    : normalizeCostType(cType) === "수수료"
      ? costWalletQuote.feeKRW
      : 0;

  useEffect(() => {
    if (!cUseWallet) return;
    if (!costWalletEligible) {
      setCUseWallet(false);
      return;
    }
    setCTotalKRW(costWalletQuote.ok ? String(costWalletKRW) : "");
    setCFxRate(
      costWalletQuote.ok && n(cTotalForeign) > 0
        ? String(calcFxRate(costWalletKRW, n(cTotalForeign)))
        : "",
    );
  }, [
    cUseWallet,
    costWalletEligible,
    costWalletQuote.ok,
    costWalletKRW,
    cTotalForeign,
  ]);

  function toggleCostWalletUse(checked: boolean) {
    if (!checked) {
      setCUseWallet(false);
      setCTotalKRW("");
      return;
    }

    if (!costWalletEligible) {
      setErr("충전잔액 사용은 배송비 또는 수수료에서 사용할 수 있어.");
      return;
    }
    if (!cVendorName.trim()) {
      setErr("충전잔액을 사용할 거래처를 먼저 선택해줘.");
      return;
    }

    const vendorKey = normalizeName(cVendorName);
    const firstLot = walletTopups.find(
      (row) =>
        normalizeName(row.vendor_name) === vendorKey &&
        n(row.remaining_foreign) > 0,
    );

    if (!firstLot) {
      setErr(`${cVendorName}에 사용 가능한 외화 충전잔액이 없어.`);
      return;
    }

    const currency = normalizeCurrencyCode(firstLot.currency);
    const builtIn = CURRENCY_OPTIONS.find((x) => x.value === currency);
    if (builtIn && builtIn.value !== "직접입력") {
      setCCurrency(builtIn.value);
      setCCurrencyCustom("");
    } else {
      setCCurrency("직접입력");
      setCCurrencyCustom(currency);
    }

    setCUseWallet(true);
    setCostDirty(true);
    setErr(null);
  }

  // 충전잔액 결제를 켜면 결제내역은 프로그램이 FIFO 결과로 자동 작성한다.
  useEffect(() => {
    if (!fUseWallet || buyMode !== "create") return;
    if (!fSupplier.trim() || !walletCurrency) return;

    const requiredForeign = pointNetParts.net;
    if (requiredForeign <= 0 && !fullyPointPaid) return;

    setDraftPayments((prev) => {
      const current = prev[0];

      return [
        {
          key: current?.key || crypto.randomUUID(),
          // 충전일/매입일과 별개로 실제 결제일을 직접 저장할 수 있게 유지한다.
          payment_date: current?.payment_date || "",
          payment_method: "충전잔액",
          card_name: `${fSupplier.trim()} 외화잔액`,
          currency: fCurrency,
          currency_custom: fCurrencyCustom,
          // 상품·배송비·수수료 모두 같은 충전잔액에서 빠지므로
          // 결제내역에는 이번에 실제 차감되는 외화 총액/원화 총액을 기록한다.
          foreign_amount: String(requiredForeign),
          krw_amount: walletQuote.ok
            ? String(walletQuote.totalKRW)
            : "",
          memo: walletQuote.ok
            ? `FIFO 충전잔액 사용 · 사용 전 잔액 ${fmtNum(
                walletQuote.balance,
              )} ${walletCurrency}`
            : `충전잔액 부족 · 현재 ${fmtNum(
                walletQuote.balance,
              )} / 필요 ${fmtNum(
                walletQuote.needed,
              )} ${walletCurrency}`,
        },
      ];
    });

    setFTotalKRW(walletQuote.ok ? String(walletQuote.totalKRW) : "");
    setManualPaymentForeignKeys([]);
  }, [
    fUseWallet,
    buyMode,
    fSupplier,
    fPurchaseDate,
    fCurrency,
    fCurrencyCustom,
    walletCurrency,
    walletProductForeign,
    walletShippingForeign,
    walletFeeForeign,
    appliedPoints,
    fullyPointPaid,
    fFeeIncluded,
    walletQuote.ok,
    walletQuote.totalKRW,
    walletQuote.balance,
    walletQuote.needed,
  ]);


  useEffect(() => {
    if (!buyModalOpen || !buyDirty) return;
    const timer = window.setTimeout(() => {
      savePurchaseDraft(false);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [
    buyModalOpen,
    buyDirty,
    buyMode,
    editingPurchaseId,
    fSupplier,
    fPurchaseDate,
    fPaymentMet,
    fCardName,
    fCurrency,
    fCurrencyCustom,
    fTotalForeign,
    fTotalForeignManuallyEdited,
    manualPaymentForeignKeys,
    fShippingIncluded,
    fFeeIncluded,
    fShippingForeign,
    fFeeForeign,
    fCombinedForeign,
    fShippingVendor,
    fTotalKRW,
    fMemo,
    fUseWallet,
    fPointsUsed,
    fPointsEarned,
    draftPayments,
    draftPurchaseCosts,
    draftItems,
    existingPurchaseReceiptPath,
  ]);

  const draftPreview = useMemo(() => {
    const previewForeign = Math.max(
      0,
      enteredDraftItemForeignSum || n(fTotalForeign),
    );
    const previewKRW = fUseWallet && buyMode === "create" ? walletQuote.productKRW : editingPurchaseHasRefund
      ? previewForeign * purchasePaymentComposition.productFx
      : purchasePaymentComposition.productKRW;

    const preview = computeDraftPreviewRows(draftItems, previewForeign, previewKRW);
    if (appliedPoints > 0 && preview.rows.length) {
      const parts = allocateExactKRW(previewKRW, preview.rows.map((row) => row.previewForeignTotal));
      preview.rows = preview.rows.map((row, index) => ({...row, previewKRWTotal: parts[index], previewKRWUnit: row.qty > 0 ? parts[index] / row.qty : 0}));
    }
    return preview;
  }, [
    draftItems,
    enteredDraftItemForeignSum,
    fTotalForeign,
    editingPurchaseHasRefund,
    purchasePaymentComposition.productKRW,
    purchasePaymentComposition.productFx,
    fUseWallet,
    buyMode,
    walletQuote.productKRW,
    appliedPoints,
  ]);

  // 안내 전용: 기존 자동계산 및 저장 로직은 변경하지 않는다.
  const paymentTotalsByCurrency = (() => {
    const totals = new Map<string, number>();
    for (const row of draftPayments) {
      const currency = currencyValue(row.currency, row.currency_custom);
      if (!currency) continue;
      const amount = normalizeCurrencyCode(currency) === "KRW" ? n(row.krw_amount) : n(row.foreign_amount);
      totals.set(currency, round4((totals.get(currency) ?? 0) + Math.max(0, amount)));
    }
    return Array.from(totals);
  })();

  const purchaseEntryGuide = (() => {
    const named = draftItems.filter((item) => item.item_name.trim());
    const qty = named.reduce((sum, item) => sum + Math.max(0, n(item.qty)), 0);
    const currency = currencyValue(fCurrency, fCurrencyCustom);
    const productForeign = purchasePaymentComposition.productForeign;
    const computed = computeDraftForeignTotals(draftItems, productForeign);
    const notes: string[] = [];
    if (!named.length) notes.push("상품명과 수량을 입력해 주세요.");
    if (n(fTotalForeign) <= 0) notes.push("인보이스의 상품금액을 입력하거나 상품별 가격을 입력해 주세요.");
    if (named.length && productForeign > 0 && !computed.ok) notes.push(computed.message);
    if (!currency) notes.push("상품 기준 통화를 선택해 주세요.");
    if (fUseWallet && buyMode === "create") {
      if (!fSupplier.trim()) notes.push("충전잔액을 사용할 거래처를 선택해 주세요.");
      if (!walletQuote.ok) notes.push("충전잔액이 부족합니다. 잔액과 차감할 금액을 확인해 주세요.");
    } else if (paymentKRWSum <= 0) {
      notes.push("결제내역에 실제로 지급한 원화금액을 입력해 주세요.");
    }
    if (draftPayments.some((row) => (n(row.krw_amount) > 0 || fullyPointPaid) && (!row.payment_date || row.payment_date.length !== 10))) {
      notes.push("금액을 입력한 결제 건의 결제일을 확인해 주세요.");
    }
    if (draftPayments.some((row) => n(row.krw_amount) > 0 && normalizeCurrencyCode(currencyValue(row.currency, row.currency_custom)) !== "KRW" && n(row.foreign_amount) <= 0)) {
      notes.push("외화 결제 건에는 실제 결제한 외화금액도 입력해 주세요.");
    }
    if (!editingPurchaseHasRefund && fShippingIncluded && (fUseWallet ? n(fShippingForeign) : purchasePaymentComposition.shippingForeign) <= 0) {
      notes.push(fUseWallet ? "충전잔액에서 함께 차감할 배송비를 입력해 주세요." : "배송비 포함 실제 결제금액이 상품금액보다 큰지 확인해 주세요.");
    }
    if (fUseWallet && fFeeIncluded && n(fFeeForeign) <= 0) notes.push("충전잔액에서 함께 차감할 수수료를 입력해 주세요.");
    const expectedPayment = fUseWallet
      ? round4(productForeign + (fShippingIncluded ? n(fShippingForeign) : 0) + (fFeeIncluded ? n(fFeeForeign) : 0) - appliedPointForeign)
      : fShippingIncluded ? purchasePaymentComposition.combinedForeign : productForeign;
    if (!editingPurchaseHasRefund && !hasCrossCurrencyPayments && paymentForeignSum > 0 && Math.abs(paymentForeignSum - expectedPayment) > 0.01) {
      notes.push("결제내역의 외화금액과 상품·함께 결제한 비용의 합계가 다릅니다. 결제 통화와 금액을 확인해 주세요.");
    }
    const invoiceDiff = round4(n(fTotalForeign) - enteredDraftItemForeignSum);
    const blankCount = named.filter((item) => item.foreign_total.trim() === "").length;
    return { namedCount: named.length, qty, currency, notes, invoiceDiff, blankCount,
      productKRW: fUseWallet && buyMode === "create" ? walletQuote.productKRW : purchasePaymentComposition.productKRW,
      totalKRW: fUseWallet && buyMode === "create" ? walletQuote.totalKRW : paymentKRWSum,
      separateCostKRW: draftPurchaseCosts.reduce((sum, cost) => sum + signedCostAmountByType(cost.cost_type, Math.max(0, n(cost.krw_amount))), 0),
    };
  })();

  const draftPreviewMap = useMemo(() => {
    const map = new Map<string, DraftPreviewRow>();
    draftPreview.rows.forEach((row) => map.set(row.key, row));
    return map;
  }, [draftPreview]);

  useEffect(() => {
    if (productTableWrapRef.current) {
      productTableWrapRef.current.scrollTop = 0;
    }
  }, [selectedPurchaseId, itemSearch]);

  function getPublicUrl(path: string | null | undefined) {
    if (!path) return "";
    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    return data.publicUrl;
  }

  function getPurchaseReceiptPath(purchaseId: string | null | undefined) {
    if (!purchaseId) return null;
    const found = (filesByPurchase.get(purchaseId) ?? []).find(
      (f) => f.file_type === "매입영수증",
    );
    return found?.file_path ?? null;
  }

  function getCostReceiptPath(
    costId: string | null | undefined,
    costType: string | null | undefined,
  ) {
    if (!costId) return null;
    const receiptType = getCostReceiptFileType(costType);
    const found =
      (filesByCost.get(costId) ?? []).find(
        (f) => f.file_type === receiptType,
      ) ??
      (filesByCost.get(costId) ?? []).find(
        (f) => f.file_type === "추가비용영수증",
      );
    return found?.file_path ?? null;
  }

  function getCostImportDocPath(costId: string | null | undefined) {
    if (!costId) return null;
    const found = (filesByCost.get(costId) ?? []).find(
      (f) => f.file_type === "수입신고필증",
    );
    return found?.file_path ?? null;
  }

  async function uploadStorageFile(file: File, folder: string) {
    const path = `${folder}/${Date.now()}-${safeFileName(file.name)}`;
    const res = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, {
      upsert: true,
    });
    if (res.error) throw res.error;
    return path;
  }

  async function removeStoragePath(path: string | null | undefined) {
    if (!path) return;
    await supabase.storage.from(STORAGE_BUCKET).remove([path]);
  }

  async function upsertPurchaseFile(params: {
    purchase_id?: string | null;
    item_id?: string | null;
    cost_id?: string | null;
    file_type: string;
    file: File;
    oldPath?: string | null;
  }) {
    const {
      purchase_id = null,
      item_id = null,
      cost_id = null,
      file_type,
      file,
      oldPath = null,
    } = params;

    if (oldPath) {
      const oldRows = files.filter(
        (f) =>
          f.purchase_id === purchase_id &&
          f.item_id === item_id &&
          f.cost_id === cost_id &&
          f.file_type === file_type,
      );
      for (const row of oldRows) {
        await supabase.from("purchase_files").delete().eq("id", row.id);
      }
      await removeStoragePath(oldPath);
    }

    const folder =
      file_type === "상품사진"
        ? "item-photos"
        : file_type === "매입영수증"
          ? "purchase-receipts"
          : file_type === "수입신고필증"
            ? "import-docs"
            : file_type === "관부과세영수증"
              ? "customs-receipts"
              : file_type === "잔금비용영수증"
                ? "balance-receipts"
                : file_type === "카드할인증빙"
                  ? "card-discount-receipts"
                  : file_type === "기타비용영수증"
                    ? "etc-receipts"
                    : "shipping-receipts";

    const path = await uploadStorageFile(file, folder);

    const ins = await supabase.from("purchase_files").insert({
      purchase_id,
      item_id,
      cost_id,
      file_type,
      file_name: file.name,
      file_path: path,
    });
    if (ins.error) throw ins.error;
    return path;
  }

  async function refreshAll() {
    setLoading(true);
    setErr(null);
    setMsg(null);

    try {
      const [pRes, ppRes, iRes, cRes, aRes, arRes, vRes, fRes, wtRes] = await Promise.all([
        supabase
          .from("purchase")
          .select(
            "id,created_at,supplier,purchase_date,payment_met,card_name,currency,fx_rate,total_foreign,total_amount,memo,points_used,points_earned,cancelled_at",
          )
          .order("created_at", { ascending: false }),

        supabase
          .from("purchase_payments")
          .select(
            "id,created_at,purchase_id,payment_date,payment_method,card_name,currency,foreign_amount,krw_amount,fx_rate,memo",
          )
          .order("created_at", { ascending: true }),

        supabase
          .from("purchase_items")
          .select(
            "id,created_at,purchase_id,item_name,qty,foreign_total,foreign_unit_price,unit_price,line_total,memo,is_preorder,product_type",
          )
          .order("created_at", { ascending: false }),

        supabase
          .from("purchase_costs")
          .select(
            "id,created_at,purchase_id,cost_type,amount,currency,fx_rate,memo,vendor_name,cost_date,cancelled_at",
          )
          .order("created_at", { ascending: false })
          .limit(500),

        supabase
          .from("cost_allocations")
          .select("purchase_cost_id,purchase_item_id,allocated_amount"),

        supabase
          .from("purchase_item_arrivals")
          .select("purchase_item_id,arrived_qty"),

        supabase
          .from("vendors")
          .select(
            "id,created_at,name,is_product_supplier,is_forwarder,is_carry_in,is_customs_broker,is_active",
          )
          .order("name", { ascending: true }),

        supabase
          .from("purchase_files")
          .select(
            "id,purchase_id,item_id,cost_id,file_type,file_name,file_path,created_at",
          )
          .order("created_at", { ascending: false }),

        supabase
          .from("vendor_wallet_topups")
          .select(
            "id,created_at,vendor_name,currency,topup_date,foreign_amount,krw_amount,fx_rate,remaining_foreign,memo",
          )
          .order("topup_date", { ascending: true })
          .order("created_at", { ascending: true }),
      ]);

      if (pRes.error) throw pRes.error;
      if (ppRes.error) throw ppRes.error;
      if (iRes.error) throw iRes.error;
      if (cRes.error) throw cRes.error;
      if (aRes.error) throw aRes.error;
      if (arRes.error) throw arRes.error;
      if (vRes.error) throw vRes.error;
      if (fRes.error) throw fRes.error;
      if (wtRes.error) throw wtRes.error;

      const p = (pRes.data ?? []).filter((row: any) => !row.cancelled_at) as PurchaseRow[];
      const pp = (ppRes.data ?? []) as PurchasePaymentRow[];
      const activePurchaseIds = new Set(p.map(row => row.id));
      const it = (iRes.data ?? []).filter((row: any) => activePurchaseIds.has(row.purchase_id)) as PurchaseItemRow[];
      const cs = (cRes.data ?? []).filter((row: any) => !row.cancelled_at) as PurchaseCostRow[];
      const as = (aRes.data ?? []) as CostAllocationRow[];
      const ars = (arRes.data ?? []) as ArrivalRow[];
      const vs = (vRes.data ?? []) as VendorRow[];
      const fs = (fRes.data ?? []) as FileRow[];
      const wts = (wtRes.data ?? []) as VendorWalletTopupRow[];

      setPurchases(p);
      setPurchasePayments(pp);
      setItems(it);
      setCosts(cs);
      setAllocations(as);
      setArrivals(ars);
      setVendors(vs.filter((x) => x.is_active !== false));
      setWalletTopups(wts);
      const pointRes = await supabase.from("vendor_point_ledger").select("vendor_name,amount");
      if (pointRes.error) throw pointRes.error;
      setPointRows(pointRes.data ?? []);
      const pointSettingsRes = await supabase.from("vendor_point_settings").select("vendor_key,currency,foreign_per_point");
      if (pointSettingsRes.error) throw pointSettingsRes.error;
      setPointSettings(pointSettingsRes.data ?? []);

      setFiles(fs);
      const cancelRes = await supabase.from("manager_cancellations").select("id,created_at,action_kind,source_id,reason,effects,snapshot").order("created_at", { ascending: false }).limit(100);
      if (cancelRes.error) throw cancelRes.error;
      setCancellationRows(cancelRes.data ?? []);
      const targetsRes = await supabase.from("cost_allocation_targets").select("cost_id,item_id");
      if (targetsRes.error) throw targetsRes.error;
      setHistoryTargets(targetsRes.data ?? []);

      if (!selectedPurchaseId && p.length > 0) {
        const first = [...p].sort((a, b) => {
          if (a.purchase_date && b.purchase_date)
            return a.purchase_date < b.purchase_date ? 1 : -1;
          if (a.purchase_date && !b.purchase_date) return -1;
          if (!a.purchase_date && b.purchase_date) return 1;
          return a.created_at < b.created_at ? 1 : -1;
        })[0];
        setSelectedPurchaseId(first.id);
      }
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  async function restoreLegacyRefundItems() {
    if (legacyRefundRestoreCandidates.length === 0) {
      setMsg("복구할 이전 전체환불 상품이 없어.");
      return;
    }

    const ok = window.confirm(
      `이전 환불 기록에서 상품 ${legacyRefundRestoreCandidates.length}개를 매입목록에 복구할까?\n\n수량은 현재 환불 후 상태(대부분 0)로 복구되며, 전체환불/부분환불 표시는 그대로 유지돼.`,
    );
    if (!ok) return;

    setLoading(true);
    setErr(null);
    setMsg(null);

    try {
      const restoreRows = legacyRefundRestoreCandidates.map(
        ({ cost, meta }) => {
          const qty = Math.max(0, Math.floor(n(meta.override_qty)));
          const foreignUnit = Math.max(0, n(meta.original_foreign_unit_price));
          const unitKRW = Math.max(0, n(meta.original_unit_price));

          return {
            id: meta.item_id,
            purchase_id: cost.purchase_id as string,
            item_name: meta.override_name || meta.original_name || "환불 상품",
            qty,
            foreign_total: ceil4(foreignUnit * qty),
            foreign_unit_price: foreignUnit,
            unit_price: unitKRW,
            line_total: ceil4(unitKRW * qty),
            memo: "[이전 환불 기록 복구] 환불 이력 확인용 상품",
            is_preorder: false,
            product_type: "기타",
          };
        },
      );

      const ins = await supabase.from("purchase_items").insert(restoreRows);
      if (ins.error) throw ins.error;

      setMsg(
        `이전 환불 상품 ${restoreRows.length}개 복구 완료 · 매입목록에서 전체환불/부분환불 상태를 확인할 수 있어.`,
      );
      await refreshAll();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshAll();
  }, []);

  useEffect(() => {
    if (loading) return;
    if (costs.length === 0 || items.length === 0) return;
    const hasLegacyCost = costs.some((cost) => {
      const type = normalizeCostType(cost.cost_type);
      if (!type || type === "환불" || type === "환불 진행중") return false;
      return !hasCostAllocationBasisMeta(cost.memo);
    });
    if (!hasLegacyCost) return;
    migrateExistingCostsToAutoAllocationBasis();
  }, [loading, costs, allocations, items]);

  function toggleSelectedItem(id: string) {
    setSelectedItemIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function addSelectedItem(id: string) {
    setSelectedItemIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }

  function removeSelectedItem(id: string) {
    setSelectedItemIds((prev) => prev.filter((x) => x !== id));
  }

  function clearSelection() {
    setSelectedItemIds([]);
  }

  function toggleAllVisibleItems() {
    setSelectedItemIds((prev) => {
      const visibleSet = new Set(visibleSelectableItemIds);

      if (allVisibleItemsSelected) {
        return prev.filter((id) => !visibleSet.has(id));
      }

      const next = new Set(prev);
      visibleSelectableItemIds.forEach((id) => next.add(id));
      return Array.from(next);
    });
  }


  async function clearRefundPendingForItems(itemIds: string[]) {
    const idSet = new Set(itemIds);
    if (idSet.size === 0) return;

    const pendingCosts = costs.filter(
      (cost) => normalizeCostType(cost.cost_type) === "환불 진행중",
    );

    for (const cost of pendingCosts) {
      const linked = allocations.filter(
        (a) =>
          a.purchase_cost_id === cost.id &&
          idSet.has(a.purchase_item_id),
      );
      if (linked.length === 0) continue;

      const idsToRemove = linked.map((a) => a.purchase_item_id);
      const delAlloc = await supabase
        .from("cost_allocations")
        .delete()
        .eq("purchase_cost_id", cost.id)
        .in("purchase_item_id", idsToRemove);
      if (delAlloc.error) throw delAlloc.error;

      const remaining = allocations.filter(
        (a) =>
          a.purchase_cost_id === cost.id &&
          !idsToRemove.includes(a.purchase_item_id),
      );
      if (remaining.length === 0) {
        const delCost = await supabase
          .from("purchase_costs")
          .delete()
          .eq("id", cost.id);
        if (delCost.error) throw delCost.error;
      }
    }
  }

  async function toggleRefundPendingForSelected() {
    if (selectedItems.length === 0) {
      setErr("환불 진행중으로 표시할 상품을 먼저 체크해줘.");
      return;
    }

    setLoading(true);
    setErr(null);
    setMsg(null);

    try {
      const toClear = selectedItems
        .filter((item) => refundPendingItemIds.has(item.id))
        .map((item) => item.id);
      const toAdd = selectedItems.filter(
        (item) => !refundPendingItemIds.has(item.id),
      );

      if (toClear.length > 0) {
        await clearRefundPendingForItems(toClear);
      }

      for (const item of toAdd) {
        const insCost = await supabase
          .from("purchase_costs")
          .insert({
            purchase_id: item.purchase_id,
            cost_type: "환불 진행중",
            amount: 0,
            currency: "KRW",
            fx_rate: 1,
            memo: "실제 환불금액 입금 전 임시 표시",
            cost_date: new Date().toISOString().slice(0, 10),
          })
          .select("id")
          .single();
        if (insCost.error) throw insCost.error;

        const insAlloc = await supabase.from("cost_allocations").insert({
          purchase_cost_id: insCost.data.id,
          purchase_item_id: item.id,
          allocated_amount: 0,
        });
        if (insAlloc.error) throw insAlloc.error;
      }

      setMsg(
        toAdd.length > 0
          ? `환불 진행중 ${toAdd.length}개 표시 완료${toClear.length > 0 ? ` / ${toClear.length}개 해제` : ""}`
          : `환불 진행중 ${toClear.length}개 해제 완료`,
      );
      await refreshAll();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  function resetCostForm() {
    setCPointMode(false); setCPointAmount(""); setCPointUsageType("상품");
    setCPointQuote(null); cPointRequestRef.current = null;
    setCType("배송비(거래처)");
    setCAllocationBasis("auto");
    setCUseWallet(false);
    setCTotalForeign("");
    setCTotalKRW("");
    setCCurrency("KRW");
    setCCurrencyCustom("");
    setCFxRate("1");
    setCMemo("");
    setCVendorName("");
    setCDate("");
    setCostReceiptFile(null);
    setCostImportDocFile(null);
    setCostItemForeignMap({});
    setRefundItemEditMap({});
    setCDutyAmount("");
    setCVatAmount("");
    setCCustomsFeeAmount("");
    setCRefundKind("product");
    setCostDirty(false);
  }

  function openCostCreateModal() {
    resetCostForm();
    const nextMap: Record<string, string> = {};
    selectedItemIds.forEach((id) => {
      nextMap[id] = "";
    });
    setCostItemForeignMap(nextMap);
    setRefundItemEditMap(buildRefundItemEditMap(selectedItemIds, items));
    setCostModalOpen(true);
  }

  function resetCostEditForm() {
    setEditingCost(null);
    setEcType("배송비(거래처)");
    setEcAllocationBasis("auto");
    setEcTotalForeign("");
    setEcTotalKRW("");
    setEcCurrency("KRW");
    setEcCurrencyCustom("");
    setEcFxRate("1");
    setEcMemo("");
    setEcVendorName("");
    setEcDate("");
    setEcSelectedItemIds([]);
    setEcReceiptFile(null);
    setEcImportDocFile(null);
    setEcExistingReceiptPath(null);
    setEcExistingImportDocPath(null);
    setEditCostItemForeignMap({});
    setEditRefundItemEditMap({});
    setEcDutyAmount("");
    setEcVatAmount("");
    setEcCustomsFeeAmount("");
    setEcRefundKind("product");
    setCostEditDirty(false);
  }

  function addSelectedCostItem(id: string) {
    addSelectedItem(id);
    setCostItemForeignMap((prev) => ({ ...prev, [id]: prev[id] ?? "" }));
    const found = items.find((it) => it.id === id);
    setRefundItemEditMap((prev) => ({
      ...prev,
      [id]: prev[id] ?? {
        item_name: found?.item_name ?? "",
        next_qty: String(Math.max(1, n(found?.qty))),
      },
    }));
    setCostDirty(true);
  }

  function removeSelectedCostItem(id: string) {
    removeSelectedItem(id);
    setCostItemForeignMap((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setRefundItemEditMap((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setCostDirty(true);
  }

  function addEditCostAllocationItem(id: string) {
    setEcSelectedItemIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setEditCostItemForeignMap((prev) => ({ ...prev, [id]: prev[id] ?? "" }));
    const found = items.find((it) => it.id === id);
    setEditRefundItemEditMap((prev) => ({
      ...prev,
      [id]: prev[id] ?? {
        item_name: found?.item_name ?? "",
        next_qty: String(Math.max(1, n(found?.qty))),
      },
    }));
    setCostEditDirty(true);
  }

  function removeEditCostAllocationItem(id: string) {
    setEcSelectedItemIds((prev) => prev.filter((x) => x !== id));
    setEditCostItemForeignMap((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setEditRefundItemEditMap((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setCostEditDirty(true);
  }

  function syncCostItemForeignMapByIds(ids: string[]) {
    setCostItemForeignMap((prev) => {
      const next: Record<string, string> = {};
      ids.forEach((id) => {
        next[id] = prev[id] ?? "";
      });
      return next;
    });
  }

  function syncEditCostItemForeignMapByIds(ids: string[]) {
    setEditCostItemForeignMap((prev) => {
      const next: Record<string, string> = {};
      ids.forEach((id) => {
        next[id] = prev[id] ?? "";
      });
      return next;
    });
  }

  function addEditCostSelectedItem(id: string) {
    setEcSelectedItemIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    const found = items.find((it) => it.id === id);
    setEditRefundItemEditMap((prev) => ({
      ...prev,
      [id]: prev[id] ?? {
        item_name: found?.item_name ?? "",
        next_qty: String(Math.max(1, n(found?.qty))),
      },
    }));
    setCostEditDirty(true);
  }

  function removeEditCostSelectedItem(id: string) {
    setEcSelectedItemIds((prev) => prev.filter((x) => x !== id));
    setEditRefundItemEditMap((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setCostEditDirty(true);
  }

  function getSerializablePurchaseDraft() {
    return {
      version: 2,
      saved_at: new Date().toISOString(),
      buyMode,
      editingPurchaseId,
      fSupplier,
      fPurchaseDate,
      fPaymentMet,
      fCardName,
      fCurrency,
      fCurrencyCustom,
      fTotalForeign,
      fTotalForeignManuallyEdited,
      manualPaymentForeignKeys,
      fShippingIncluded,
      fFeeIncluded,
      fShippingForeign,
      fFeeForeign,
      fCombinedForeign,
      fShippingVendor,
      fTotalKRW,
      fMemo,
      fUseWallet,
      fPointsUsed,
      fPointsEarned,
      draftPayments,
      draftPurchaseCosts,
      draftItems: draftItems.map((item) => ({
        ...item,
        photoFile: null,
      })),
      existingPurchaseReceiptPath,
    };
  }

  function savePurchaseDraft(showNotice = true) {
    try {
      window.localStorage.setItem(
        PURCHASE_DRAFT_STORAGE_KEY,
        JSON.stringify(getSerializablePurchaseDraft()),
      );
      if (showNotice) {
        setBuyDraftNotice(
          `임시저장 완료 · ${new Date().toLocaleTimeString("ko-KR")}`,
        );
      }
    } catch (e: any) {
      setErr(`임시저장 실패: ${e?.message ?? String(e)}`);
    }
  }

  function loadPurchaseDraft() {
    try {
      const raw = window.localStorage.getItem(PURCHASE_DRAFT_STORAGE_KEY);
      if (!raw) {
        setBuyDraftNotice("불러올 임시저장이 없어.");
        return;
      }

      const draft = JSON.parse(raw);
      setBuyMode(draft.buyMode === "edit" ? "edit" : "create");
      setEditingPurchaseId(draft.editingPurchaseId ?? null);
      setFSupplier(draft.fSupplier ?? "");
      setFPurchaseDate(draft.fPurchaseDate ?? "");
      setFPaymentMet(draft.fPaymentMet ?? "카드");
      setFCardName(draft.fCardName ?? "");
      setFCurrency(draft.fCurrency ?? "USD");
      setFCurrencyCustom(draft.fCurrencyCustom ?? "");
      setFTotalForeign(String(draft.fTotalForeign ?? ""));
      setFTotalForeignManuallyEdited(!!draft.fTotalForeignManuallyEdited);
      setManualPaymentForeignKeys(
        Array.isArray(draft.manualPaymentForeignKeys)
          ? draft.manualPaymentForeignKeys
          : [],
      );
      setFShippingIncluded(!!draft.fShippingIncluded);
      setFFeeIncluded(!!draft.fFeeIncluded);
      setFShippingForeign(String(draft.fShippingForeign ?? ""));
      setFFeeForeign(String(draft.fFeeForeign ?? ""));
      setFCombinedForeign(String(draft.fCombinedForeign ?? ""));
      setFShippingVendor(draft.fShippingVendor ?? "");
      setFTotalKRW(String(draft.fTotalKRW ?? ""));
      setFMemo(draft.fMemo ?? "");
      setFUseWallet(!!draft.fUseWallet && draft.buyMode !== "edit");
      setFPointsUsed(String(draft.fPointsUsed ?? ""));
      setFPointsEarned(String(draft.fPointsEarned ?? ""));
      setDraftPayments(
        Array.isArray(draft.draftPayments) && draft.draftPayments.length > 0
          ? draft.draftPayments
          : [
              {
                key: crypto.randomUUID(),
                payment_date: "",
                payment_method: "카드",
                card_name: "",
                currency: "USD",
                currency_custom: "",
                foreign_amount: "",
                krw_amount: "",
                memo: "",
              },
            ],
      );
      setDraftPurchaseCosts(
        Array.isArray(draft.draftPurchaseCosts)
          ? draft.draftPurchaseCosts
          : [],
      );
      setDraftItems(
        Array.isArray(draft.draftItems) && draft.draftItems.length > 0
          ? draft.draftItems.map((item: DraftItem) => ({
              ...item,
              key: item.key || crypto.randomUUID(),
              foreign_unit_price: item.foreign_unit_price ?? "",
              photoFile: null,
            }))
          : [
              {
                key: crypto.randomUUID(),
                item_name: "",
                qty: "1",
                foreign_unit_price: "",
                foreign_total: "",
                memo: "",
                is_preorder: false,
                product_type: "기타",
                photoFile: null,
                existingPhotoPath: null,
              },
            ],
      );
      setExistingPurchaseReceiptPath(draft.existingPurchaseReceiptPath ?? null);
      setPurchaseReceiptFile(null);
      setBuyDirty(true);
      setBuyDraftNotice(
        draft.saved_at
          ? `임시저장 불러옴 · ${new Date(draft.saved_at).toLocaleString("ko-KR")}`
          : "임시저장 불러옴",
      );
    } catch (e: any) {
      setErr(`임시저장 불러오기 실패: ${e?.message ?? String(e)}`);
    }
  }

  function deletePurchaseDraft() {
    window.localStorage.removeItem(PURCHASE_DRAFT_STORAGE_KEY);
    setBuyDraftNotice("임시저장을 삭제했어.");
  }

  function resetBuyForm() {
    setBuyMode("create");
    setEditingPurchaseId(null);
    setFSupplier("");
    setFPointsUsed("");
    setFPointsEarned("");
    setFPurchaseDate("");
    setFPaymentMet("카드");
    setFCardName("");
    setFCurrency("USD");
    setFCurrencyCustom("");
    setFTotalForeign("");
    setFTotalForeignManuallyEdited(false);
    setManualPaymentForeignKeys([]);
    setFShippingIncluded(false);
    setFFeeIncluded(false);
    setFShippingForeign("");
    setFFeeForeign("");
    setFCombinedForeign("");
    setFShippingVendor("");
    setFTotalKRW("");
    setFMemo("");
    setFUseWallet(false);
    setDraftPayments([
      {
        key: crypto.randomUUID(),
        payment_date: "",
        payment_method: "카드",
        card_name: "",
        currency: "USD",
        currency_custom: "",
        foreign_amount: "",
        krw_amount: "",
        memo: "",
      },
    ]);
    setDraftPurchaseCosts([]);
    setPurchaseReceiptFile(null);
    setExistingPurchaseReceiptPath(null);
    setDraftItems([
      {
        key: crypto.randomUUID(),
        item_name: "",
        qty: "1",
        foreign_unit_price: "",
        foreign_total: "",
        memo: "",
        is_preorder: false,
        product_type: "기타",
        photoFile: null,
        existingPhotoPath: null,
      },
    ]);
    setBuyDirty(false);
    setBuyDraftNotice("");
  }

  function openCreatePurchaseModal() {
    resetBuyForm();
    setBuyMode("create");
    setBuyModalOpen(true);
  }

  function openPurchaseEditModal(p: PurchaseRow) {
    setFPointsUsed(""); setFPointsEarned("");
    const purchaseItems = itemsByPurchase.get(p.id) ?? [];

    setBuyMode("edit");
    setEditingPurchaseId(p.id);
    setFSupplier(p.supplier ?? "");
    setFPurchaseDate(p.purchase_date ?? "");
    setFPaymentMet(p.payment_met ?? "카드");
    setFCardName(p.card_name ?? "");
    setFCurrency(normalizeCurrencySelectValue(p.currency));
    setFCurrencyCustom(
      normalizeCurrencySelectValue(p.currency) === "직접입력"
        ? (p.currency ?? "")
        : "",
    );
    const combinedMeta = parseCombinedPaymentMeta(p.memo);
    setFShippingIncluded(!!combinedMeta?.enabled && n(combinedMeta?.shipping_foreign) > 0);
    setFFeeIncluded(!!combinedMeta?.enabled && n(combinedMeta?.fee_foreign) > 0);
    setFTotalForeignManuallyEdited(true);
    setManualPaymentForeignKeys(
      purchasePayments
        .filter((row) => row.purchase_id === p.id)
        .map((row) => row.id),
    );
    setFTotalForeign(
      String(
        combinedMeta?.enabled
          ? combinedMeta.product_foreign
          : p.total_foreign ?? "",
      ),
    );
    setFShippingForeign(
      combinedMeta?.enabled ? String(combinedMeta.shipping_foreign) : "",
    );
    setFFeeForeign(
      combinedMeta?.enabled ? String(combinedMeta.fee_foreign ?? 0) : "",
    );
    setFCombinedForeign(
      combinedMeta?.enabled
        ? String(combinedMeta.total_foreign)
        : String(p.total_foreign ?? ""),
    );
    setFShippingVendor(
      combinedMeta?.shipping_vendor || p.supplier || "",
    );
    setFTotalKRW(String(p.total_amount ?? ""));
    setFMemo(stripCombinedPaymentMeta(p.memo));
    setFUseWallet(false);
    const existingPayments = purchasePayments.filter((row) => row.purchase_id === p.id);
    setDraftPayments(
      existingPayments.length > 0
        ? existingPayments.map((row) => ({
            key: row.id,
            payment_date: row.payment_date ?? p.purchase_date ?? "",
            payment_method: row.payment_method ?? "카드",
            card_name: row.card_name ?? "",
            currency: normalizeCurrencySelectValue(row.currency),
            currency_custom:
              normalizeCurrencySelectValue(row.currency) === "직접입력" ? row.currency ?? "" : "",
            foreign_amount: String(row.foreign_amount ?? ""),
            krw_amount: String(row.krw_amount ?? ""),
            memo: row.memo ?? "",
          }))
        : [
            {
              key: crypto.randomUUID(),
              payment_date: p.purchase_date ?? "",
              payment_method: p.payment_met ?? "카드",
              card_name: p.card_name ?? "",
              currency: normalizeCurrencySelectValue(p.currency),
              currency_custom:
                normalizeCurrencySelectValue(p.currency) === "직접입력" ? p.currency ?? "" : "",
              foreign_amount: String(p.total_foreign ?? ""),
              krw_amount: String(p.total_amount ?? ""),
              memo: "기존 결제정보 이전",
            },
          ],
    );
    setDraftPurchaseCosts([]);
    setExistingPurchaseReceiptPath(getPurchaseReceiptPath(p.id));
    setPurchaseReceiptFile(null);

    setDraftItems(
      purchaseItems.length > 0
        ? purchaseItems.map((it) => ({
            id: it.id,
            key: it.id,
            item_name: it.item_name ?? "",
            qty: String(it.qty ?? 1),
            foreign_unit_price: String(
              it.foreign_unit_price ??
                (n(it.qty) > 0 ? ceil4(n(it.foreign_total) / n(it.qty)) : ""),
            ),
            foreign_total: String(it.foreign_total ?? ""),
            memo: it.memo ?? "",
            is_preorder: !!it.is_preorder,
            product_type: (it.product_type ?? "기타") as ProductType,
            photoFile: null,
            existingPhotoPath:
              (filesByItem.get(it.id) ?? []).find(
                (f) => f.file_type === "상품사진",
              )?.file_path ?? null,
          }))
        : [
            {
              key: crypto.randomUUID(),
              item_name: "",
              qty: "1",
              foreign_unit_price: "",
              foreign_total: "",
              memo: "",
              is_preorder: false,
              product_type: "기타",
              photoFile: null,
              existingPhotoPath: null,
            },
          ],
    );

    setBuyDirty(false);
    setBuyModalOpen(true);
  }

  function requestCloseBuyModal() {
    if (buyDirty) {
      const ok = window.confirm(
        "작성 중인 내용이 있어요.\n저장하지 않고 닫을까요?",
      );
      if (!ok) return;
    }
    setBuyModalOpen(false);
    setBuyDirty(false);
  }

  function requestCloseCostModal() {
    if (costDirty) {
      const ok = window.confirm(
        "작성 중인 내용이 있어요.\n저장하지 않고 닫을까요?",
      );
      if (!ok) return;
    }
    setCostModalOpen(false);
    setCostDirty(false);
  }

  function requestCloseCostEditModal() {
    if (costEditDirty) {
      const ok = window.confirm(
        "작성 중인 내용이 있어요.\n저장하지 않고 닫을까요?",
      );
      if (!ok) return;
    }
    setCostEditModalOpen(false);
    setCostEditDirty(false);
  }

  async function savePurchaseWithItems() {
    setErr(null);
    if (buyMode === "edit" && editingPurchaseId) {
      const original = purchaseMap.get(editingPurchaseId);
      if (n(original?.points_used) > 0 || n(original?.points_earned) > 0) {
        setErr("포인트가 연결된 매입의 일반 금액 수정은 잠겨 있어요. 포인트 추가는 아래 ‘잔액·포인트 불러오기’에서 저장해 주세요."); return;
      }
    }
    if ((n(fPointsUsed) || n(fPointsEarned)) && (!fUseWallet || buyMode !== "create" || !pointCurrencyMatches)) {
      setErr("포인트 환산 기준을 거래처관리에서 저장하고, 같은 통화의 충전잔액으로 새 매입을 등록해 주세요."); return;
    }
    if (![n(fPointsUsed), n(fPointsEarned)].every((v) => Number.isSafeInteger(v) && v >= 0) || appliedPoints > pointBalance || appliedPointForeign > round4(walletProductForeign + walletShippingForeign + walletFeeForeign)) {
      setErr("포인트는 0 이상의 정수로 입력하고, 사용액은 현재 잔액과 결제 전 금액을 넘지 않아야 해요."); return;
    }
    setMsg(null);

    const isRefundedPurchaseEdit = editingPurchaseHasRefund;
    const currentEditingPurchase = editingPurchaseId
      ? purchaseMap.get(editingPurchaseId) ?? null
      : null;
    const currentCombinedMeta = isRefundedPurchaseEdit
      ? parseCombinedPaymentMeta(currentEditingPurchase?.memo)
      : null;

    const totalKRW =
      fUseWallet && buyMode === "create" && walletQuote.ok
        ? Math.max(0, Math.round(walletQuote.totalKRW))
        : Math.max(0, Math.round(paymentKRWSum));
    const invoiceProductForeign = Math.max(0, n(fTotalForeign));
    const productForeign = Math.max(
      0,
      purchasePaymentComposition.productForeign ||
        enteredDraftItemForeignSum ||
        invoiceProductForeign,
    );
    const feeForeign =
      fUseWallet && fFeeIncluded && buyMode === "create"
        ? Math.max(0, n(fFeeForeign))
        : 0;

    const combinedForeign =
      fUseWallet && buyMode === "create"
        ? Math.max(
            0,
            round4(
              productForeign +
                (fShippingIncluded ? Math.max(0, n(fShippingForeign)) : 0) +
                (fFeeIncluded ? feeForeign : 0),
            ),
          )
        : fShippingIncluded
          ? Math.max(
              0,
              purchasePaymentComposition.combinedForeign ||
                paymentForeignSum ||
                n(fCombinedForeign),
            )
          : isRefundedPurchaseEdit
            ? Math.max(
                0,
                paymentForeignSum ||
                  n(currentEditingPurchase?.total_foreign) ||
                  productForeign,
              )
            : productForeign;

    const shippingForeign = fShippingIncluded
      ? isRefundedPurchaseEdit
        ? Math.max(
            0,
            n(fShippingForeign) || n(currentCombinedMeta?.shipping_foreign),
          )
        : fUseWallet && buyMode === "create"
          ? Math.max(0, n(fShippingForeign))
          : Math.max(0, round4(combinedForeign - productForeign))
      : 0;
    const productKRW =
      fUseWallet && buyMode === "create" && walletQuote.ok
        ? walletQuote.productKRW
        : purchasePaymentComposition.productKRW;
    const shippingKRW =
      fUseWallet && buyMode === "create" && walletQuote.ok
        ? walletQuote.shippingKRW
        : purchasePaymentComposition.shippingKRW;
    const cur = currencyValue(fCurrency, fCurrencyCustom);
    const fx =
      fUseWallet && buyMode === "create" && walletQuote.ok
        ? calcFxRate(walletQuote.productKRW, productForeign)
        : purchasePaymentComposition.productFx;
    const validPayments = draftPayments.filter(
      (row) => n(row.krw_amount) > 0 || (fullyPointPaid && row.payment_method === "충전잔액"),
    );

    if (!cur) {
      setErr("통화를 선택하거나 직접 입력해줘.");
      return;
    }

    if (fUseWallet && buyMode === "create") {
      if (!fSupplier.trim()) {
        setErr("충전잔액 결제는 거래처를 선택해야 해.");
        return;
      }

      if (!walletQuote.ok) {
        setErr(
          `충전잔액이 부족해. 현재 ${fmtNum(
            walletQuote.balance,
          )} ${walletCurrency} / 필요 ${fmtNum(
            walletQuote.needed,
          )} ${walletCurrency}`,
        );
        return;
      }

      if (
        validPayments.length !== 1 ||
        validPayments[0]?.payment_method !== "충전잔액"
      ) {
        setErr("충전잔액 결제내역 자동계산을 확인해줘.");
        return;
      }
    }
    if (validPayments.length === 0 || (totalKRW <= 0 && !fullyPointPaid)) {
      setErr("결제내역을 1건 이상 입력하고 원화 실결제금액을 넣어줘.");
      return;
    }
    if (invoiceProductForeign <= 0 || productForeign <= 0 || (fx <= 0 && !fullyPointPaid)) {
      setErr("전체 상품금액과 원화 결제금액을 확인해줘. 상품별 외화가격은 비워두면 수량 기준으로 자동 분배돼.");
      return;
    }

    // 환불이 없는 일반 매입만 현재 상품합계와 결제총액의 일치를 검사한다.
    // 환불된 매입은 원결제금액과 현재 남은 상품합계가 달라지는 것이 정상이다.
    if (!isRefundedPurchaseEdit) {
      if (fShippingIncluded && shippingForeign <= 0) {
        setErr(
          fUseWallet
            ? "배송비를 충전잔액에서 사용할 경우 배송비 외화금액을 입력해줘."
            : "함께 결제한 배송비 외화총액을 입력해줘.",
        );
        return;
      }
      if (fUseWallet && fFeeIncluded && feeForeign <= 0) {
        setErr("수수료를 충전잔액에서 사용할 경우 수수료 외화금액을 입력해줘.");
        return;
      }

      const expectedCombined = round4(
        productForeign +
          (fShippingIncluded ? shippingForeign : 0) +
          (fUseWallet && fFeeIncluded ? feeForeign : 0),
      );

      if (
        (fShippingIncluded || (fUseWallet && fFeeIncluded)) &&
        Math.abs(expectedCombined - combinedForeign) > 0.01
      ) {
        setErr(
          `상품·배송비·수수료 외화합계(${fmtNum(
            expectedCombined,
          )})가 총 차감 외화(${fmtNum(combinedForeign)})와 달라.`,
        );
        return;
      }
    }

    // 충전잔액 사용 시 상품·배송비·수수료가 모두 같은 잔액에서 차감된다.
    // 따라서 결제내역 외화합계도 실제 총 충전잔액 차감 외화와 맞아야 한다.
    const expectedPaymentForeign = fUseWallet
      ? round4(combinedForeign - appliedPointForeign)
      : fShippingIncluded
        ? combinedForeign
        : productForeign;

    if (
      !isRefundedPurchaseEdit &&
      !hasCrossCurrencyPayments &&
      paymentForeignSum > 0 &&
      Math.abs(paymentForeignSum - expectedPaymentForeign) > 0.01
    ) {
      setErr(
        fUseWallet
          ? `충전잔액 결제내역 외화합계(${fmtNum(
              paymentForeignSum,
            )})가 실제 총 차감 외화(${fmtNum(
              expectedPaymentForeign,
            )})와 달라. 상품·배송비·수수료 충전잔액 사용분을 모두 포함한 금액이어야 해.`
          : `결제내역 외화합계(${fmtNum(
              paymentForeignSum,
            )})가 실제 총 결제 외화총액(${fmtNum(
              expectedPaymentForeign,
            )})과 달라. 배송비를 같이 결제했다면 결제내역에는 배송비까지 포함된 실제 송금액을 적어줘.`,
      );
      return;
    }

    for (const payment of validPayments) {
      const paymentCurrency = currencyValue(
        payment.currency,
        payment.currency_custom,
      );
      if (!paymentCurrency) {
        setErr("각 결제내역의 통화를 선택하거나 직접 입력해줘.");
        return;
      }
      if (!payment.payment_date || payment.payment_date.length !== 10) {
        setErr(fUseWallet ? "잔액 사용일을 YYYY-MM-DD 형식으로 입력해줘." : "각 결제내역의 결제일을 YYYY-MM-DD 형식으로 입력해줘.");
        return;
      }
      if (
        normalizeCurrencyCode(paymentCurrency) !== "KRW" &&
        n(payment.foreign_amount) <= 0 && !fullyPointPaid
      ) {
        setErr("외화 결제는 외화 결제금액도 입력해줘.");
        return;
      }
    }

    const computed = isRefundedPurchaseEdit
      ? {
          ok: true as const,
          message: "",
          rows: draftItems
            .map((d) => ({
              id: d.id,
              key: d.key,
              item_name: d.item_name.trim(),
              qty: Math.max(0, Math.floor(n(d.qty))),
              foreign_total: ceil4(Math.max(0, n(d.foreign_total))),
              memo: d.memo.trim(),
              is_preorder: d.is_preorder,
              product_type: d.product_type,
              photoFile: d.photoFile,
              existingPhotoPath: d.existingPhotoPath,
            }))
            .filter((d) => d.item_name.length > 0),
        }
      : computeDraftForeignTotals(draftItems, productForeign);

    if (!computed.ok) {
      setErr(computed.message);
      return;
    }

    if (computed.rows.length === 0) {
      setErr("상품을 1개 이상 입력해줘.");
      return;
    }

    const cleaned = computed.rows;

    const totalForeignToSave = isRefundedPurchaseEdit
      ? Math.max(
          0,
          paymentForeignSum ||
            n(currentEditingPurchase?.total_foreign) ||
            combinedForeign,
        )
      : combinedForeign;
    const purchaseFxToSave = isRefundedPurchaseEdit
      ? calcFxRate(totalKRW, totalForeignToSave) ||
        Math.max(0, n(currentEditingPurchase?.fx_rate))
      : fShippingIncluded || fFeeIncluded
        ? calcFxRate(totalKRW, combinedForeign)
        : fx;
    const combinedMetaToSave = fShippingIncluded || fFeeIncluded
      ? isRefundedPurchaseEdit && currentCombinedMeta?.enabled
        ? {
            ...currentCombinedMeta,
            product_foreign: invoiceProductForeign || currentCombinedMeta.product_foreign,
            shipping_foreign:
              Math.max(0, n(fShippingForeign)) ||
              currentCombinedMeta.shipping_foreign,
            fee_foreign:
              Math.max(0, n(fFeeForeign)) ||
              currentCombinedMeta.fee_foreign ||
              0,
            total_foreign: totalForeignToSave,
            shipping_vendor:
              fShippingVendor.trim() || currentCombinedMeta.shipping_vendor,
          }
        : {
            enabled: true,
            product_foreign: invoiceProductForeign,
            shipping_foreign: shippingForeign,
            fee_foreign: feeForeign,
            total_foreign: totalForeignToSave,
            product_krw: productKRW,
            shipping_krw: shippingKRW,
            fee_krw:
              fUseWallet && walletQuote.ok ? walletQuote.feeKRW : 0,
            shipping_vendor: fShippingVendor.trim(),
          }
      : null;
    const historicalProductFx = isRefundedPurchaseEdit
      ? calcFxRate(
          Math.max(0, n(currentCombinedMeta?.product_krw)) || productKRW,
          Math.max(0, n(currentCombinedMeta?.product_foreign)) ||
            invoiceProductForeign,
        ) ||
        Math.max(0, n(currentEditingPurchase?.fx_rate)) ||
        fx
      : fx;

    setLoading(true);
    try {
      let purchaseId = editingPurchaseId;

      if (buyMode === "edit" && editingPurchaseId) {
        const updP = await supabase
          .from("purchase")
          .update({
            supplier: fSupplier || null,
            purchase_date: validPayments[0]?.payment_date || null,
            payment_met: paymentPrimary?.payment_method || null,
            card_name: paymentPrimary?.card_name || null,
            currency: cur,
            fx_rate: purchaseFxToSave,
            total_foreign: totalForeignToSave,
            total_amount: totalKRW,
            memo: buildCombinedPaymentMemo(fMemo, combinedMetaToSave),
          })
          .eq("id", editingPurchaseId);
        if (updP.error) throw updP.error;
      } else {
        const insP = await supabase
          .from("purchase")
          .insert({
            supplier: fSupplier || null,
            purchase_date: validPayments[0]?.payment_date || null,
            payment_met: paymentPrimary?.payment_method || null,
            card_name: paymentPrimary?.card_name || null,
            currency: cur,
            fx_rate: fShippingIncluded || fFeeIncluded
              ? calcFxRate(totalKRW, combinedForeign)
              : fx,
            total_foreign: combinedForeign,
            total_amount: totalKRW,
            memo: buildCombinedPaymentMemo(
              fMemo,
              fShippingIncluded || fFeeIncluded
                ? {
                    enabled: true,
                    product_foreign: invoiceProductForeign,
                    shipping_foreign: shippingForeign,
                    fee_foreign: feeForeign,
                    total_foreign: combinedForeign,
                    product_krw: productKRW,
                    shipping_krw: shippingKRW,
                    fee_krw:
                      fUseWallet && walletQuote.ok ? walletQuote.feeKRW : 0,
                    shipping_vendor: fShippingVendor.trim(),
                  }
                : null,
            ),
          })
          .select("id")
          .single();
        if (insP.error) throw insP.error;
        purchaseId = insP.data.id as string;
        setSelectedPurchaseId(purchaseId);
      }

      if (!purchaseId) throw new Error("매입 ID를 찾을 수 없어.");

      // 새 매입에서 충전잔액을 사용한 경우 실제 FIFO 차감을 확정한다.
      // 상품분과 배송비분은 같은 충전잔액에서 순서대로 차감되지만,
      // 원화 원가는 서로 분리해서 저장한다.
      if (fUseWallet && buyMode === "create") {
        const consumeRes = await supabase.rpc(
          (appliedPoints > 0 || n(fPointsEarned) > 0) ? "consume_vendor_wallet_with_points_v2" : "consume_vendor_wallet",
          {
            p_purchase_id: purchaseId,
            p_vendor_name: fSupplier.trim(),
            p_currency: walletCurrency,
            p_usage_date:
              validPayments[0]?.payment_date || fPurchaseDate,
            p_product_foreign: productForeign,
            p_shipping_foreign: shippingForeign,
            p_fee_foreign: feeForeign,
            p_memo: "매입관리 자동 차감",
            ...((appliedPoints > 0 || n(fPointsEarned) > 0) ? {
              p_point_currency: pointSetting!.currency, p_point_rate: n(pointSetting!.foreign_per_point), p_points_used: appliedPoints, p_points_earned: n(fPointsEarned),
              p_expected_product_krw: walletQuote.productKRW,
              p_expected_shipping_krw: walletQuote.shippingKRW,
              p_expected_fee_krw: walletQuote.feeKRW,
            } : {}),
          },
        );

        if (consumeRes.error) {
          // 매입 본체만 생성된 직후 차감이 실패한 경우 찌꺼기를 남기지 않는다.
          await supabase
            .from("purchase")
            .delete()
            .eq("id", purchaseId);
          throw consumeRes.error;
        }

        const consumed = (consumeRes.data ?? {}) as {
          product_krw?: number;
          shipping_krw?: number;
          fee_krw?: number;
          total_krw?: number;
        };

        const consumedProductKRW = Math.max(
          0,
          Math.round(n(consumed.product_krw)),
        );
        const consumedShippingKRW = Math.max(
          0,
          Math.round(n(consumed.shipping_krw)),
        );
        const consumedFeeKRW = Math.max(
          0,
          Math.round(n(consumed.fee_krw)),
        );
        const consumedTotalKRW = Math.max(
          0,
          Math.round(n(consumed.total_krw)),
        );

        if (consumedTotalKRW <= 0 && !fullyPointPaid) {
          throw new Error(
            "충전잔액 원화 계산 결과가 0원이야. 충전내역을 확인해줘.",
          );
        }

        // 아래 기존 저장 로직이 같은 원화금액을 사용하도록 반영한다.
        validPayments[0].krw_amount = String(consumedTotalKRW);

        const walletPurchaseMemo = buildCombinedPaymentMemo(
          fMemo,
          fShippingIncluded || fFeeIncluded
            ? {
                enabled: true,
                product_foreign: invoiceProductForeign,
                shipping_foreign: shippingForeign,
                fee_foreign: feeForeign,
                total_foreign: combinedForeign,
                product_krw: consumedProductKRW,
                shipping_krw: consumedShippingKRW,
                fee_krw: consumedFeeKRW,
                shipping_vendor:
                  fShippingVendor.trim() || fSupplier.trim(),
              }
            : null,
        );

        const updateWalletPurchase = await supabase
          .from("purchase")
          .update({
            payment_met: "충전잔액",
            card_name: `${fSupplier.trim()} 외화잔액`,
            currency: cur,
            fx_rate: calcFxRate(
              consumedTotalKRW,
              combinedForeign,
            ),
            total_foreign: combinedForeign,
            total_amount: consumedTotalKRW,
            memo: walletPurchaseMemo,
          })
          .eq("id", purchaseId);

        if (updateWalletPurchase.error)
          throw updateWalletPurchase.error;
      }

      const deletePayments = await supabase
        .from("purchase_payments")
        .delete()
        .eq("purchase_id", purchaseId);
      if (deletePayments.error) throw deletePayments.error;

      const paymentRows = validPayments.map((payment) => {
        const paymentCurrency = currencyValue(payment.currency, payment.currency_custom);
        const foreignAmount =
          normalizeCurrencyCode(paymentCurrency) === "KRW"
            ? n(payment.krw_amount)
            : n(payment.foreign_amount);
        return {
          purchase_id: purchaseId,
          payment_date: payment.payment_date,
          payment_method: payment.payment_method || null,
          card_name: payment.card_name || null,
          currency: paymentCurrency,
          foreign_amount: foreignAmount,
          krw_amount: n(payment.krw_amount),
          fx_rate:
            normalizeCurrencyCode(paymentCurrency) === "KRW"
              ? 1
              : calcFxRate(n(payment.krw_amount), foreignAmount),
          memo: payment.memo || null,
        };
      });
      const insertPayments = await supabase.from("purchase_payments").insert(paymentRows);
      if (insertPayments.error) throw insertPayments.error;

      const prevItems = itemsByPurchase.get(purchaseId) ?? [];
      const prevIds = new Set(prevItems.map((x) => x.id));
      const nextIds = new Set(
        cleaned.filter((x) => x.id).map((x) => x.id as string),
      );

      const deleteIds = [...prevIds].filter((id) => !nextIds.has(id));
      if (deleteIds.length > 0) {
        const delRes = await supabase
          .from("purchase_items")
          .delete()
          .in("id", deleteIds);
        if (delRes.error) throw delRes.error;
      }

      const savedPurchaseItemIds: string[] = [];
      const crossCurrencyProductParts = (hasCrossCurrencyPayments || appliedPoints > 0) && !isRefundedPurchaseEdit
        ? allocateExactKRW(Math.round(productKRW), cleaned.map((row) => Math.max(0, row.foreign_total)))
        : null;

      for (let idx = 0; idx < cleaned.length; idx++) {
        const d = cleaned[idx];
        const previousItem = d.id
          ? items.find((item) => item.id === d.id) ?? null
          : null;
        const q = isRefundedPurchaseEdit
          ? Math.max(0, Math.floor(n(d.qty)))
          : Math.max(1, n(d.qty));
        const ft = Math.max(0, d.foreign_total);
        const foreignUnit =
          q > 0
            ? ceil4(ft / q)
            : Math.max(0, n(previousItem?.foreign_unit_price));
        const previousItemFx =
          previousItem &&
          n(previousItem.foreign_unit_price) > 0 &&
          n(previousItem.unit_price) > 0
            ? n(previousItem.unit_price) / n(previousItem.foreign_unit_price)
            : 0;
        const itemFx = isRefundedPurchaseEdit
          ? previousItemFx || historicalProductFx
          : fx;
        const lineKRW = q > 0 ? (crossCurrencyProductParts ? crossCurrencyProductParts[idx] : ceil4(ft * itemFx)) : 0;
        const unitKRW =
          q > 0
            ? ceil4(lineKRW / q)
            : Math.max(0, n(previousItem?.unit_price));

        const payload = {
          purchase_id: purchaseId,
          item_name: d.item_name,
          qty: q,
          foreign_total: ft,
          foreign_unit_price: foreignUnit,
          unit_price: unitKRW,
          line_total: lineKRW,
          memo: d.memo || null,
          is_preorder: d.is_preorder,
          product_type: d.product_type,
        };

        let savedId = d.id;
        if (d.id) {
          const updI = await supabase
            .from("purchase_items")
            .update(payload)
            .eq("id", d.id);
          if (updI.error) throw updI.error;
        } else {
          const insI = await supabase
            .from("purchase_items")
            .insert(payload)
            .select("id")
            .single();
          if (insI.error) throw insI.error;
          savedId = insI.data.id as string;
        }

        if (!savedId) throw new Error("상품 저장 ID를 찾을 수 없어.");
        savedPurchaseItemIds.push(savedId);

        if (d.photoFile) {
          await upsertPurchaseFile({
            item_id: savedId,
            file_type: "상품사진",
            file: d.photoFile,
            oldPath: d.existingPhotoPath ?? null,
          });
        }
      }

      if (!isRefundedPurchaseEdit) {
        const previousIncludedShippingCosts = costs.filter(
          (cost) =>
            cost.purchase_id === purchaseId &&
            normalizeCostType(cost.cost_type) === "배송비(거래처)" &&
            String(cost.memo ?? "").includes(INCLUDED_SHIPPING_MEMO_HEADER),
        );
  
        for (const oldCost of previousIncludedShippingCosts) {
          const delAlloc = await supabase
            .from("cost_allocations")
            .delete()
            .eq("purchase_cost_id", oldCost.id);
          if (delAlloc.error) throw delAlloc.error;
  
          const delCost = await supabase
            .from("purchase_costs")
            .delete()
            .eq("id", oldCost.id);
          if (delCost.error) throw delCost.error;
        }
  
        if (fShippingIncluded && shippingForeign > 0 && shippingKRW > 0) {
          const shippingCost = await supabase
            .from("purchase_costs")
            .insert({
              purchase_id: purchaseId,
              cost_type: "배송비(거래처)",
              amount: shippingForeign,
              currency: cur,
              fx_rate: calcFxRate(shippingKRW, shippingForeign),
              memo: `${INCLUDED_SHIPPING_MEMO_HEADER}
  상품값과 같은 결제로 지급`,
              vendor_name: fShippingVendor.trim() || fSupplier || null,
              cost_date: validPayments[0]?.payment_date || null,
            })
            .select("id")
            .single();
          if (shippingCost.error) throw shippingCost.error;
  
          const shippingAllocated = (appliedPoints > 0 ? allocateExactKRW : distributeByWeightsCeilIntSigned)(
            shippingKRW,
            cleaned.map((row) => Math.max(0, row.qty)),
          );
  
          const shippingAllocationInsert = await supabase
            .from("cost_allocations")
            .insert(
              savedPurchaseItemIds.map((itemId, index) => ({
                purchase_cost_id: shippingCost.data.id,
                purchase_item_id: itemId,
                allocated_amount: shippingAllocated[index] ?? 0,
              })),
            );
          if (shippingAllocationInsert.error)
            throw shippingAllocationInsert.error;
        }
      }


      if (
        buyMode === "create" &&
        fUseWallet &&
        feeForeign > 0 &&
        walletQuote.feeKRW > 0
      ) {
        const feeCost = await supabase
          .from("purchase_costs")
          .insert({
            purchase_id: purchaseId,
            cost_type: "수수료",
            amount: feeForeign,
            currency: cur,
            fx_rate: calcFxRate(walletQuote.feeKRW, feeForeign),
            memo: "[충전잔액 수수료]\n상품 매입과 함께 충전잔액에서 차감",
            vendor_name: fSupplier || null,
            cost_date:
              validPayments[0]?.payment_date || fPurchaseDate || null,
          })
          .select("id")
          .single();

        if (feeCost.error) throw feeCost.error;

        const feeAllocated = (appliedPoints > 0 ? allocateExactKRW : distributeByWeightsCeilIntSigned)(
          walletQuote.feeKRW,
          cleaned.map((row) => Math.max(0, row.foreign_total)),
        );

        const feeAllocationInsert = await supabase
          .from("cost_allocations")
          .insert(
            savedPurchaseItemIds.map((itemId, index) => ({
              purchase_cost_id: feeCost.data.id,
              purchase_item_id: itemId,
              allocated_amount: feeAllocated[index] ?? 0,
            })),
          );

        if (feeAllocationInsert.error)
          throw feeAllocationInsert.error;
      }

      if (buyMode === "create" && draftPurchaseCosts.length > 0) {
        for (const draftCost of draftPurchaseCosts) {
          const itemWeights = isShippingCostType(draftCost.cost_type)
            ? cleaned.map((row) => Math.max(0, row.qty))
            : cleaned.map((row) =>
                Math.max(0, row.foreign_total * fx),
              );
          const costCurrency = currencyValue(draftCost.currency, draftCost.currency_custom);
          const costKRW = Math.max(0, n(draftCost.krw_amount));
          const signedDraftCostKRW = signedCostAmountByType(
            draftCost.cost_type,
            costKRW,
          );
          if (!draftCost.cost_type || !costCurrency || costKRW <= 0) continue;
          if (!draftCost.cost_date || draftCost.cost_date.length !== 10) {
            throw new Error("추가비용 날짜를 YYYY-MM-DD 형식으로 입력해줘.");
          }
          const foreignAmount =
            normalizeCurrencyCode(costCurrency) === "KRW"
              ? costKRW
              : Math.max(0, n(draftCost.foreign_amount));
          if (normalizeCurrencyCode(costCurrency) !== "KRW" && foreignAmount <= 0) {
            throw new Error("외화 추가비용은 외화금액도 입력해줘.");
          }

          const costInsert = await supabase
            .from("purchase_costs")
            .insert({
              purchase_id: purchaseId,
              cost_type: draftCost.cost_type,
              amount: signedCostAmountByType(
                draftCost.cost_type,
                foreignAmount,
              ),
              currency: costCurrency,
              fx_rate:
                normalizeCurrencyCode(costCurrency) === "KRW"
                  ? 1
                  : calcFxRate(costKRW, foreignAmount),
              memo: draftCost.memo || null,
              vendor_name: draftCost.vendor_name || null,
              cost_date: draftCost.cost_date,
            })
            .select("id")
            .single();
          if (costInsert.error) throw costInsert.error;

          const allocated = distributeByWeightsCeilIntSigned(
            signedDraftCostKRW,
            itemWeights,
          );
          const allocationInsert = await supabase.from("cost_allocations").insert(
            savedPurchaseItemIds.map((itemId, index) => ({
              purchase_cost_id: costInsert.data.id,
              purchase_item_id: itemId,
              allocated_amount: allocated[index] ?? 0,
            })),
          );
          if (allocationInsert.error) throw allocationInsert.error;
        }
      }

      if (purchaseReceiptFile) {
        await upsertPurchaseFile({
          purchase_id: purchaseId,
          file_type: "매입영수증",
          file: purchaseReceiptFile,
          oldPath: existingPurchaseReceiptPath ?? null,
        });
      }

      setMsg(
        buyMode === "edit"
          ? isRefundedPurchaseEdit
            ? "매입 수정 완료 · 최초 결제내역은 유지하고 환불 후 남은 상품만 수정했어."
            : "매입 수정 완료"
          : fUseWallet
            ? `매입 저장 완료 · 충전잔액 FIFO 차감 / 상품 ${fmtKRW(
                productKRW,
              )}${
                fShippingIncluded
                  ? ` / 배송비 ${fmtKRW(shippingKRW)}`
                  : ""
              }${
                feeForeign > 0
                  ? ` / 수수료 ${fmtKRW(walletQuote.feeKRW)}`
                  : ""
              }`
            : fShippingIncluded
              ? `매입 저장 완료 · 상품 ${fmtKRW(
                  productKRW,
                )} / 배송비 ${fmtKRW(
                  shippingKRW,
                )}로 실제 결제액을 남김없이 나눴어.`
              : `매입 저장 완료 (상품 외화합계 자동보정 / 환율 ${fx.toFixed(
                  4,
                )})`,
      );
      window.localStorage.removeItem(PURCHASE_DRAFT_STORAGE_KEY);
      setBuyModalOpen(false);
      resetBuyForm();
      await refreshAll();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  async function migrateExistingCostsToAutoAllocationBasis() {
    if (costAllocationMigrationRunningRef.current) return;

    const legacyCosts = costs.filter((cost) => {
      const type = normalizeCostType(cost.cost_type);
      if (!type || type === "환불" || type === "환불 진행중") return false;
      return !hasCostAllocationBasisMeta(cost.memo);
    });

    if (legacyCosts.length === 0) return;

    costAllocationMigrationRunningRef.current = true;
    try {
      let updatedCount = 0;
      let skippedCount = 0;

      for (const cost of legacyCosts) {
        const oldRows = allocations.filter(
          (allocation) => allocation.purchase_cost_id === cost.id,
        );
        const linkedIds = new Set(oldRows.map((row) => row.purchase_item_id));
        const targetItems = items.filter(
          (item) =>
            linkedIds.has(item.id) &&
            Math.max(0, Math.floor(n(item.qty))) > 0,
        );

        const totalAllocatedKRW = Math.round(
          oldRows.reduce(
            (sum, allocation) => sum + n(allocation.allocated_amount),
            0,
          ),
        );

        if (targetItems.length > 0 && totalAllocatedKRW !== 0) {
          const weights = getCostAllocationWeights(
            cost.cost_type,
            targetItems,
            "auto",
          );

          if (weights.some((weight) => weight > 0)) {
            const distributed = distributeByWeightsCeilIntSigned(
              totalAllocatedKRW,
              weights,
            );

            const del = await supabase
              .from("cost_allocations")
              .delete()
              .eq("purchase_cost_id", cost.id);
            if (del.error) throw del.error;

            const ins = await supabase.from("cost_allocations").insert(
              targetItems.map((item, index) => ({
                purchase_cost_id: cost.id,
                purchase_item_id: item.id,
                allocated_amount: distributed[index] ?? 0,
              })),
            );
            if (ins.error) throw ins.error;
            updatedCount += 1;
          } else {
            skippedCount += 1;
          }
        } else {
          skippedCount += 1;
        }

        const memoUpdate = await supabase
          .from("purchase_costs")
          .update({
            memo: buildCostAllocationBasisMemo(cost.memo, "auto"),
          })
          .eq("id", cost.id);
        if (memoUpdate.error) throw memoUpdate.error;
      }

      setMsg(
        `기존 추가비용 자동 배분기준 적용 완료 · ${updatedCount}건 재배분${
          skippedCount > 0 ? ` / ${skippedCount}건은 배분 대상 없음` : ""
        }`,
      );
      await refreshAll();
    } catch (e: any) {
      setErr(`기존 추가비용 자동 재배분 실패: ${e?.message ?? String(e)}`);
    } finally {
      costAllocationMigrationRunningRef.current = false;
    }
  }

  async function reallocateAllExistingShippingCostsByQuantity() {
    const shippingCosts = costs.filter((cost) =>
      isShippingCostType(cost.cost_type),
    );

    if (shippingCosts.length === 0) {
      setMsg("수량대비로 다시 배분할 기존 배송비가 없어.");
      return;
    }

    const ok = window.confirm(
      `기존 배송비 ${shippingCosts.length}건을 현재 남아 있는 상품 수량 기준으로 전부 다시 배분할까?\n\n관부과세와 다른 추가비용은 건드리지 않아.`,
    );
    if (!ok) return;

    setLoading(true);
    setErr(null);
    setMsg(null);

    try {
      let updatedCount = 0;
      let skippedCount = 0;

      for (const cost of shippingCosts) {
        const oldAllocationRows = allocations.filter(
          (allocation) => allocation.purchase_cost_id === cost.id,
        );

        let targetItems: PurchaseItemRow[] = [];

        if (oldAllocationRows.length > 0) {
          const linkedItemIds = new Set(
            oldAllocationRows.map((row) => row.purchase_item_id),
          );
          targetItems = items.filter(
            (item) =>
              linkedItemIds.has(item.id) &&
              Math.max(0, Math.floor(n(item.qty))) > 0,
          );
        } else if (cost.purchase_id) {
          targetItems = items.filter(
            (item) =>
              item.purchase_id === cost.purchase_id &&
              Math.max(0, Math.floor(n(item.qty))) > 0,
          );
        }

        if (targetItems.length === 0) {
          skippedCount += 1;
          continue;
        }

        const allocatedTotalKRW = Math.round(
          oldAllocationRows.reduce(
            (sum, row) => sum + n(row.allocated_amount),
            0,
          ),
        );

        const storedCostKRW =
          normalizeCurrencyCode(cost.currency) === "KRW"
            ? Math.round(Math.abs(n(cost.amount)))
            : Math.round(Math.abs(n(cost.amount)) * Math.max(0, n(cost.fx_rate)));

        const totalShippingKRW =
          allocatedTotalKRW !== 0 ? allocatedTotalKRW : storedCostKRW;

        if (totalShippingKRW === 0) {
          skippedCount += 1;
          continue;
        }

        const distributed = distributeByWeightsCeilIntSigned(
          totalShippingKRW,
          targetItems.map((item) =>
            Math.max(0, Math.floor(n(item.qty))),
          ),
        );

        const del = await supabase
          .from("cost_allocations")
          .delete()
          .eq("purchase_cost_id", cost.id);
        if (del.error) throw del.error;

        const ins = await supabase.from("cost_allocations").insert(
          targetItems.map((item, index) => ({
            purchase_cost_id: cost.id,
            purchase_item_id: item.id,
            allocated_amount: distributed[index] ?? 0,
          })),
        );
        if (ins.error) throw ins.error;

        updatedCount += 1;
      }

      window.localStorage.setItem(
        SHIPPING_REALLOCATION_DONE_KEY,
        "done",
      );
      setShippingReallocationDone(true);
      setMsg(
        `기존 배송비 수량대비 재배분 완료 · ${updatedCount}건 적용${
          skippedCount > 0 ? ` / ${skippedCount}건 제외` : ""
        }`,
      );
      await refreshAll();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  function processingProducts(cost: PurchaseCostRow) {
    const refundItems = parseRefundMeta(cost.memo).items;
    const ids = new Set([
      ...historyTargets.filter(row => row.cost_id === cost.id).map(row => row.item_id),
      ...allocations.filter(row => row.purchase_cost_id === cost.id).map(row => row.purchase_item_id),
      ...refundItems.map(row => row.item_id),
    ]);
    return [...ids].map(id => {
      const current = itemMap.get(id);
      const original = refundItems.find(row => row.item_id === id);
      return { id, name: current?.item_name || original?.override_name || original?.original_name || "상품명 확인 필요",
        qty: n(current?.qty ?? original?.override_qty), before: original?.original_qty };
    });
  }

  function renderProcessingProducts(cost: PurchaseCostRow) {
    const products = processingProducts(cost);
    if (!products.length) return <div style={styles.small}>대상 상품 연결 기록이 없어요. 해당 매입의 상품을 임의로 표시하지 않아요.</div>;
    return <div style={{ padding: 10, background: "#f8fafc", borderRadius: 8, display: "grid", gap: 6, overflowWrap: "anywhere" }}>
      <b style={{ fontSize: 12 }}>대상 상품 {products.length}종 · 현재 총 {fmtNum(products.reduce((sum, row) => sum + row.qty, 0))}개</b>
      {products.slice(0, 3).map(row => <div key={row.id} style={{ fontSize: 12 }}>{row.name} · {row.before !== undefined ? `환불 전 ${row.before}개 → 현재 ${row.qty}개` : `현재 ${row.qty}개`}</div>)}
      {products.length > 3 ? <details><summary style={{ cursor: "pointer", fontSize: 12 }}>나머지 {products.length - 3}종 보기</summary><div style={{ maxHeight: 220, overflowY: "auto", display: "grid", gap: 5, paddingTop: 6 }}>{products.slice(3).map(row => <div key={row.id} style={{ fontSize: 12 }}>{row.name} · 현재 {row.qty}개</div>)}</div></details> : null}
    </div>;
  }

  async function loadEditPurchasePoints() {
    if (!editingPurchaseId || editPointBusyRef.current) return;
    const source = purchaseMap.get(editingPurchaseId);
    if (!source?.supplier) { setErr("저장된 매입 거래처가 없어요."); return; }
    setEditPointOpen(true); setEditPointSource(null); setEditPointError(""); setEditPointAmount(""); setEditPointQuote(null); setEditPointType("상품");
    setEditPointDate(purchasePayments.find(row => row.purchase_id === source.id)?.payment_date || source.purchase_date || "");
    editPointRequestRef.current = null; editPointBusyRef.current = true; setEditPointBusy(true);
    try {
      const results = await Promise.all([
        supabase.from("vendor_wallet_topups").select("vendor_name,currency,remaining_foreign").eq("vendor_name", source.supplier.trim()).is("cancelled_at", null),
        supabase.from("vendor_point_ledger").select("vendor_name,amount"),
        supabase.from("vendor_wallet_usages").select("id,currency,usage_type,foreign_amount").eq("purchase_id", source.id).is("cancelled_at", null),
        supabase.from("point_wallet_restorations").select("usage_id,foreign_amount").eq("purchase_id", source.id).is("cancelled_at", null),
      ]);
      for (const result of results) if (result.error) throw result.error;
      const ruleRes = await supabase.from("vendor_point_settings").select("currency,foreign_per_point").eq("vendor_key", source.supplier.trim().toLowerCase()).maybeSingle();
      if (ruleRes.error) throw ruleRes.error;
      if (!ruleRes.data) throw new Error("거래처관리에서 포인트 환산 기준을 먼저 저장해 주세요.");
      const rule = ruleRes.data;
      const usages = (results[2].data || []).filter((row: any) => normalizeCurrencyCode(row.currency) === rule.currency);
      if (!usages.length) throw new Error("이 매입에 설정한 포인트 통화의 충전잔액 차감 기록이 없어요. 카드 결제를 충전잔액 결제로 바꾸는 기능은 아니에요.");
      const available: Record<string, number> = { 상품: 0, 배송비: 0, 수수료: 0 };
      for (const row of usages) available[row.usage_type] = round4((available[row.usage_type] || 0) + n(row.foreign_amount) - (results[3].data || []).filter((r: any) => r.usage_id === row.id).reduce((sum: number, r: any) => sum + n(r.foreign_amount), 0));
      const savedItems = itemsByPurchase.get(source.id) || [];
      setEditPointSource({ purchaseId: source.id, vendor: source.supplier, currency: rule.currency, rate: n(rule.foreign_per_point),
        ids: savedItems.map(row => row.id).sort(), products: savedItems.map(row => `${row.item_name || "상품"} · ${fmtNum(n(row.qty))}개`),
        wallet: (results[0].data || []).filter((row: any) => normalizeCurrencyCode(row.currency) === rule.currency).reduce((sum: number, row: any) => sum + n(row.remaining_foreign), 0),
        points: (results[1].data || []).filter((row: any) => normalizeName(row.vendor_name) === normalizeName(source.supplier)).reduce((sum: number, row: any) => sum + n(row.amount), 0),
        usedPoints: n(source.points_used), available,
      });
    } catch (e: any) { setEditPointError(e?.message ?? String(e)); }
    finally { editPointBusyRef.current = false; setEditPointBusy(false); }
  }

  async function processEditPurchasePoints(apply: boolean) {
    if (editPointBusyRef.current || !editPointSource) return;
    setEditPointError("");
    if (buyDirty) { setEditPointError("매입 수정 화면에 다른 변경사항이 있어요. 먼저 저장하거나 변경을 버리고 다시 열어 주세요. 이 창에서는 저장된 매입에 포인트만 적용해요."); return; }
    const points = Number(editPointAmount);
    if (!Number.isSafeInteger(points) || points <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(editPointDate)) { setEditPointError("사용일과 추가로 적용할 포인트를 양의 정수로 입력해 주세요."); return; }
    const signature = JSON.stringify([editPointSource.purchaseId, editPointSource.ids, points, editPointDate, editPointType]);
    if (apply && editPointQuote?.signature !== signature) { setEditPointError("변경된 내용으로 적용 금액 확인을 다시 눌러 주세요."); return; }
    editPointBusyRef.current = true; setEditPointBusy(true);
    try {
      if (editPointRequestRef.current?.signature !== signature) editPointRequestRef.current = { signature, id: crypto.randomUUID() };
      const result = await supabase.rpc("apply_cost_points_v2", { p_item_ids: editPointSource.ids, p_points: points, p_usage_date: editPointDate, p_usage_type: editPointType,
        p_apply: apply, p_expected_krw: apply ? editPointQuote!.krw : null, p_request_id: apply ? editPointRequestRef.current!.id : null,
        p_point_currency: apply ? editPointQuote!.currency : null, p_point_rate: apply ? editPointQuote!.rate : null, p_memo: "매입 수정에서 추가 적용한 포인트",
      });
      if (result.error) throw result.error;
      if (!apply) setEditPointQuote({ signature, krw: n(result.data.krw), currency: result.data.currency, rate: n(result.data.rate), foreign: n(result.data.foreign) });
      else {
        setEditPointOpen(false); setBuyModalOpen(false); setBuyDirty(false);
        await refreshAll(); setMsg(`포인트 ${fmtNum(points)}점 적용 · 충전잔액 ${fmtNum(n(result.data.foreign))} ${result.data.currency} 복원 · 원가 ${fmtKRW(n(result.data.krw))} 차감 완료`);
      }
    } catch (e: any) { setEditPointError(e?.message ?? String(e)); }
    finally { editPointBusyRef.current = false; setEditPointBusy(false); }
  }

  async function cancelProcessing(kind: "cost" | "purchase", id: string) {
    if (cancellationBusyRef.current) return;
    const cost = costs.find(row => row.id === id);
    const purchase = purchaseMap.get(id);
    const products = kind === "cost" && cost ? processingProducts(cost).map(row => `${row.name} · 현재 ${row.qty}개`)
      : (itemsByPurchase.get(id) ?? []).map(row => `${row.item_name || "상품"} · 현재 ${fmtNum(n(row.qty))}개`);
    const title = kind === "purchase" ? `${purchase?.supplier || "매입"} · 매입 전체 취소` : `${cost?.cost_date || ""} · ${cost?.vendor_name || ""} · ${cost?.cost_type || "처리"} 취소`;
    const refund = cost?.cost_type === "환불" ? parseRefundSummaryMemo(cost.memo) : null;
    const details = kind === "purchase" ? [`기록된 매입 금액: ${fmtKRW(n(purchase?.total_amount))}`] : refund ? [`실제 환불금액 ${fmtKRW(refund.actualKRW)}`, `환불 차손 ${fmtKRW(refund.lossKRW)} / 차익 ${fmtKRW(refund.profitKRW)} — 취소 후 현재 계산에서 제외돼요.`] : [`추가비용 원화 환산: ${fmtKRW(n(cost?.amount) * n(cost?.fx_rate || 1))}`];
    setCancelReason("잘못 입력해서 취소"); setCancelPopup({ kind, id, title, products, details });
    cancellationBusyRef.current = true; setCancelPopupBusy(true);
    try {
      const preview = await supabase.rpc("cancel_manager_action", { p_kind: kind, p_id: id, p_reason: "취소 내용 미리보기", p_apply: false });
      if (preview.error) throw preview.error;
      if (preview.data.already_cancelled) throw new Error("이미 취소된 내역이에요. 새로고침해서 확인해 주세요.");
      setCancelPopup({ kind, id, title, products, details, effects: preview.data });
    } catch (e: any) { setCancelPopup({ kind, id, title, products, details, error: e?.message ?? String(e) }); }
    finally { cancellationBusyRef.current = false; setCancelPopupBusy(false); }
  }

  async function confirmProcessingCancellation() {
    if (cancellationBusyRef.current || !cancelPopup?.effects || !cancelReason.trim()) return;
    const pending = cancelPopup;
    cancellationBusyRef.current = true; setCancelPopupBusy(true);
    try {
      const result = await supabase.rpc("cancel_manager_action", { p_kind: pending.kind, p_id: pending.id, p_reason: cancelReason.trim(), p_apply: true, p_expected_token: pending.effects.token });
      if (result.error) throw result.error;
      setCancelPopup(null); setItemDetailOpen(false);
      if (pending.kind === "purchase") { setSelectedPurchaseId(null); setSelectedItemIds([]); }
      await refreshAll(); setMsg("처리 취소 완료 · 수량·원가·잔액을 함께 반영했어.");
    } catch (e: any) { setCancelPopup({ ...pending, error: e?.message ?? String(e) }); }
    finally { cancellationBusyRef.current = false; setCancelPopupBusy(false); }
  }

  async function deletePurchase(purchaseId: string) { await cancelProcessing("purchase", purchaseId); }
  async function deleteCost(costId: string) { await cancelProcessing("cost", costId); }

  function openCostEditModal(cost: PurchaseCostRow) {
    if (cost.memo?.startsWith("[사후 포인트 사용]")) {
      setErr("포인트 연결 할인은 처리내역·취소에서 취소한 뒤 다시 등록해줘."); return;
    }
    if (cost.memo?.startsWith("[충전잔액 사용]")) { setErr("충전잔액이 연결된 비용은 처리내역·취소에서 취소한 뒤 다시 등록해줘."); return; }
    const normalizedType =
      normalizeCostType(cost.cost_type) || "배송비(거래처)";
    const linkedAllocationRows = allocations.filter(
      (a) => a.purchase_cost_id === cost.id,
    );
    const refundMetaItems = parseRefundMeta(cost.memo).items;
    const nextSelectedIds =
      normalizedType === "환불"
        ? refundMetaItems.map((item) => item.item_id)
        : linkedAllocationRows.map((a) => a.purchase_item_id);
    const nextSelectedItems = items.filter((it) =>
      nextSelectedIds.includes(it.id),
    );
    const nextTotalForeign = Math.abs(n(cost.amount));

    setEditingCost(cost);
    setEcType(normalizedType);
    setEcAllocationBasis(parseCostAllocationBasis(cost.memo));
    setEcRefundKind(
      normalizedType === "환불"
        ? parseRefundMeta(cost.memo).kind
        : "product",
    );
    setEcCurrency(normalizeCurrencySelectValue(cost.currency || "KRW"));
    setEcCurrencyCustom(
      normalizeCurrencySelectValue(cost.currency) === "직접입력"
        ? (cost.currency ?? "")
        : "",
    );
    setEcFxRate(String(cost.fx_rate ?? 1));
    setEcMemo(
      stripCostAllocationBasisMeta(
        stripRefundMetaDetail(stripCustomsMemoDetail(cost.memo)),
      ),
    );
    setEcVendorName(cost.vendor_name ?? "");
    setEcDate(cost.cost_date ?? "");
    setEcSelectedItemIds(nextSelectedIds);
    setEditRefundItemEditMap(
      buildRefundItemEditMap(
        nextSelectedIds,
        items,
        normalizedType === "환불" ? cost.memo : null,
      ),
    );
    setEditCostItemForeignMap(
      normalizedType === "환불"
        ? Object.fromEntries(nextSelectedIds.map((id) => [id, ""]))
        : buildCostItemForeignMapFromAllocations(
            nextSelectedItems,
            linkedAllocationRows,
            nextTotalForeign,
          ),
    );
    setEcExistingReceiptPath(getCostReceiptPath(cost.id, cost.cost_type));
    setEcExistingImportDocPath(getCostImportDocPath(cost.id));
    setEcReceiptFile(null);
    setEcImportDocFile(null);

    if (normalizedType === "관부과세") {
      const parsed = parseCustomsMemo(cost.memo);
      const storedAmount = n(cost.amount);
      const storedKRW =
        normalizeCurrencyCode(cost.currency) === "KRW"
          ? storedAmount
          : ceil4(storedAmount * n(cost.fx_rate));
      setEcDutyAmount(parsed.duty);
      setEcVatAmount(parsed.vat);
      setEcCustomsFeeAmount(parsed.customsFee);
      setEcAmount(String(cost.amount ?? ""));
      setEcTotalForeign(String(nextTotalForeign || ""));
      setEcTotalKRW(String(storedKRW));
    } else if (normalizedType === "환불") {
      const refundSummary = parseRefundSummaryMemo(cost.memo);
      const rawRefundMemo = stripRefundMetaDetail(cost.memo);
      const actualRefundKRW = rawRefundMemo.includes("실제 환불금액:")
        ? refundSummary.actualKRW
        : Math.abs(n(cost.amount));
      setEcDutyAmount("");
      setEcVatAmount("");
      setEcCustomsFeeAmount("");
      setEcAmount(String(cost.amount ?? ""));
      setEcTotalForeign(String(actualRefundKRW));
      setEcTotalKRW(String(actualRefundKRW));
    } else {
      setEcDutyAmount("");
      setEcVatAmount("");
      setEcCustomsFeeAmount("");
      setEcAmount(String(cost.amount ?? ""));
      setEcTotalForeign(String(nextTotalForeign || ""));
      setEcTotalKRW(
        String(
          normalizeCurrencyCode(cost.currency) === "KRW"
            ? Math.abs(n(cost.amount))
            : ceil4(Math.abs(n(cost.amount)) * n(cost.fx_rate)),
        ),
      );
    }

    setCostEditDirty(false);
    setCostEditModalOpen(true);
  }

  async function saveCostEdit() {
    if (!editingCost) return;

    const cur = currencyValue(ecCurrency, ecCurrencyCustom);
    const previousType = normalizeCostType(editingCost.cost_type);
    const wasRefund = previousType === "환불";
    // 기존 환불을 수정하거나 일반 비용으로 바꿔도, 원복된 상품까지 함께 재배분 대상으로 잡는다.
    const previousRefundItemIds = wasRefund
      ? getRefundMetaItemIds(editingCost.memo)
      : [];

    const customsAmount = customsTotal(
      ecDutyAmount,
      ecVatAmount,
      ecCustomsFeeAmount,
    );
    const amountBase =
      ecType === "관부과세"
        ? customsAmount > 0
          ? customsAmount
          : n(ecTotalForeign || ecTotalKRW)
        : n(ecTotalForeign);
    const amount = signedCostAmountByType(ecType, amountBase);

    const fx =
      ecType === "관부과세"
        ? 1
        : normalizeCurrencyCode(cur) === "KRW"
          ? 1
          : calcFxRate(n(ecTotalKRW), n(ecTotalForeign));

    const costKRW =
      ecType === "관부과세"
        ? n(ecTotalKRW || amount)
        : normalizeCurrencyCode(cur) === "KRW"
          ? n(ecTotalKRW || ecTotalForeign)
          : n(ecTotalKRW);

    const chosen = items.filter((it) => ecSelectedItemIds.includes(it.id));
    const refundInfoEdit = getRefundLossInfo(
      chosen,
      editRefundItemEditMap,
      n(ecTotalKRW),
      wasRefund ? editingCost.memo : null,
    );
    const isPriceAdjustmentRefund =
      ecType === "환불" && ecRefundKind === "price_adjustment";
    const refundItemAdjustments = getRefundItemAdjustments(
      chosen,
      editRefundItemEditMap,
      n(ecTotalKRW),
      wasRefund ? editingCost.memo : null,
    );

    const visibleFinalMemo =
      ecType === "관부과세"
        ? buildCustomsMemo(
            ecMemo,
            ecDutyAmount,
            ecVatAmount,
            ecCustomsFeeAmount,
          )
        : ecType === "환불"
          ? buildRefundSummaryMemo(
              ecMemo,
              buildRefundMetaItems(
                chosen,
                editRefundItemEditMap,
                wasRefund ? editingCost.memo : null,
              ),
              refundInfoEdit,
              ecRefundKind,
            )
          : ecMemo || null;
    const finalMemo =
      ecType === "환불"
        ? visibleFinalMemo
        : buildCostAllocationBasisMemo(visibleFinalMemo, ecAllocationBasis);

    const resolvedForeign = resolveCostForeignTotals(
      chosen,
      editCostItemForeignMap,
      n(ecTotalForeign),
    );
    const allocationItems = chosen;
    const allocationWeights =
      ecType === "환불"
        ? []
        : getCostAllocationWeights(ecType, chosen, ecAllocationBasis);
    const signedCostKRW =
      ecType === "환불"
        ? isPriceAdjustmentRefund
          ? -Math.round(Math.max(0, n(ecTotalKRW)))
          : refundInfoEdit.adjustmentKRW
        : signedCostAmountByType(ecType, costKRW);

    if (!ecType.trim()) {
      setErr("추가비용 종류를 선택해줘.");
      return;
    }
    if (!cur) {
      setErr("통화를 선택하거나 직접 입력해줘.");
      return;
    }
    if (ecType === "관부과세") {
      if (amount <= 0 && n(ecTotalKRW) <= 0) {
        setErr("원화 총액이나 관세/부가세를 입력해줘.");
        return;
      }
    } else if (ecType === "환불") {
      if (n(ecTotalKRW) < 0) {
        setErr("실제 환불금액은 0 이상으로 입력해줘.");
        return;
      }
    } else {
      if (n(ecTotalForeign) <= 0) {
        setErr("외화 총액을 입력해줘.");
        return;
      }
      if (n(ecTotalKRW) <= 0) {
        setErr("원화 총액을 입력해줘.");
        return;
      }
      if (normalizeCurrencyCode(cur) !== "KRW" && fx <= 0) {
        setErr("외화 총액과 원화 총액을 입력하면 환율이 자동 계산돼.");
        return;
      }
    }
    if (!ecDate || ecDate.length !== 10) {
      setErr("날짜를 YYYY-MM-DD 형식으로 입력해줘.");
      return;
    }
    if (ecSelectedItemIds.length === 0) {
      setErr("환불/배분할 상품을 1개 이상 선택해줘.");
      return;
    }
    if (ecType === "환불" && !isPriceAdjustmentRefund) {
      for (const it of chosen) {
        const edit = editRefundItemEditMap[it.id];
        if (!edit || !edit.item_name.trim()) {
          setErr("환불일 때는 상품 이름을 입력해줘.");
          return;
        }
        const nextQty = Math.floor(n(edit.next_qty));
        if (nextQty < 0) {
          setErr("변경 후 수량은 0 이상이어야 해.");
          return;
        }
        const prevRefund = parseRefundMeta(
          wasRefund ? editingCost.memo : null,
        ).items.find((x) => x.item_id === it.id);
        const maxQty = prevRefund?.original_qty ?? Math.max(0, n(it.qty));
        if (nextQty > maxQty) {
          setErr("변경 후 수량은 원래 수량보다 크게 넣을 수 없어.");
          return;
        }
      }
    }
    if (ecType !== "환불" && allocationWeights.every((w) => n(w) <= 0)) {
      setErr(
        getEffectiveCostAllocationBasis(ecType, ecAllocationBasis) === "quantity"
          ? "수량비율로 배분할 수 있는 상품 수량이 0이야."
          : "금액비율로 배분할 수 있는 상품 원화금액이 0이야.",
      );
      return;
    }

    try {
      setLoading(true);
      setErr(null);
      setMsg(null);

      // 기존 환불을 수정하거나 다른 비용으로 바꾸는 경우,
      // 먼저 상품 원래 상태를 복구한 뒤 아래의 새 설정을 다시 적용한다.
      if (wasRefund) {
        await restoreRefundAdjustedItemsFromMemo(editingCost.memo);
      }

      const upd = await supabase
        .from("purchase_costs")
        .update({
          cost_type: ecType,
          // 차손은 +, 차익은 -로 저장해서 대시보드에서도 둘 다 집계할 수 있게 한다.
          amount:
            ecType === "환불"
              ? isPriceAdjustmentRefund
                ? -Math.round(Math.max(0, n(ecTotalKRW)))
                : refundInfoEdit.adjustmentKRW
              : amount,
          currency: ecType === "환불" ? "KRW" : cur,
          fx_rate:
            ecType === "환불"
              ? 1
              : normalizeCurrencyCode(cur) === "KRW"
                ? 1
                : fx,
          memo: finalMemo,
          vendor_name: ecVendorName || null,
          cost_date: ecDate,
        })
        .eq("id", editingCost.id);
      if (upd.error) throw upd.error;

      const delAlloc = await supabase
        .from("cost_allocations")
        .delete()
        .eq("purchase_cost_id", editingCost.id);
      if (delAlloc.error) throw delAlloc.error;

      const alloc =
        ecType === "환불"
          ? isPriceAdjustmentRefund
            ? (() => {
                const directWeights = chosen.map((item) =>
                  Math.max(0, n(editCostItemForeignMap[item.id])),
                );
                const weights = directWeights.some((v) => v > 0)
                  ? directWeights
                  : chosen.map((item) => Math.max(0, n(item.foreign_total)));
                const allocated = distributeByWeightsCeilIntSigned(
                  -Math.round(Math.max(0, n(ecTotalKRW))),
                  weights,
                );
                return chosen.map((item, idx) => ({
                  item_id: item.id,
                  amt: allocated[idx] ?? 0,
                }));
              })()
            : refundItemAdjustments.map((row) => ({
                item_id: row.item_id,
                amt: row.adjustment_krw,
              }))
          : (() => {
              const allocAmounts = distributeByWeightsCeilIntSigned(
                signedCostKRW,
                allocationWeights,
              );
              return allocationItems.map((it, idx) => ({
                item_id: it.id,
                amt: allocAmounts[idx] ?? 0,
              }));
            })();

      if (alloc.length > 0) {
        const insAlloc = await supabase.from("cost_allocations").insert(
          alloc.map((a) => ({
            purchase_cost_id: editingCost.id,
            purchase_item_id: a.item_id,
            allocated_amount: a.amt,
          })),
        );
        if (insAlloc.error) throw insAlloc.error;
      }

      if (ecType !== "환불" && alloc.length > 0) {
        const sync = await supabase.rpc("sync_cost_allocation_targets", { p_cost_id: editingCost.id, p_item_ids: chosen.map(item => item.id) });
        if (sync.error) throw sync.error;
      }

      if (ecReceiptFile) {
        await upsertPurchaseFile({
          cost_id: editingCost.id,
          file_type: getCostReceiptFileType(ecType),
          file: ecReceiptFile,
          oldPath: ecExistingReceiptPath ?? null,
        });
      }

      if (ecImportDocFile) {
        await upsertPurchaseFile({
          cost_id: editingCost.id,
          file_type: "수입신고필증",
          file: ecImportDocFile,
          oldPath: ecExistingImportDocPath ?? null,
        });
      }

      if (ecType === "환불" && !isPriceAdjustmentRefund) {
        await updateRefundAdjustedItems(
          chosen,
          editRefundItemEditMap,
          wasRefund ? editingCost.memo : null,
        );
      }

      if (ecType === "환불") {
        await clearRefundPendingForItems(chosen.map((item) => item.id));
      }

      // 환불 신규등록·수정·삭제·일반비용 전환 모두 저장 직후 자동 재배분한다.
      // 이전 환불 상품과 새 환불 상품을 합쳐서 처리하므로, 환불 대상이 바뀌어도 누락되지 않는다.
      const autoRebalanceItemIds = Array.from(
        new Set([
          ...previousRefundItemIds,
          ...(ecType === "환불" ? chosen.map((item) => item.id) : []),
        ]),
      );
      if (autoRebalanceItemIds.length > 0) {
        await rebalanceSharedCostsAfterRefund(
          autoRebalanceItemIds,
          costs,
          allocations,
        );
      }

      setMsg(
        ecType === "환불"
          ? isPriceAdjustmentRefund
            ? `차액 환불 수정 완료 · 상품 수량은 유지하고 ${fmtKRW(Math.max(0, n(ecTotalKRW)))} 원가 차감`
            : `상품 환불 수정 완료 · 공동비용 자동 재배분 완료 (차손 ${fmtKRW(refundInfoEdit.lossKRW)} / 차익 ${fmtKRW(refundInfoEdit.profitKRW)})`
          : wasRefund
            ? "환불 해제 완료 · 공동비용 자동 재배분 완료"
            : "추가비용 수정 완료",
      );
      setCostEditModalOpen(false);
      setEditingCost(null);
      setCostEditDirty(false);
      await refreshAll();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  async function openItemDetail(it: PurchaseItemRow) {
    setDetailItem(it);
    setDetailAlloc([]);
    setExpandedAllocationKeys([]);
    setItemDetailOpen(true);
    setErr(null);

    try {
      const allocRes = await supabase
        .from("cost_allocations")
        .select("purchase_cost_id,purchase_item_id,allocated_amount")
        .eq("purchase_item_id", it.id);

      if (allocRes.error) throw allocRes.error;

      const myAllocRows = (allocRes.data ?? []) as CostAllocationRow[];
      if (myAllocRows.length === 0) {
        setDetailAlloc([]);
        return;
      }

      const costIds = Array.from(
        new Set(myAllocRows.map((a) => a.purchase_cost_id)),
      );

      const allCostAllocRes = await supabase
        .from("cost_allocations")
        .select("purchase_cost_id,purchase_item_id,allocated_amount")
        .in("purchase_cost_id", costIds);
      if (allCostAllocRes.error) throw allCostAllocRes.error;

      const costRes = await supabase
        .from("purchase_costs")
        .select(
          "id,created_at,cost_type,amount,currency,fx_rate,memo,vendor_name,cost_date",
        )
        .in("id", costIds);
      if (costRes.error) throw costRes.error;

      const allAlloc = (allCostAllocRes.data ?? []) as CostAllocationRow[];
      const localCostMap = new Map<string, PurchaseCostRow>();
      for (const c of (costRes.data ?? []) as PurchaseCostRow[])
        localCostMap.set(c.id, c);

      const view: ItemAllocationView[] = myAllocRows
        .map((a) => {
          const c = localCostMap.get(a.purchase_cost_id);
          const related = allAlloc
            .filter(
              (x) =>
                x.purchase_cost_id === a.purchase_cost_id &&
                x.purchase_item_id !== it.id,
            )
            .map(
              (x) =>
                itemMap.get(x.purchase_item_id)?.item_name ?? "(이름 없음)",
            );

          return {
            cost_id: a.purchase_cost_id,
            cost_type: c?.cost_type ?? null,
            amount_krw: n(a.allocated_amount),
            created_at: c?.created_at ?? "",
            memo: c?.memo ?? null,
            vendor_name: c?.vendor_name ?? null,
            related_item_names: related,
            cost_date: c?.cost_date ?? null,
          };
        })
        .sort((x, y) => (x.created_at < y.created_at ? 1 : -1));

      setDetailAlloc(view);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  }

  async function saveDetailQtyChange() {
    if (!detailItem) return;

    const nextQty = Math.floor(n(detailQtyInput));
    if (nextQty < 1) {
      setErr("차감 후 수량은 1 이상으로 입력해줘.");
      return;
    }

    if (nextQty === Math.max(1, n(detailItem.qty))) {
      setMsg("수량 변경 없음");
      return;
    }

    const foreignUnit = n(detailItem.foreign_unit_price);
    const krwUnit = n(detailItem.unit_price);
    const nextForeignTotal = ceil4(foreignUnit * nextQty);
    const nextLineTotal = ceil4(krwUnit * nextQty);

    try {
      setDetailQtySaving(true);
      setLoading(true);
      setErr(null);
      setMsg(null);

      const upd = await supabase
        .from("purchase_items")
        .update({
          qty: nextQty,
          foreign_total: nextForeignTotal,
          line_total: nextLineTotal,
        })
        .eq("id", detailItem.id);
      if (upd.error) throw upd.error;

      await refreshAll();

      const refreshed = itemMap.get(detailItem.id);
      const fallback = {
        ...detailItem,
        qty: nextQty,
        foreign_total: nextForeignTotal,
        line_total: nextLineTotal,
      };
      setDetailItem(refreshed ?? fallback);
      setDetailQtyInput(String(nextQty));
      setMsg("상품 수량 수정 완료");
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setDetailQtySaving(false);
      setLoading(false);
    }
  }

  function openCostEditorById(costId: string, closeDetail = false) {
    const target = costs.find((c) => c.id === costId);
    if (!target) return;
    if (closeDetail) {
      setItemDetailOpen(false);
      setTimeout(() => openCostEditModal(target), 0);
      return;
    }
    openCostEditModal(target);
  }

  async function processCostPoints(apply: boolean) {
    if (cPointBusyRef.current) return;
    setErr(null); setMsg(null);
    const points = Number(cPointAmount);
    if (!Number.isSafeInteger(points) || points <= 0 || !selectedItemIds.length || !/^\d{4}-\d{2}-\d{2}$/.test(cDate)) {
      setErr("상품을 선택하고 사용일과 사용할 포인트를 양의 정수로 입력해줘."); return;
    }
    if (apply && (!cPointQuote || cPointQuote.signature !== cPointSignature)) {
      setErr("입력한 내용으로 복원 금액 확인을 먼저 눌러줘."); return;
    }
    cPointBusyRef.current = true; setLoading(true);
    try {
      if (!cPointRequestRef.current || cPointRequestRef.current.signature !== cPointSignature) {
        cPointRequestRef.current = { signature: cPointSignature, id: crypto.randomUUID() };
      }
      const res = await supabase.rpc("apply_cost_points_v2", {
        p_item_ids: selectedItemIds.slice().sort(), p_points: points,
        p_usage_date: cDate, p_usage_type: cPointUsageType, p_apply: apply,
        p_expected_krw: apply ? cPointQuote!.krw : null,
        p_point_currency: apply ? cPointQuote!.currency : null, p_point_rate: apply ? cPointQuote!.rate : null, p_request_id: apply ? cPointRequestRef.current.id : null, p_memo: cMemo || null,
      });
      if (res.error) throw res.error;
      if (!apply) {
        setCPointQuote({ signature: cPointSignature, krw: Number(res.data.krw), balance: Number(res.data.balance), vendor: String(res.data.vendor), currency: String(res.data.currency), foreign: Number(res.data.foreign), rate: Number(res.data.rate) });
      } else {
        setCostModalOpen(false); setCostDirty(false);
        setMsg(`${points}점 사용 · 충전잔액 ${Number(res.data.foreign)} ${res.data.currency} 복원 · 원가 ${fmtKRW(Number(res.data.krw))} 차감 완료`);
        await refreshAll(); resetCostForm();
      }
    } catch (e: any) { setErr(e?.message ?? String(e)); }
    finally { cPointBusyRef.current = false; setLoading(false); }
  }

  async function saveCostAndAllocate() {
    if (isCostPointUse) { await processCostPoints(true); return; }
    setErr(null);
    setMsg(null);

    const cur = currencyValue(cCurrency, cCurrencyCustom);

    const customsAmount = customsTotal(
      cDutyAmount,
      cVatAmount,
      cCustomsFeeAmount,
    );
    const amountBase =
      cType === "관부과세"
        ? customsAmount > 0
          ? customsAmount
          : n(cTotalForeign || cTotalKRW)
        : n(cTotalForeign);
    const amount = signedCostAmountByType(cType, amountBase);

    const fx = cUseWallet
      ? calcFxRate(costWalletKRW, n(cTotalForeign))
      : normalizeCurrencyCode(cur) === "KRW"
        ? 1
        : calcFxRate(
            n(cTotalKRW),
            cType === "관부과세" ? amount : n(cTotalForeign),
          );

    const costKRW = cUseWallet
      ? costWalletKRW
      : cType === "관부과세"
        ? n(cTotalKRW || amount)
        : normalizeCurrencyCode(cur) === "KRW"
          ? n(cTotalKRW || cTotalForeign)
          : n(cTotalKRW);

    if (!cType.trim()) {
      setErr("추가비용 종류를 선택해줘.");
      return;
    }
    if (!cur) {
      setErr("통화를 선택하거나 직접 입력해줘.");
      return;
    }
    if (cUseWallet) {
      if (!costWalletEligible) {
        setErr("충전잔액 사용은 배송비 또는 수수료에서 사용할 수 있어.");
        return;
      }
      if (!cVendorName.trim()) {
        setErr("충전잔액을 사용할 거래처를 선택해줘.");
        return;
      }
      if (n(cTotalForeign) <= 0) {
        setErr("충전잔액에서 차감할 외화금액을 입력해줘.");
        return;
      }
      if (!costWalletQuote.ok || costWalletKRW <= 0) {
        setErr(
          `충전잔액이 부족하거나 계산할 수 없어. 현재 ${fmtNum(
            costWalletQuote.balance,
          )} ${costWalletCurrency} / 필요 ${fmtNum(
            costWalletQuote.needed,
          )} ${costWalletCurrency}`,
        );
        return;
      }
    }
    if (cType === "관부과세") {
      if (Math.abs(amount) <= 0 && n(cTotalKRW) <= 0) {
        setErr("원화 총액이나 관세/부가세를 입력해줘.");
        return;
      }
      if (!cUseWallet && n(cTotalKRW) <= 0) {
        setErr("원화 총액을 입력해줘.");
        return;
      }
      if (normalizeCurrencyCode(cur) !== "KRW" && fx <= 0) {
        setErr("관부과세 합계와 원화 총액을 입력하면 환율이 자동 계산돼.");
        return;
      }
    } else if (cType === "환불") {
      if (n(cTotalKRW) < 0) {
        setErr("실제 환불금액은 0 이상으로 입력해줘.");
        return;
      }
    } else {
      if (n(cTotalForeign) <= 0) {
        setErr("외화 총액을 입력해줘.");
        return;
      }
      if (!cUseWallet && n(cTotalKRW) <= 0) {
        setErr("원화 총액을 입력해줘.");
        return;
      }
      if (normalizeCurrencyCode(cur) !== "KRW" && fx <= 0) {
        setErr("외화 총액과 원화 총액을 입력하면 환율이 자동 계산돼.");
        return;
      }
    }
    if (!cDate || cDate.length !== 10) {
      setErr("날짜를 YYYY-MM-DD 형식으로 입력해줘.");
      return;
    }
    if (selectedItemIds.length === 0) {
      setErr("자동분배하려면 상품을 1개 이상 체크해야 해.");
      return;
    }

    const chosen = selectedItems;
    const refundInfo = getRefundLossInfo(
      chosen,
      refundItemEditMap,
      n(cTotalKRW),
    );
    const isPriceAdjustmentRefund =
      cType === "환불" && cRefundKind === "price_adjustment";
    const refundItemAdjustments = getRefundItemAdjustments(
      chosen,
      refundItemEditMap,
      n(cTotalKRW),
    );

    const visibleFinalMemo =
      cType === "관부과세"
        ? buildCustomsMemo(cMemo, cDutyAmount, cVatAmount, cCustomsFeeAmount)
        : cType === "환불"
          ? buildRefundSummaryMemo(
              cMemo,
              buildRefundMetaItems(chosen, refundItemEditMap),
              refundInfo,
              cRefundKind,
            )
          : cUseWallet
            ? `[충전잔액 사용]\n${cMemo || ""}`.trim()
            : cMemo || null;
    const finalMemo =
      cType === "환불"
        ? visibleFinalMemo
        : buildCostAllocationBasisMemo(visibleFinalMemo, cAllocationBasis);

    if (cType === "환불" && !isPriceAdjustmentRefund) {
      for (const it of chosen) {
        const edit = refundItemEditMap[it.id];
        if (!edit || !edit.item_name.trim()) {
          setErr("환불일 때는 상품 이름을 입력해줘.");
          return;
        }
        const nextQty = Math.floor(n(edit.next_qty));
        if (nextQty < 0) {
          setErr("변경 후 수량은 0 이상이어야 해.");
          return;
        }
        if (nextQty > Math.max(0, n(it.qty))) {
          setErr("변경 후 수량은 현재 수량보다 크게 넣을 수 없어.");
          return;
        }
      }
    }
    if (cType !== "환불" && costKRW <= 0) {
      setErr("원화 환산 금액이 0이야.");
      return;
    }

    const resolvedForeign = resolveCostForeignTotals(
      chosen,
      costItemForeignMap,
      n(cTotalForeign),
    );
    const allocationItems = chosen;
    const allocationWeights =
      cType === "환불"
        ? []
        : getCostAllocationWeights(cType, chosen, cAllocationBasis);
    const signedCostKRW =
      cType === "환불"
        ? isPriceAdjustmentRefund
          ? -Math.round(Math.max(0, n(cTotalKRW)))
          : refundInfo.adjustmentKRW
        : signedCostAmountByType(cType, costKRW);

    if (cType !== "환불" && allocationWeights.every((w) => n(w) <= 0)) {
      setErr(
        getEffectiveCostAllocationBasis(cType, cAllocationBasis) === "quantity"
          ? "수량비율로 배분할 수 있는 상품 수량이 0이야."
          : "금액비율로 배분할 수 있는 상품 원화금액이 0이야.",
      );
      return;
    }

    setLoading(true);
    try {
      const linkedPurchaseIds = Array.from(
        new Set(chosen.map((it) => it.purchase_id)),
      );
      const linkedPurchaseId =
        linkedPurchaseIds.length === 1 ? linkedPurchaseIds[0] : null;

      if (cUseWallet && !linkedPurchaseId) {
        throw new Error(
          "충전잔액으로 추가비용을 저장할 때는 한 매입의 상품들만 선택해줘.",
        );
      }

      const insCost = await supabase
        .from("purchase_costs")
        .insert({
          purchase_id: linkedPurchaseId,
          cost_type: cType,
          // 차손은 +, 차익은 -로 저장해서 대시보드에도 모두 반영된다.
          amount:
            cType === "환불"
              ? isPriceAdjustmentRefund
                ? -Math.round(Math.max(0, n(cTotalKRW)))
                : refundInfo.adjustmentKRW
              : amount,
          currency: cType === "환불" ? "KRW" : cur,
          fx_rate:
            cType === "환불"
              ? 1
              : normalizeCurrencyCode(cur) === "KRW"
                ? 1
                : fx,
          memo: finalMemo,
          vendor_name: cVendorName || null,
          cost_date: cDate,
        })
        .select("id")
        .single();

      if (insCost.error) throw insCost.error;
      const costId = insCost.data.id as string;

      const alloc =
        cType === "환불"
          ? isPriceAdjustmentRefund
            ? (() => {
                const directWeights = chosen.map((item) =>
                  Math.max(0, n(costItemForeignMap[item.id])),
                );
                const weights = directWeights.some((v) => v > 0)
                  ? directWeights
                  : chosen.map((item) => Math.max(0, n(item.foreign_total)));
                const allocated = distributeByWeightsCeilIntSigned(
                  -Math.round(Math.max(0, n(cTotalKRW))),
                  weights,
                );
                return chosen.map((item, idx) => ({
                  item_id: item.id,
                  amt: allocated[idx] ?? 0,
                }));
              })()
            : refundItemAdjustments.map((row) => ({
                item_id: row.item_id,
                amt: row.adjustment_krw,
              }))
          : (() => {
              const allocAmounts = distributeByWeightsCeilIntSigned(
                signedCostKRW,
                allocationWeights,
              );
              return allocationItems.map((it, idx) => ({
                item_id: it.id,
                amt: allocAmounts[idx] ?? 0,
              }));
            })();

      if (alloc.length > 0) {
        const insAlloc = await supabase.from("cost_allocations").insert(
          alloc.map((a) => ({
            purchase_cost_id: costId,
            purchase_item_id: a.item_id,
            allocated_amount: a.amt,
          })),
        );
        if (insAlloc.error) throw insAlloc.error;
      }

      if (cUseWallet) {
        const consumeRes = await supabase.rpc(
          "consume_vendor_wallet_for_cost",
          {
            p_cost_id: costId,
            p_expected_krw: costWalletKRW,
            p_purchase_id: linkedPurchaseId,
            p_vendor_name: cVendorName.trim(),
            p_currency: costWalletCurrency,
            p_usage_date: cDate,
            p_product_foreign: 0,
            p_shipping_foreign: isShippingCostType(cType)
              ? Math.max(0, n(cTotalForeign))
              : 0,
            p_fee_foreign:
              normalizeCostType(cType) === "수수료"
                ? Math.max(0, n(cTotalForeign))
                : 0,
            p_memo: `추가비용 자동 차감 · ${cType}`,
          },
        );

        if (consumeRes.error) {
          await supabase
            .from("cost_allocations")
            .delete()
            .eq("purchase_cost_id", costId);
          await supabase
            .from("purchase_costs")
            .delete()
            .eq("id", costId);
          throw consumeRes.error;
        }
      }

      if (costReceiptFile) {
        await upsertPurchaseFile({
          cost_id: costId,
          file_type: getCostReceiptFileType(cType),
          file: costReceiptFile,
        });
      }

      if (costImportDocFile) {
        await upsertPurchaseFile({
          cost_id: costId,
          file_type: "수입신고필증",
          file: costImportDocFile,
        });
      }

      if (cType === "환불" && !isPriceAdjustmentRefund) {
        await updateRefundAdjustedItems(chosen, refundItemEditMap);

        // 공동비용 전체 재배분 버튼 없이, 상품 환불 저장과 동시에 자동 처리한다.
        await rebalanceSharedCostsAfterRefund(
          chosen.map((item) => item.id),
          costs,
          allocations,
        );
      }

      if (cType === "환불") {
        await clearRefundPendingForItems(chosen.map((item) => item.id));
      }

      setMsg(
        cType === "환불"
          ? isPriceAdjustmentRefund
            ? `차액 환불 저장 완료 · 상품 수량은 유지하고 ${fmtKRW(Math.max(0, n(cTotalKRW)))} 원가 차감`
            : `상품 환불 저장 완료 · 공동비용 자동 재배분 완료 (차손 ${fmtKRW(refundInfo.lossKRW)} / 차익 ${fmtKRW(refundInfo.profitKRW)})`
          : cType === "카드할인"
            ? `카드할인 저장 완료 (${fmtKRW(Math.abs(Math.round(costKRW)))} 차감)`
            : cUseWallet
              ? `추가비용 저장 완료 · 충전잔액 ${fmtNum(
                  n(cTotalForeign),
                )} ${costWalletCurrency} 차감 / ${fmtKRW(
                  Math.round(costKRW),
                )}`
              : `추가비용 저장 완료 (${fmtKRW(Math.round(costKRW))})`,
      );
      setCostModalOpen(false);
      setCostDirty(false);
      setCType("배송비(거래처)");
      setCUseWallet(false);
      setCAmount("");
      setCTotalForeign("");
      setCTotalKRW("");
      setCCurrency("KRW");
      setCCurrencyCustom("");
      setCFxRate("1");
      setCMemo("");
      setCVendorName("");
      setCDate("");
      setCShippingAmount("");
      setCDutyAmount("");
      setCVatAmount("");
      setCCustomsFeeAmount("");
      setCRefundKind("product");
      setCostReceiptFile(null);
      setCostImportDocFile(null);
      await refreshAll();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  const styles = {
    page: {
      minHeight: "100vh",
      background: "#f7f7fb",
      color: "#111",
      padding: 20,
      fontFamily:
        "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif",
    } as React.CSSProperties,

    topbar: {
      display: "flex",
      gap: 10,
      alignItems: "center",
      marginBottom: 12,
      flexWrap: "wrap",
    } as React.CSSProperties,

    title: {
      fontSize: 24,
      fontWeight: 900,
      marginRight: 10,
      color: "#312e81",
    } as React.CSSProperties,

    btn: (kind: "primary" | "ghost" | "danger" = "ghost") =>
      ({
        border: "1px solid",
        borderColor:
          kind === "primary"
            ? "#6d28d9"
            : kind === "danger"
              ? "#ef4444"
              : "#ddd",
        background: kind === "primary" ? "#6d28d9" : "#fff",
        color:
          kind === "primary" ? "#fff" : kind === "danger" ? "#dc2626" : "#111",
        padding: kind === "danger" ? "7px 10px" : "9px 12px",
        borderRadius: 12,
        cursor: "pointer",
        fontWeight: 800,
        fontSize: kind === "danger" ? 12 : 14,
        whiteSpace: "nowrap",
      }) as React.CSSProperties,

    smallBtn: {
      border: "1px solid #ddd",
      background: "#fff",
      color: "#111",
      padding: "7px 10px",
      borderRadius: 10,
      cursor: "pointer",
      fontWeight: 800,
      fontSize: 12,
    } as React.CSSProperties,

    dangerSmallBtn: {
      border: "1px solid #fecaca",
      background: "#fff",
      color: "#dc2626",
      padding: "7px 10px",
      borderRadius: 10,
      cursor: "pointer",
      fontWeight: 800,
      fontSize: 12,
    } as React.CSSProperties,

    layout: {
      display: "grid",
      gridTemplateColumns: "500px minmax(0, 1fr)",
      gap: 16,
      alignItems: "start",
    } as React.CSSProperties,

    card: {
      background: "#fff",
      border: "1px solid #e6e6ef",
      borderRadius: 18,
      padding: 12,
      boxShadow: "0 8px 24px rgba(124, 58, 237, 0.05)",
    } as React.CSSProperties,

    purchaseCard: (active: boolean) =>
      ({
        background: active ? "#f3e8ff" : "#fff",
        border: active ? "2px solid #7c3aed" : "1px solid #e6e6ef",
        borderRadius: 16,
        padding: 12,
        cursor: "pointer",
        maxWidth: "100%",
        minHeight: 112,
        flexShrink: 0,
        overflow: "visible",
        boxSizing: "border-box",
      }) as React.CSSProperties,

    badge: (color: "purple" | "orange" | "green" | "gray" = "gray") =>
      ({
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 8px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 800,
        background:
          color === "purple"
            ? "#ede9fe"
            : color === "orange"
              ? "#ffedd5"
              : color === "green"
                ? "#dcfce7"
                : "#f3f4f6",
        color:
          color === "purple"
            ? "#5b21b6"
            : color === "orange"
              ? "#9a3412"
              : color === "green"
                ? "#166534"
                : "#374151",
      }) as React.CSSProperties,

    small: {
      fontSize: 12,
      color: "#4b5563",
    } as React.CSSProperties,

    h2: {
      fontSize: 16,
      fontWeight: 900,
      marginBottom: 8,
    } as React.CSSProperties,

    table: {
      width: "100%",
      borderCollapse: "separate",
      borderSpacing: 0,
      overflow: "hidden",
      borderRadius: 14,
      border: "1px solid #e6e6ef",
      background: "#fff",
      tableLayout: "fixed",
    } as React.CSSProperties,

    th: {
      textAlign: "left",
      fontSize: 12,
      color: "#374151",
      padding: "10px 12px",
      borderBottom: "1px solid #e6e6ef",
      background: "#fafafa",
      fontWeight: 900,
      whiteSpace: "nowrap",
    } as React.CSSProperties,

    td: {
      padding: "10px 12px",
      borderBottom: "1px solid #f0f0f5",
      fontSize: 14,
      verticalAlign: "top",
    } as React.CSSProperties,

    grid2: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 12,
      alignItems: "start",
    } as React.CSSProperties,

    field: {
      display: "grid",
      gap: 6,
    } as React.CSSProperties,

    label: {
      fontSize: 12,
      color: "#374151",
      fontWeight: 800,
    } as React.CSSProperties,

    input: {
      border: "1px solid #d9d9e6",
      borderRadius: 12,
      padding: "10px 12px",
      outline: "none",
      fontSize: 14,
      background: "#fff",
      width: "100%",
      color: "#111",
      boxSizing: "border-box",
    } as React.CSSProperties,

    select: {
      border: "1px solid #d9d9e6",
      borderRadius: 12,
      padding: "10px 12px",
      outline: "none",
      fontSize: 14,
      background: "#fff",
      width: "100%",
      color: "#111",
      boxSizing: "border-box",
    } as React.CSSProperties,

    textarea: {
      border: "1px solid #d9d9e6",
      borderRadius: 12,
      padding: "10px 12px",
      outline: "none",
      fontSize: 14,
      minHeight: 80,
      resize: "vertical",
      width: "100%",
      color: "#111",
      boxSizing: "border-box",
    } as React.CSSProperties,

    hr: {
      border: "none",
      borderTop: "1px solid #eee",
      margin: "14px 0",
    } as React.CSSProperties,

    fileBox: {
      border: "1px dashed #d9d9e6",
      borderRadius: 12,
      padding: 10,
      background: "#fafafa",
      display: "grid",
      gap: 8,
    } as React.CSSProperties,

    fileInfo: {
      fontSize: 12,
      color: "#374151",
      wordBreak: "break-all",
    } as React.CSSProperties,
  };

  return (
    <div style={styles.page} data-page="documents">
      <div style={styles.topbar} data-mobile-role="documents-topbar">
        <div style={styles.title} data-mobile-role="documents-page-title">매입관리</div>

        <button style={styles.btn("primary")} onClick={openCreatePurchaseModal}>
          + 매입 등록(안에 상품까지)
        </button>

        <button style={styles.btn("primary")} onClick={openCostCreateModal}>
          + 추가비용(자동분배)
        </button>

        <button
          style={styles.btn("ghost")}
          onClick={toggleRefundPendingForSelected}
          disabled={loading || selectedItems.length === 0}
          title="선택 상품의 환불 진행중 표시를 켜거나 해제"
        >
          환불 진행중 체크/해제
        </button>

        <button
          style={styles.btn("ghost")}
          onClick={refreshAll}
          disabled={loading}
        >
          새로고침
        </button>

        <button style={styles.btn("ghost")} disabled={loading} onClick={() => setProcessingHistoryOpen(true)}>처리내역·취소</button>
        {legacyRefundRestoreCandidates.length > 0 ? (
          <button
            style={styles.btn("ghost")}
            onClick={restoreLegacyRefundItems}
            disabled={loading}
            title="예전 버전에서 삭제된 전체환불 상품을 환불 상세 기록으로 복구"
          >
            이전 환불상품 복구 ({legacyRefundRestoreCandidates.length}개)
          </button>
        ) : null}

        <div
          data-mobile-role="documents-selection-summary"
          style={{
            marginLeft: "auto",
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <span style={styles.small}>
            선택된 상품: <b>{selectedItemIds.length}개</b> / 선택 합계(상품
            원화합계): <b>{fmtKRW(selectedItemsLineTotalSum)}</b>
          </span>
          <button style={styles.btn("ghost")} onClick={clearSelection}>
            선택 해제
          </button>
        </div>
      </div>

      <ImportCertificatePanel selectedIds={selectedItemIds} items={items.map(item => ({ id: item.id, name: item.item_name || "상품명 없음", vendor: purchaseMap.get(item.purchase_id)?.supplier || "" }))} />

      {msg && (
        <div
          style={{
            ...styles.card,
            borderColor: "#bbf7d0",
            background: "#ecfdf5",
            color: "#065f46",
            fontWeight: 800,
            marginBottom: 12,
          }}
        >
          ✅ {msg}
        </div>
      )}

      {err && (
        <div
          style={{
            ...styles.card,
            borderColor: "#fecaca",
            background: "#fef2f2",
            color: "#991b1b",
            fontWeight: 800,
            marginBottom: 12,
          }}
        >
          ❌ {err}
        </div>
      )}

      <div style={styles.layout} data-tablet-layout="documents-main">
        <div
          data-tablet-role="documents-sidebar"
          style={{
            ...styles.card,
            position: "sticky",
            top: 16,
            minWidth: 0,
            display: "grid",
            gap: 10,
            alignSelf: "start",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
            }}
          >
            <div style={styles.h2}>매입목록</div>
            <div style={{ ...styles.small }}>
              총 <b>{filteredPurchases.length}건</b>
            </div>
          </div>

          <div
            data-mobile-role="documents-purchase-controls"
            style={{ display: "grid", gap: 8 }}
          >
            <input
              style={styles.input}
              value={purchaseSearch}
              onChange={(e) => setPurchaseSearch(e.target.value)}
              placeholder="매입목록 검색 (거래처/결제수단/카드/결제일)"
            />

            <select
              style={styles.select}
              value={purchaseSort}
              onChange={(e) =>
                setPurchaseSort(
                  e.target
                    .value as (typeof PURCHASE_SORT_OPTIONS)[number]["value"],
                )
              }
            >
              {PURCHASE_SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <select
              style={styles.select}
              value={purchaseViewFilter}
              onChange={(e) =>
                setPurchaseViewFilter(
                  e.target
                    .value as (typeof PURCHASE_FILTER_OPTIONS)[number]["value"],
                )
              }
            >
              {PURCHASE_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div
            data-mobile-role="documents-purchase-scroller"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              height: 520,
              minHeight: 520,
              maxHeight: 520,
              overflowY: "auto",
              overflowX: "hidden",
              paddingRight: 6,
              paddingBottom: 4,
              boxSizing: "border-box",
            }}
          >
            {filteredPurchases.length === 0 && (
              <div style={styles.small}>
                {purchaseViewFilter === "unreceived"
                  ? "미입고 상품이 포함된 매입이 없어."
                  : purchaseViewFilter === "refund_pending"
                    ? "환불 진행중 상품이 포함된 매입이 없어."
                    : purchaseViewFilter === "refunded"
                      ? "환불 상품이 포함된 매입이 없어."
                      : "조건에 맞는 매입이 없어."}
              </div>
            )}

            {filteredPurchases.map((p) => {
              const active = p.id === selectedPurchaseId;
              const cnt = purchaseCardCounts.get(p.id);
              const refundSummary = purchaseRefundSummaryMap.get(p.id);

              return (
                <div
                  key={p.id}
                  data-mobile-role="documents-purchase-card"
                  style={styles.purchaseCard(active)}
                  onClick={() => setSelectedPurchaseId(p.id)}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      alignItems: "start",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 15,
                          fontWeight: 900,
                          marginBottom: 6,
                        }}
                      >
                        {p.supplier?.trim() ? p.supplier : "(거래처 없음)"}{" "}
                        {cnt?.hasUnreceived ? (
                          <span style={styles.badge("orange")}>
                            미입고 {cnt.unreceivedQty}개
                          </span>
                        ) : null}
                        {(cnt?.refundPendingCount ?? 0) > 0 ? (
                          <span
                            style={{
                              ...styles.badge("purple"),
                              background: "#fef3c7",
                              color: "#92400e",
                              border: "1px solid #f59e0b",
                              padding: "4px 8px",
                              fontWeight: 900,
                            }}
                          >
                            환불 진행중 {cnt?.refundPendingCount ?? 0}개
                          </span>
                        ) : null}
                        {refundSummary?.fullCount ? (
                          <span
                            style={{
                              ...styles.badge("gray"),
                              background: "#fee2e2",
                              color: "#991b1b",
                              border: "1px solid #f87171",
                              padding: "4px 8px",
                              fontWeight: 900,
                            }}
                          >
                            전체환불 {refundSummary.fullCount}개
                          </span>
                        ) : null}
                        {refundSummary?.partialCount ? (
                          <span
                            style={{
                              ...styles.badge("orange"),
                              background: "#ffedd5",
                              color: "#9a3412",
                              border: "1px solid #fb923c",
                              padding: "4px 8px",
                              fontWeight: 900,
                            }}
                          >
                            부분환불 {refundSummary.partialCount}개
                          </span>
                        ) : null}
                        {refundSummary?.unknownCount ? (
                          <span style={styles.badge("purple")}>
                            환불기록 {refundSummary.unknownCount}건
                          </span>
                        ) : null}
                      </div>

                      <div style={{ ...styles.small, display: "grid", gap: 2 }}>
                        <div>
                          결제일: <b>{fmtDate(p.purchase_date)}</b>
                        </div>
                        <div>
                          결제수단: <b>{p.payment_met ?? "미입력"}</b> / 카드:{" "}
                          <b>{p.card_name ?? "미입력"}</b>
                        </div>
                        <div>
                          상품 종류 수: <b>{cnt?.itemKinds ?? 0}개</b> / 총원화:{" "}
                          <b>{fmtKRW(n(p.total_amount))}</b>
                        </div>
                        {cnt?.hasUnreceived ? (
                          <div style={{ color: "#9a3412", fontWeight: 900 }}>
                            미입고: {cnt.unreceivedQty}개
                          </div>
                        ) : null}
                        {(cnt?.refundPendingCount ?? 0) > 0 ? (
                          <div style={{ color: "#92400e", fontWeight: 900 }}>
                            환불 진행중: {cnt?.refundPendingCount ?? 0}개
                          </div>
                        ) : null}
                        {refundSummary &&
                        (refundSummary.fullCount > 0 ||
                          refundSummary.partialCount > 0 ||
                          refundSummary.unknownCount > 0) ? (
                          <div
                            style={{
                              color: "#b91c1c",
                              fontWeight: 900,
                              background: "#fff7ed",
                              border: "1px solid #fed7aa",
                              borderRadius: 8,
                              padding: "4px 6px",
                              width: "fit-content",
                            }}
                          >
                            환불:{" "}
                            {refundSummary.fullCount > 0 ? (
                              <>전체 {refundSummary.fullCount}개</>
                            ) : null}
                            {refundSummary.fullCount > 0 &&
                            refundSummary.partialCount > 0
                              ? " / "
                              : ""}
                            {refundSummary.partialCount > 0 ? (
                              <>부분 {refundSummary.partialCount}개</>
                            ) : null}
                            {(refundSummary.fullCount > 0 ||
                              refundSummary.partialCount > 0) &&
                            refundSummary.unknownCount > 0
                              ? " / "
                              : ""}
                            {refundSummary.unknownCount > 0 ? (
                              <>기록 {refundSummary.unknownCount}건</>
                            ) : null}
                          </div>
                        ) : null}
                        <div>등록: {fmtDateTime(p.created_at)}</div>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                        flexShrink: 0,
                        alignSelf: "stretch",
                        justifyContent: "center",
                      }}
                    >
                      <button
                        style={styles.smallBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          openPurchaseEditModal(p);
                        }}
                      >
                        수정
                      </button>
                      <button
                        style={styles.dangerSmallBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          deletePurchase(p.id);
                        }}
                      >
                        매입 취소
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div
          data-mobile-role="documents-product-panel"
          style={{ display: "grid", gap: 14, minWidth: 0 }}
        >
          <div style={styles.card}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                marginBottom: 10,
                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <div style={styles.h2}>상품목록</div>
                <div style={styles.small}>
                  종류수 <b>{visibleItemKinds}개</b> / 총수량{" "}
                  <b>{fmtNum(visibleItemQtySum)}개</b>
                </div>
              </div>

              <div
                data-mobile-role="documents-item-controls"
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <input
                  style={{ ...styles.input, width: 280 }}
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                  placeholder="상품 전체 검색 (상품명/메모/거래처)"
                />
                <select
                  style={{ ...styles.select, width: 220 }}
                  value={itemSort}
                  onChange={(e) =>
                    setItemSort(
                      e.target
                        .value as (typeof ITEM_SORT_OPTIONS)[number]["value"],
                    )
                  }
                >
                  {ITEM_SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <div style={styles.small}>
                  {itemSearch.trim() ? (
                    <>
                      전체 상품 검색 중 · 현재 선택 매입:{" "}
                      <b>
                        {selectedPurchase?.supplier?.trim() || "(거래처 없음)"}
                      </b>
                    </>
                  ) : selectedPurchase ? (
                    <>
                      현재 매입:{" "}
                      <b>
                        {selectedPurchase.supplier?.trim() || "(거래처 없음)"}
                      </b>
                    </>
                  ) : (
                    "왼쪽에서 매입을 선택해줘."
                  )}
                </div>
              </div>
            </div>

            <div
              style={{
                marginBottom: 10,
                padding: "10px 12px",
                borderRadius: 10,
                background: "#f5f6fa",
                color: "#4b5563",
                fontSize: 12,
                lineHeight: 1.7,
              }}
            >
              <div><b>원화합계</b> · 해당 상품의 수량 전체 금액 (추가비용 제외)</div>
              <div><b>상품단가</b> · 상품 1개 가격 (추가비용 제외)</div>
              <div><b>추가비용 내역</b> · 해당 상품에 배분된 배송비·수수료·관부가세 등의 금액</div>
              <div><b>최종단가</b> · 추가비용까지 포함한 상품 1개 가격</div>
              <div style={{ marginTop: 5, color: "#6b7280", fontSize: 11 }}>
                예: 10개 상품값 80,000원 + 추가비용 15,000원 → 원화합계 80,000원 / 상품단가 8,000원 / 최종단가 9,500원
              </div>
            </div>

            <div style={{ ...styles.small, marginBottom: 10 }}>
              ✅ 체크는 매입을 바꿔도 유지돼. 검색해도 체크 유지됨.
            </div>

            <div
              data-tablet-role="documents-table-wrap" data-mobile-role="documents-desktop-table"
              ref={productTableWrapRef}
              style={{
                maxHeight: 350,
                overflowY: "auto",
                overflowX: "auto",
                borderRadius: 14,
              }}
            >
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={{ ...styles.th, width: 52 }}>
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 5,
                          cursor:
                            visibleSelectableItemIds.length > 0
                              ? "pointer"
                              : "default",
                        }}
                        title="현재 화면에 보이는 상품 전체 선택/해제"
                      >
                        <input
                          type="checkbox"
                          checked={allVisibleItemsSelected}
                          ref={(el) => {
                            if (el) el.indeterminate = someVisibleItemsSelected;
                          }}
                          disabled={visibleSelectableItemIds.length === 0}
                          onChange={toggleAllVisibleItems}
                          style={{
                            width: 16,
                            height: 16,
                            cursor:
                              visibleSelectableItemIds.length > 0
                                ? "pointer"
                                : "default",
                          }}
                        />
                        <span>전체</span>
                      </label>
                    </th>
                    <th style={styles.th}>상품</th>
                    <th style={{ ...styles.th, width: 70 }}>수량</th>
                    <th
                      data-tablet-role="documents-payment-date"
                      style={{ ...styles.th, width: 110 }}
                    >
                      결제일
                    </th>
                    <th style={{ ...styles.th, width: 130 }}>원화합계</th>
                    <th style={{ ...styles.th, width: 110 }}>상품단가</th>
                    <th style={{ ...styles.th, width: 180 }}>추가비용 내역</th>
                    <th style={{ ...styles.th, width: 120 }}>최종단가</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedVisibleItems.length === 0 ? (
                    <tr>
                      <td style={styles.td} colSpan={8}>
                        <span style={styles.small}>
                          조건에 맞는 상품이 없어.
                        </span>
                      </td>
                    </tr>
                  ) : (
                    sortedVisibleItems.map((it) => {
                      const checked = selectedItemIds.includes(it.id);
                      const lineTotal = n(it.line_total);
                      const allocSum = allocationSumByItem.get(it.id) ?? 0;
                      const refundStatus = itemRefundStatusMap.get(it.id);
                      const isFullyRefunded =
                        refundStatus === "전체환불" || n(it.qty) <= 0;
                      const finalUnit = isFullyRefunded
                        ? 0
                        : ceilInt(
                            (lineTotal + allocSum) / Math.max(1, n(it.qty)),
                          );
                      const parentPurchase = purchaseMap.get(it.purchase_id);
                      const arrivedQty = Math.max(
                        0,
                        arrivedQtyByItem.get(it.id) ?? 0,
                      );
                      const unreceivedQty = Math.max(0, n(it.qty) - arrivedQty);
                      const isUnreceived =
                        !isFullyRefunded && unreceivedQty > 0;

                      return (
                        <tr key={it.id}>
                          <td style={styles.td}>
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={isFullyRefunded}
                              onChange={() => {
                                if (!isFullyRefunded) toggleSelectedItem(it.id);
                              }}
                              style={{
                                width: 18,
                                height: 18,
                                cursor: isFullyRefunded
                                  ? "not-allowed"
                                  : "pointer",
                              }}
                            />
                          </td>

                          <td style={styles.td}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                minWidth: 220,
                              }}
                            >
                              {itemPhotoMap.get(it.id) ? (
                                <img
                                  src={itemPhotoMap.get(it.id)}
                                  alt={it.item_name ?? "상품"}
                                  style={{
                                    width: 44,
                                    height: 44,
                                    objectFit: "cover",
                                    borderRadius: 10,
                                    border: "1px solid #ddd",
                                    background: "#f3f4f6",
                                    flexShrink: 0,
                                  }}
                                />
                              ) : (
                                <div
                                  style={{
                                    width: 44,
                                    height: 44,
                                    borderRadius: 10,
                                    border: "1px solid #ddd",
                                    background: "#f3f4f6",
                                    color: "#888",
                                    fontSize: 11,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    flexShrink: 0,
                                  }}
                                >
                                  없음
                                </div>
                              )}

                              <div style={{ minWidth: 0 }}>
                                <div
                                  onClick={() => openItemDetail(it)}
                                  style={{
                                    cursor: "pointer",
                                    textAlign: "left",
                                    color: "#111",
                                  }}
                                >
                                  <div
                                    data-tablet-role="documents-item-title"
                                    style={{
                                      fontWeight: 900,
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 6,
                                      flexWrap: "wrap",
                                    }}
                                  >
                                    <span data-tablet-role="documents-product-name">
                                      {it.item_name ?? "(이름 없음)"}
                                    </span>
                                    <span style={styles.badge("gray")}>
                                      {it.product_type ?? "기타"}
                                    </span>
                                    {refundPendingItemIds.has(it.id) ? (
                                      <span
                                        style={{
                                          ...styles.badge("purple"),
                                          background: "#fef3c7",
                                          color: "#92400e",
                                          border: "1px solid #f59e0b",
                                        }}
                                      >
                                        환불 진행중
                                      </span>
                                    ) : null}
                                    {refundStatus ? (
                                      <span
                                        style={styles.badge(
                                          refundStatus === "전체환불"
                                            ? "gray"
                                            : "orange",
                                        )}
                                      >
                                        {refundStatus}
                                      </span>
                                    ) : null}
                                    {isUnreceived ? (
                                      <span style={styles.badge("orange")}>
                                        미입고 {fmtNum(unreceivedQty)}개
                                      </span>
                                    ) : null}
                                    <span data-tablet-role="documents-cost-badges">
                                      {(itemCostBadgeMap.get(it.id) ?? []).map(
                                        (badge) => (
                                          <button
                                            key={badge.costId}
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              openCostEditorById(badge.costId);
                                            }}
                                            style={{
                                              ...styles.badge("purple"),
                                              border: "none",
                                              cursor: "pointer",
                                            }}
                                          >
                                            {badge.label}
                                          </button>
                                        ),
                                      )}
                                    </span>
                                  </div>
                                </div>
                                <div style={styles.small}>
                                  거래처:{" "}
                                  {parentPurchase?.supplier ?? "(거래처 없음)"}
                                </div>
                                <div style={styles.small}>
                                  등록: {fmtDateTime(it.created_at)}
                                </div>
                                <div
                                  data-tablet-role="documents-payment-date-inline"
                                  style={{ ...styles.small, display: "none" }}
                                >
                                  결제일:{" "}
                                  {fmtDate(parentPurchase?.purchase_date)}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td style={styles.td}>
                            <div style={{ fontWeight: 900 }}>
                              {fmtNum(n(it.qty))}
                            </div>
                            {isFullyRefunded ? (
                              <div style={styles.small}>환불완료</div>
                            ) : null}
                          </td>
                          <td
                            data-tablet-role="documents-payment-date"
                            style={styles.td}
                          >
                            {fmtDate(parentPurchase?.purchase_date)}
                          </td>

                          <td style={styles.td}>
                            <div style={{ fontWeight: 900 }}>
                              {fmtKRW(lineTotal)}
                            </div>
                            <div style={styles.small}>
                              외화총액: {fmtNum(n(it.foreign_total))}{" "}
                              {parentPurchase?.currency ?? ""}
                            </div>
                          </td>

                          <td style={styles.td}>
                            <div style={{ fontWeight: 900 }}>
                              {isFullyRefunded ? "-" : fmtKRW(ceilInt(lineTotal / Math.max(1, n(it.qty))))}
                            </div>
                            <div style={styles.small}>추가비용 제외 · 개당</div>
                          </td>
                          <td style={styles.td}>
                            {renderAllocationDetails(it.id, isFullyRefunded ? 0 : n(it.qty), allocSum)}
                          </td>

                          <td style={styles.td}>
                            <div style={{ fontWeight: 900 }}>
                              {isFullyRefunded ? "-" : fmtKRW(finalUnit)}
                            </div>
                            <div style={styles.small}>
                              {isFullyRefunded ? "전체환불" : "추가비용 포함 · 개당"}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* 휴대폰 전용 상품 카드 목록.
                PC/태블릿 표와 같은 데이터/이벤트를 사용하므로 기능은 동일하다. */}
            <div
              data-mobile-role="documents-mobile-items"
              style={{ display: "none" }}
            >
              <label
                data-mobile-role="documents-mobile-select-all"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontWeight: 900,
                  cursor:
                    visibleSelectableItemIds.length > 0 ? "pointer" : "default",
                }}
              >
                <input
                  type="checkbox"
                  checked={allVisibleItemsSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someVisibleItemsSelected;
                  }}
                  disabled={visibleSelectableItemIds.length === 0}
                  onChange={toggleAllVisibleItems}
                  style={{ width: 20, height: 20 }}
                />
                현재 보이는 상품 전체 선택
              </label>

              {sortedVisibleItems.length === 0 ? (
                <div style={{ ...styles.card, padding: 14 }}>
                  <span style={styles.small}>조건에 맞는 상품이 없어.</span>
                </div>
              ) : (
                sortedVisibleItems.map((it) => {
                  const checked = selectedItemIds.includes(it.id);
                  const lineTotal = n(it.line_total);
                  const allocSum = allocationSumByItem.get(it.id) ?? 0;
                  const refundStatus = itemRefundStatusMap.get(it.id);
                  const isFullyRefunded =
                    refundStatus === "전체환불" || n(it.qty) <= 0;
                  const finalUnit = isFullyRefunded
                    ? 0
                    : ceilInt(
                        (lineTotal + allocSum) / Math.max(1, n(it.qty)),
                      );
                  const parentPurchase = purchaseMap.get(it.purchase_id);
                  const arrivedQty = Math.max(
                    0,
                    arrivedQtyByItem.get(it.id) ?? 0,
                  );
                  const unreceivedQty = Math.max(0, n(it.qty) - arrivedQty);
                  const isUnreceived = !isFullyRefunded && unreceivedQty > 0;

                  return (
                    <div
                      key={`mobile-${it.id}`}
                      data-mobile-role="documents-item-card"
                      style={{
                        ...styles.card,
                        padding: 10,
                        display: "grid",
                        gap: 8,
                        boxShadow: "none",
                      }}
                    >
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "24px minmax(0, 1fr)",
                          gap: 8,
                          alignItems: "start",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={isFullyRefunded}
                          onChange={() => {
                            if (!isFullyRefunded) toggleSelectedItem(it.id);
                          }}
                          style={{
                            width: 20,
                            height: 20,
                            marginTop: 4,
                            cursor: isFullyRefunded
                              ? "not-allowed"
                              : "pointer",
                          }}
                        />

                        <div style={{ minWidth: 0 }}>
                          <button
                            type="button"
                            onClick={() => openItemDetail(it)}
                            style={{
                              border: "none",
                              background: "transparent",
                              padding: 0,
                              color: "#111",
                              textAlign: "left",
                              fontWeight: 900,
                              fontSize: 13,
                              lineHeight: 1.3,
                              cursor: "pointer",
                              width: "100%",
                              wordBreak: "break-word",
                              display: "-webkit-box",
                              WebkitLineClamp: 3,
                              WebkitBoxOrient: "vertical",
                              overflow: "hidden",
                              marginBottom: 6,
                            }}
                          >
                            {it.item_name ?? "(이름 없음)"}
                          </button>

                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "52px minmax(0, 1fr)",
                              gap: 8,
                              alignItems: "start",
                              marginLeft: -32,
                            }}
                          >
                            {itemPhotoMap.get(it.id) ? (
                              <img
                                src={itemPhotoMap.get(it.id)}
                                alt={it.item_name ?? "상품"}
                                onClick={() => openItemDetail(it)}
                                style={{
                                  width: 52,
                                  height: 52,
                                  objectFit: "cover",
                                  borderRadius: 10,
                                  border: "1px solid #ddd",
                                  background: "#f3f4f6",
                                  cursor: "pointer",
                                }}
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={() => openItemDetail(it)}
                                style={{
                                  width: 52,
                                  height: 52,
                                  borderRadius: 10,
                                  border: "1px solid #ddd",
                                  background: "#f3f4f6",
                                  color: "#888",
                                  fontSize: 10,
                                  cursor: "pointer",
                                  padding: 0,
                                }}
                              >
                                사진
                                <br />
                                없음
                              </button>
                            )}

                            <div
                              style={{
                                display: "flex",
                                gap: 4,
                                flexWrap: "wrap",
                                alignContent: "flex-start",
                                minWidth: 0,
                              }}
                            >
                              <span style={{ ...styles.badge("gray"), fontSize: 10, padding: "2px 6px" }}>
                                {it.product_type ?? "기타"}
                              </span>
                              {refundPendingItemIds.has(it.id) ? (
                                <span
                                  style={{
                                    ...styles.badge("purple"),
                                    background: "#fef3c7",
                                    color: "#92400e",
                                    border: "1px solid #f59e0b",
                                    fontSize: 10,
                                    padding: "2px 6px",
                                  }}
                                >
                                  환불 진행중
                                </span>
                              ) : null}
                              {refundStatus ? (
                                <span
                                  style={{
                                    ...styles.badge(
                                      refundStatus === "전체환불"
                                        ? "gray"
                                        : "orange",
                                    ),
                                    fontSize: 10,
                                    padding: "2px 6px",
                                  }}
                                >
                                  {refundStatus}
                                </span>
                              ) : null}
                              {isUnreceived ? (
                                <span
                                  style={{
                                    ...styles.badge("orange"),
                                    fontSize: 10,
                                    padding: "2px 6px",
                                  }}
                                >
                                  미입고 {fmtNum(unreceivedQty)}개
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: "7px 8px",
                          fontSize: 11,
                        }}
                      >
                        <div>
                          <div style={{ color: "#6b7280" }}>수량</div>
                          <b style={{ fontSize: 13 }}>
                            {fmtNum(n(it.qty))}
                            {isFullyRefunded ? " (환불완료)" : ""}
                          </b>
                        </div>
                        <div>
                          <div style={{ color: "#6b7280" }}>원화합계</div>
                          <b style={{ fontSize: 13 }}>{fmtKRW(lineTotal)}</b>
                        </div>
                        <div>
                          <div style={{ color: "#6b7280" }}>상품단가 · 개당</div>
                          <b style={{ fontSize: 13 }}>
                            {isFullyRefunded ? "-" : fmtKRW(ceilInt(lineTotal / Math.max(1, n(it.qty))))}
                          </b>
                          <div style={{ color: "#6b7280", fontSize: 10 }}>추가비용 제외</div>
                        </div>
                        <div>
                          <div style={{ color: "#6b7280" }}>최종단가</div>
                          <b style={{ fontSize: 13 }}>
                            {isFullyRefunded ? "-" : fmtKRW(finalUnit)}
                          </b>
                        </div>
                      </div>

                      <div style={{ paddingTop: 8, borderTop: "1px solid #f0f0f5" }}>
                        <div style={{ color: "#6b7280", fontSize: 11 }}>추가비용 내역 · 해당 상품 기준</div>
                        {renderAllocationDetails(it.id, isFullyRefunded ? 0 : n(it.qty), allocSum)}
                      </div>

                      {(itemCostBadgeMap.get(it.id) ?? []).length > 0 ? (
                        <div
                          style={{
                            display: "flex",
                            gap: 6,
                            flexWrap: "wrap",
                            paddingTop: 8,
                            borderTop: "1px solid #f0f0f5",
                          }}
                        >
                          {(itemCostBadgeMap.get(it.id) ?? []).map((badge) => (
                            <button
                              key={`mobile-cost-${badge.costId}`}
                              type="button"
                              onClick={() => openCostEditorById(badge.costId)}
                              style={{
                                ...styles.badge("purple"),
                                border: "none",
                                cursor: "pointer",
                                fontSize: 10,
                                padding: "5px 7px",
                              }}
                            >
                              {badge.label} 수정
                            </button>
                          ))}
                        </div>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => openItemDetail(it)}
                        style={{
                          ...styles.smallBtn,
                          width: "100%",
                          padding: "8px 8px",
                          fontSize: 11,
                        }}
                      >
                        상품 상세 보기
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            <div
              data-mobile-role="documents-cost-action"
              style={{
                marginTop: 10,
                display: "flex",
                justifyContent: "flex-end",
              }}
            >
              <button
                style={styles.btn("primary")}
                onClick={openCostCreateModal}
              >
                선택 상품에 추가비용 자동분배 →
              </button>
            </div>
          </div>

          {selectedItems.length > 0 ? (
            <div style={styles.card}>
              <div style={styles.h2}>선택된상품</div>
              <div
                style={{
                  display: "grid",
                  gap: 10,
                  maxHeight: 240,
                  overflowY: "auto",
                }}
              >
                {selectedItems.map((it) => {
                  const allocSum = allocationSumByItem.get(it.id) ?? 0;
                  const refundStatus = itemRefundStatusMap.get(it.id);
                  return (
                    <div
                      key={it.id}
                      style={{
                        ...styles.card,
                        padding: 10,
                        background: "#fcfcff",
                        width: "100%",
                      }}
                    >
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr auto",
                          gap: 8,
                          alignItems: "start",
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontWeight: 900,
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              flexWrap: "wrap",
                            }}
                          >
                            <span data-tablet-role="documents-product-name">
                              {it.item_name ?? "(이름 없음)"}
                            </span>
                            {refundPendingItemIds.has(it.id) ? (
                              <span
                                style={{
                                  ...styles.badge("purple"),
                                  background: "#fef3c7",
                                  color: "#92400e",
                                }}
                              >
                                환불 진행중
                              </span>
                            ) : null}
                            {itemRefundStatusMap.get(it.id) ? (
                              <span
                                style={styles.badge(
                                  itemRefundStatusMap.get(it.id) === "전체환불"
                                    ? "gray"
                                    : "orange",
                                )}
                              >
                                {itemRefundStatusMap.get(it.id)}
                              </span>
                            ) : null}
                            {(itemCostBadgeMap.get(it.id) ?? []).map(
                              (badge) => (
                                <button
                                  key={badge.costId}
                                  type="button"
                                  onClick={() =>
                                    openCostEditorById(badge.costId)
                                  }
                                  style={{
                                    ...styles.badge("purple"),
                                    border: "none",
                                    cursor: "pointer",
                                  }}
                                >
                                  {badge.label}
                                </button>
                              ),
                            )}
                          </div>
                          <div style={styles.small}>
                            매입:{" "}
                            {purchaseMap.get(it.purchase_id)?.supplier ??
                              "(거래처 없음)"}
                          </div>
                          <div style={styles.small}>
                            수량 {fmtNum(n(it.qty))} / 상품 원화합계{" "}
                            {fmtKRW(n(it.line_total))} / 현재 배분{" "}
                            {fmtKRW(allocSum)}
                            {refundStatus === "전체환불"
                              ? " / 전체환불 이력 유지"
                              : ""}
                          </div>
                        </div>
                        <button
                          style={{
                            ...styles.dangerSmallBtn,
                            padding: "6px 8px",
                            minWidth: 0,
                            width: "fit-content",
                            flexShrink: 0,
                          }}
                          onClick={() => removeSelectedItem(it.id)}
                        >
                          제거
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <style jsx global>{`
        /* 매입관리 태블릿 전용: 매입목록과 상품목록을 위아래로 쌓지 않고 좌우로 유지 */
        @media (min-width: 700px) and (max-width: 1180px) {
          html[data-view-mode="tablet"] [data-page="documents"] [data-tablet-layout="documents-main"] {
            grid-template-columns: minmax(260px, 32%) minmax(0, 1fr) !important;
            gap: 12px !important;
            align-items: start !important;
          }

          html[data-view-mode="tablet"] [data-page="documents"] [data-tablet-role="documents-sidebar"] {
            position: sticky !important;
            top: 12px !important;
            min-width: 0 !important;
          }

          html[data-view-mode="tablet"] [data-page="documents"] [data-tablet-role="documents-table-wrap"] {
            overflow-x: hidden !important;
            max-width: 100% !important;
          }

          html[data-view-mode="tablet"] [data-page="documents"] [data-tablet-role="documents-table-wrap"] table {
            width: 100% !important;
            min-width: 0 !important;
            table-layout: fixed !important;
          }

          html[data-view-mode="tablet"] [data-page="documents"] [data-tablet-role="documents-payment-date"] {
            display: none !important;
          }

          html[data-view-mode="tablet"] [data-page="documents"] [data-tablet-role="documents-payment-date-inline"] {
            display: block !important;
          }

          html[data-view-mode="tablet"] [data-page="documents"] [data-tablet-role="documents-product-name"] {
            white-space: normal !important;
            word-break: break-word !important;
            overflow: visible !important;
          }

          html[data-view-mode="tablet"] [data-page="documents"] [data-tablet-role="documents-table-wrap"] th,
          html[data-view-mode="tablet"] [data-page="documents"] [data-tablet-role="documents-table-wrap"] td {
            padding: 9px 6px !important;
            font-size: 12px !important;
            white-space: normal !important;
            vertical-align: top !important;
          }

          html[data-view-mode="tablet"] [data-page="documents"] [data-tablet-role="documents-table-wrap"] th:nth-child(1) { width: 7% !important; }
          html[data-view-mode="tablet"] [data-page="documents"] [data-tablet-role="documents-table-wrap"] th:nth-child(2) { width: 50% !important; }
          html[data-view-mode="tablet"] [data-page="documents"] [data-tablet-role="documents-table-wrap"] th:nth-child(3) { width: 7% !important; }
          html[data-view-mode="tablet"] [data-page="documents"] [data-tablet-role="documents-table-wrap"] th:nth-child(5) { width: 14% !important; }
          html[data-view-mode="tablet"] [data-page="documents"] [data-tablet-role="documents-table-wrap"] th:nth-child(6) { width: 9% !important; }
          html[data-view-mode="tablet"] [data-page="documents"] [data-tablet-role="documents-table-wrap"] th:nth-child(7) { width: 13% !important; }

          [data-tablet-role="purchase-buy-form"] [data-tablet-role="purchase-form-grid"] {
            grid-template-columns: minmax(0, 1fr) !important;
          }
          [data-tablet-role="purchase-buy-form"] input,
          [data-tablet-role="purchase-buy-form"] select,
          [data-tablet-role="purchase-buy-form"] textarea {
            min-width: 0 !important;
            width: 100% !important;
            box-sizing: border-box !important;
          }
          [data-tablet-role="purchase-buy-form"] button {
            max-width: 100%;
          }

          [data-tablet-role="purchase-buy-form"] [data-tablet-role="purchase-item-input-grid"] {
            grid-template-columns: minmax(0, 1fr) !important;
          }

          [data-tablet-role="purchase-cost-form"] > div,
          [data-tablet-role="purchase-cost-form"] input,
          [data-tablet-role="purchase-cost-form"] select,
          [data-tablet-role="purchase-cost-form"] textarea {
            min-width: 0 !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
          }

          [data-tablet-role="purchase-cost-form"] > div:nth-child(2) {
            grid-template-columns: minmax(0, 1fr) !important;
          }

          [data-tablet-role="purchase-cost-form"] button {
            max-width: 100% !important;
            white-space: normal !important;
          }

        }

        /* -------------------------------------------------------
           휴대폰 전용
           기능을 빼지 않고 레이아웃만 모바일 카드형으로 변경
        ------------------------------------------------------- */
        @media (max-width: 699px) {
          html, body {
            max-width: 100vw !important;
            overflow-x: hidden !important;
          }

          [data-page="documents"] {
            width: 100% !important;
            max-width: 100vw !important;
            padding: 10px !important;
            overflow-x: hidden !important;
            box-sizing: border-box !important;
          }

          [data-page="documents"] * {
            box-sizing: border-box;
          }

          /* 매입관리 액션바: 휴대폰에서 한 줄 가로 스크롤 + 상단 고정 */
          [data-page="documents"] [data-mobile-role="documents-topbar"] {
            position: sticky !important;
            top: 0 !important;
            z-index: 45 !important;
            display: flex !important;
            flex-direction: row !important;
            flex-wrap: nowrap !important;
            gap: 8px !important;
            width: calc(100% + 20px) !important;
            max-width: none !important;
            margin: -10px -10px 10px -10px !important;
            padding: 8px 10px !important;
            overflow-x: auto !important;
            overflow-y: hidden !important;
            overscroll-behavior-x: contain;
            scroll-snap-type: x proximity;
            align-items: center !important;
            background: rgba(247, 247, 251, 0.98) !important;
            border-bottom: 1px solid #e5e7eb !important;
            backdrop-filter: blur(8px);
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
            touch-action: pan-x;
          }

          [data-page="documents"] [data-mobile-role="documents-topbar"]::-webkit-scrollbar {
            display: none;
          }

          [data-page="documents"] [data-mobile-role="documents-page-title"],
          [data-page="documents"] [data-mobile-role="documents-topbar"] > div:first-child {
            display: none !important;
          }

          [data-page="documents"] [data-mobile-role="documents-topbar"] > button {
            flex: 0 0 auto !important;
            width: auto !important;
            min-width: max-content !important;
            max-width: none !important;
            padding: 9px 13px !important;
            white-space: nowrap !important;
            line-height: 1.2 !important;
            font-size: 13px !important;
            scroll-snap-align: start;
          }

          [data-page="documents"] [data-mobile-role="documents-selection-summary"] {
            flex: 0 0 auto !important;
            margin-left: 0 !important;
            width: auto !important;
            display: flex !important;
            flex-wrap: nowrap !important;
            gap: 6px !important;
            align-items: center !important;
            padding: 0 !important;
          }

          [data-page="documents"] [data-mobile-role="documents-selection-summary"] > span {
            display: none !important;
          }

          [data-page="documents"] [data-mobile-role="documents-selection-summary"] > span {
            min-width: max-content !important;
            font-size: 12px !important;
            line-height: 1.2 !important;
            white-space: nowrap !important;
          }

          [data-page="documents"] [data-mobile-role="documents-selection-summary"] > button {
            width: auto !important;
            min-width: max-content !important;
          }

          /* 매입목록 + 상품목록은 휴대폰에서 세로로 */
          [data-page="documents"] [data-tablet-layout="documents-main"] {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) !important;
            gap: 12px !important;
            width: 100% !important;
          }

          [data-page="documents"] [data-tablet-role="documents-sidebar"] {
            position: static !important;
            top: auto !important;
            width: 100% !important;
            min-width: 0 !important;
            padding: 10px !important;
            gap: 8px !important;
          }

          /* 매입카드를 가로 캐러셀처럼 보여서 상품목록도 같은 화면에 바로 보이게 */
          [data-page="documents"] [data-mobile-role="documents-purchase-scroller"] {
            display: flex !important;
            flex-direction: row !important;
            gap: 8px !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            overflow-x: auto !important;
            overflow-y: hidden !important;
            padding: 2px 2px 8px !important;
            scroll-snap-type: x proximity;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
          }

          [data-page="documents"] [data-mobile-role="documents-purchase-scroller"]::-webkit-scrollbar {
            display: none;
          }

          [data-page="documents"] [data-mobile-role="documents-purchase-card"] {
            flex: 0 0 82% !important;
            width: 82% !important;
            min-width: 260px !important;
            max-width: 320px !important;
            min-height: 0 !important;
            scroll-snap-align: start;
            padding: 10px !important;
          }

          [data-page="documents"] [data-mobile-role="documents-purchase-card"] button {
            min-height: 36px !important;
            padding: 6px 8px !important;
          }

          [data-page="documents"] [data-mobile-role="documents-product-panel"] {
            margin-top: 0 !important;
          }

          [data-page="documents"] [data-tablet-role="documents-sidebar"] input,
          [data-page="documents"] [data-tablet-role="documents-sidebar"] select {
            width: 100% !important;
            min-width: 0 !important;
            font-size: 16px !important;
          }

          /* 매입목록: 검색 + 정렬 + 보기 필터를 한 줄 */
          [data-page="documents"] [data-mobile-role="documents-purchase-controls"] {
            display: grid !important;
            grid-template-columns: minmax(0, 1.6fr) minmax(105px, 0.8fr) minmax(120px, 0.9fr) !important;
            gap: 6px !important;
            align-items: center !important;
            width: 100% !important;
          }

          [data-page="documents"] [data-mobile-role="documents-purchase-controls"] input,
          [data-page="documents"] [data-mobile-role="documents-purchase-controls"] select {
            width: 100% !important;
            min-width: 0 !important;
            height: 44px !important;
            min-height: 44px !important;
            padding: 8px 9px !important;
            font-size: 14px !important;
          }

          /* 매입 카드: 버튼이 내용 폭을 잡아먹지 않게 */
          [data-page="documents"] [data-tablet-role="documents-sidebar"] button {
            flex-shrink: 0 !important;
          }

          /* 상품검색/정렬 */
          [data-page="documents"] [data-mobile-role="documents-item-controls"] {
            width: 100% !important;
            display: grid !important;
            grid-template-columns: minmax(0, 1.6fr) minmax(120px, 0.9fr) !important;
            gap: 6px !important;
            align-items: center !important;
          }

          [data-page="documents"] [data-mobile-role="documents-item-controls"] input,
          [data-page="documents"] [data-mobile-role="documents-item-controls"] select {
            width: 100% !important;
            min-width: 0 !important;
            height: 44px !important;
            min-height: 44px !important;
            padding: 8px 9px !important;
            font-size: 14px !important;
          }

          [data-page="documents"] [data-mobile-role="documents-item-controls"] > div {
            grid-column: 1 / -1 !important;
            font-size: 12px !important;
          }

          /* 좁은 화면에서는 기존 가로표 대신 동일 기능의 카드 목록 */
          [data-page="documents"] [data-mobile-role="documents-desktop-table"] {
            display: none !important;
          }

          [data-page="documents"] [data-mobile-role="documents-mobile-items"] {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 8px !important;
            width: 100% !important;
            align-items: start !important;
          }

          [data-page="documents"] [data-mobile-role="documents-mobile-select-all"] {
            grid-column: 1 / -1 !important;
          }

          [data-page="documents"] [data-mobile-role="documents-mobile-select-all"] {
            padding: 8px 2px !important;
          }

          [data-page="documents"] [data-mobile-role="documents-item-card"] {
            width: 100% !important;
            min-width: 0 !important;
            overflow: hidden !important;
            border-radius: 14px !important;
          }

          [data-page="documents"] [data-mobile-role="documents-item-card"] button {
            min-width: 0 !important;
          }

          [data-page="documents"] [data-mobile-role="documents-cost-action"] {
            justify-content: stretch !important;
          }

          [data-page="documents"] [data-mobile-role="documents-cost-action"] button {
            width: 100% !important;
            white-space: normal !important;
          }

          /* 일반 카드/선택상품 카드가 화면 밖으로 나가지 않게 */
          [data-page="documents"] > div,
          [data-page="documents"] [data-tablet-layout="documents-main"] > div,
          [data-page="documents"] [data-tablet-layout="documents-main"] > div > div {
            max-width: 100% !important;
            min-width: 0 !important;
          }

          [data-page="documents"] [data-tablet-role="documents-product-name"] {
            white-space: normal !important;
            overflow-wrap: anywhere !important;
            word-break: break-word !important;
          }

          /* 매입/추가비용/환불 모달 내부 */
          [data-tablet-role="purchase-buy-form"],
          [data-tablet-role="purchase-cost-form"] {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            overflow-x: hidden !important;
          }

          [data-tablet-role="purchase-buy-form"] *,
          [data-tablet-role="purchase-cost-form"] * {
            box-sizing: border-box !important;
            max-width: 100% !important;
            min-width: 0 !important;
          }

          [data-tablet-role="purchase-buy-form"] [data-tablet-role="purchase-form-grid"],
          [data-tablet-role="purchase-buy-form"] [data-tablet-role="purchase-item-input-grid"],
          [data-tablet-role="purchase-cost-form"] > div {
            grid-template-columns: minmax(0, 1fr) !important;
          }

          [data-tablet-role="purchase-buy-form"] input,
          [data-tablet-role="purchase-buy-form"] select,
          [data-tablet-role="purchase-buy-form"] textarea,
          [data-tablet-role="purchase-cost-form"] input,
          [data-tablet-role="purchase-cost-form"] select,
          [data-tablet-role="purchase-cost-form"] textarea {
            width: 100% !important;
            min-width: 0 !important;
            max-width: 100% !important;
            font-size: 16px !important; /* iOS 입력 시 자동 확대 방지 */
          }

          [data-tablet-role="purchase-buy-form"] button,
          [data-tablet-role="purchase-cost-form"] button {
            max-width: 100% !important;
            white-space: normal !important;
          }

          /* 모달 컴포넌트가 role=dialog를 쓰는 경우 화면 안에 고정 */
          [role="dialog"] {
            max-width: calc(100vw - 16px) !important;
            width: calc(100vw - 16px) !important;
            max-height: calc(100dvh - 24px) !important;
            overflow: auto !important;
          }

          [role="dialog"] > * {
            max-width: 100% !important;
            min-width: 0 !important;
          }

          /* 모달 안의 표는 기능 보존을 위해 가로스크롤 허용 */
          [role="dialog"] table {
            min-width: 640px;
          }

          [role="dialog"] table:has(input),
          [role="dialog"] table:has(select) {
            display: table;
          }

          /* 파일 업로드/메모 */
          [data-page="documents"] input[type="file"] {
            max-width: 100% !important;
            width: 100% !important;
          }

          /* 터치 영역 확보 */
          [data-page="documents"] button,
          [data-page="documents"] select,
          [data-page="documents"] input {
            min-height: 42px;
          }

          [data-page="documents"] input[type="checkbox"] {
            min-height: 0 !important;
          }
        }
      `}</style>

      <SafeModal
        open={buyModalOpen}
        title={buyMode === "edit" ? "매입 수정" : "매입 등록 (안에 상품까지)"}
        onClose={requestCloseBuyModal}
      >
        <div
          data-tablet-role="purchase-buy-form"
          onInputCapture={() => setBuyDirty(true)}
          onChangeCapture={() => setBuyDirty(true)}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 10,
              marginBottom: 14,
            }}
          >
            <button
              type="button"
              style={styles.btn("ghost")}
              onClick={() => savePurchaseDraft(true)}
            >
              임시저장
            </button>
            <button
              type="button"
              style={styles.btn("ghost")}
              onClick={loadPurchaseDraft}
            >
              불러오기
            </button>
            <button
              type="button"
              style={styles.btn("danger")}
              onClick={deletePurchaseDraft}
            >
              임시삭제
            </button>
            <button style={styles.btn("ghost")} onClick={requestCloseBuyModal}>
              닫기
            </button>
            <button
              style={styles.btn("primary")}
              onClick={savePurchaseWithItems}
              disabled={loading}
            >
              {buyMode === "edit" ? "수정 저장" : "저장"}
            </button>
          </div>

          {buyDraftNotice ? (
            <div
              style={{
                marginBottom: 12,
                border: "1px solid #ddd6fe",
                background: "#f5f3ff",
                color: "#5b21b6",
                borderRadius: 12,
                padding: "9px 12px",
                fontSize: 12,
                fontWeight: 900,
              }}
            >
              {buyDraftNotice}
            </div>
          ) : null}

          <div data-tablet-role="purchase-form-grid" style={styles.grid2}>
            <div style={styles.field}>
              <div style={styles.label}>거래처(선택)</div>
              <select
                style={styles.select}
                value={fSupplier}
                onChange={(e) => setFSupplier(e.target.value)}
              >
                <option value="">선택 안함</option>
                {supplierVendorOptions.map((v) => (
                  <option key={v.id} value={v.name ?? ""}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>



            <div style={{ gridColumn: "1 / -1", display: "grid", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div>
                  <div style={styles.label}>① 실제로 결제한 내역을 입력해 주세요</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>카드 승인내역이나 이체내역을 보고 입력하세요. 여러 번 나눠 결제했다면 ‘결제 추가’로 각각 적어 주세요. 배송비까지 한 번에 냈다면 그 비용을 포함한 실제 결제금액을 적으세요.</div>
                </div>
                <button
                  type="button"
                  style={styles.btn("ghost")}
                  onClick={() => setDraftPayments((prev) => [...prev, {
                    key: crypto.randomUUID(), payment_date: "", payment_method: "카드", card_name: "",
                    currency: fCurrency, currency_custom: fCurrencyCustom, foreign_amount: "", krw_amount: "", memo: "",
                  }])}
                >
                  + 결제 추가
                </button>
              </div>

              {draftPayments.map((payment, index) => (
                <div key={payment.key} style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 12, display: "grid", gap: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <strong>결제 {index + 1}</strong>
                    <button type="button" style={styles.btn("danger")} disabled={fUseWallet} onClick={() => setDraftPayments((prev) => prev.length === 1 ? prev : prev.filter((row) => row.key !== payment.key))}>삭제</button>
                  </div>
                  <div data-tablet-role="purchase-form-grid" style={styles.grid2}>
                    <div style={styles.field}><div style={styles.label}>{fUseWallet ? "잔액 사용일(필수)" : "결제일(필수)"}</div><input style={styles.input} value={payment.payment_date} placeholder="YYYY-MM-DD" onChange={(e) => setDraftPayments((prev) => prev.map((row) => row.key === payment.key ? { ...row, payment_date: formatDateInput(e.target.value) } : row))} /></div>
                    <div style={styles.field}><div style={styles.label}>결제수단</div><select style={styles.select} value={payment.payment_method} onChange={(e) => setDraftPayments((prev) => prev.map((row) => row.key === payment.key ? { ...row, payment_method: e.target.value } : row))}><option value="카드">카드</option><option value="현금">현금</option><option value="계좌이체">계좌이체</option><option value="충전잔액">충전잔액</option><option value="기타">기타</option></select></div>
                    <div style={styles.field}><div style={styles.label}>카드명·계좌(선택)</div><input style={styles.input} value={payment.card_name} onChange={(e) => setDraftPayments((prev) => prev.map((row) => row.key === payment.key ? { ...row, card_name: e.target.value } : row))} placeholder="예: 신한 / 사업자계좌" /></div>
                    <div style={styles.field}><div style={styles.label}>결제 통화</div><select style={styles.select} value={payment.currency} onChange={(e) => setDraftPayments((prev) => prev.map((row) => row.key === payment.key ? { ...row, currency: e.target.value } : row))}>{CURRENCY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select>{payment.currency === "직접입력" && <input style={styles.input} value={payment.currency_custom} onChange={(e) => setDraftPayments((prev) => prev.map((row) => row.key === payment.key ? { ...row, currency_custom: e.target.value } : row))} placeholder="예: THB" />}</div>
                    <div style={styles.field}><div style={styles.label}>외화 결제금액(배송비 포함 실제 송금액)</div><input
                      style={{
                        ...styles.input,
                        background: fUseWallet ? "#f3f4f6" : "#fff",
                      }}
                      value={payment.foreign_amount}
                      readOnly={fUseWallet}
                      onChange={(e) => {
                        setManualPaymentForeignKeys((prev) =>
                          prev.includes(payment.key)
                            ? prev
                            : [...prev, payment.key],
                        );
                        setDraftPayments((prev) =>
                          prev.map((row) =>
                            row.key === payment.key
                              ? { ...row, foreign_amount: e.target.value }
                              : row,
                          ),
                        );
                      }}
                      placeholder="상품 입력 시 자동계산 / 직접 수정 가능"
                    /></div>
                    <div style={styles.field}><div style={styles.label}>원화 실결제금액</div><input style={{ ...styles.input, background: fUseWallet ? "#f3f4f6" : "#fff" }} readOnly={fUseWallet} value={payment.krw_amount} onChange={(e) => setDraftPayments((prev) => prev.map((row) => row.key === payment.key ? { ...row, krw_amount: e.target.value } : row))} placeholder="카드 승인·이체된 원화" /></div>
                    <div style={styles.field}><div style={styles.label}>개별 환율</div><input style={{ ...styles.input, background: "#f3f4f6" }} readOnly value={normalizeCurrencyCode(currencyValue(payment.currency, payment.currency_custom)) === "KRW" ? "1" : calcFxRate(n(payment.krw_amount), n(payment.foreign_amount)) > 0 ? calcFxRate(n(payment.krw_amount), n(payment.foreign_amount)).toFixed(4) : ""} /></div>
                    <div style={styles.field}><div style={styles.label}>결제 메모</div><input style={styles.input} value={payment.memo} onChange={(e) => setDraftPayments((prev) => prev.map((row) => row.key === payment.key ? { ...row, memo: e.target.value } : row))} /></div>
                  </div>
                </div>
              ))}

              <div style={{ borderRadius: 14, background: "#f5f3ff", padding: 14, fontWeight: 900 }}>총 원화 실결제금액: {fmtKRW(paymentKRWSum)}</div>
              <section style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 12, display: "grid", gap: 10, background: "#fff" }}>
                <strong style={{ fontSize: 14 }}>상품금액 및 포함 비용</strong>
                {hasCrossCurrencyPayments && !fUseWallet ? <div style={styles.small}>결제 통화와 상품 통화가 달라요. 결제 외화는 그대로 기록하고, 실제 원화 결제액을 상품 통화 금액 비율로 나눠요. 배송비가 포함됐다면 상품과 같은 통화로 배송비를 입력해 주세요.</div> : null}
                <div data-tablet-role="purchase-form-grid" style={{ ...styles.grid2, alignItems: "start" }}>
            <div style={styles.field}>
              <div style={styles.label}>상품 통화</div>
              <select style={styles.select} value={fCurrency} onChange={(e) => setFCurrency(e.target.value)}>
                {CURRENCY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              {fCurrency === "직접입력" && <input style={styles.input} value={fCurrencyCustom} onChange={(e) => setFCurrencyCustom(e.target.value)} placeholder="예: THB" />}
            </div>            <div style={styles.field}>
              <div style={styles.label}>상품금액 · 배송비 제외</div>
              <input
                style={styles.input}
                value={fTotalForeign}
                onChange={(e) => {
                  const value = e.target.value;
                  setFTotalForeignManuallyEdited(true);
                  setFTotalForeign(value);
                  if (fShippingIncluded && !hasCrossCurrencyPayments && n(fCombinedForeign) > 0) {
                    setFShippingForeign(
                      String(
                        Math.max(
                          0,
                          round4(
                            n(fCombinedForeign) -
                              n(value) -
                              (fUseWallet && fFeeIncluded
                                ? Math.max(0, n(fFeeForeign))
                                : 0),
                          ),
                        ),
                      ),
                    );
                  }
                }}
                placeholder="상품 입력 시 자동계산 / 직접 수정 가능"
              />
            </div>
            <div style={styles.field}>
              <div style={styles.label}>적용 환율 · 자동계산</div>
              <input
                style={{ ...styles.input, background: "#f3f4f6" }}
                readOnly
                value={
                  purchasePaymentComposition.productFx > 0
                    ? purchasePaymentComposition.productFx.toFixed(4)
                    : ""
                }
              />
            </div>

                  <div style={styles.field}>
                    <div style={styles.label}>실제 결제금액 · 통화별 합계</div>
                    <div style={{ ...styles.input, background: "#f3f4f6", minHeight: 42, boxSizing: "border-box", display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                      {paymentTotalsByCurrency.length ? paymentTotalsByCurrency.map(([currency, value]) => <span key={currency}>{fmtNum(value)} {currency}</span>) : "0"}
                    </div>
                  </div>
                </div>
                <div style={{ ...styles.small, fontSize: 11, lineHeight: 1.7 }}>
                  <div>상품별 가격 입력 → 상품금액 자동계산 · 따로 입력할 필요 없어요.</div>
                  <div>상품별 가격을 비워두고 수량대로 나누기 → 전체 상품금액을 직접 입력하세요.</div>
                  <div>배송비가 없으면 ‘배송비 포함’은 체크하지 마세요.</div>
                </div>
                        <div
              style={{
                gridColumn: "1 / -1",
                border: "1px solid #e5e7eb",
                borderRadius: 14,
                padding: 12,
                background: "#fff",
                display: "grid",
                gap: 12,
              }}
            >
              {fUseWallet ? (
                <>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 10,
                    }}
                  >
                    <label
                      style={{
                        border: fShippingIncluded
                          ? "2px solid #7c3aed"
                          : "1px solid #ddd6fe",
                        borderRadius: 12,
                        padding: 10,
                        background: fShippingIncluded ? "#f5f3ff" : "#fff",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontWeight: 900,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={fShippingIncluded}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setFShippingIncluded(checked);
                          if (checked) {
                            setFShippingVendor((prev) => prev || fSupplier);
                          } else {
                            setFShippingForeign("");
                          }
                          const productForeign =
                            enteredDraftItemForeignSum > 0
                              ? enteredDraftItemForeignSum
                              : Math.max(0, n(fTotalForeign));
                          setFCombinedForeign(
                            String(
                              round4(
                                productForeign +
                                  (checked
                                    ? Math.max(0, n(fShippingForeign))
                                    : 0) +
                                  (fFeeIncluded
                                    ? Math.max(0, n(fFeeForeign))
                                    : 0),
                              ),
                            ),
                          );
                          setBuyDirty(true);
                        }}
                      />
                      배송비 충전잔액 사용
                    </label>

                    <label
                      style={{
                        border: fFeeIncluded
                          ? "2px solid #7c3aed"
                          : "1px solid #ddd6fe",
                        borderRadius: 12,
                        padding: 10,
                        background: fFeeIncluded ? "#f5f3ff" : "#fff",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontWeight: 900,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={fFeeIncluded}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setFFeeIncluded(checked);
                          if (!checked) setFFeeForeign("");
                          const productForeign =
                            enteredDraftItemForeignSum > 0
                              ? enteredDraftItemForeignSum
                              : Math.max(0, n(fTotalForeign));
                          setFCombinedForeign(
                            String(
                              round4(
                                productForeign +
                                  (fShippingIncluded
                                    ? Math.max(0, n(fShippingForeign))
                                    : 0) +
                                  (checked
                                    ? Math.max(0, n(fFeeForeign))
                                    : 0),
                              ),
                            ),
                          );
                          setBuyDirty(true);
                        }}
                      />
                      수수료 충전잔액 사용
                    </label>
                  </div>

                  {(fShippingIncluded || fFeeIncluded) ? (
                    <>
                      <div
                        data-tablet-role="purchase-form-grid"
                        style={styles.grid2}
                      >
                        {fShippingIncluded ? (
                          <div style={styles.field}>
                            <div style={styles.label}>
                              배송비 외화금액 ({walletCurrency || "외화"})
                            </div>
                            <input
                              style={styles.input}
                              value={fShippingForeign}
                              inputMode="decimal"
                              onChange={(e) => {
                                const value = e.target.value;
                                setFShippingForeign(value);
                                const productForeign =
                                  enteredDraftItemForeignSum > 0
                                    ? enteredDraftItemForeignSum
                                    : Math.max(0, n(fTotalForeign));
                                setFCombinedForeign(
                                  String(
                                    round4(
                                      productForeign +
                                        Math.max(0, n(value)) +
                                        (fFeeIncluded
                                          ? Math.max(0, n(fFeeForeign))
                                          : 0),
                                    ),
                                  ),
                                );
                                setBuyDirty(true);
                              }}
                              placeholder="예: 3500"
                            />
                            <div style={styles.small}>
                              배송비가 나중에 결제되면 지금은 체크하지 않고,
                              나중에 추가비용에서 충전잔액으로 등록하면 돼.
                            </div>
                          </div>
                        ) : null}

                        {fFeeIncluded ? (
                          <div style={styles.field}>
                            <div style={styles.label}>
                              수수료 외화금액 ({walletCurrency || "외화"})
                            </div>
                            <input
                              style={styles.input}
                              value={fFeeForeign}
                              inputMode="decimal"
                              onChange={(e) => {
                                const value = e.target.value;
                                setFFeeForeign(value);
                                const productForeign =
                                  enteredDraftItemForeignSum > 0
                                    ? enteredDraftItemForeignSum
                                    : Math.max(0, n(fTotalForeign));
                                setFCombinedForeign(
                                  String(
                                    round4(
                                      productForeign +
                                        (fShippingIncluded
                                          ? Math.max(0, n(fShippingForeign))
                                          : 0) +
                                        Math.max(0, n(value)),
                                    ),
                                  ),
                                );
                                setBuyDirty(true);
                              }}
                              placeholder="예: 500"
                            />
                            <div style={styles.small}>
                              수수료는 상품 가격 비율로 각 상품에 배분돼.
                            </div>
                          </div>
                        ) : null}

                        <div style={styles.field}>
                          <div style={styles.label}>
                            총 차감 외화(상품
                            {fShippingIncluded ? " + 배송비" : ""}
                            {fFeeIncluded ? " + 수수료" : ""})
                          </div>
                          <input
                            style={{ ...styles.input, background: "#f3f4f6" }}
                            value={fCombinedForeign}
                            readOnly
                          />
                        </div>
                      </div>

                      {fShippingIncluded ? (
                        <div style={styles.field}>
                          <div style={styles.label}>배송비 거래처</div>
                          <select
                            style={styles.select}
                            value={fShippingVendor}
                            onChange={(e) => setFShippingVendor(e.target.value)}
                          >
                            <option value="">선택 안함</option>
                            {includedShippingVendorOptions.map((vendor) => (
                              <option key={vendor.id} value={vendor.name ?? ""}>
                                {vendor.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : null}

                      <div
                        style={{
                          borderRadius: 12,
                          background: "#ede9fe",
                          padding: 12,
                          display: "grid",
                          gap: 4,
                          fontSize: 13,
                        }}
                      >
                        <div>
                          상품 원화: <b>{fmtKRW(walletQuote.productKRW)}</b>
                        </div>
                        {fShippingIncluded ? (
                          <div>
                            배송비 원화: <b>{fmtKRW(walletQuote.shippingKRW)}</b>
                            {" "}(수량 대비 배분)
                          </div>
                        ) : null}
                        {fFeeIncluded ? (
                          <div>
                            수수료 원화: <b>{fmtKRW(walletQuote.feeKRW)}</b>
                            {" "}(상품 가격 대비 배분)
                          </div>
                        ) : null}
                        <div>
                          합계: <b>{fmtKRW(walletQuote.totalKRW)}</b>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div style={styles.small}>
                      배송비나 수수료가 아직 결제되지 않았다면 체크하지 않아도 돼.
                      나중에 <b>추가비용</b>에서 충전잔액을 사용해 따로 등록할 수 있어.
                    </div>
                  )}
                </>
              ) : (
                <>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontWeight: 900,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={fShippingIncluded}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setFShippingIncluded(checked);
                        if (checked) {
                          setFShippingVendor((prev) => prev || fSupplier);
                          if (!fCombinedForeign && fTotalForeign) {
                            setFCombinedForeign(fTotalForeign);
                          }
                        } else {
                          setFShippingForeign("");
                          setFCombinedForeign(fTotalForeign);
                        }
                      }}
                    />
                    위 결제금액에 배송비가 포함되어 있어요
                  </label>

                  {fShippingIncluded ? (
                    <>
                      <div
                        data-tablet-role="purchase-form-grid"
                        style={styles.grid2}
                      >
                        <div style={styles.field}>
                          <div style={styles.label}>{hasCrossCurrencyPayments ? `포함 배송비 (${currencyValue(fCurrency, fCurrencyCustom)}) · 직접 입력` : "위 결제금액에 포함된 배송비 · 자동계산"}</div>
                          <input
                            style={{ ...styles.input, background: "#f3f4f6" }}
                            value={fShippingForeign}
                            readOnly={!hasCrossCurrencyPayments}
                            onChange={(e) => { setFShippingForeign(e.target.value); setBuyDirty(true); }}
                            placeholder={hasCrossCurrencyPayments ? "상품과 같은 통화의 배송비" : "결제 외화합계 - 상품리스트 입력합계"}
                          />
                        </div>
                        <div style={styles.field}>
                          <div style={styles.label}>
                            {hasCrossCurrencyPayments ? `상품＋배송비 합계 (${currencyValue(fCurrency, fCurrencyCustom)})` : "배송비 포함 실제 결제금액 · 자동계산"}
                          </div>
                          <input
                            style={{ ...styles.input, background: "#f3f4f6" }}
                            value={hasCrossCurrencyPayments ? String(round4(purchasePaymentComposition.productForeign + n(fShippingForeign))) : fCombinedForeign}
                            readOnly
                          />
                        </div>
                      </div>

                      <div style={styles.field}>
                        <div style={styles.label}>배송비 거래처</div>
                        <select
                          style={styles.select}
                          value={fShippingVendor}
                          onChange={(e) => setFShippingVendor(e.target.value)}
                        >
                          <option value="">선택 안함</option>
                          {includedShippingVendorOptions.map((vendor) => (
                            <option key={vendor.id} value={vendor.name ?? ""}>
                              {vendor.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </>
                  ) : (
                    <div style={styles.small}>
                      배송비를 따로 결제했다면 아래 추가비용에서 별도로 등록해.
                    </div>
                  )}
                </>
              )}
            </div>


            

                <details style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.7 }}>
                  <summary style={{ cursor: "pointer" }}>입력 방법 보기</summary>
                  <div style={{ paddingTop: 6 }}>결제내역에는 실제로 지급한 전체 금액을 적고, 상품금액에는 배송비를 뺀 상품값을 적으세요. 배송비가 포함됐다면 체크하세요. 예: 결제 11,000엔 / 상품 10,000엔 → 포함 배송비 1,000엔.</div>
                  <div>환율은 결제내역이나 사용한 충전잔액을 기준으로 자동계산돼요. 여러 통화의 금액은 서로 더하지 않고 통화별로 확인하세요.</div>
                </details>
              </section>

            </div>



            <div
              style={{
                gridColumn: "1 / -1",
                border: fUseWallet
                  ? "2px solid #7c3aed"
                  : "1px solid #ddd6fe",
                borderRadius: 14,
                padding: 12,
                background: fUseWallet ? "#faf5ff" : "#fff",
                display: "grid",
                gap: 10,
              }}
            >
              <div>
                <div style={{ fontWeight: 900, marginBottom: 4 }}>
                  충전잔액으로 결제하기
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "#6b7280",
                    lineHeight: 1.6,
                  }}
                >
                  거래처관리에서 등록한 충전내역을 여기서 불러와 사용해.
                  잔액 사용일은 충전일과 별도예요. 배송이 시작될 때 잔액이 차감된다면 배송시작일을 입력하세요.
                </div>
              </div>

              {buyMode === "edit" ? <div style={{ border: "1px solid #ddd6fe", background: "#faf5ff", padding: 12, borderRadius: 10, display: "grid", gap: 8 }}>
                <b>이미 결제한 매입에 포인트 추가 적용</b>
                <div style={styles.small}>현재 충전잔액과 포인트, 이 매입에서 이미 차감한 금액을 불러와요. 포인트로 바꾼 금액만큼 충전잔액을 돌려주므로 다시 차감하지 않아요. 거래처의 포인트 통화와 같은 통화로 충전 결제한 매입에서 사용할 수 있어요.</div>
                <button type="button" style={styles.btn("ghost")} disabled={editPointBusy} onClick={loadEditPurchasePoints}>잔액·포인트 불러오기</button>
              </div> : null}
              {fUseWallet && buyMode === "create" && !pointCurrencyMatches ? <div style={styles.small}>{pointRuleLabel}{pointSetting ? ` · 충전 결제 통화(${walletCurrency})와 달라 포인트를 사용할 수 없어요.` : ''}</div> : null}
              {fUseWallet && buyMode === "create" && pointCurrencyMatches ? (
                <div style={{ padding: 12, border: "1px solid #ddd6fe", borderRadius: 12, display: "grid", gap: 8 }}>
                  <b style={{fontSize:13}}>포인트 · 현재 {fmtNum(pointBalance)}점 ({pointRuleLabel})</b>
                  <div style={styles.grid2}>
                    <div style={styles.field}><div style={styles.label}>이번에 사용한 포인트</div><input style={styles.input} type="number" min="0" step="1" value={fPointsUsed} onChange={(e)=>{setFPointsUsed(e.target.value);setBuyDirty(true)}} placeholder="사용하지 않으면 0"/></div>
                    <div style={styles.field}><div style={styles.label}>이번 구매로 받은 포인트</div><input style={styles.input} type="number" min="0" step="1" value={fPointsEarned} onChange={(e)=>{setFPointsEarned(e.target.value);setBuyDirty(true)}} placeholder="주문내역의 획득 포인트"/></div>
                  </div>
                  <div style={styles.small}>상품·배송비·수수료에서 포인트를 금액 비율로 차감하고, 남은 {fmtNum(pointNetParts.net)} {walletCurrency}만 충전잔액에서 사용해요. 새 적립은 사용 처리 후 더해져요.</div>
                </div>
              ) : null}
              {!fSupplier.trim() ? (
                <div
                  style={{
                    border: "1px dashed #d9d9e6",
                    borderRadius: 12,
                    padding: 12,
                    fontSize: 12,
                    color: "#6b7280",
                    background: "#fafafa",
                  }}
                >
                  먼저 거래처를 선택하면 등록된 외화 충전내역이 표시돼.
                </div>
              ) : supplierWalletCurrencySummaries.length === 0 ? (
                <div
                  style={{
                    border: "1px dashed #d9d9e6",
                    borderRadius: 12,
                    padding: 12,
                    fontSize: 12,
                    color: "#6b7280",
                    background: "#fafafa",
                  }}
                >
                  {fSupplier}에 사용 가능한 외화 충전잔액이 없어.
                  충전등록은 거래처관리에서 해줘.
                </div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {supplierWalletCurrencySummaries.map((summary) => {
                    const selected =
                      fUseWallet &&
                      walletCurrency === summary.currency;

                    return (
                      <div
                        key={summary.currency}
                        style={{
                          border: selected
                            ? "2px solid #7c3aed"
                            : "1px solid #e5e7eb",
                          borderRadius: 12,
                          padding: 10,
                          background: selected ? "#f5f3ff" : "#fff",
                          display: "grid",
                          gap: 8,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 10,
                            flexWrap: "wrap",
                          }}
                        >
                          <div>
                            <div
                              style={{
                                fontSize: 11,
                                color: "#6b7280",
                              }}
                            >
                              사용 가능 잔액
                            </div>
                            <div
                              style={{
                                fontSize: 18,
                                fontWeight: 900,
                              }}
                            >
                              {fmtNum(summary.balance)} {summary.currency}
                            </div>
                          </div>

                          <button
                            type="button"
                            style={styles.btn(
                              selected ? "primary" : "ghost",
                            )}
                            disabled={editPointBusy}
                            onClick={() => buyMode === "edit" ? loadEditPurchasePoints() : loadVendorWalletCurrency(summary.currency)}
                          >
                            {buyMode === "edit" ? "잔액·포인트 불러오기" : selected ? "불러옴 ✓" : `${summary.currency} 잔액 불러오기`}
                          </button>
                        </div>

                        <div
                          style={{
                            display: "grid",
                            gap: 5,
                            maxHeight: 150,
                            overflowY: "auto",
                          }}
                        >
                          {summary.lots.map((lot) => (
                            <div
                              key={lot.id}
                              style={{
                                display: "grid",
                                gridTemplateColumns:
                                  "90px minmax(0,1fr) minmax(0,1fr)",
                                gap: 8,
                                borderTop: "1px solid #f0f0f5",
                                paddingTop: 6,
                                fontSize: 11,
                                color: "#4b5563",
                              }}
                            >
                              <div>
                                충전 {lot.topup_date}
                              </div>
                              <div>
                                충전 {fmtNum(n(lot.foreign_amount))}{" "}
                                {summary.currency}
                                <br />
                                남음 {fmtNum(n(lot.remaining_foreign))}{" "}
                                {summary.currency}
                              </div>
                              <div>
                                원화 {fmtKRW(n(lot.krw_amount))}
                                <br />
                                환율 {n(lot.fx_rate).toFixed(4)}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {fUseWallet ? (
                <>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(150px, 1fr))",
                      gap: 8,
                    }}
                  >
                    <div
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: 12,
                        padding: 10,
                        background: "#fff",
                      }}
                    >
                      <div style={{ fontSize: 11, color: "#6b7280" }}>
                        현재 충전잔액
                      </div>
                      <div style={{ marginTop: 3, fontWeight: 900 }}>
                        {fmtNum(walletQuote.balance)} {walletCurrency}
                      </div>
                    </div>

                    <div
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: 12,
                        padding: 10,
                        background: "#fff",
                      }}
                    >
                      <div style={{ fontSize: 11, color: "#6b7280" }}>
                        이번 상품 외화
                      </div>
                      <div style={{ marginTop: 3, fontWeight: 900 }}>
                        {fmtNum(walletProductForeign)} {walletCurrency}
                        {walletQuote.ok
                          ? ` → ${fmtKRW(walletQuote.productKRW)}`
                          : ""}
                      </div>
                    </div>

                    <div
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: 12,
                        padding: 10,
                        background: "#fff",
                      }}
                    >
                      <div style={{ fontSize: 11, color: "#6b7280" }}>
                        이번 배송비 외화
                      </div>
                      <div style={{ marginTop: 3, fontWeight: 900 }}>
                        {fmtNum(walletShippingForeign)} {walletCurrency}
                        {walletQuote.ok
                          ? ` → ${fmtKRW(walletQuote.shippingKRW)}`
                          : ""}
                      </div>
                    </div>

                    <div
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: 12,
                        padding: 10,
                        background: "#fff",
                      }}
                    >
                      <div style={{ fontSize: 11, color: "#6b7280" }}>
                        이번 수수료 외화
                      </div>
                      <div style={{ marginTop: 3, fontWeight: 900 }}>
                        {fmtNum(walletFeeForeign)} {walletCurrency}
                        {walletQuote.ok
                          ? ` → ${fmtKRW(walletQuote.feeKRW)}`
                          : ""}
                      </div>
                    </div>

                    <div
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: 12,
                        padding: 10,
                        background: "#fff",
                      }}
                    >
                      <div style={{ fontSize: 11, color: "#6b7280" }}>
                        자동 원화총액
                      </div>
                      <div
                        style={{
                          marginTop: 3,
                          fontWeight: 900,
                          color: walletQuote.ok
                            ? "#166534"
                            : "#b91c1c",
                        }}
                      >
                        {walletQuote.ok
                          ? fmtKRW(walletQuote.totalKRW)
                          : "상품 외화금액 입력 필요"}
                      </div>
                    </div>

                    <div
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: 12,
                        padding: 10,
                        background: "#fff",
                      }}
                    >
                      <div style={{ fontSize: 11, color: "#6b7280" }}>
                        저장 후 예상잔액
                      </div>
                      <div
                        style={{
                          marginTop: 3,
                          fontWeight: 900,
                          color: walletQuote.ok
                            ? "#166534"
                            : "#b91c1c",
                        }}
                      >
                        {walletQuote.ok
                          ? `${fmtNum(
                              Math.max(
                                0,
                                walletQuote.balance -
                                  walletQuote.needed,
                              ),
                            )} ${walletCurrency}`
                          : `부족 ${fmtNum(
                              Math.max(
                                0,
                                walletQuote.needed -
                                  walletQuote.balance,
                              ),
                            )} ${walletCurrency}`}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                    }}
                  >
                    <button
                      type="button"
                      style={styles.btn("ghost")}
                      onClick={() => {
                        setFUseWallet(false);
                        setFFeeIncluded(false);
                        setFFeeForeign("");
                        setFTotalKRW("");
                        setDraftPayments((prev) =>
                          prev.map((row) =>
                            row.payment_method === "충전잔액"
                              ? {
                                  ...row,
                                  payment_method: "카드",
                                  card_name: "",
                                  foreign_amount: "",
                                  krw_amount: "",
                                  memo: "",
                                }
                              : row,
                          ),
                        );
                      }}
                    >
                      충전잔액 사용 해제
                    </button>
                  </div>
                </>
              ) : null}
            </div>



            {buyMode === "create" && (
              <div style={{ gridColumn: "1 / -1", display: "grid", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <div>
                    <div style={styles.label}>별도로 지급한 추가비용 · 선택</div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>배송비는 수량 비율로, 관부과세·기타비용은 상품금액 비율로 배분해.</div>
                  </div>
                  <button type="button" style={styles.btn("ghost")} onClick={() => setDraftPurchaseCosts((prev) => [...prev, { key: crypto.randomUUID(), cost_type: "배송비(거래처)", currency: "KRW", currency_custom: "", foreign_amount: "", krw_amount: "", vendor_name: fSupplier, cost_date: fPurchaseDate, memo: "" }])}>+ 추가비용</button>
                </div>
                {draftPurchaseCosts.map((cost, index) => (
                  <div key={cost.key} style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 12, display: "grid", gap: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><strong>추가비용 {index + 1}</strong><button type="button" style={styles.btn("danger")} onClick={() => setDraftPurchaseCosts((prev) => prev.filter((row) => row.key !== cost.key))}>삭제</button></div>
                    <div data-tablet-role="purchase-form-grid" style={styles.grid2}>
                      <div style={styles.field}><div style={styles.label}>종류</div><select style={styles.select} value={cost.cost_type} onChange={(e) => setDraftPurchaseCosts((prev) => prev.map((row) => row.key === cost.key ? { ...row, cost_type: e.target.value } : row))}>{COST_TYPE_OPTIONS.filter((x) => x !== "환불").map((x) => <option key={x} value={x}>{x}</option>)}</select></div>
                      <div style={styles.field}><div style={styles.label}>날짜</div><input style={styles.input} value={cost.cost_date} placeholder="YYYY-MM-DD" onChange={(e) => setDraftPurchaseCosts((prev) => prev.map((row) => row.key === cost.key ? { ...row, cost_date: formatDateInput(e.target.value) } : row))} /></div>
                      <div style={styles.field}><div style={styles.label}>통화</div><select style={styles.select} value={cost.currency} onChange={(e) => setDraftPurchaseCosts((prev) => prev.map((row) => row.key === cost.key ? { ...row, currency: e.target.value } : row))}>{CURRENCY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select>{cost.currency === "직접입력" && <input style={styles.input} value={cost.currency_custom} onChange={(e) => setDraftPurchaseCosts((prev) => prev.map((row) => row.key === cost.key ? { ...row, currency_custom: e.target.value } : row))} />}</div>
                      <div style={styles.field}><div style={styles.label}>외화금액</div><input style={styles.input} value={cost.foreign_amount} onChange={(e) => setDraftPurchaseCosts((prev) => prev.map((row) => row.key === cost.key ? { ...row, foreign_amount: e.target.value } : row))} placeholder="원화면 비워도 됨" /></div>
                      <div style={styles.field}><div style={styles.label}>원화 실결제금액</div><input style={styles.input} value={cost.krw_amount} onChange={(e) => setDraftPurchaseCosts((prev) => prev.map((row) => row.key === cost.key ? { ...row, krw_amount: e.target.value } : row))} /></div>
                      <div style={styles.field}>
                        <div style={styles.label}>거래처·배송업체</div>
                        <input
                          style={styles.input}
                          list={`draft-cost-vendors-${cost.key}`}
                          value={cost.vendor_name}
                          placeholder="목록에서 선택하거나 직접 입력"
                          onChange={(e) =>
                            setDraftPurchaseCosts((prev) =>
                              prev.map((row) =>
                                row.key === cost.key
                                  ? { ...row, vendor_name: e.target.value }
                                  : row,
                              ),
                            )
                          }
                        />
                        <datalist id={`draft-cost-vendors-${cost.key}`}>
                          {vendors
                            .filter((vendor) => {
                              if (!vendor.name?.trim()) return false;
                              if (cost.cost_type === "배송비(거래처)" || cost.cost_type === "잔금") {
                                return !!vendor.is_product_supplier;
                              }
                              if (cost.cost_type === "배송비(배대지)") {
                                return !!vendor.is_forwarder || !!vendor.is_carry_in;
                              }
                              if (cost.cost_type === "관부과세") {
                                return (
                                  !!vendor.is_forwarder ||
                                  !!vendor.is_carry_in ||
                                  !!vendor.is_customs_broker
                                );
                              }
                              return true;
                            })
                            .map((vendor) => (
                              <option key={vendor.id} value={vendor.name ?? ""} />
                            ))}
                        </datalist>
                      </div>
                      <div style={{ ...styles.field, gridColumn: "1 / -1" }}><div style={styles.label}>메모</div><input style={styles.input} value={cost.memo} onChange={(e) => setDraftPurchaseCosts((prev) => prev.map((row) => row.key === cost.key ? { ...row, memo: e.target.value } : row))} /></div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ gridColumn: "1 / -1" }}>
              <div style={styles.label}>매입영수증</div>
              <div style={styles.fileBox}>
                {existingPurchaseReceiptPath ? (
                  <div style={styles.fileInfo}>
                    기존 파일:{" "}
                    <a
                      href={getPublicUrl(existingPurchaseReceiptPath)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      보기
                    </a>
                  </div>
                ) : (
                  <div style={styles.fileInfo}>기존 파일 없음</div>
                )}
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setPurchaseReceiptFile(e.target.files?.[0] ?? null)
                  }
                />
                {purchaseReceiptFile ? (
                  <div style={styles.fileInfo}>
                    새 파일: {purchaseReceiptFile.name}
                  </div>
                ) : null}
              </div>
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <div style={styles.label}>메모</div>
              <textarea
                style={styles.textarea}
                value={fMemo}
                onChange={(e) => setFMemo(e.target.value)}
              />
            </div>
          </div>

          <div style={styles.hr} />

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 10,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 900 }}>상품 등록</div>
              <span style={{ ...styles.small, fontSize: 11 }}>가격 입력 기준: {currencyValue(fCurrency, fCurrencyCustom) || "상품 통화를 선택하세요"} · 상품 통화 기준</span>
              <select
                style={{ ...styles.select, width: 190 }}
                defaultValue=""
                onChange={(e) => {
                  const nextType = e.target.value as ProductType;
                  if (!nextType) return;
                  setDraftItems((prev) =>
                    prev.map((item) => ({
                      ...item,
                      product_type: nextType,
                    })),
                  );
                  setBuyDirty(true);
                  e.currentTarget.value = "";
                }}
              >
                <option value="">전체 상품유형 변경</option>
                {PRODUCT_TYPE_OPTIONS.map((type) => (
                  <option key={type} value={type}>
                    전체를 {type}로
                  </option>
                ))}
              </select>
            </div>

          </div>

          <div style={{ ...styles.card, marginTop: 10, padding: 14, background: "#f8f9fc" }}>
            <div style={{ fontWeight: 900, fontSize: 14, marginBottom: 10 }}>입력한 매입 한눈에 보기</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
              <div style={{ background: "white", borderRadius: 10, padding: 10 }}>
                <div style={styles.small}>등록할 상품</div>
                <b>{purchaseEntryGuide.namedCount}종 · 총 {fmtNum(purchaseEntryGuide.qty)}개</b>
                <div style={styles.small}>상품명을 입력한 항목 기준</div>
              </div>
              <div style={{ background: "white", borderRadius: 10, padding: 10 }}>
                <div style={styles.small}>상품금액 · 추가비용 제외</div>
                <b>{fmtNum(purchasePaymentComposition.productForeign)} {purchaseEntryGuide.currency}</b>
                <div style={styles.small}>원화 {fmtKRW(purchaseEntryGuide.productKRW)}</div>
              </div>
              <div style={{ background: "white", borderRadius: 10, padding: 10 }}>
                <div style={styles.small}>{fUseWallet ? "충전잔액 차감 합계" : "결제내역의 통화별 합계"}</div>
                {paymentTotalsByCurrency.length ? paymentTotalsByCurrency.map(([currency, amount]) => (
                  <div key={currency}><b>{fmtNum(amount)} {currency}</b></div>
                )) : <b>0 {purchaseEntryGuide.currency}</b>}
                <div style={styles.small}>원화 {fmtKRW(purchaseEntryGuide.totalKRW)}</div>
                {paymentTotalsByCurrency.length > 1 ? <div style={styles.small}>다른 통화끼리는 합산하지 않아요.</div> : null}
                <div style={styles.small}>{fShippingIncluded || (fUseWallet && fFeeIncluded) ? "함께 결제한 비용 포함" : "상품 결제금액"} · 별도 추가비용 제외</div>
              </div>
            </div>
            {fShippingIncluded || (fUseWallet && fFeeIncluded) ? (
              <div style={{ ...styles.small, marginTop: 10 }}>
                함께 결제한 비용: {fShippingIncluded ? `배송비 ${fmtNum(fUseWallet ? n(fShippingForeign) : purchasePaymentComposition.shippingForeign)} ${purchaseEntryGuide.currency}` : ""}
                {fUseWallet && fFeeIncluded ? ` · 수수료 ${fmtNum(n(fFeeForeign))} ${purchaseEntryGuide.currency}` : ""}
              </div>
            ) : null}
            {buyMode === "create" && draftPurchaseCosts.length > 0 ? (
              <div style={{ ...styles.small, marginTop: 6 }}>별도 추가비용: {draftPurchaseCosts.length}건 · 입력한 원화 순합계 {fmtKRW(purchaseEntryGuide.separateCostKRW)} (할인 차감)</div>
            ) : null}
            <div role="status" style={{ marginTop: 12, padding: 10, borderRadius: 10, background: purchaseEntryGuide.notes.length ? "#fff7ed" : "#eff6ff", fontSize: 12, lineHeight: 1.7 }}>
              <b>{purchaseEntryGuide.notes.length ? "다음 내용을 확인해 주세요" : "입력한 주요 금액을 확인했어요"}</b>
              {purchaseEntryGuide.notes.map((note, index) => <div key={index}>• {note}</div>)}
              {!purchaseEntryGuide.notes.length ? <div>위 금액과 상품별 단가를 확인한 뒤 저장해 주세요. 추가비용·증빙 등 세부 입력은 저장 시 다시 검사합니다.</div> : null}
              {purchaseEntryGuide.blankCount > 0 && n(fTotalForeign) > 0 ? (
                <div>가격을 비워둔 상품 {purchaseEntryGuide.blankCount}종은 기존 자동분배 규칙으로 계산합니다. 아래 상품 카드에서 예상 단가를 확인해 주세요.</div>
              ) : null}
              {editingPurchaseHasRefund ? <div>환불된 매입입니다. 현재 남은 상품금액과 원래 결제금액이 다른 것은 정상이며, 기존 결제 기준을 유지합니다.</div> : null}
              {!editingPurchaseHasRefund && purchaseEntryGuide.namedCount > 0 && n(fTotalForeign) > 0 && Math.abs(purchaseEntryGuide.invoiceDiff) > 0.0001 ? (
                <div>인보이스 상품금액과 직접 입력한 상품합계의 차이: {fmtNum(purchaseEntryGuide.invoiceDiff)} {purchaseEntryGuide.currency}. {fShippingIncluded ? "함께 결제한 배송비는 실제 결제 외화금액에서 상품합계를 뺀 금액으로 계산됩니다." : "상품별 가격과 인보이스 금액을 확인해 주세요."}</div>
              ) : null}
            </div>
            <details style={{ marginTop: 10, fontSize: 12, lineHeight: 1.8 }}>
              <summary style={{ cursor: "pointer", fontWeight: 800 }}>가격 입력과 자동계산 방법 보기</summary>
              <div style={{ paddingTop: 8 }}>
                <div><b>상품별 가격을 아는 경우</b> · 수량과 개당 외화가격을 입력하세요. 상품별 총액은 자동계산되며 직접 수정할 수도 있어요.</div>
                <div><b>총 상품금액만 아는 경우</b> · 전체 상품금액과 상품명·수량을 입력하고, 상품별 가격은 비워두세요. 수량 기준으로 나눠 계산해요.</div>
                <div><b>일부 상품만 가격을 아는 경우</b> · 아는 가격만 입력하고 나머지는 비워둘 수 있어요. 아래 예상 단가를 확인해 주세요.</div>
                <div><b>기존 가격을 모두 균등하게 바꾸려면</b> · ‘수량 기준 균등분배’를 누르세요. 확인 후 기존 상품별 가격을 지우고 다시 계산해요.</div>
                <div><b>배송비까지 함께 결제했다면</b> · 함께 결제 옵션을 켜고 결제내역에 실제 지급한 전체 외화금액을 입력하세요. 별도로 낸 배송비는 ‘추가비용 함께 등록’에 입력해요.</div>
                <div><b>자동입력된 금액을 직접 바꾸면</b> · 해당 금액은 자동으로 덮어쓰지 않는 경우가 있어요. 상품을 바꾼 뒤 결제내역과 예상 금액도 확인해 주세요.</div>
              </div>
            </details>
          </div>

          <div
            ref={draftProductListRef}
            style={{
              display: "grid",
              gap: 10,
              marginTop: 10,
              maxHeight: 430,
              overflowY: "auto",
              paddingRight: 4,
            }}
          >
            {draftItems.map((d, idx) => {
              const preview = draftPreviewMap.get(d.key);
              const q = preview?.qty ?? Math.max(1, n(d.qty));
              const ft =
                preview?.previewForeignTotal ?? Math.max(0, n(d.foreign_total));
              const foreignUnit =
                preview?.previewForeignUnit ?? (q > 0 ? ceil4(ft / q) : 0);
              const lineKRW =
                preview?.previewKRWTotal ?? ceil4(ft * draftPreview.fx);
              const unitKRW =
                preview?.previewKRWUnit ?? (q > 0 ? ceil4(lineKRW / q) : 0);
              const isAutoPreview =
                !!preview?.isBlank && d.item_name.trim().length > 0;

              return (
                <div
                  key={d.key}
                  style={{ ...styles.card, background: "#fafafa" }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <div style={{ fontWeight: 900 }}>상품 {idx + 1}</div>
                    <button
                      style={styles.dangerSmallBtn}
                      onClick={() =>
                        setDraftItems((prev) =>
                          prev.filter((x) => x.key !== d.key),
                        )
                      }
                    >
                      삭제
                    </button>
                  </div>

                  <div
                    data-tablet-role="purchase-item-input-grid"
                    style={{ ...styles.grid2, marginTop: 10 }}
                  >
                    <div style={styles.field}>
                      <div style={styles.label}>상품명</div>
                      <input
                        style={styles.input}
                        value={d.item_name}
                        onChange={(e) =>
                          setDraftItems((prev) =>
                            prev.map((x) =>
                              x.key === d.key
                                ? { ...x, item_name: e.target.value }
                                : x,
                            ),
                          )
                        }
                        placeholder="예: 가챠A"
                      />
                    </div>

                    <div style={styles.field}>
                      <div style={styles.label}>상품유형</div>
                      <select
                        style={styles.select}
                        value={d.product_type}
                        onChange={(e) =>
                          setDraftItems((prev) =>
                            prev.map((x) =>
                              x.key === d.key
                                ? {
                                    ...x,
                                    product_type: e.target.value as ProductType,
                                  }
                                : x,
                            ),
                          )
                        }
                      >
                        {PRODUCT_TYPE_OPTIONS.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div style={styles.field}>
                      <div style={styles.label}>수량(수정 가능)</div>
                      <input
                        style={styles.input}
                        value={d.qty}
                        onChange={(e) => {
                          const nextQty = e.target.value;
                          setDraftItems((prev) =>
                            prev.map((x) => {
                              if (x.key !== d.key) return x;
                              const unit = Math.max(
                                0,
                                n(x.foreign_unit_price),
                              );
                              return {
                                ...x,
                                qty: nextQty,
                                foreign_total:
                                  unit > 0
                                    ? String(round4(n(nextQty) * unit))
                                    : x.foreign_total,
                              };
                            }),
                          );
                        }}
                      />
                    </div>

                    <div style={styles.field}>
                      <div style={styles.label}>개당 가격 ({currencyValue(fCurrency, fCurrencyCustom) || "상품 통화"})</div>
                      <input
                        style={styles.input}
                        value={d.foreign_unit_price}
                        onChange={(e) => {
                          const nextUnit = e.target.value;
                          setDraftItems((prev) =>
                            prev.map((x) =>
                              x.key === d.key
                                ? {
                                    ...x,
                                    foreign_unit_price: nextUnit,
                                    foreign_total:
                                      n(nextUnit) > 0
                                        ? String(
                                            round4(
                                              Math.max(0, n(x.qty)) *
                                                n(nextUnit),
                                            ),
                                          )
                                        : "",
                                  }
                                : x,
                            ),
                          );
                        }}
                        placeholder="예: 1600"
                      />
                    </div>

                    <div style={styles.field}>
                      <div style={styles.label}>
                        상품 총액 ({currencyValue(fCurrency, fCurrencyCustom) || "상품 통화"}) · 자동계산·수정 가능
                      </div>
                      <input
                        style={styles.input}
                        value={d.foreign_total}
                        onChange={(e) => {
                          const nextTotal = e.target.value;
                          setDraftItems((prev) =>
                            prev.map((x) =>
                              x.key === d.key
                                ? {
                                    ...x,
                                    foreign_total: nextTotal,
                                    foreign_unit_price:
                                      n(x.qty) > 0 && n(nextTotal) >= 0
                                        ? String(
                                            round4(
                                              n(nextTotal) /
                                                Math.max(1, n(x.qty)),
                                            ),
                                          )
                                        : x.foreign_unit_price,
                                  }
                                : x,
                            ),
                          );
                        }}
                        placeholder="수량 × 개당가격으로 자동계산"
                      />
                    </div>

                    <div style={styles.field}>
                      <div style={styles.label}>예약상품</div>
                      <label
                        style={{
                          display: "flex",
                          gap: 10,
                          alignItems: "center",
                          minHeight: 44,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={d.is_preorder}
                          onChange={(e) =>
                            setDraftItems((prev) =>
                              prev.map((x) =>
                                x.key === d.key
                                  ? { ...x, is_preorder: e.target.checked }
                                  : x,
                              ),
                            )
                          }
                        />
                        <span style={{ fontWeight: 800 }}>예약</span>
                      </label>
                    </div>

                    <div
                      style={{ gridColumn: "1 / -1", display: "grid", gap: 6 }}
                    >
                      <div style={styles.small}>
                        {isAutoPreview ? (
                          <>
                            자동계산 외화총액:{" "}
                            <b>{ft > 0 ? fmtNum(ft) : "0"}</b> / 외화단가:{" "}
                            <b>
                              {foreignUnit > 0 ? foreignUnit.toFixed(4) : "0"}
                            </b>{" "}
                            / 원화단가:{" "}
                            <b>{unitKRW > 0 ? fmtKRW(unitKRW) : "0원"}</b> /
                            상품 원화합계:{" "}
                            <b>{lineKRW > 0 ? fmtKRW(lineKRW) : "0원"}</b>
                          </>
                        ) : (
                          <>
                            외화단가:{" "}
                            <b>
                              {foreignUnit > 0 ? foreignUnit.toFixed(4) : "0"}
                            </b>{" "}
                            / 원화단가:{" "}
                            <b>{unitKRW > 0 ? fmtKRW(unitKRW) : "0원"}</b> /
                            상품 원화합계:{" "}
                            <b>{lineKRW > 0 ? fmtKRW(lineKRW) : "0원"}</b>
                          </>
                        )}
                      </div>
                    </div>

                    <div style={{ gridColumn: "1 / -1" }}>
                      <div style={styles.label}>상품사진</div>
                      <div style={styles.fileBox}>
                        {d.existingPhotoPath ? (
                          <div style={styles.fileInfo}>
                            기존 파일:{" "}
                            <a
                              href={getPublicUrl(d.existingPhotoPath)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              보기
                            </a>
                          </div>
                        ) : (
                          <div style={styles.fileInfo}>기존 파일 없음</div>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e: ChangeEvent<HTMLInputElement>) =>
                            setDraftItems((prev) =>
                              prev.map((x) =>
                                x.key === d.key
                                  ? {
                                      ...x,
                                      photoFile: e.target.files?.[0] ?? null,
                                    }
                                  : x,
                              ),
                            )
                          }
                        />
                        {d.photoFile ? (
                          <div style={styles.fileInfo}>
                            새 파일: {d.photoFile.name}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div style={{ gridColumn: "1 / -1" }}>
                      <div style={styles.label}>메모</div>
                      <input
                        style={styles.input}
                        value={d.memo}
                        onChange={(e) =>
                          setDraftItems((prev) =>
                            prev.map((x) =>
                              x.key === d.key
                                ? { ...x, memo: e.target.value }
                                : x,
                            ),
                          )
                        }
                        placeholder="예: 옵션/색상"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap", paddingTop: 10, paddingBottom: 4 }}>
              <button
                type="button"
                style={styles.btn("ghost")}
                onClick={() => {
                  if (n(fTotalForeign) <= 0) {
                    setErr("먼저 전체 상품금액을 입력해줘.");
                    return;
                  }
                  if (!draftItems.some((item) => item.item_name.trim())) {
                    setErr("균등분배할 상품명을 1개 이상 입력해줘.");
                    return;
                  }
                  const hasEnteredPrices = draftItems.some(
                    (item) => item.foreign_unit_price.trim() !== "" || item.foreign_total.trim() !== "",
                  );
                  if (
                    hasEnteredPrices &&
                    !window.confirm("기존 상품별 외화가격을 지우고 전체 수량 기준으로 다시 균등분배할까?")
                  ) return;
                  setDraftItems((prev) =>
                    prev.map((item) => ({
                      ...item,
                      foreign_unit_price: "",
                      foreign_total: "",
                    })),
                  );
                  setFTotalForeignManuallyEdited(true);
                  setBuyDirty(true);
                  setErr(null);
                }}
              >
                수량 기준 균등분배
              </button>
            <button type="button" style={{ ...styles.btn("primary"), minWidth: 160 }}
              onClick={() => {
                setDraftItems((prev) => [...prev, {
                  key: crypto.randomUUID(), item_name: "", qty: "1",
                  foreign_unit_price: "", foreign_total: "", memo: "",
                  is_preorder: false, product_type: "기타", photoFile: null,
                  existingPhotoPath: null,
                }]);
                setBuyDirty(true);
                requestAnimationFrame(() => {
                  const list = draftProductListRef.current;
                  if (list) list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
                });
              }}>
              + 상품 추가
            </button>
          </div>
        </div>
      </SafeModal>

      <SafeModal open={processingHistoryOpen} title="처리내역·취소" onClose={() => setProcessingHistoryOpen(false)}>
        <div style={{ display: "grid", gap: 10 }}>
          <div style={styles.small}>전체환불로 수량이 0인 상품도 여기서 환불을 취소할 수 있어요. 배송비는 남은 수량, 관부과세는 남은 상품금액으로 자동 재배분하며, 직접 지정한 배분 기준이 있으면 그 기준을 따라요. 같은 상품을 여러 번 환불했다면 최근 기록부터 취소하세요. 취소는 실제 카드·송금에 영향을 주지 않아요.</div>
          <strong>등록한 처리 · 최근 {costs.length}건</strong>
          {costs.length === 0 ? <div style={styles.small}>등록한 추가비용이나 환불이 없어요.</div> : costs.map(cost => (
            <div key={cost.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, display: "grid", gap: 6 }}>
              <b>{cost.cost_date || "날짜 없음"} · {cost.cost_type} · {cost.vendor_name || purchaseMap.get(cost.purchase_id || "")?.supplier || "거래처 미지정"}</b>
              {renderProcessingProducts(cost)}
              <div style={styles.small}>{stripCostAllocationBasisMeta(stripRefundMetaDetail(cost.memo)) || "메모 없음"}</div>
              <div style={{ display: "flex", gap: 8 }}><button type="button" disabled={loading} style={styles.smallBtn} onClick={() => { setProcessingHistoryOpen(false); openCostEditModal(cost); }}>수정</button><button type="button" disabled={loading} style={styles.dangerSmallBtn} onClick={() => deleteCost(cost.id)}>{cost.cost_type === "환불" ? "환불 취소·수량 복구" : "처리 취소"}</button></div>
            </div>
          ))}
          <strong>취소 이력 · 최근 100건</strong>
          {cancellationRows.map(row => <div key={row.id} style={{ borderBottom: "1px solid #e5e7eb", padding: 10, fontSize: 12 }}><b>{new Date(row.created_at).toLocaleString("ko-KR")} · {({ cost: "추가비용/환불", purchase: "매입", points: "포인트", topup: "충전" } as Record<string, string>)[row.action_kind]} 취소</b><div>{row.reason}</div>{row.action_kind === "cost" ? renderProcessingProducts({ ...(row.snapshot?.cost || row.snapshot || {}), id: row.source_id } as PurchaseCostRow) : row.action_kind === "purchase" ? <div>{(row.snapshot?.items || []).map((item: any) => `${item.item_name || "상품"} ${item.qty}개`).join(" · ")}</div> : null}<div>{(row.effects.quantity_changes || []).map((q: any) => `${q.name}: ${q.before} → ${q.after}개`).join(" · ")}</div></div>)}
          <div style={styles.small}>취소 이력은 확인용이에요. 취소를 다시 되돌리는 기능은 없으며, 필요하면 새 거래로 등록하세요.</div>
        </div>
      </SafeModal>

      <SafeModal
        open={costModalOpen}
        title="추가비용 저장 + 선택 상품 자동분배"
        onClose={requestCloseCostModal}
      >
        <div
          data-tablet-role="purchase-cost-form"
          onInputCapture={() => setCostDirty(true)}
          onChangeCapture={() => setCostDirty(true)}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 10,
              marginBottom: 14,
            }}
          >
            <button style={styles.btn("ghost")} onClick={requestCloseCostModal}>
              닫기
            </button>
            <button
              style={styles.btn("primary")}
              onClick={saveCostAndAllocate}
              disabled={loading}
            >
              저장
            </button>
          </div>

          <div style={styles.grid2}>
            <div style={styles.field}>
              <div style={styles.label}>추가비용 종류</div>
              <select
                style={styles.select}
                value={cType}
                onChange={(e) => {
                  const nextType = e.target.value;
                  setCType(nextType);
                  if (nextType === "환불") {
                    setCCurrency("KRW");
                    setCCurrencyCustom("");
                  }
                  if (
                    !isShippingCostType(nextType) &&
                    normalizeCostType(nextType) !== "수수료"
                  ) {
                    setCUseWallet(false);
                  }
                }}
              >
                {COST_TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              {cType === "할인/쿠폰" ? (
                <select aria-label="할인 방식" style={styles.select} value={cPointMode ? "points" : "discount"}
                  onChange={(e) => { setCPointMode(e.target.value === "points"); setCUseWallet(false); setCPointQuote(null); }}>
                  <option value="discount">일반 할인 / 쿠폰</option>
                  <option value="points">포인트 사용 · 충전잔액 복원</option>
                </select>
              ) : null}
            </div>

            <div style={styles.field}>
              <div style={styles.label}>{isCostPointUse ? "포인트 사용일(필수)" : "날짜"}</div>
              <input
                style={styles.input}
                type="text"
                inputMode="numeric"
                placeholder="YYYY-MM-DD"
                value={cDate}
                onChange={(e) => setCDate(formatDateInput(e.target.value))}
              />
            </div>

            {isCostPointUse ? (
              <div style={{ gridColumn: "1 / -1", border: "1px solid #ddd6fe", borderRadius: 12, padding: 14, display: "grid", gap: 10 }}>
                <strong>이미 결제한 금액에 포인트 적용</strong>
                <div style={styles.small}>거래처별 환산 기준으로 포인트를 금액으로 바꿔 이미 사용한 같은 통화의 충전잔액을 복원해요. 한 매입의 상품만 선택하세요. 매입등록에서 이미 사용한 포인트는 여기에 다시 넣지 마세요.</div>
                <div style={styles.grid2}>
                  <label style={styles.field}>사용할 포인트<input style={styles.input} inputMode="numeric" value={cPointAmount} onChange={(e) => setCPointAmount(e.target.value)} placeholder="예: 200" /></label>
                  <label style={styles.field}>잔액을 복원할 결제 항목<select style={styles.select} value={cPointUsageType} onChange={(e) => setCPointUsageType(e.target.value)}><option>상품</option><option>배송비</option><option>수수료</option></select></label>
                </div>
                <button type="button" style={styles.btn("ghost")} disabled={loading} onClick={() => processCostPoints(false)}>복원 금액 확인</button>
                {cPointQuote?.signature === cPointSignature ? <div style={{ lineHeight: 1.8 }}>
                  <b>{cPointQuote.vendor}</b> · 현재 {fmtNum(cPointQuote.balance)}점<br />
                  포인트 −{fmtNum(Number(cPointAmount))}점 · 충전잔액 +{fmtNum(cPointQuote.foreign)} {cPointQuote.currency}<br />
                  선택 상품 원가 −{fmtKRW(cPointQuote.krw)} · 원래 차감한 충전내역 기준
                </div> : <div style={styles.small}>금액을 확인한 뒤 위의 저장을 누르면 포인트·잔액·원가가 함께 반영돼요.</div>}
                <label style={styles.field}>메모(선택)<input style={styles.input} value={cMemo} onChange={(e) => setCMemo(e.target.value)} /></label>
                <div style={styles.small}>원가 차감은 선택 상품의 상품금액 비율로 배분해요. 잘못 저장했다면 ‘처리내역·취소’에서 포인트 사용을 취소할 수 있어요.</div>
              </div>
            ) : null}
            <div style={{ display: isCostPointUse ? "none" : "contents" }}>
            {cType === "환불" ? (
              <>
                <div style={styles.field}>
                  <div style={styles.label}>환불 종류</div>
                  <select
                    style={styles.select}
                    value={cRefundKind}
                    onChange={(e) =>
                      setCRefundKind(e.target.value as RefundKind)
                    }
                  >
                    <option value="product">상품 환불</option>
                    <option value="price_adjustment">차액 환불</option>
                  </select>
                  <div style={styles.small}>
                    상품 환불은 수량도 줄고, 차액 환불은 수량은 그대로 두고 원가만 내려가.
                  </div>
                </div>
                <div style={styles.field}>
                  <div style={styles.label}>환불 외화총액(선택)</div>
                  <input
                    style={styles.input}
                    value={cTotalForeign}
                    onChange={(e) => setCTotalForeign(e.target.value)}
                    placeholder="예: 500"
                  />
                </div>
                <div style={styles.field}>
                  <div style={styles.label}>실제 환불금액(원)</div>
                  <input
                    style={styles.input}
                    value={cTotalKRW}
                    onChange={(e) => setCTotalKRW(e.target.value)}
                    placeholder="예: 4820"
                  />
                  <div style={styles.small}>
                    차액 환불은 선택 상품 금액 비율로 자동배분하고, 상품별 외화금액을 넣으면 그 비율을 우선 사용해.
                  </div>
                </div>
              </>
            ) : cType === "관부과세" ? (
              <>
                <div style={styles.field}>
                  <div style={styles.label}>외화 총액</div>
                  <input
                    style={styles.input}
                    value={cTotalForeign}
                    onChange={(e) => setCTotalForeign(e.target.value)}
                    placeholder="숫자만"
                  />
                </div>

                <div style={styles.field}>
                  <div style={styles.label}>원화 총액(실결제)</div>
                  <input
                    style={styles.input}
                    value={cTotalKRW}
                    onChange={(e) => setCTotalKRW(e.target.value)}
                    placeholder="숫자만"
                  />
                </div>

                <div style={styles.field}>
                  <div style={styles.label}>관세</div>
                  <input
                    style={styles.input}
                    value={cDutyAmount}
                    onChange={(e) => setCDutyAmount(e.target.value)}
                    placeholder="예: 3000"
                  />
                </div>

                <div style={styles.field}>
                  <div style={styles.label}>부가세</div>
                  <input
                    style={styles.input}
                    value={cVatAmount}
                    onChange={(e) => setCVatAmount(e.target.value)}
                    placeholder="예: 1500"
                  />
                </div>

                <div style={styles.field}>
                  <div style={styles.label}>통관수수료(자동)</div>
                  <input
                    style={styles.input}
                    value={cCustomsFeeAmount}
                    onChange={(e) => setCCustomsFeeAmount(e.target.value)}
                    placeholder="관세/부가세 입력 시 자동 계산"
                  />
                </div>
              </>
            ) : (
              <>
                <div style={styles.field}>
                  <div style={styles.label}>외화 총액</div>
                  <input
                    style={styles.input}
                    value={cTotalForeign}
                    onChange={(e) => setCTotalForeign(e.target.value)}
                    placeholder="숫자만"
                  />
                </div>

                <div style={styles.field}>
                  <div style={styles.label}>원화 총액(실결제)</div>
                  <input
                    style={{
                      ...styles.input,
                      background: cUseWallet ? "#f3f4f6" : "#fff",
                    }}
                    value={cTotalKRW}
                    readOnly={cUseWallet}
                    onChange={(e) => setCTotalKRW(e.target.value)}
                    placeholder={
                      cUseWallet ? "충전잔액 환율로 자동계산" : "숫자만"
                    }
                  />
                </div>
              </>
            )}

            <div style={styles.field}>
              <div style={styles.label}>통화</div>
              <select
                style={styles.select}
                value={cCurrency}
                disabled={cUseWallet}
                onChange={(e) => setCCurrency(e.target.value)}
              >
                {CURRENCY_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              {cCurrency === "직접입력" && (
                <input
                  style={styles.input}
                  value={cCurrencyCustom}
                  onChange={(e) => setCCurrencyCustom(e.target.value)}
                  placeholder="예: THB"
                />
              )}
            </div>

            <div style={styles.field}>
              <div style={styles.label}>환율(자동 계산)</div>
              <input
                style={{ ...styles.input, background: "#f3f4f6" }}
                readOnly
                value={
                  normalizeCurrencyCode(
                    currencyValue(cCurrency, cCurrencyCustom),
                  ) === "KRW"
                    ? "1.0000"
                    : calcFxRate(
                          n(cTotalKRW),
                          cType === "관부과세"
                            ? customsTotal(
                                cDutyAmount,
                                cVatAmount,
                                cCustomsFeeAmount,
                              )
                            : n(cTotalForeign),
                        ) > 0
                      ? calcFxRate(
                          n(cTotalKRW),
                          cType === "관부과세"
                            ? customsTotal(
                                cDutyAmount,
                                cVatAmount,
                                cCustomsFeeAmount,
                              )
                            : n(cTotalForeign),
                        ).toFixed(4)
                      : ""
                }
                placeholder="자동 계산"
              />
            </div>

            <div style={styles.field}>
              <div style={styles.label}>거래처</div>
              <select
                style={styles.select}
                value={cVendorName}
                onChange={(e) => setCVendorName(e.target.value)}
              >
                <option value="">선택 안함</option>
                {costVendorOptions.map((v) => (
                  <option key={v.id} value={v.name ?? ""}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>

            {costWalletEligible ? (
              <div
                style={{
                  gridColumn: "1 / -1",
                  border: cUseWallet
                    ? "2px solid #7c3aed"
                    : "1px solid #ddd6fe",
                  borderRadius: 12,
                  padding: 12,
                  background: cUseWallet ? "#faf5ff" : "#fff",
                  display: "grid",
                  gap: 8,
                }}
              >
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontWeight: 900,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={cUseWallet}
                    onChange={(e) => toggleCostWalletUse(e.target.checked)}
                  />
                  충전잔액 사용
                </label>

                <div style={styles.small}>
                  나중에 결제된 배송비·수수료도 여기서 외화로 입력하면
                  거래처 충전잔액에서 FIFO로 차감돼.
                </div>

                {cUseWallet ? (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(150px, 1fr))",
                      gap: 8,
                    }}
                  >
                    <div
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: 10,
                        padding: 9,
                        background: "#fff",
                      }}
                    >
                      <div style={{ fontSize: 11, color: "#6b7280" }}>
                        현재 잔액
                      </div>
                      <b>
                        {fmtNum(costWalletQuote.balance)} {costWalletCurrency}
                      </b>
                    </div>
                    <div
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: 10,
                        padding: 9,
                        background: "#fff",
                      }}
                    >
                      <div style={{ fontSize: 11, color: "#6b7280" }}>
                        이번 차감
                      </div>
                      <b>
                        {fmtNum(n(cTotalForeign))} {costWalletCurrency}
                      </b>
                    </div>
                    <div
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: 10,
                        padding: 9,
                        background: "#fff",
                      }}
                    >
                      <div style={{ fontSize: 11, color: "#6b7280" }}>
                        자동 원화
                      </div>
                      <b>
                        {costWalletQuote.ok
                          ? fmtKRW(costWalletKRW)
                          : "외화금액/잔액 확인"}
                      </b>
                    </div>
                    <div
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: 10,
                        padding: 9,
                        background: "#fff",
                      }}
                    >
                      <div style={{ fontSize: 11, color: "#6b7280" }}>
                        처리 후 예상잔액
                      </div>
                      <b>
                        {costWalletQuote.ok
                          ? `${fmtNum(
                              Math.max(
                                0,
                                costWalletQuote.balance -
                                  costWalletQuote.needed,
                              ),
                            )} ${costWalletCurrency}`
                          : "-"}
                      </b>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div style={styles.field}>
              <div style={styles.label}>{getCostInputLabel(cType)}</div>
              <div style={styles.fileBox}>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setCostReceiptFile(e.target.files?.[0] ?? null)
                  }
                />
                {costReceiptFile ? (
                  <div style={styles.fileInfo}>{costReceiptFile.name}</div>
                ) : null}
              </div>
            </div>

            <div style={styles.field}>
              <div style={styles.label}>수입신고필증(관부과세 선택 시)</div>
              <div style={styles.fileBox}>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setCostImportDocFile(e.target.files?.[0] ?? null)
                  }
                />
                {costImportDocFile ? (
                  <div style={styles.fileInfo}>{costImportDocFile.name}</div>
                ) : null}
              </div>
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <div style={styles.label}>메모(선택)</div>
              <input
                style={styles.input}
                value={cMemo}
                onChange={(e) => setCMemo(e.target.value)}
                placeholder={
                  cType === "관부과세"
                    ? "예: 고지서 메모 / 특이사항"
                    : "예: DHL / 일반 메모"
                }
              />
            </div>
            </div>
          </div>

          <div style={styles.hr} />

          {cType !== "환불" && !isCostPointUse ? (
            <div
              style={{
                ...styles.card,
                padding: 12,
                marginBottom: 12,
                background: "#fafafa",
              }}
            >
              <div style={styles.label}>배분 기준</div>
              <select
                style={styles.select}
                value={cAllocationBasis}
                onChange={(e) => {
                  setCAllocationBasis(e.target.value as CostAllocationBasis);
                  setCostDirty(true);
                }}
              >
                <option value="auto">
                  자동 ({isShippingCostType(cType) ? "수량비율" : "금액비율"})
                </option>
                <option value="quantity">수량비율</option>
                <option value="amount">금액비율</option>
              </select>
              <div style={{ ...styles.small, marginTop: 6 }}>
                현재 적용: <b>{getCostAllocationBasisLabel(cType, cAllocationBasis)}</b>
                {" "}· 금액비율은 각 상품의 원화합계, 수량비율은 상품 수량으로 계산해.
              </div>
            </div>
          ) : null}

          <ItemSelectionManager
            title="배분할 상품"
            selectedItems={selectedItems}
            allItems={items}
            purchaseMap={purchaseMap}
            selectedIds={selectedItemIds}
            onRemove={(id) => {
              removeSelectedCostItem(id);
            }}
            onAdd={(id) => {
              addSelectedCostItem(id);
            }}
          />

          <div style={{ display: isCostPointUse ? "none" : "block" }}>
          <div style={{ height: 12 }} />
          <div style={{ fontWeight: 900, marginBottom: 8 }}>
            {cType === "환불" ? "환불 대상 상품" : "선택 상품별 외화 총액"}
          </div>
          <div
            style={{ ...styles.small, marginBottom: 8, whiteSpace: "pre-line" }}
          >
            {cType === "환불" && cRefundKind === "price_adjustment"
              ? "차액 환불은 상품별 외화금액을 입력하면 그 비율을 우선 사용하고, 비우면 상품금액 비율로 자동배분돼."
              : cType === "환불"
                ? "환불할 상품과 변경 후 수량을 확인해줘."
                : `선택한 배분 기준(${getCostAllocationBasisLabel(cType, cAllocationBasis)})으로 추가비용을 자동배분해.`}
            {cType === "환불"
              ? "\n[환불 처리]\n• 부분환불: 남은 수량의 원가만 다시 계산\n• 전체환불: 수량 0, 상품 원가에 차손·차익 미반영\n• 차손·차익: 전체환불이면 별도 손익으로만 기록\n\n[공동 추가비용 재배분]\n• 대상: 배송비·관부과세·잔금·기타·카드할인\n• 기준: 개당 상품금액 × 남은 수량\n• 전체환불 상품: 재배분 대상 제외\n• 수량만 기준으로 나누지 않음"
              : cType === "카드할인"
                ? "\n※ 카드할인은 선택 상품 원가에서 자동 차감돼."
                : ""}
          </div>
          <div
            style={{
              display: "grid",
              gap: 8,
              maxHeight: 240,
              overflowY: "auto",
            }}
          >
            {selectedItems.length === 0 ? (
              <div style={styles.small}>선택된 상품 없음</div>
            ) : (
              selectedItems.map((it) => {
                const previewRow = costAllocationPreview.ok
                  ? costAllocationPreview.rows.find(
                      (row) => row.item_id === it.id,
                    )
                  : null;
                return (
                  <div
                    key={it.id}
                    style={{
                      ...styles.card,
                      padding: 10,
                      background: "#fafafa",
                    }}
                  >
                    <div style={{ fontWeight: 900 }}>
                      {it.item_name ?? "(이름 없음)"}
                    </div>
                    <div style={styles.small}>
                      수량 {fmtNum(n(it.qty))} / 상품 원화합계{" "}
                      {fmtKRW(n(it.line_total))}
                    </div>
                    {cType === "환불" && cRefundKind === "product" ? (
                      <div style={{ ...styles.small, marginTop: 6 }}>
                        환불 대상 원가: <b>{fmtKRW(n(it.line_total))}</b>
                      </div>
                    ) : cType === "환불" && cRefundKind === "price_adjustment" ? (
                      <>
                        <div style={{ ...styles.field, marginTop: 8 }}>
                          <div style={styles.label}>상품 외화 총액(선택)</div>
                          <input
                            style={styles.input}
                            value={costItemForeignMap[it.id] ?? ""}
                            onChange={(e) => {
                              setCostItemForeignMap((prev) => ({
                                ...prev,
                                [it.id]: e.target.value,
                              }));
                              setCostDirty(true);
                            }}
                            placeholder="비우면 상품금액 비율"
                          />
                        </div>
                        <div style={{ ...styles.small, marginTop: 6 }}>
                          자동계산 외화총액:{" "}
                          <b>{previewRow ? fmtNum(previewRow.foreign_total) : "0"}</b>
                        </div>
                      </>
                    ) : (
                      <div
                        style={{
                          ...styles.small,
                          marginTop: 8,
                          padding: 8,
                          borderRadius: 10,
                          background: "#f5f3ff",
                          color: "#5b21b6",
                        }}
                      >
                        {getEffectiveCostAllocationBasis(cType, cAllocationBasis) ===
                        "quantity"
                          ? <>배분 기준값: 수량 <b>{fmtNum(Math.max(0, n(it.qty)))}</b></>
                          : <>배분 기준값: 상품 원화합계 <b>{fmtKRW(Math.max(0, n(it.line_total)))}</b></>}
                      </div>
                    )}

                    {cType === "환불" && cRefundKind === "product" ? (
                      <div
                        style={{
                          marginTop: 10,
                          padding: 10,
                          border: "1px dashed #d8b4fe",
                          borderRadius: 12,
                          background: "#fff",
                          display: "grid",
                          gap: 8,
                        }}
                      >
                        <div
                          style={{
                            ...styles.small,
                            color: "#6d28d9",
                            fontWeight: 800,
                          }}
                        >
                          환불 처리하면서 상품명/수량도 같이 수정
                        </div>
                        <div style={styles.field}>
                          <div style={styles.label}>변경 후 상품명</div>
                          <input
                            style={styles.input}
                            value={
                              refundItemEditMap[it.id]?.item_name ??
                              it.item_name ??
                              ""
                            }
                            onChange={(e) => {
                              setRefundItemEditMap((prev) => ({
                                ...prev,
                                [it.id]: {
                                  item_name: e.target.value,
                                  next_qty:
                                    prev[it.id]?.next_qty ??
                                    String(Math.max(0, n(it.qty))),
                                },
                              }));
                              setCostDirty(true);
                            }}
                            placeholder="예: 스폰지밥 바퀴벌레 4종"
                          />
                        </div>
                        <div style={styles.field}>
                          <div style={styles.label}>변경 후 수량</div>
                          <input
                            style={styles.input}
                            inputMode="numeric"
                            value={
                              refundItemEditMap[it.id]?.next_qty ??
                              String(Math.max(0, n(it.qty)))
                            }
                            onChange={(e) => {
                              setRefundItemEditMap((prev) => ({
                                ...prev,
                                [it.id]: {
                                  item_name:
                                    prev[it.id]?.item_name ??
                                    it.item_name ??
                                    "",
                                  next_qty: e.target.value,
                                },
                              }));
                              setCostDirty(true);
                            }}
                            placeholder="예: 4"
                          />
                        </div>
                        <div style={styles.small}>
                          현재 수량 <b>{fmtNum(Math.max(0, n(it.qty)))}</b> →
                          변경 후 수량{" "}
                          <b>
                            {fmtNum(
                              Math.max(
                                0,
                                Math.floor(
                                  n(
                                    refundItemEditMap[it.id]?.next_qty ??
                                      it.qty,
                                  ),
                                ),
                              ),
                            )}
                          </b>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
          </div>
        </div>
      </SafeModal>

      <SafeModal
        open={costEditModalOpen}
        title="추가비용 수정"
        onClose={requestCloseCostEditModal}
      >
        <div
          data-tablet-role="purchase-cost-form"
          onInputCapture={() => setCostEditDirty(true)}
          onChangeCapture={() => setCostEditDirty(true)}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 10,
              marginBottom: 14,
            }}
          >
            <button
              style={styles.btn("ghost")}
              onClick={requestCloseCostEditModal}
            >
              닫기
            </button>
            <button
              style={styles.btn("primary")}
              onClick={saveCostEdit}
              disabled={loading}
            >
              저장
            </button>
          </div>

          <div style={styles.grid2}>
            <div style={styles.field}>
              <div style={styles.label}>추가비용 종류</div>
              <select
                style={styles.select}
                value={ecType}
                onChange={(e) => {
                  const nextType = e.target.value;
                  setEcType(nextType);
                  if (nextType === "환불") {
                    setEcCurrency("KRW");
                    setEcCurrencyCustom("");
                  }
                }}
              >
                {COST_TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div style={styles.field}>
              <div style={styles.label}>날짜</div>
              <input
                style={styles.input}
                type="text"
                inputMode="numeric"
                placeholder="YYYY-MM-DD"
                value={ecDate}
                onChange={(e) => setEcDate(formatDateInput(e.target.value))}
              />
            </div>

            {ecType === "환불" ? (
              <>
                <div style={styles.field}>
                  <div style={styles.label}>환불 종류</div>
                  <select
                    style={styles.select}
                    value={ecRefundKind}
                    onChange={(e) =>
                      setEcRefundKind(e.target.value as RefundKind)
                    }
                  >
                    <option value="product">상품 환불</option>
                    <option value="price_adjustment">차액 환불</option>
                  </select>
                </div>
                <div style={styles.field}>
                  <div style={styles.label}>환불 외화총액(선택)</div>
                  <input
                    style={styles.input}
                    value={ecTotalForeign}
                    onChange={(e) => setEcTotalForeign(e.target.value)}
                    placeholder="예: 500"
                  />
                </div>
                <div style={styles.field}>
                  <div style={styles.label}>실제 환불금액(원)</div>
                  <input
                    style={styles.input}
                    value={ecTotalKRW}
                    onChange={(e) => setEcTotalKRW(e.target.value)}
                    placeholder="예: 4820"
                  />
                </div>
              </>
            ) : ecType === "관부과세" ? (
              <>
                <div style={styles.field}>
                  <div style={styles.label}>외화 총액</div>
                  <input
                    style={styles.input}
                    value={ecTotalForeign}
                    onChange={(e) => setEcTotalForeign(e.target.value)}
                    placeholder="숫자만"
                  />
                </div>

                <div style={styles.field}>
                  <div style={styles.label}>원화 총액(실결제)</div>
                  <input
                    style={styles.input}
                    value={ecTotalKRW}
                    onChange={(e) => setEcTotalKRW(e.target.value)}
                    placeholder="숫자만"
                  />
                </div>

                <div style={styles.field}>
                  <div style={styles.label}>관세</div>
                  <input
                    style={styles.input}
                    value={ecDutyAmount}
                    onChange={(e) => setEcDutyAmount(e.target.value)}
                  />
                </div>

                <div style={styles.field}>
                  <div style={styles.label}>부가세</div>
                  <input
                    style={styles.input}
                    value={ecVatAmount}
                    onChange={(e) => setEcVatAmount(e.target.value)}
                  />
                </div>

                <div style={styles.field}>
                  <div style={styles.label}>통관수수료(자동)</div>
                  <input
                    style={styles.input}
                    value={ecCustomsFeeAmount}
                    onChange={(e) => setEcCustomsFeeAmount(e.target.value)}
                    placeholder="관세/부가세 입력 시 자동 계산"
                  />
                </div>
              </>
            ) : (
              <>
                <div style={styles.field}>
                  <div style={styles.label}>외화 총액</div>
                  <input
                    style={styles.input}
                    value={ecTotalForeign}
                    onChange={(e) => setEcTotalForeign(e.target.value)}
                    placeholder="숫자만"
                  />
                </div>

                <div style={styles.field}>
                  <div style={styles.label}>원화 총액(실결제)</div>
                  <input
                    style={styles.input}
                    value={ecTotalKRW}
                    onChange={(e) => setEcTotalKRW(e.target.value)}
                    placeholder="숫자만"
                  />
                </div>
              </>
            )}

            <div style={styles.field}>
              <div style={styles.label}>통화</div>
              <select
                style={styles.select}
                value={ecCurrency}
                onChange={(e) => setEcCurrency(e.target.value)}
              >
                {CURRENCY_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              {ecCurrency === "직접입력" && (
                <input
                  style={styles.input}
                  value={ecCurrencyCustom}
                  onChange={(e) => setEcCurrencyCustom(e.target.value)}
                />
              )}
            </div>

            <div style={styles.field}>
              <div style={styles.label}>환율(자동 계산)</div>
              <input
                style={{ ...styles.input, background: "#f3f4f6" }}
                readOnly
                value={
                  ecType === "관부과세"
                    ? "1"
                    : normalizeCurrencyCode(
                          currencyValue(ecCurrency, ecCurrencyCustom),
                        ) === "KRW"
                      ? "1.0000"
                      : calcFxRate(n(ecTotalKRW), n(ecTotalForeign)) > 0
                        ? calcFxRate(n(ecTotalKRW), n(ecTotalForeign)).toFixed(
                            4,
                          )
                        : ""
                }
                placeholder="자동 계산"
              />
            </div>

            <div style={styles.field}>
              <div style={styles.label}>거래처</div>
              <select
                style={styles.select}
                value={ecVendorName}
                onChange={(e) => setEcVendorName(e.target.value)}
              >
                <option value="">선택 안함</option>
                {editCostVendorOptions.map((v) => (
                  <option key={v.id} value={v.name ?? ""}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={styles.field}>
              <div style={styles.label}>{getCostInputLabel(ecType)}</div>
              <div style={styles.fileBox}>
                {ecExistingReceiptPath ? (
                  <div style={styles.fileInfo}>
                    기존 파일:{" "}
                    <a
                      href={getPublicUrl(ecExistingReceiptPath)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      보기
                    </a>
                  </div>
                ) : (
                  <div style={styles.fileInfo}>기존 파일 없음</div>
                )}
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setEcReceiptFile(e.target.files?.[0] ?? null)
                  }
                />
                {ecReceiptFile ? (
                  <div style={styles.fileInfo}>{ecReceiptFile.name}</div>
                ) : null}
              </div>
            </div>

            <div style={styles.field}>
              <div style={styles.label}>수입신고필증(관부과세 선택 시)</div>
              <div style={styles.fileBox}>
                {ecExistingImportDocPath ? (
                  <div style={styles.fileInfo}>
                    기존 파일:{" "}
                    <a
                      href={getPublicUrl(ecExistingImportDocPath)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      보기
                    </a>
                  </div>
                ) : (
                  <div style={styles.fileInfo}>기존 파일 없음</div>
                )}
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setEcImportDocFile(e.target.files?.[0] ?? null)
                  }
                />
                {ecImportDocFile ? (
                  <div style={styles.fileInfo}>{ecImportDocFile.name}</div>
                ) : null}
              </div>
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <div style={styles.label}>메모</div>
              <input
                style={styles.input}
                value={ecMemo}
                onChange={(e) => setEcMemo(e.target.value)}
              />
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              {ecType !== "환불" ? (
                <div
                  style={{
                    ...styles.card,
                    padding: 12,
                    marginBottom: 12,
                    background: "#fafafa",
                  }}
                >
                  <div style={styles.label}>배분 기준</div>
                  <select
                    style={styles.select}
                    value={ecAllocationBasis}
                    onChange={(e) => {
                      setEcAllocationBasis(e.target.value as CostAllocationBasis);
                      setCostEditDirty(true);
                    }}
                  >
                    <option value="auto">
                      자동 ({isShippingCostType(ecType) ? "수량비율" : "금액비율"})
                    </option>
                    <option value="quantity">수량비율</option>
                    <option value="amount">금액비율</option>
                  </select>
                  <div style={{ ...styles.small, marginTop: 6 }}>
                    현재 적용: <b>{getCostAllocationBasisLabel(ecType, ecAllocationBasis)}</b>
                    {" "}· 기존 비용에 저장된 기준이 없으면 자동으로 불러와.
                  </div>
                </div>
              ) : null}

              <ItemSelectionManager
                title="배분할 상품"
                selectedItems={editSelectedItems}
                allItems={items}
                purchaseMap={purchaseMap}
                selectedIds={ecSelectedItemIds}
                onRemove={(id) => {
                  removeEditCostAllocationItem(id);
                }}
                onAdd={(id) => {
                  addEditCostAllocationItem(id);
                }}
              />

              <div style={{ height: 12 }} />
              <div style={{ fontWeight: 900, marginBottom: 8 }}>
                {ecType === "환불" ? "환불 대상 상품" : "선택 상품별 외화 총액"}
              </div>
              <div
                style={{
                  ...styles.small,
                  marginBottom: 8,
                  whiteSpace: "pre-line",
                }}
              >
                {ecType === "환불" && ecRefundKind === "price_adjustment"
                  ? "차액 환불은 상품별 외화금액을 입력하면 그 비율을 우선 사용하고, 비우면 상품금액 비율로 자동배분돼."
                  : ecType === "환불"
                    ? "환불할 상품과 변경 후 수량을 확인해줘."
                    : `선택한 배분 기준(${getCostAllocationBasisLabel(ecType, ecAllocationBasis)})으로 추가비용을 다시 자동배분해.`}
                {ecType === "환불"
                  ? "\n[환불 처리]\n• 부분환불: 남은 수량의 원가만 다시 계산\n• 전체환불: 수량 0, 상품 원가에 차손·차익 미반영\n• 차손·차익: 전체환불이면 별도 손익으로만 기록\n\n[공동 추가비용 재배분]\n• 대상: 배송비·관부과세·잔금·기타·카드할인\n• 기준: 개당 상품금액 × 남은 수량\n• 전체환불 상품: 재배분 대상 제외\n• 수량만 기준으로 나누지 않음"
                  : ecType === "카드할인"
                    ? "\n※ 카드할인은 선택 상품 원가에서 자동 차감돼."
                    : ""}
              </div>
              <div
                style={{
                  display: "grid",
                  gap: 8,
                  maxHeight: 240,
                  overflowY: "auto",
                }}
              >
                {editSelectedItems.length === 0 ? (
                  <div style={styles.small}>선택된 상품 없음</div>
                ) : (
                  editSelectedItems.map((it) => {
                    const previewRow = editCostAllocationPreview.ok
                      ? editCostAllocationPreview.rows.find(
                          (row) => row.item_id === it.id,
                        )
                      : null;
                    return (
                      <div
                        key={it.id}
                        style={{
                          ...styles.card,
                          padding: 10,
                          background: "#fafafa",
                        }}
                      >
                        <div style={{ fontWeight: 900 }}>
                          {it.item_name ?? "(이름 없음)"}
                        </div>
                        <div style={styles.small}>
                          수량 {fmtNum(n(it.qty))} / 상품 원화합계{" "}
                          {fmtKRW(n(it.line_total))}
                        </div>
                        {ecType === "환불" && ecRefundKind === "product" ? (
                          <div style={{ ...styles.small, marginTop: 6 }}>
                            환불 대상 원가: <b>{fmtKRW(n(it.line_total))}</b>
                          </div>
                        ) : ecType === "환불" && ecRefundKind === "price_adjustment" ? (
                          <>
                            <div style={{ ...styles.field, marginTop: 8 }}>
                              <div style={styles.label}>상품 외화 총액(선택)</div>
                              <input
                                style={styles.input}
                                value={editCostItemForeignMap[it.id] ?? ""}
                                onChange={(e) => {
                                  setEditCostItemForeignMap((prev) => ({
                                    ...prev,
                                    [it.id]: e.target.value,
                                  }));
                                  setCostEditDirty(true);
                                }}
                                placeholder="비우면 상품금액 비율"
                              />
                            </div>
                            <div style={{ ...styles.small, marginTop: 6 }}>
                              자동계산 외화총액:{" "}
                              <b>{previewRow ? fmtNum(previewRow.foreign_total) : "0"}</b>
                            </div>
                          </>
                        ) : (
                          <div
                            style={{
                              ...styles.small,
                              marginTop: 8,
                              padding: 8,
                              borderRadius: 10,
                              background: "#f5f3ff",
                              color: "#5b21b6",
                            }}
                          >
                            {getEffectiveCostAllocationBasis(ecType, ecAllocationBasis) ===
                            "quantity"
                              ? <>배분 기준값: 수량 <b>{fmtNum(Math.max(0, n(it.qty)))}</b></>
                              : <>배분 기준값: 상품 원화합계 <b>{fmtKRW(Math.max(0, n(it.line_total)))}</b></>}
                          </div>
                        )}

                        {ecType === "환불" && ecRefundKind === "product" ? (
                          <div
                            style={{
                              marginTop: 10,
                              padding: 10,
                              border: "1px dashed #d8b4fe",
                              borderRadius: 12,
                              background: "#fff",
                              display: "grid",
                              gap: 8,
                            }}
                          >
                            <div
                              style={{
                                ...styles.small,
                                color: "#6d28d9",
                                fontWeight: 800,
                              }}
                            >
                              환불 처리하면서 상품명/수량도 같이 수정
                            </div>
                            <div style={styles.field}>
                              <div style={styles.label}>변경 후 상품명</div>
                              <input
                                style={styles.input}
                                value={
                                  editRefundItemEditMap[it.id]?.item_name ??
                                  it.item_name ??
                                  ""
                                }
                                onChange={(e) => {
                                  setEditRefundItemEditMap((prev) => ({
                                    ...prev,
                                    [it.id]: {
                                      item_name: e.target.value,
                                      next_qty:
                                        prev[it.id]?.next_qty ??
                                        String(Math.max(0, n(it.qty))),
                                    },
                                  }));
                                  setCostEditDirty(true);
                                }}
                                placeholder="예: 스폰지밥 바퀴벌레 4종"
                              />
                            </div>
                            <div style={styles.field}>
                              <div style={styles.label}>변경 후 수량</div>
                              <input
                                style={styles.input}
                                inputMode="numeric"
                                value={
                                  editRefundItemEditMap[it.id]?.next_qty ??
                                  String(Math.max(0, n(it.qty)))
                                }
                                onChange={(e) => {
                                  setEditRefundItemEditMap((prev) => ({
                                    ...prev,
                                    [it.id]: {
                                      item_name:
                                        prev[it.id]?.item_name ??
                                        it.item_name ??
                                        "",
                                      next_qty: e.target.value,
                                    },
                                  }));
                                  setCostEditDirty(true);
                                }}
                                placeholder="예: 4"
                              />
                            </div>
                            <div style={styles.small}>
                              현재 수량 <b>{fmtNum(Math.max(0, n(it.qty)))}</b>{" "}
                              → 변경 후 수량{" "}
                              <b>
                                {fmtNum(
                                  Math.max(
                                    0,
                                    Math.floor(
                                      n(
                                        editRefundItemEditMap[it.id]
                                          ?.next_qty ?? it.qty,
                                      ),
                                    ),
                                  ),
                                )}
                              </b>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </SafeModal>

      <SafeModal
        open={itemDetailOpen}
        title="상품 상세"
        onClose={() => setItemDetailOpen(false)}
      >
        {detailItem ? (
          <>
            <div style={styles.card}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  alignItems: "start",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      const purchase = purchaseMap.get(detailItem.purchase_id);
                      if (!purchase) return;
                      setItemDetailOpen(false);
                      openPurchaseEditModal(purchase);
                    }}
                    style={{
                      border: "none",
                      background: "transparent",
                      padding: 0,
                      margin: 0,
                      fontSize: 16,
                      fontWeight: 900,
                      color: "#111",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    {detailItem.item_name ?? "(이름 없음)"}
                  </button>{" "}
                  {refundPendingItemIds.has(detailItem.id) ? (
                    <span
                      style={{
                        ...styles.badge("purple"),
                        background: "#fef3c7",
                        color: "#92400e",
                      }}
                    >
                      환불 진행중
                    </span>
                  ) : null}
                  {itemRefundStatusMap.get(detailItem.id) ? (
                    <span
                      style={styles.badge(
                        itemRefundStatusMap.get(detailItem.id) === "전체환불"
                          ? "gray"
                          : "orange",
                      )}
                    >
                      {itemRefundStatusMap.get(detailItem.id)}
                    </span>
                  ) : null}
                  {detailItem.is_preorder &&
                  itemRefundStatusMap.get(detailItem.id) !== "전체환불" &&
                  !hasBalanceByItem.get(detailItem.id) ? (
                    <span style={styles.badge("orange")}>미입고</span>
                  ) : null}
                  <div style={styles.small}>
                    상품명을 누르면 해당 매입등록 수정창으로 이동
                  </div>
                </div>
                <button
                  type="button"
                  style={styles.btn("ghost")}
                  onClick={() => {
                    const purchase = purchaseMap.get(detailItem.purchase_id);
                    if (!purchase) return;
                    setItemDetailOpen(false);
                    openPurchaseEditModal(purchase);
                  }}
                >
                  매입등록으로 이동
                </button>
              </div>
              <div style={{ ...styles.small, marginTop: 8 }}>
                현재 수량: <b>{fmtNum(n(detailItem.qty))}</b> / 상품 원화합계:{" "}
                <b>{fmtKRW(n(detailItem.line_total))}</b>
                {itemRefundStatusMap.get(detailItem.id) === "전체환불"
                  ? " / 전체환불 이력 보관 중"
                  : ""}
              </div>
              <div style={styles.small}>
                외화총액: <b>{fmtNum(n(detailItem.foreign_total))}</b> /
                외화단가: <b>{n(detailItem.foreign_unit_price).toFixed(4)}</b>
              </div>
              {detailItem.memo ? (
                <div style={{ marginTop: 8 }}>{detailItem.memo}</div>
              ) : null}
            </div>

            <div style={{ height: 12 }} />
            <div style={{ fontWeight: 900, marginBottom: 8 }}>
              이 상품에 분배된 추가비용
            </div>

            {detailAlloc.length === 0 ? (
              <div style={styles.small}>아직 분배된 추가비용이 없어.</div>
            ) : (
              <>
                {/* PC에서는 기존 표 유지 */}
                <div data-tablet-role="item-detail-allocation-table" style={{ overflowX: "auto" }}>
                  <table style={{ ...styles.table, minWidth: 820, tableLayout: "fixed" }}>
                    <colgroup>
                      <col style={{ width: "14%" }} />
                      <col style={{ width: "13%" }} />
                      <col style={{ width: "15%" }} />
                      <col style={{ width: "20%" }} />
                      <col style={{ width: "13%" }} />
                      <col style={{ width: "13%" }} />
                      <col style={{ width: "12%" }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th style={styles.th}>종류</th>
                        <th style={{ ...styles.th, width: 120 }}>날짜</th>
                        <th style={{ ...styles.th, width: 150 }}>이 상품 부담액</th>
                        <th style={styles.th}>같이 배분된 상품</th>
                        <th style={styles.th}>거래처</th>
                        <th style={styles.th}>메모</th>
                        <th style={{ ...styles.th, width: 150 }}>액션</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailAlloc.map((a, idx) => (
                        <React.Fragment key={`${detailItem.id}-${a.cost_id ?? idx}`}>
                        <tr>
                          <td style={styles.td}>{a.cost_type ?? ""}</td>
                          <td style={styles.td}>{fmtDate(a.cost_date)}</td>
                          <td style={styles.td}>
                            <b>{fmtKRW(a.amount_krw)}</b>
                          </td>
                          <td style={styles.td}>
                            <button
                              type="button"
                              style={{ ...styles.smallBtn, width: "100%", maxWidth: "100%", minWidth: 0, boxSizing: "border-box", whiteSpace: "normal", overflowWrap: "anywhere", lineHeight: 1.5 }}
                              aria-expanded={expandedAllocationKeys.includes(String(a.cost_id ?? idx))}
                              aria-controls={`allocation-products-${idx}`}
                              onClick={() => toggleAllocationList(String(a.cost_id ?? idx))}
                            >
                              총 {a.related_item_names.length + 1}종 · {expandedAllocationKeys.includes(String(a.cost_id ?? idx)) ? "목록 접기 ▴" : "목록 보기 ▾"}
                            </button>
                          </td>
                          <td style={{ ...styles.td, whiteSpace: "normal", overflowWrap: "anywhere" }}>{a.vendor_name ?? "-"}</td>
                          <td style={{ ...styles.td, whiteSpace: "pre-line" }}>
                            {stripCostAllocationBasisMeta(
                              stripRefundMetaDetail(a.memo),
                            )}
                          </td>
                          <td style={styles.td}>
                            {a.cost_id ? (
                              <div
                                style={{
                                  display: "flex",
                                  gap: 6,
                                  flexWrap: "wrap",
                                }}
                              >
                                <button
                                  style={styles.smallBtn}
                                  onClick={() =>
                                    openCostEditorById(
                                      a.cost_id as string,
                                      true,
                                    )
                                  }
                                >
                                  수정
                                </button>
                                <button
                                  style={styles.dangerSmallBtn}
                                  onClick={() => {
                                    deleteCost(a.cost_id as string);
                                  }}
                                >
                                  처리 취소
                                </button>
                              </div>
                            ) : null}
                          </td>
                        </tr>
                        {expandedAllocationKeys.includes(String(a.cost_id ?? idx)) ? (
                          <tr>
                            <td colSpan={7} style={{ ...styles.td, padding: 12 }}>
                              <div id={`allocation-products-${idx}`}>
                                <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>같이 배분된 상품 · 현재 상품 포함 {a.related_item_names.length + 1}종</div>
                                {renderRelatedAllocationItems(a)}
                              </div>
                            </td>
                          </tr>
                        ) : null}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* 태블릿: 한 글자씩 내려가는 표 대신 카드형 */}
                <div data-tablet-role="item-detail-allocation-cards">
                  {detailAlloc.map((a, idx) => (
                    <div
                      key={idx}
                      data-tablet-role="item-detail-allocation-card"
                    >
                      <div data-tablet-role="item-detail-allocation-card-head">
                        <div>
                          <div data-tablet-role="item-detail-allocation-type">
                            {a.cost_type ?? "추가비용"}
                          </div>
                          <div data-tablet-role="item-detail-allocation-date">
                            {fmtDate(a.cost_date)}
                          </div>
                        </div>
                        <div data-tablet-role="item-detail-allocation-amount">
                          <div style={{ fontSize: 11, fontWeight: 400 }}>이 상품 부담액</div>
                          {fmtKRW(a.amount_krw)}
                        </div>
                      </div>

                      <div data-tablet-role="item-detail-allocation-products">
                        <button type="button" style={styles.smallBtn}
                          aria-expanded={expandedAllocationKeys.includes(String(a.cost_id ?? idx))}
                          onClick={() => toggleAllocationList(String(a.cost_id ?? idx))}>
                          같이 배분된 상품 {a.related_item_names.length + 1}종 · {expandedAllocationKeys.includes(String(a.cost_id ?? idx)) ? "목록 접기 ▴" : "목록 보기 ▾"}
                        </button>
                        {expandedAllocationKeys.includes(String(a.cost_id ?? idx)) ? renderRelatedAllocationItems(a) : null}
                      </div>

                      <div data-tablet-role="item-detail-allocation-meta">
                        <div>
                          <b>거래처</b>
                          <span>{a.vendor_name ?? "-"}</span>
                        </div>
                        <div>
                          <b>메모</b>
                          <span>{stripRefundMetaDetail(a.memo) || "-"}</span>
                        </div>
                      </div>

                      {a.cost_id ? (
                        <div data-tablet-role="item-detail-allocation-actions">
                          <button
                            style={styles.smallBtn}
                            onClick={() =>
                              openCostEditorById(a.cost_id as string, true)
                            }
                          >
                            수정
                          </button>
                          <button
                            style={styles.dangerSmallBtn}
                            onClick={() => {
                              deleteCost(a.cost_id as string);
                            }}
                          >
                            처리 취소
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </>
            )}

            <div style={{ height: 12 }} />
            <div style={styles.small}>
              상품단가(추가비용 제외 · 개당):{" "}
              <b>{n(detailItem.qty) <= 0 ? "전체환불" : fmtKRW(ceilInt(n(detailItem.line_total) / n(detailItem.qty)))}</b>
              <br />
              최종단가(추가비용 포함 · 개당):{" "}
              <b>
                {n(detailItem.qty) <= 0
                  ? "전체환불"
                  : fmtKRW(
                      ceilInt(
                        (n(detailItem.line_total) +
                          detailAlloc.reduce(
                            (acc, x) => acc + n(x.amount_krw),
                            0,
                          )) /
                          n(detailItem.qty),
                      ),
                    )}
              </b>
            </div>
          </>
        ) : null}
      </SafeModal>
      <SafeModal open={editPointOpen} title="기존 결제에 포인트 추가 적용" onClose={() => { if (!editPointBusy) setEditPointOpen(false); }}>
        <div style={{ display: "grid", gap: 12 }}>
          {editPointBusy ? <div>잔액과 적용 금액을 확인하고 있어요…</div> : null}
          {editPointSource ? <>
            <b>{editPointSource.vendor} · 저장된 매입</b>
            <div style={{ background: "#faf5ff", borderRadius: 10, padding: 12 }}>현재 충전잔액 <b>{fmtNum(editPointSource.wallet)} {editPointSource.currency}</b> · 보유 포인트 <b>{fmtNum(editPointSource.points)}점</b><br />이 매입에 이미 사용한 포인트 {fmtNum(editPointSource.usedPoints)}점</div>
            <div style={{ maxHeight: 150, overflowY: "auto", fontSize: 12 }}>{editPointSource.products.map((name, index) => <div key={index}>{name}</div>)}</div>
            <div style={styles.small}>이미 사용한 포인트를 다시 적지 말고, 추가로 적용할 포인트만 입력하세요. 현재 충전잔액이 0이어도 기존 차감분을 포인트로 바꿀 수 있어요.</div>
            <div style={styles.grid2}>
              <label style={styles.field}>포인트 사용일<input style={styles.input} value={editPointDate} placeholder="YYYY-MM-DD" onChange={e => { setEditPointDate(formatDateInput(e.target.value)); setEditPointQuote(null); }} disabled={editPointBusy} /></label>
              <label style={styles.field}>추가로 적용할 포인트<input style={styles.input} inputMode="numeric" value={editPointAmount} onChange={e => { setEditPointAmount(e.target.value); setEditPointQuote(null); }} disabled={editPointBusy} /></label>
              <label style={styles.field}>포인트로 대신 결제할 항목<select style={styles.select} value={editPointType} onChange={e => { setEditPointType(e.target.value); setEditPointQuote(null); }} disabled={editPointBusy}>{["상품", "배송비", "수수료"].map(type => <option key={type} value={type}>{type} · 남은 차감분 {fmtNum(editPointSource.available[type] || 0)} {editPointSource.currency}</option>)}</select></label>
            </div>
            <button type="button" style={styles.btn("ghost")} disabled={editPointBusy} onClick={() => processEditPurchasePoints(false)}>적용 금액 확인</button>
            {editPointQuote ? <div style={{ padding: 12, borderRadius: 10, background: "#fff7ed" }}>포인트 <b>−{fmtNum(Number(editPointAmount))}점</b> / 충전잔액 <b>+{fmtNum(editPointQuote.foreign)} {editPointQuote.currency}</b><br />상품 원가 <b>−{fmtKRW(editPointQuote.krw)}</b><div style={styles.small}>원래 차감한 충전분과 환율로 복원해요. 기존 결제 전체를 다시 차감하지 않아요.</div></div> : null}
          </> : null}
          {editPointError ? <div role="alert" style={{ color: "#b91c1c", whiteSpace: "pre-wrap" }}>{editPointError}</div> : null}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}><button type="button" style={styles.btn("ghost")} disabled={editPointBusy} onClick={() => setEditPointOpen(false)}>돌아가기</button><button type="button" style={styles.btn("primary")} disabled={editPointBusy || !editPointQuote || !!editPointError} onClick={() => processEditPurchasePoints(true)}>확인 후 포인트 적용</button></div>
        </div>
      </SafeModal>
      <SafeModal open={!!cancelPopup} title="취소할 내용을 확인해 주세요" onClose={() => { if (!cancelPopupBusy) setCancelPopup(null); }}>
        {cancelPopup ? <div style={{ display: "grid", gap: 14 }}>
          <b>{cancelPopup.title}</b>
          {cancelPopup.details?.map((line, index) => <div key={index} style={styles.small}>{line}</div>)}
          <div style={{ padding: 12, border: "1px solid #e5e7eb", borderRadius: 10, maxHeight: 200, overflowY: "auto", display: "grid", gap: 6 }}>{cancelPopup.products.length ? cancelPopup.products.map((name, index) => <div key={index}>{name}</div>) : "상품 연결 기록 없음"}</div>
          {cancelPopupBusy ? <div>취소할 내용을 확인하고 있어요…</div> : null}
          {cancelPopup.effects ? <div style={{ background: "#fff7ed", padding: 12, borderRadius: 10, lineHeight: 1.8 }}>
            {(cancelPopup.effects.quantity_changes || []).map((row: any, index: number) => <div key={index}>{row.name || "상품"}: <b>{row.before}개 → {row.after}개</b></div>)}
            <div>포인트: <b>{Number(cancelPopup.effects.points_delta) > 0 ? "+" : ""}{fmtNum(Number(cancelPopup.effects.points_delta))}점</b></div>
            <div>충전잔액: <b>{cancelPopup.effects.wallet_changes ? cancelPopup.effects.wallet_changes.map((row: any) => `+${fmtNum(Number(row.amount))} ${row.currency}`).join(" / ") || "변경 없음" : `${Number(cancelPopup.effects.wallet_delta) > 0 ? "+" : ""}${fmtNum(Number(cancelPopup.effects.wallet_delta))} ${cancelPopup.effects.wallet_currency || ""}`}</b></div>
            <div>{cancelPopup.kind === "purchase" ? "매입과 재고는 현재 목록에서 제외되고, 원본은 취소 이력에 보관돼요." : "이 처리의 원가 조정을 제거하고, 환불이면 원래 수량과 공동비용 배분도 복구해요."}</div>
          </div> : null}
          <label style={styles.field}>취소 사유<input style={styles.input} value={cancelReason} disabled={cancelPopupBusy} onChange={e => setCancelReason(e.target.value)} /></label>
          <div style={styles.small}>아래 ‘확인 후 취소’를 눌러야 실행돼요. 실제 카드 승인·송금은 취소되지 않아요.</div>
          {cancelPopup.error ? <div role="alert" style={{ color: "#b91c1c", whiteSpace: "pre-wrap" }}>{cancelPopup.error}</div> : null}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}><button type="button" style={styles.btn("ghost")} disabled={cancelPopupBusy} onClick={() => setCancelPopup(null)}>돌아가기</button><button type="button" style={styles.btn("danger")} disabled={cancelPopupBusy || !cancelPopup.effects || !!cancelPopup.error || !cancelReason.trim()} onClick={confirmProcessingCancellation}>확인 후 취소</button></div>
        </div> : null}
      </SafeModal>

    </div>
  );
}
