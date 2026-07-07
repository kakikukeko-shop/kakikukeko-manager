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
};

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

type VendorRow = {
  id: string;
  created_at: string;
  name: string | null;
  is_product_supplier: boolean | null;
  is_forwarder: boolean | null;
  is_carry_in: boolean | null;
  is_active: boolean | null;
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
  foreign_total: string;
  memo: string;
  is_preorder: boolean;
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
  const text = (raw ?? "").trim();
  if (!text) return "";
  if (!text.startsWith(REFUND_META_HEADER)) return text;

  const parts = text.split("\n\n");
  if (parts.length <= 1) return "";
  return parts.slice(1).join("\n\n").trim();
}

function parseRefundMeta(memo: string | null | undefined): {
  items: RefundMetaItem[];
} {
  const text = (memo ?? "").trim();
  if (!text.startsWith(REFUND_META_HEADER))
    return { items: [] as RefundMetaItem[] };

  const payload = text.split("\n\n")[0].replace(REFUND_META_HEADER, "").trim();
  if (!payload) return { items: [] as RefundMetaItem[] };

  try {
    const parsed = JSON.parse(payload);
    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    return {
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
    return { items: [] as RefundMetaItem[] };
  }
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

function buildRefundMemo(baseMemo: string, items: RefundMetaItem[]) {
  const detail = `${REFUND_META_HEADER}
${JSON.stringify({ items }, null, 2)}`;
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

  // 양수면 차손(남은 상품 원가에 더해짐), 음수면 차익(남은 상품 원가에서 차감됨)
  const adjustmentKRW = ceilInt(targetKRW - actualKRW);

  return { rows, targetKRW, actualKRW, lossKRW, profitKRW, adjustmentKRW };
}

function buildRefundSummaryMemo(
  baseMemo: string,
  items: RefundMetaItem[],
  info: ReturnType<typeof getRefundLossInfo>,
) {
  const summary = [
    `환불 대상 원가:${Math.round(info.targetKRW)}`,
    `실제 환불금액:${Math.round(info.actualKRW)}`,
    `환불 차손:${Math.round(info.lossKRW)}`,
    `환불 차익:${Math.round(info.profitKRW)}`,
    `환불 원가조정:${Math.round(info.adjustmentKRW)}`,
  ].join("\n");

  const memo = baseMemo?.trim() ? `${summary}\n\n${baseMemo.trim()}` : summary;
  return buildRefundMemo(memo, items);
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

function getRefundDistributionTargets(
  allItems: PurchaseItemRow[],
  selectedItems: PurchaseItemRow[],
  refundMap: Record<string, RefundItemEdit>,
  existingMemo?: string | null,
) {
  const existing = new Map<string, RefundMetaItem>(
    parseRefundMeta(existingMemo).items.map(
      (item): [string, RefundMetaItem] => [item.item_id, item],
    ),
  );
  const selectedIds = new Set(selectedItems.map((item) => item.id));
  const purchaseIds = new Set(selectedItems.map((item) => item.purchase_id));

  return allItems
    .filter((item) => purchaseIds.has(item.purchase_id))
    .map((item) => {
      if (!selectedIds.has(item.id)) return item;

      const prev = existing.get(item.id);
      const baselineQty =
        prev?.original_qty ?? Math.max(0, Math.floor(n(item.qty)));
      const baselineForeignUnit =
        prev?.original_foreign_unit_price ??
        (n(item.foreign_unit_price) > 0
          ? n(item.foreign_unit_price)
          : baselineQty > 0
            ? ceil4(n(item.foreign_total) / baselineQty)
            : 0);
      const baselineUnitKRW =
        prev?.original_unit_price ??
        (n(item.unit_price) > 0
          ? n(item.unit_price)
          : baselineQty > 0
            ? ceil4(n(item.line_total) / baselineQty)
            : 0);
      const nextQty = Math.max(
        0,
        Math.floor(n(refundMap[item.id]?.next_qty ?? baselineQty)),
      );

      return {
        ...item,
        qty: nextQty,
        foreign_unit_price: baselineForeignUnit,
        unit_price: baselineUnitKRW,
        foreign_total: ceil4(baselineForeignUnit * nextQty),
        line_total: ceil4(baselineUnitKRW * nextQty),
      };
    })
    .filter((item) => Math.max(0, n(item.qty)) > 0);
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
  "관부과세",
  "잔금",
  "카드할인",
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
  if (type === "카드할인") return "카드할인증빙";
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
  return Number.isFinite(v) ? v.toLocaleString("ko-KR") : "0";
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
  return normalized === "카드할인" ? -absolute : absolute;
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
  if (normalized === "카드할인") return "카드할인 증빙";
  if (normalized === "기타") return "기타비용영수증";
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

  // 3) 전부 입력했는데 총합이 안 맞음 → 입력금액대비 전체 보정
  const enteredSum = round4(
    rows.reduce((acc, row) => acc + row.foreign_total, 0),
  );

  if (Math.abs(enteredSum - total) <= 0.0001) {
    return {
      ok: true as const,
      message: "",
      rows,
    };
  }

  const weights = rows.map((r) => Math.max(0, r.entered_foreign_total));
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
    photoFile: r.photoFile,
    existingPhotoPath: r.existingPhotoPath,
  }));

  const finalSum = round4(result.reduce((acc, x) => acc + x.foreign_total, 0));
  const total = ceil4(totalForeign);

  if (Math.abs(finalSum - total) > 0.0001) {
    return {
      ok: false as const,
      message: `자동 계산 후 상품 외화총합(${fmtNum(finalSum)})이 외화 총액(${fmtNum(total)})과 같아야 해.`,
      rows: [],
    };
  }

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

export default function DocumentsPage() {
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [items, setItems] = useState<PurchaseItemRow[]>([]);
  const [costs, setCosts] = useState<PurchaseCostRow[]>([]);
  const [allocations, setAllocations] = useState<CostAllocationRow[]>([]);
  const [vendors, setVendors] = useState<VendorRow[]>([]);
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

  const [buyModalOpen, setBuyModalOpen] = useState(false);
  const [buyMode, setBuyMode] = useState<"create" | "edit">("create");
  const [editingPurchaseId, setEditingPurchaseId] = useState<string | null>(
    null,
  );
  const [buyDirty, setBuyDirty] = useState(false);

  const [costModalOpen, setCostModalOpen] = useState(false);
  const [costDirty, setCostDirty] = useState(false);

  const [costEditModalOpen, setCostEditModalOpen] = useState(false);
  const [editingCost, setEditingCost] = useState<PurchaseCostRow | null>(null);
  const [ecType, setEcType] = useState("배송비(거래처)");
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
  const [detailQtyInput, setDetailQtyInput] = useState("");
  const [detailQtySaving, setDetailQtySaving] = useState(false);

  const [fSupplier, setFSupplier] = useState("");
  const [fPurchaseDate, setFPurchaseDate] = useState("");
  const [fPaymentMet, setFPaymentMet] = useState("카드");
  const [fCardName, setFCardName] = useState("");
  const [fCurrency, setFCurrency] = useState("USD");
  const [fCurrencyCustom, setFCurrencyCustom] = useState("");
  const [fTotalForeign, setFTotalForeign] = useState("");
  const [fTotalKRW, setFTotalKRW] = useState("");
  const [fMemo, setFMemo] = useState("");
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
      foreign_total: "",
      memo: "",
      is_preorder: false,
      photoFile: null,
      existingPhotoPath: null,
    },
  ]);

  const [cType, setCType] = useState("배송비(거래처)");
  const [cAmount, setCAmount] = useState("");
  const [cTotalForeign, setCTotalForeign] = useState("");
  const [cTotalKRW, setCTotalKRW] = useState("");
  const [cCurrency, setCCurrency] = useState("KRW");
  const [cCurrencyCustom, setCCurrencyCustom] = useState("");
  const [cFxRate, setCFxRate] = useState("1");
  const [cMemo, setCMemo] = useState("");
  const [cVendorName, setCVendorName] = useState("");
  const [cDate, setCDate] = useState("");
  const [costReceiptFile, setCostReceiptFile] = useState<File | null>(null);
  const [costImportDocFile, setCostImportDocFile] = useState<File | null>(null);

  const [cDutyAmount, setCDutyAmount] = useState("");
  const [cVatAmount, setCVatAmount] = useState("");
  const [cCustomsFeeAmount, setCCustomsFeeAmount] = useState("");

  const [ecDutyAmount, setEcDutyAmount] = useState("");
  const [ecVatAmount, setEcVatAmount] = useState("");
  const [ecCustomsFeeAmount, setEcCustomsFeeAmount] = useState("");
  const [cShippingAmount, setCShippingAmount] = useState("");

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
    const candidateMap = new Map<string, { cost: PurchaseCostRow; meta: RefundMetaItem }>();

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
    const statusByPurchase = new Map<string, Map<string, "전체환불" | "부분환불">>();
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
    const map = new Map<string, { itemKinds: number; hasPreorder: boolean }>();
    for (const p of purchases) {
      const its = itemsByPurchase.get(p.id) ?? [];
      map.set(p.id, {
        itemKinds: its.length,
        hasPreorder: its.some(
          (x) => !!x.is_preorder && !hasBalanceByItem.get(x.id),
        ),
      });
    }
    return map;
  }, [purchases, itemsByPurchase, hasBalanceByItem]);

  const filteredPurchases = useMemo(() => {
    if (purchaseViewFilter === "unreceived") {
      return searchedSortedPurchases.filter(
        (purchase) => purchaseCardCounts.get(purchase.id)?.hasPreorder,
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

  const costVendorOptions = useMemo(() => {
    let filtered = vendors;

    if (cType === "배송비(거래처)" || cType === "잔금") {
      filtered = vendors.filter((v) => !!v.is_product_supplier);
    } else if (cType === "배송비(배대지)" || cType === "관부과세") {
      filtered = vendors.filter((v) => !!v.is_forwarder || !!v.is_carry_in);
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
    } else if (ecType === "배송비(배대지)" || ecType === "관부과세") {
      filtered = vendors.filter((v) => !!v.is_forwarder || !!v.is_carry_in);
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

  const draftPreview = useMemo(
    () => computeDraftPreviewRows(draftItems, n(fTotalForeign), n(fTotalKRW)),
    [draftItems, fTotalForeign, fTotalKRW],
  );

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
      const [pRes, iRes, cRes, aRes, vRes, fRes] = await Promise.all([
        supabase
          .from("purchase")
          .select(
            "id,created_at,supplier,purchase_date,payment_met,card_name,currency,fx_rate,total_foreign,total_amount,memo",
          )
          .order("created_at", { ascending: false }),

        supabase
          .from("purchase_items")
          .select(
            "id,created_at,purchase_id,item_name,qty,foreign_total,foreign_unit_price,unit_price,line_total,memo,is_preorder",
          )
          .order("created_at", { ascending: false }),

        supabase
          .from("purchase_costs")
          .select(
            "id,created_at,purchase_id,cost_type,amount,currency,fx_rate,memo,vendor_name,cost_date",
          )
          .order("created_at", { ascending: false })
          .limit(500),

        supabase
          .from("cost_allocations")
          .select("purchase_cost_id,purchase_item_id,allocated_amount"),

        supabase
          .from("vendors")
          .select(
            "id,created_at,name,is_product_supplier,is_forwarder,is_carry_in,is_active",
          )
          .order("name", { ascending: true }),

        supabase
          .from("purchase_files")
          .select(
            "id,purchase_id,item_id,cost_id,file_type,file_name,file_path,created_at",
          )
          .order("created_at", { ascending: false }),
      ]);

      if (pRes.error) throw pRes.error;
      if (iRes.error) throw iRes.error;
      if (cRes.error) throw cRes.error;
      if (aRes.error) throw aRes.error;
      if (vRes.error) throw vRes.error;
      if (fRes.error) throw fRes.error;

      const p = (pRes.data ?? []) as PurchaseRow[];
      const it = (iRes.data ?? []) as PurchaseItemRow[];
      const cs = (cRes.data ?? []) as PurchaseCostRow[];
      const as = (aRes.data ?? []) as CostAllocationRow[];
      const vs = (vRes.data ?? []) as VendorRow[];
      const fs = (fRes.data ?? []) as FileRow[];

      setPurchases(p);
      setItems(it);
      setCosts(cs);
      setAllocations(as);
      setVendors(vs.filter((x) => x.is_active !== false));
      setFiles(fs);

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
      const restoreRows = legacyRefundRestoreCandidates.map(({ cost, meta }) => {
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
        };
      });

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

  function resetCostForm() {
    setCType("배송비(거래처)");
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

  function resetBuyForm() {
    setBuyMode("create");
    setEditingPurchaseId(null);
    setFSupplier("");
    setFPurchaseDate("");
    setFPaymentMet("카드");
    setFCardName("");
    setFCurrency("USD");
    setFCurrencyCustom("");
    setFTotalForeign("");
    setFTotalKRW("");
    setFMemo("");
    setPurchaseReceiptFile(null);
    setExistingPurchaseReceiptPath(null);
    setDraftItems([
      {
        key: crypto.randomUUID(),
        item_name: "",
        qty: "1",
        foreign_total: "",
        memo: "",
        is_preorder: false,
        photoFile: null,
        existingPhotoPath: null,
      },
    ]);
    setBuyDirty(false);
  }

  function openCreatePurchaseModal() {
    resetBuyForm();
    setBuyMode("create");
    setBuyModalOpen(true);
  }

  function openPurchaseEditModal(p: PurchaseRow) {
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
    setFTotalForeign(String(p.total_foreign ?? ""));
    setFTotalKRW(String(p.total_amount ?? ""));
    setFMemo(p.memo ?? "");
    setExistingPurchaseReceiptPath(getPurchaseReceiptPath(p.id));
    setPurchaseReceiptFile(null);

    setDraftItems(
      purchaseItems.length > 0
        ? purchaseItems.map((it) => ({
            id: it.id,
            key: it.id,
            item_name: it.item_name ?? "",
            qty: String(it.qty ?? 1),
            foreign_total: String(it.foreign_total ?? ""),
            memo: it.memo ?? "",
            is_preorder: !!it.is_preorder,
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
              foreign_total: "",
              memo: "",
              is_preorder: false,
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
    setMsg(null);

    const totalKRW = n(fTotalKRW);
    const totalForeign = n(fTotalForeign);
    const cur = currencyValue(fCurrency, fCurrencyCustom);
    const fx = calcFxRate(totalKRW, totalForeign);

    if (!cur) {
      setErr("통화를 선택하거나 직접 입력해줘.");
      return;
    }
    if (totalKRW <= 0 || totalForeign <= 0 || fx <= 0) {
      setErr("원화총액/외화총액을 둘 다 입력해야 환율을 자동 계산할 수 있어.");
      return;
    }

    const computed = computeDraftForeignTotals(draftItems, totalForeign);
    if (!computed.ok) {
      setErr(computed.message);
      return;
    }

    const cleaned = computed.rows;

    setLoading(true);
    try {
      let purchaseId = editingPurchaseId;

      if (buyMode === "edit" && editingPurchaseId) {
        const updP = await supabase
          .from("purchase")
          .update({
            supplier: fSupplier || null,
            purchase_date: fPurchaseDate || null,
            payment_met: fPaymentMet || null,
            card_name: fCardName || null,
            currency: cur,
            fx_rate: fx,
            total_foreign: totalForeign,
            total_amount: totalKRW,
            memo: fMemo || null,
          })
          .eq("id", editingPurchaseId);
        if (updP.error) throw updP.error;
      } else {
        const insP = await supabase
          .from("purchase")
          .insert({
            supplier: fSupplier || null,
            purchase_date: fPurchaseDate || null,
            payment_met: fPaymentMet || null,
            card_name: fCardName || null,
            currency: cur,
            fx_rate: fx,
            total_foreign: totalForeign,
            total_amount: totalKRW,
            memo: fMemo || null,
          })
          .select("id")
          .single();
        if (insP.error) throw insP.error;
        purchaseId = insP.data.id as string;
        setSelectedPurchaseId(purchaseId);
      }

      if (!purchaseId) throw new Error("매입 ID를 찾을 수 없어.");

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

      for (let idx = 0; idx < cleaned.length; idx++) {
        const d = cleaned[idx];
        const q = Math.max(1, n(d.qty));
        const ft = Math.max(0, d.foreign_total);
        const foreignUnit = q > 0 ? ceil4(ft / q) : 0;
        const lineKRW = ceil4(ft * fx);
        const unitKRW = q > 0 ? ceil4(lineKRW / q) : 0;

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

        if (d.photoFile) {
          await upsertPurchaseFile({
            item_id: savedId,
            file_type: "상품사진",
            file: d.photoFile,
            oldPath: d.existingPhotoPath ?? null,
          });
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
          ? "매입 수정 완료"
          : `매입 저장 완료 (상품 외화합계 일치 / 환율 ${fx.toFixed(4)})`,
      );
      setBuyModalOpen(false);
      resetBuyForm();
      await refreshAll();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  async function deletePurchase(purchaseId: string) {
    if (
      !confirm(
        "이 매입을 삭제할까? (연결된 상품/추가비용/배분도 같이 삭제될 수 있어)",
      )
    )
      return;

    setLoading(true);
    setErr(null);
    setMsg(null);
    try {
      const del = await supabase.from("purchase").delete().eq("id", purchaseId);
      if (del.error) throw del.error;

      setSelectedItemIds((prev) =>
        prev.filter(
          (id) => items.find((x) => x.id === id)?.purchase_id !== purchaseId,
        ),
      );
      if (selectedPurchaseId === purchaseId) setSelectedPurchaseId(null);

      setMsg("매입 삭제 완료");
      await refreshAll();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  async function deleteCost(costId: string) {
    if (!confirm("이 추가비용을 삭제할까?")) return;

    setLoading(true);
    setErr(null);
    setMsg(null);
    try {
      const targetCost = costs.find((c) => c.id === costId) ?? null;
      if (normalizeCostType(targetCost?.cost_type) === "환불") {
        await restoreRefundAdjustedItemsFromMemo(targetCost?.memo);
      }

      const del = await supabase
        .from("purchase_costs")
        .delete()
        .eq("id", costId);
      if (del.error) throw del.error;

      setMsg(
        normalizeCostType(targetCost?.cost_type) === "환불"
          ? "환불 삭제 완료 (상품명/수량 원복)"
          : "추가비용 삭제 완료",
      );
      await refreshAll();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  function openCostEditModal(cost: PurchaseCostRow) {
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
    setEcCurrency(normalizeCurrencySelectValue(cost.currency || "KRW"));
    setEcCurrencyCustom(
      normalizeCurrencySelectValue(cost.currency) === "직접입력"
        ? (cost.currency ?? "")
        : "",
    );
    setEcFxRate(String(cost.fx_rate ?? 1));
    setEcMemo(stripRefundMetaDetail(stripCustomsMemoDetail(cost.memo)));
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
    const refundAllocationItems = getRefundDistributionTargets(
      items,
      chosen,
      editRefundItemEditMap,
      wasRefund ? editingCost.memo : null,
    );

    const finalMemo =
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
            )
          : ecMemo || null;

    const resolvedForeign = resolveCostForeignTotals(
      chosen,
      editCostItemForeignMap,
      n(ecTotalForeign),
    );
    const allocationItems = ecType === "환불" ? refundAllocationItems : chosen;
    const allocationWeights =
      ecType === "환불"
        ? refundAllocationItems.map((item) => Math.max(0, n(item.line_total)))
        : resolvedForeign.ok
          ? resolvedForeign.rows.map((row) => row.foreign_total)
          : [];
    const signedCostKRW =
      ecType === "환불"
        ? refundInfoEdit.adjustmentKRW
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
    if (ecType === "환불") {
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
    if (ecType !== "환불" && !resolvedForeign.ok) {
      setErr(resolvedForeign.message);
      return;
    }
    if (ecType !== "환불" && allocationWeights.every((w) => n(w) <= 0)) {
      setErr("상품 외화 총액 배분값이 0이야.");
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
          amount: ecType === "환불" ? refundInfoEdit.adjustmentKRW : amount,
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

      const allocAmounts = distributeByWeightsCeilIntSigned(
        signedCostKRW,
        allocationWeights,
      );
      const alloc = allocationItems.map((it, idx) => ({
        item_id: it.id,
        amt: allocAmounts[idx] ?? 0,
      }));

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

      if (ecType === "환불") {
        await updateRefundAdjustedItems(
          chosen,
          editRefundItemEditMap,
          wasRefund ? editingCost.memo : null,
        );
      }

      setMsg(
        ecType === "환불"
          ? `환불 수정 완료 (차손 ${fmtKRW(refundInfoEdit.lossKRW)} / 차익 ${fmtKRW(refundInfoEdit.profitKRW)})`
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

  async function saveCostAndAllocate() {
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

    const fx =
      normalizeCurrencyCode(cur) === "KRW"
        ? 1
        : calcFxRate(
            n(cTotalKRW),
            cType === "관부과세" ? amount : n(cTotalForeign),
          );

    const costKRW =
      cType === "관부과세"
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
    if (cType === "관부과세") {
      if (Math.abs(amount) <= 0 && n(cTotalKRW) <= 0) {
        setErr("원화 총액이나 관세/부가세를 입력해줘.");
        return;
      }
      if (n(cTotalKRW) <= 0) {
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
      if (n(cTotalKRW) <= 0) {
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
    const refundAllocationItems = getRefundDistributionTargets(
      items,
      chosen,
      refundItemEditMap,
    );

    const finalMemo =
      cType === "관부과세"
        ? buildCustomsMemo(cMemo, cDutyAmount, cVatAmount, cCustomsFeeAmount)
        : cType === "환불"
          ? buildRefundSummaryMemo(
              cMemo,
              buildRefundMetaItems(chosen, refundItemEditMap),
              refundInfo,
            )
          : cMemo || null;

    if (cType === "환불") {
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
    const allocationItems = cType === "환불" ? refundAllocationItems : chosen;
    const allocationWeights =
      cType === "환불"
        ? refundAllocationItems.map((item) => Math.max(0, n(item.line_total)))
        : resolvedForeign.ok
          ? resolvedForeign.rows.map((row) => row.foreign_total)
          : [];
    const signedCostKRW =
      cType === "환불"
        ? refundInfo.adjustmentKRW
        : signedCostAmountByType(cType, costKRW);

    if (cType !== "환불" && !resolvedForeign.ok) {
      setErr(resolvedForeign.message);
      return;
    }
    if (cType !== "환불" && allocationWeights.every((w) => n(w) <= 0)) {
      setErr("상품 외화 총액 배분값이 0이야.");
      return;
    }

    setLoading(true);
    try {
      const linkedPurchaseIds = Array.from(
        new Set(chosen.map((it) => it.purchase_id)),
      );
      const linkedPurchaseId =
        linkedPurchaseIds.length === 1 ? linkedPurchaseIds[0] : null;

      const insCost = await supabase
        .from("purchase_costs")
        .insert({
          purchase_id: linkedPurchaseId,
          cost_type: cType,
          // 차손은 +, 차익은 -로 저장해서 대시보드에도 모두 반영된다.
          amount: cType === "환불" ? refundInfo.adjustmentKRW : amount,
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

      const allocAmounts = distributeByWeightsCeilIntSigned(
        signedCostKRW,
        allocationWeights,
      );
      const alloc = allocationItems.map((it, idx) => ({
        item_id: it.id,
        amt: allocAmounts[idx] ?? 0,
      }));

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

      if (cType === "환불") {
        await updateRefundAdjustedItems(chosen, refundItemEditMap);
      }

      setMsg(
        cType === "환불"
          ? `환불 저장 완료 (차손 ${fmtKRW(refundInfo.lossKRW)} / 차익 ${fmtKRW(refundInfo.profitKRW)})`
          : cType === "카드할인"
            ? `카드할인 저장 완료 (${fmtKRW(Math.abs(Math.round(costKRW)))} 차감)`
            : `추가비용 저장 완료 (${fmtKRW(Math.round(costKRW))})`,
      );
      setCostModalOpen(false);
      setCostDirty(false);
      setCType("배송비(거래처)");
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
      <div style={styles.topbar}>
        <div style={styles.title}>매입관리</div>

        <button style={styles.btn("primary")} onClick={openCreatePurchaseModal}>
          + 매입 등록(안에 상품까지)
        </button>

        <button style={styles.btn("primary")} onClick={openCostCreateModal}>
          + 추가비용(자동분배)
        </button>

        <button
          style={styles.btn("ghost")}
          onClick={refreshAll}
          disabled={loading}
        >
          새로고침
        </button>

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

          <div style={{ display: "grid", gap: 8 }}>
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
                        {cnt?.hasPreorder ? (
                          <span style={styles.badge("orange")}>
                            미입고 포함
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
                            환불: {refundSummary.fullCount > 0 ? (
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
                        삭제
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ display: "grid", gap: 14, minWidth: 0 }}>
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

            <div style={{ ...styles.small, marginBottom: 10 }}>
              ✅ 체크는 매입을 바꿔도 유지돼. 검색해도 체크 유지됨.
            </div>

            <div
              data-tablet-role="documents-table-wrap"
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
                    <th style={{ ...styles.th, width: 44 }}>선택</th>
                    <th style={styles.th}>상품</th>
                    <th style={{ ...styles.th, width: 70 }}>수량</th>
                    <th data-tablet-role="documents-payment-date" style={{ ...styles.th, width: 110 }}>결제일</th>
                    <th style={{ ...styles.th, width: 130 }}>원화합계</th>
                    <th style={{ ...styles.th, width: 100 }}>배분</th>
                    <th style={{ ...styles.th, width: 120 }}>최종단가</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedVisibleItems.length === 0 ? (
                    <tr>
                      <td style={styles.td} colSpan={7}>
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
                                    style={{
                                      fontWeight: 900,
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 6,
                                      flexWrap: "wrap",
                                    }}
                                  >
                                    <span data-tablet-role="documents-product-name">{it.item_name ?? "(이름 없음)"}</span>
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
                                    {it.is_preorder &&
                                    !hasBalanceByItem.get(it.id) ? (
                                      <span style={styles.badge("orange")}>
                                        미입고
                                      </span>
                                    ) : null}
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
                                  결제일: {fmtDate(parentPurchase?.purchase_date)}
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
                          <td data-tablet-role="documents-payment-date" style={styles.td}>
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
                              {fmtKRW(allocSum)}
                            </div>
                          </td>

                          <td style={styles.td}>
                            <div style={{ fontWeight: 900 }}>
                              {isFullyRefunded ? "-" : fmtKRW(finalUnit)}
                            </div>
                            <div style={styles.small}>
                              {isFullyRefunded ? "전체환불" : "(배분 포함)"}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div
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
                            <span data-tablet-role="documents-product-name">{it.item_name ?? "(이름 없음)"}</span>
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

      <SafeModal
        open={buyModalOpen}
        title={buyMode === "edit" ? "매입 수정" : "매입 등록 (안에 상품까지)"}
        onClose={requestCloseBuyModal}
      >
        <div
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

          <div style={styles.grid2}>
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

            <div style={styles.field}>
              <div style={styles.label}>결제일(선택)</div>
              <input
                style={styles.input}
                type="text"
                inputMode="numeric"
                placeholder="YYYY-MM-DD"
                value={fPurchaseDate}
                onChange={(e) =>
                  setFPurchaseDate(formatDateInput(e.target.value))
                }
              />
            </div>

            <div style={styles.field}>
              <div style={styles.label}>결제수단(선택)</div>
              <select
                style={styles.select}
                value={fPaymentMet}
                onChange={(e) => setFPaymentMet(e.target.value)}
              >
                <option value="카드">카드</option>
                <option value="현금">현금</option>
                <option value="계좌이체">계좌이체</option>
                <option value="기타">기타</option>
              </select>
            </div>

            <div style={styles.field}>
              <div style={styles.label}>카드명(선택)</div>
              <input
                style={styles.input}
                value={fCardName}
                onChange={(e) => setFCardName(e.target.value)}
                placeholder="예: 신한/토스/트래블카드"
              />
            </div>

            <div style={styles.field}>
              <div style={styles.label}>통화</div>
              <select
                style={styles.select}
                value={fCurrency}
                onChange={(e) => setFCurrency(e.target.value)}
              >
                {CURRENCY_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              {fCurrency === "직접입력" && (
                <input
                  style={styles.input}
                  value={fCurrencyCustom}
                  onChange={(e) => setFCurrencyCustom(e.target.value)}
                  placeholder="예: THB"
                />
              )}
            </div>

            <div style={styles.field}>
              <div style={styles.label}>외화 총액</div>
              <input
                style={styles.input}
                value={fTotalForeign}
                onChange={(e) => setFTotalForeign(e.target.value)}
                placeholder="숫자만"
              />
            </div>

            <div style={styles.field}>
              <div style={styles.label}>원화 총액(실결제)</div>
              <input
                style={styles.input}
                value={fTotalKRW}
                onChange={(e) => setFTotalKRW(e.target.value)}
                placeholder="숫자만"
              />
            </div>

            <div style={styles.field}>
              <div style={styles.label}>환율(자동 계산)</div>
              <input
                style={{ ...styles.input, background: "#f3f4f6" }}
                readOnly
                value={
                  calcFxRate(n(fTotalKRW), n(fTotalForeign)) > 0
                    ? calcFxRate(n(fTotalKRW), n(fTotalForeign)).toFixed(4)
                    : ""
                }
                placeholder="자동 계산"
              />
            </div>

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
            <div style={{ fontSize: 14, fontWeight: 900 }}>상품 등록</div>
            <button
              style={styles.btn("ghost")}
              onClick={() =>
                setDraftItems((prev) => [
                  ...prev,
                  {
                    key: crypto.randomUUID(),
                    item_name: "",
                    qty: "1",
                    foreign_total: "",
                    memo: "",
                    is_preorder: false,
                    photoFile: null,
                    existingPhotoPath: null,
                  },
                ])
              }
            >
              + 상품 추가
            </button>
          </div>

          <div
            style={{ ...styles.small, marginTop: 6, whiteSpace: "pre-line" }}
          >
            ① 상품 외화금액이 전부 비어 있으면 <b>수량대비 자동배분</b>
            {"\n"}② 일부만 입력하면 <b>남은 금액만 빈 칸에 수량대비 자동배분</b>
            {"\n"}③ 전부 입력했는데 외화 총액과 안 맞으면{" "}
            <b>입력한 금액대비로 전체 자동보정</b>
            {"\n"}
            소수점은 <b>무조건 올림</b> 처리돼.
          </div>

          <div
            style={{
              ...styles.card,
              marginTop: 10,
              background: "#fafafa",
              borderColor:
                draftPreview.hasNamedItems &&
                Math.abs(draftPreview.diff) > 0.0001
                  ? "#fecaca"
                  : "#e6e6ef",
              padding: 10,
            }}
          >
            <div
              style={{
                ...styles.small,
                display: "flex",
                gap: 14,
                flexWrap: "wrap",
              }}
            >
              <span>
                미리보기 외화합계:{" "}
                <b>{fmtNum(draftPreview.previewForeignSum)}</b>
              </span>
              <span>
                외화 총액: <b>{fmtNum(n(fTotalForeign))}</b>
              </span>
              <span>
                차이:{" "}
                <b
                  style={{
                    color:
                      Math.abs(draftPreview.diff) > 0.0001
                        ? "#dc2626"
                        : "#166534",
                  }}
                >
                  {fmtNum(draftPreview.diff)}
                </b>
              </span>
            </div>
          </div>

          <div
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

                  <div style={{ ...styles.grid2, marginTop: 10 }}>
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
                      <div style={styles.label}>수량(수정 가능)</div>
                      <input
                        style={styles.input}
                        value={d.qty}
                        onChange={(e) =>
                          setDraftItems((prev) =>
                            prev.map((x) =>
                              x.key === d.key
                                ? { ...x, qty: e.target.value }
                                : x,
                            ),
                          )
                        }
                      />
                    </div>

                    <div style={styles.field}>
                      <div style={styles.label}>상품 외화 총액</div>
                      <input
                        style={styles.input}
                        value={d.foreign_total}
                        onChange={(e) =>
                          setDraftItems((prev) =>
                            prev.map((x) =>
                              x.key === d.key
                                ? { ...x, foreign_total: e.target.value }
                                : x,
                            ),
                          )
                        }
                        placeholder="비우면 자동배분 / 전부 입력 후 합계 안 맞으면 비례보정"
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
        </div>
      </SafeModal>

      <SafeModal
        open={costModalOpen}
        title="추가비용 저장 + 선택 상품 자동분배"
        onClose={requestCloseCostModal}
      >
        <div
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
                value={cDate}
                onChange={(e) => setCDate(formatDateInput(e.target.value))}
              />
            </div>

            {cType === "환불" ? (
              <div style={styles.field}>
                <div style={styles.label}>실제 환불금액(원)</div>
                <input
                  style={styles.input}
                  value={cTotalKRW}
                  onChange={(e) => setCTotalKRW(e.target.value)}
                  placeholder="예: 90000"
                />
                <div style={styles.small}>
                  환불 대상 원가와 비교해 차손·차익이 자동 계산돼.
                </div>
              </div>
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
                    style={styles.input}
                    value={cTotalKRW}
                    onChange={(e) => setCTotalKRW(e.target.value)}
                    placeholder="숫자만"
                  />
                </div>
              </>
            )}

            <div style={styles.field}>
              <div style={styles.label}>통화</div>
              <select
                style={styles.select}
                value={cCurrency}
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

          <div style={styles.hr} />

          <div style={{ ...styles.small, marginBottom: 8 }}>
            배분 기준: <b>상품 원화합계</b> 비율 / 소수점은 <b>무조건 올림</b> /
            오차는 <b>상품 원화합계가 가장 큰 상품</b>에 몰아줌
          </div>

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

          <div style={{ height: 12 }} />
          <div style={{ fontWeight: 900, marginBottom: 8 }}>
            {cType === "환불" ? "환불 대상 상품" : "선택 상품별 외화 총액"}
          </div>
          <div
            style={{ ...styles.small, marginBottom: 8, whiteSpace: "pre-line" }}
          >
            ① 전부 비우면 <b>수량대비 자동배분</b>
            {"\n"}② 일부만 입력하면 <b>남은 금액만 빈 칸에 자동배분</b>
            {"\n"}③ 전부 입력 후 외화 총액과 안 맞으면{" "}
            <b>입력 금액대비 전체 자동보정</b>
            {cType === "환불"
              ? "\n※ 실제 환불금액이 원가보다 적으면 차손(+)이 남은 상품 원가에 재배분되고, 더 많으면 차익(-)으로 차감돼."
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
                    {cType === "환불" ? (
                      <div style={{ ...styles.small, marginTop: 6 }}>
                        환불 대상 원가: <b>{fmtKRW(n(it.line_total))}</b>
                      </div>
                    ) : (
                      <>
                        <div style={{ ...styles.field, marginTop: 8 }}>
                          <div style={styles.label}>상품 외화 총액</div>
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
                            placeholder="비우면 자동배분"
                          />
                        </div>
                        <div style={{ ...styles.small, marginTop: 6 }}>
                          자동계산 외화총액:{" "}
                          <b>
                            {previewRow
                              ? fmtNum(previewRow.foreign_total)
                              : "0"}
                          </b>
                        </div>
                      </>
                    )}

                    {cType === "환불" ? (
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
      </SafeModal>

      <SafeModal
        open={costEditModalOpen}
        title="추가비용 수정"
        onClose={requestCloseCostEditModal}
      >
        <div
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
              <div style={styles.field}>
                <div style={styles.label}>실제 환불금액(원)</div>
                <input
                  style={styles.input}
                  value={ecTotalKRW}
                  onChange={(e) => setEcTotalKRW(e.target.value)}
                  placeholder="예: 90000"
                />
                <div style={styles.small}>
                  환불 대상 원가와 비교해 차손·차익이 자동 계산돼.
                </div>
              </div>
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
                ① 전부 비우면 <b>수량대비 자동배분</b>
                {"\n"}② 일부만 입력하면 <b>남은 금액만 빈 칸에 자동배분</b>
                {"\n"}③ 전부 입력 후 외화 총액과 안 맞으면{" "}
                <b>입력 금액대비 전체 자동보정</b>
                {ecType === "환불"
                  ? "\n※ 실제 환불금액이 원가보다 적으면 차손(+)이 남은 상품 원가에 재배분되고, 더 많으면 차익(-)으로 차감돼."
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
                        {ecType === "환불" ? (
                          <div style={{ ...styles.small, marginTop: 6 }}>
                            환불 대상 원가: <b>{fmtKRW(n(it.line_total))}</b>
                          </div>
                        ) : (
                          <>
                            <div style={{ ...styles.field, marginTop: 8 }}>
                              <div style={styles.label}>상품 외화 총액</div>
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
                                placeholder="비우면 자동배분"
                              />
                            </div>
                            <div style={{ ...styles.small, marginTop: 6 }}>
                              자동계산 외화총액:{" "}
                              <b>
                                {previewRow
                                  ? fmtNum(previewRow.foreign_total)
                                  : "0"}
                              </b>
                            </div>
                          </>
                        )}

                        {ecType === "환불" ? (
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
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>종류</th>
                    <th style={{ ...styles.th, width: 120 }}>날짜</th>
                    <th style={{ ...styles.th, width: 150 }}>배분금액</th>
                    <th style={styles.th}>같이 배분된 상품</th>
                    <th style={styles.th}>거래처</th>
                    <th style={styles.th}>메모</th>
                    <th style={{ ...styles.th, width: 150 }}>액션</th>
                  </tr>
                </thead>
                <tbody>
                  {detailAlloc.map((a, idx) => (
                    <tr key={idx}>
                      <td style={styles.td}>{a.cost_type ?? ""}</td>
                      <td style={styles.td}>{fmtDate(a.cost_date)}</td>
                      <td style={styles.td}>
                        <b>{fmtKRW(a.amount_krw)}</b>
                      </td>
                      <td style={styles.td}>
                        {a.related_item_names.length > 0
                          ? a.related_item_names.join(", ")
                          : "-"}
                      </td>
                      <td style={styles.td}>{a.vendor_name ?? "-"}</td>
                      <td style={{ ...styles.td, whiteSpace: "pre-line" }}>
                        {a.memo ?? ""}
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
                                openCostEditorById(a.cost_id as string, true)
                              }
                            >
                              수정
                            </button>
                            <button
                              style={styles.dangerSmallBtn}
                              onClick={() => {
                                if (!confirm("이 추가비용을 삭제할까?")) return;
                                setItemDetailOpen(false);
                                deleteCost(a.cost_id as string);
                              }}
                            >
                              삭제
                            </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div style={{ height: 12 }} />
            <div style={styles.small}>
              최종 단가(배분 포함):{" "}
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
    </div>
  );
}
