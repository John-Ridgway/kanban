import { Settings2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TagPill } from "@/components/tag-pill";
import type { TaskTag } from "@/types";

interface TaskTagsRowProps {
	cardTagIds: string[];
	tags: TaskTag[];
	onToggleTag: (tagId: string) => void;
	onManageTags: () => void;
}

export function TaskTagsRow({ cardTagIds, tags, onToggleTag, onManageTags }: TaskTagsRowProps): React.ReactElement {
	return (
		<div className="flex flex-wrap items-center gap-1 border-b border-border px-2 py-1.5">
			{tags.map((tag) => {
				const active = cardTagIds.includes(tag.id);
				return (
					<button
						key={tag.id}
						type="button"
						onClick={() => onToggleTag(tag.id)}
						aria-pressed={active}
						className="rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
						title={active ? `Remove ${tag.label}` : `Add ${tag.label}`}
					>
						<TagPill label={tag.label} color={tag.color} active={active} />
					</button>
				);
			})}
			<Button
				variant="ghost"
				size="sm"
				icon={<Settings2 size={14} />}
				onClick={onManageTags}
				aria-label="Manage tags"
				title="Manage tags"
			/>
		</div>
	);
}
