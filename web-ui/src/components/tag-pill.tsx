import { cn } from "@/components/ui/cn";

interface TagPillProps {
	label: string;
	color: string;
	active?: boolean;
	className?: string;
}

function hexToRgb(hex: string): [number, number, number] {
	const normalized = hex.replace(/^#/, "").padEnd(6, "0").slice(0, 6);
	const value = parseInt(normalized, 16);
	const r = (value >> 16) & 255;
	const g = (value >> 8) & 255;
	const b = value & 255;
	return [r, g, b];
}

export function TagPill({ label, color, active = true, className }: TagPillProps) {
	const [r, g, b] = hexToRgb(color);
	const rgb = (alpha: number) => `rgba(${r}, ${g}, ${b}, ${alpha})`;
	const styles = active
		? {
				color,
				backgroundColor: rgb(0.12),
				borderColor: rgb(0.35),
			}
		: {
				color: "var(--color-text-tertiary)",
				backgroundColor: "rgba(110, 118, 129, 0.08)",
				borderColor: "rgba(110, 118, 129, 0.2)",
			};
	return (
		<span
			className={cn(
				"inline-flex max-w-full items-center truncate rounded-md border px-1.5 py-0.5 text-xs leading-none",
				className,
			)}
			style={styles}
		>
			{label}
		</span>
	);
}
