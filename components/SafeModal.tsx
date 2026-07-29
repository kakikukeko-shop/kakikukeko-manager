"use client";

import React, { useEffect, useRef, useState } from "react";

type SafeModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxWidth?: number;
};

export default function SafeModal({
  open,
  onClose,
  title,
  children,
  maxWidth = 980,
}: SafeModalProps) {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const modalRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef({
    dragging: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
  });

  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setPosition({ x: 0, y: 0 });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      dragRef.current.dragging = false;
    };
  }, [open, onClose]);

  function clampPosition(nextX: number, nextY: number) {
    const modal = modalRef.current;
    if (!modal) return { x: nextX, y: nextY };

    const rect = modal.getBoundingClientRect();
    const margin = 16;

    const currentLeft = rect.left - position.x;
    const currentTop = rect.top - position.y;

    const minX = margin - currentLeft;
    const maxX = window.innerWidth - margin - (currentLeft + rect.width);
    const minY = margin - currentTop;
    const maxY = window.innerHeight - margin - (currentTop + rect.height);

    return {
      x: Math.min(Math.max(nextX, minX), maxX),
      y: Math.min(Math.max(nextY, minY), maxY),
    };
  }

  function startDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;

    const target = e.target as HTMLElement;
    if (target.closest("button, input, select, textarea, a")) return;

    dragRef.current = {
      dragging: true,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: position.x,
      originY: position.y,
    };

    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function moveDrag(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag.dragging || drag.pointerId !== e.pointerId) return;

    const nextX = drag.originX + (e.clientX - drag.startX);
    const nextY = drag.originY + (e.clientY - drag.startY);
    setPosition(clampPosition(nextX, nextY));
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag.dragging || drag.pointerId !== e.pointerId) return;

    dragRef.current.dragging = false;
    dragRef.current.pointerId = -1;

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(15, 23, 42, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        overflow: "hidden",
      }}
    >
      <div
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth,
          maxHeight: "90vh",
          overflowY: "auto",
          background: "#ffffff",
          borderRadius: 24,
          border: "1px solid #e5e7eb",
          boxShadow: "0 24px 80px rgba(0,0,0,0.18)",
          transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
          willChange: "transform",
        }}
      >
        <div
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onDoubleClick={() => setPosition({ x: 0, y: 0 })}
          style={{
            position: "sticky",
            top: 0,
            zIndex: 2,
            background: "#ffffff",
            borderBottom: "1px solid #f1f5f9",
            padding: "18px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            cursor: "move",
            userSelect: "none",
            touchAction: "none",
          }}
          title="제목 부분을 마우스 왼쪽 버튼으로 끌어서 이동 · 더블클릭하면 원위치"
        >
          <div
            style={{
              fontSize: 22,
              fontWeight: 900,
              color: "#111827",
              lineHeight: 1.2,
              minWidth: 0,
            }}
          >
            {title || "모달"}
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              border: "1px solid #cbd5e1",
              background: "#ffffff",
              color: "#111827",
              padding: "10px 16px",
              borderRadius: 999,
              cursor: "pointer",
              fontWeight: 800,
              fontSize: 14,
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            닫기
          </button>
        </div>

        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  );
}
