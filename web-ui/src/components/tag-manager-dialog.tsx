import { Pencil, Plus, Tags, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Dialog, DialogBody, DialogHeader } from "@/components/ui/dialog";
import type { TaskTag } from "@/types";

const DEFAULT_TAG_COLOR = "#4C9AFF";

const TAG_COLOR_PALETTE = [
	DEFAULT_TAG_COLOR,
	"#3FB950",
	"#84CC16",
	"#D4A72C",
	"#D29922",
	"#F85149",
	"#F43F5E",
	"#A371F7",
	"#8B5CF6",
	"#06B6D4",
];

interface ColorSwatchPickerProps {
	value: string;
	onChange: (color: string) => void;
}

function ColorSwatchPicker({ value, onChange }: ColorSwatchPickerProps): React.ReactElement {
	return (
		<div className="flex flex-wrap gap-1.5">
			{TAG_COLOR_PALETTE.map((color) => {
				const isSelected = color.toLowerCase() === value.toLowerCase();
				return (
					<button
						key={color}
						type="button"
						onClick={() => onChange(color)}
						aria-label={`Color ${color}`}
						aria-pressed={isSelected}
						className={cn(
							"h-5 w-5 rounded-full border-2 transition-transform",
							isSelected ? "scale-110 border-text-primary" : "border-transparent hover:scale-110",
						)}
						style={{ backgroundColor: color }}
					/>
				);
			})}
		</div>
	);
}

interface TagManagerDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	tags: TaskTag[];
	onAddTag: (tag: { label: string; color: string }) => void;
	onUpdateTag: (tagId: string, changes: { label: string; color: string }) => void;
	onDeleteTag: (tagId: string) => void;
}

export function TagManagerDialog({
	open,
	onOpenChange,
	tags,
	onAddTag,
	onUpdateTag,
	onDeleteTag,
}: TagManagerDialogProps): React.ReactElement {
	const [newLabel, setNewLabel] = useState("");
	const [newColor, setNewColor] = useState(DEFAULT_TAG_COLOR);
	const [editingTagId, setEditingTagId] = useState<string | null>(null);
	const [editLabel, setEditLabel] = useState("");
	const [editColor, setEditColor] = useState(DEFAULT_TAG_COLOR);

	const resetEditing = () => {
		setEditingTagId(null);
		setEditLabel("");
		setEditColor(DEFAULT_TAG_COLOR);
	};

	const handleAdd = () => {
		const label = newLabel.trim();
		if (!label) {
			return;
		}
		onAddTag({ label, color: newColor });
		setNewLabel("");
	};

	const startEdit = (tag: TaskTag) => {
		setEditingTagId(tag.id);
		setEditLabel(tag.label);
		setEditColor(tag.color);
	};

	const saveEdit = () => {
		const label = editLabel.trim();
		if (!label || !editingTagId) {
			return;
		}
		onUpdateTag(editingTagId, { label, color: editColor });
		resetEditing();
	};

	const cancelEdit = () => {
		resetEditing();
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange} contentClassName="max-w-md">
			<DialogHeader title="Manage tags" icon={<Tags size={16} />} />
			<DialogBody>
				<div className="flex flex-col gap-1.5">
					{tags.length === 0 ? (
						<p className="m-0 text-xs text-text-tertiary">No tags yet. Create one below.</p>
					) : (
						tags.map((tag) => {
							const isEditing = editingTagId === tag.id;
							return isEditing ? (
								<div
									key={tag.id}
									className="flex flex-col gap-2 rounded-md border border-border-focus bg-surface-2 p-2"
								>
									<ColorSwatchPicker value={editColor} onChange={setEditColor} />
									<div className="flex items-center gap-2">
										<input
											value={editLabel}
											onChange={(event) => setEditLabel(event.currentTarget.value)}
											onKeyDown={(event) => {
												if (event.key === "Enter") {
													saveEdit();
												}
											}}
											autoFocus
											className="h-7 min-w-0 flex-1 rounded-md border border-border bg-surface-1 px-2 text-sm text-text-primary focus:outline-none"
										/>
										<Button variant="primary" size="sm" onClick={saveEdit} disabled={!editLabel.trim()}>
											Save
										</Button>
										<Button variant="ghost" size="sm" onClick={cancelEdit}>
											Cancel
										</Button>
									</div>
								</div>
							) : (
								<div
									key={tag.id}
									className="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-2 py-1.5"
								>
									<span
										className="h-3 w-3 shrink-0 rounded-full"
										style={{ backgroundColor: tag.color }}
									/>
									<span className="min-w-0 flex-1 truncate text-sm text-text-primary">{tag.label}</span>
									<Button
										variant="ghost"
										size="sm"
										icon={<Pencil size={14} />}
										aria-label={`Edit ${tag.label}`}
										title="Edit tag"
										onClick={() => startEdit(tag)}
									/>
									<Button
										variant="ghost"
										size="sm"
										icon={<Trash2 size={14} />}
										aria-label={`Delete ${tag.label}`}
										title="Delete tag"
										className="text-text-tertiary hover:text-status-red"
										onClick={() => onDeleteTag(tag.id)}
									/>
								</div>
							);
						})
					)}
				</div>

				<div className="my-3 h-px bg-border" />

				<div className="flex flex-col gap-2">
					<p className="m-0 flex items-center gap-1.5 text-xs font-medium text-text-secondary">
						<Plus size={14} /> New tag
					</p>
					<ColorSwatchPicker value={newColor} onChange={setNewColor} />
					<div className="flex items-center gap-2">
						<input
							value={newLabel}
							onChange={(event) => setNewLabel(event.currentTarget.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									handleAdd();
								}
							}}
							placeholder="Label (e.g. bug)"
							className="h-7 min-w-0 flex-1 rounded-md border border-border bg-surface-1 px-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
						/>
						<Button variant="primary" size="sm" onClick={handleAdd} disabled={!newLabel.trim()}>
							Add
						</Button>
					</div>
				</div>
			</DialogBody>
		</Dialog>
	);
}
