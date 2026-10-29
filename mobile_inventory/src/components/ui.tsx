import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: Variant;
	block?: boolean;
	loading?: boolean;
	icon?: ReactNode;
}

export function Button({
	variant = "primary",
	block,
	loading,
	icon,
	className = "",
	children,
	disabled,
	...props
}: ButtonProps) {
	return (
		<button
			className={`btn btn--${variant}${block ? " btn--block" : ""}${className ? ` ${className}` : ""}`}
			disabled={disabled || loading}
			{...props}
		>
			{loading ? <span className="spinner spinner--sm" aria-hidden="true" /> : icon}
			<span>{children}</span>
		</button>
	);
}

export function Field({
	label,
	hint,
	error,
	children,
}: {
	label: string;
	hint?: string;
	error?: string | null;
	children: ReactNode;
}) {
	return (
		<label className="field">
			<span className="field__label">{label}</span>
			{children}
			{error ? (
				<span className="field__error" role="alert">
					{error}
				</span>
			) : hint ? (
				<span className="field__hint">{hint}</span>
			) : null}
		</label>
	);
}

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
	invalid?: boolean;
}

export function TextInput({ invalid, className = "", ...props }: TextInputProps) {
	return (
		<input
			className={`input${invalid ? " input--invalid" : ""}${className ? ` ${className}` : ""}`}
			{...props}
		/>
	);
}

export function Select({
	invalid,
	className = "",
	children,
	...props
}: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
	return (
		<select
			className={`input select${invalid ? " input--invalid" : ""}${className ? ` ${className}` : ""}`}
			{...props}
		>
			{children}
		</select>
	);
}

export function Spinner({ label }: { label?: string }) {
	return (
		<div className="center-block">
			<span className="spinner" aria-hidden="true" />
			{label ? <span className="muted">{label}</span> : null}
		</div>
	);
}

export function Pill({
	tone = "neutral",
	children,
}: {
	tone?: "neutral" | "success" | "warn" | "danger" | "info";
	children: ReactNode;
}) {
	return <span className={`pill pill--${tone}`}>{children}</span>;
}

export function EmptyState({ title, hint, icon }: { title: string; hint?: string; icon?: ReactNode }) {
	return (
		<div className="empty">
			{icon ? <div className="empty__icon">{icon}</div> : null}
			<strong>{title}</strong>
			{hint ? <p className="muted">{hint}</p> : null}
		</div>
	);
}

export function Rows({ children }: { children: ReactNode }) {
	return <div className="rows">{children}</div>;
}

export function Row({
	leading,
	title,
	subtitle,
	trailing,
	onClick,
}: {
	leading?: ReactNode;
	title: ReactNode;
	subtitle?: ReactNode;
	trailing?: ReactNode;
	onClick?: () => void;
}) {
	const content = (
		<>
			{leading ? <div className="row__leading">{leading}</div> : null}
			<div className="row__body">
				<div className="row__title">{title}</div>
				{subtitle ? <div className="row__subtitle">{subtitle}</div> : null}
			</div>
			{trailing ? <div className="row__trailing">{trailing}</div> : null}
		</>
	);
	if (onClick) {
		return (
			<button type="button" className="row row--button" onClick={onClick}>
				{content}
			</button>
		);
	}
	return <div className="row">{content}</div>;
}
