"use client";

import type { ReactNode } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

/**
 * Drag-to-reorder list. `ids` is the current order; `onReorder` receives the
 * new id order after a drag. A small activation distance keeps taps on inner
 * inputs from starting a drag.
 */
export function SortableList({
  ids,
  onReorder,
  children,
}: {
  ids: number[];
  onReorder: (newIds: number[]) => void;
  children: ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(Number(active.id));
    const to = ids.indexOf(Number(over.id));
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(ids, from, to));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

/**
 * One sortable row. Render-prop gives you a ready-to-spread `dragHandle`
 * (a grip button) to place wherever you want inside the row.
 */
export function SortableRow({
  id,
  children,
}: {
  id: number;
  children: (args: { dragHandle: ReactNode; isDragging: boolean }) => ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Only the grip handle starts a drag, so inner inputs stay interactive.
  const dragHandle = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      className="cursor-grab active:cursor-grabbing touch-none text-muted-soft hover:text-ink p-1 -ml-1 shrink-0"
      aria-label="ลากเพื่อจัดลำดับ"
      title="ลากเพื่อจัดลำดับ"
    >
      <GripVertical className="h-4 w-4" strokeWidth={1.75} />
    </button>
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={
        "rounded " +
        (isDragging
          ? "relative z-10 bg-canvas shadow-lg ring-1 ring-hairline"
          : "")
      }
    >
      {children({ dragHandle, isDragging })}
    </div>
  );
}
