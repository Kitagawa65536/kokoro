type AudioLogDetails = Record<string, unknown>;

const AUDIO_LOG_ENDPOINT = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/__audio-log`;

export function logAudioLinkage(
	event: string,
	details: AudioLogDetails = {},
): void {
	const entry = {
		at: new Date().toISOString(),
		event,
		details,
		page: window.location.href,
		status: document.body.dataset.avatarStatus ?? null,
	};

	console.info("[audio-linkage]", event, details);

	void fetch(AUDIO_LOG_ENDPOINT, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(entry),
		keepalive: true,
	}).catch((error) => {
		console.warn("Audio linkage log write failed.", error);
	});
}

export function formatAudioLogError(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (error instanceof Event) {
		const target = error.target;
		const targetName =
			target && "constructor" in target
				? target.constructor.name
				: "unknown";
		return `${error.type || "event"} event from ${targetName}`;
	}
	return String(error);
}
