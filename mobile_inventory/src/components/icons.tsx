// Inline icon set (no icon dependency).
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Base({ children, ...props }: IconProps & { children: React.ReactNode }) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={1.8}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			{...props}
		>
			{children}
		</svg>
	);
}

export const ScanIcon = (props: IconProps) => (
	<Base {...props}>
		<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
		<path d="M4 12h16" />
	</Base>
);

export const BoxIcon = (props: IconProps) => (
	<Base {...props}>
		<path d="M12 3 3 7.5v9L12 21l9-4.5v-9L12 3Z" />
		<path d="m3 7.5 9 4.5 9-4.5M12 12v9" />
	</Base>
);

export const InIcon = (props: IconProps) => (
	<Base {...props}>
		<path d="M12 4v11" />
		<path d="m7 10 5 5 5-5" />
		<path d="M5 20h14" />
	</Base>
);

export const OutIcon = (props: IconProps) => (
	<Base {...props}>
		<path d="M12 20V9" />
		<path d="m7 14 5-5 5 5" />
		<path d="M5 4h14" />
	</Base>
);

export const SwapIcon = (props: IconProps) => (
	<Base {...props}>
		<path d="M4 8h13l-3-3M20 16H7l3 3" />
	</Base>
);

export const CountIcon = (props: IconProps) => (
	<Base {...props}>
		<rect x="4" y="4" width="16" height="16" rx="3" />
		<path d="m8 12 3 3 5-6" />
	</Base>
);

export const QueueIcon = (props: IconProps) => (
	<Base {...props}>
		<path d="M4 7h16M4 12h16M4 17h10" />
		<circle cx="18.5" cy="17" r="2" />
	</Base>
);

export const SettingsIcon = (props: IconProps) => (
	<Base {...props}>
		<circle cx="12" cy="12" r="3" />
		<path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.64 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.64 1.7 1.7 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z" />
	</Base>
);

export const CloseIcon = (props: IconProps) => (
	<Base {...props}>
		<path d="m6 6 12 12M18 6 6 18" />
	</Base>
);

export const BackIcon = (props: IconProps) => (
	<Base {...props}>
		<path d="M15 5l-7 7 7 7" />
	</Base>
);

export const CheckIcon = (props: IconProps) => (
	<Base {...props}>
		<path d="m5 13 4 4L19 7" />
	</Base>
);

export const AlertIcon = (props: IconProps) => (
	<Base {...props}>
		<path d="M12 4 3 20h18L12 4Z" />
		<path d="M12 10v4M12 17.5v.5" />
	</Base>
);

export const TrashIcon = (props: IconProps) => (
	<Base {...props}>
		<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13h10l1-13" />
	</Base>
);

export const RefreshIcon = (props: IconProps) => (
	<Base {...props}>
		<path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5" />
	</Base>
);

export const SearchIcon = (props: IconProps) => (
	<Base {...props}>
		<circle cx="11" cy="11" r="7" />
		<path d="m20 20-3.5-3.5" />
	</Base>
);

export const WifiOffIcon = (props: IconProps) => (
	<Base {...props}>
		<path d="M3 3l18 18M9 17.5a4 4 0 0 1 6 0M5.5 13.5a9 9 0 0 1 4-2.3M2 9a15 15 0 0 1 5-3M22 9a15 15 0 0 0-7.4-3.7" />
		<circle cx="12" cy="20" r=".6" fill="currentColor" />
	</Base>
);

export const CloudIcon = (props: IconProps) => (
	<Base {...props}>
		<path d="M7 18a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 17.5 9.5 3.5 3.5 0 0 1 17 18H7Z" />
	</Base>
);

export const ChevronIcon = (props: IconProps) => (
	<Base {...props}>
		<path d="m9 6 6 6-6 6" />
	</Base>
);
