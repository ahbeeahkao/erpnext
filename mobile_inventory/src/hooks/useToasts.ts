import { useCallback, useRef, useState } from "react";

export type ToastTone = "info" | "success" | "error";

export interface Toast {
	id: number;
	message: string;
	tone: ToastTone;
}

export type Notify = (message: string, tone?: ToastTone) => void;

export function useToasts(): { toasts: Toast[]; notify: Notify; dismiss: (id: number) => void } {
	const [toasts, setToasts] = useState<Toast[]>([]);
	const counter = useRef(0);

	const dismiss = useCallback((id: number) => {
		setToasts((list) => list.filter((toast) => toast.id !== id));
	}, []);

	const notify = useCallback<Notify>(
		(message, tone = "info") => {
			const id = ++counter.current;
			setToasts((list) => [...list.slice(-2), { id, message, tone }]);
			window.setTimeout(() => dismiss(id), tone === "error" ? 6500 : 3200);
		},
		[dismiss]
	);

	return { toasts, notify, dismiss };
}
