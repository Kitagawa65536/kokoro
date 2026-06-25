import {
	formatAudioLogError,
	logAudioLinkage,
} from "./audio-linkage-logger";
import type { TtsSettings } from "./types";

export class OpenAiSpeechRepository {
	async synthesize(text: string, settings: TtsSettings): Promise<Blob> {
		const endpoint = normalizeSpeechEndpoint(settings.ttsEndpoint);
		const headers = new Headers({ "Content-Type": "application/json" });
		const abortController = new AbortController();
		const timeout = window.setTimeout(() => abortController.abort(), 60000);
		if (settings.apiKey) {
			headers.set("Authorization", `Bearer ${settings.apiKey}`);
		}

		try {
			console.info(`Requesting TTS from ${endpoint}`);
			logAudioLinkage("tts.request.start", {
				endpoint,
				model: settings.ttsModel,
				voice: settings.voice,
				responseFormat: settings.responseFormat,
				inputLength: text.length,
				hasApiKey: settings.apiKey.length > 0,
			});
			const response = await fetch(endpoint, {
				method: "POST",
				headers,
				signal: abortController.signal,
				body: JSON.stringify({
					model: settings.ttsModel,
					voice: settings.voice,
					input: text,
					response_format: settings.responseFormat,
				}),
			});
			console.info(`TTS response: ${response.status} ${response.statusText}`);
			logAudioLinkage("tts.response.headers", {
				status: response.status,
				statusText: response.statusText,
				contentType: response.headers.get("content-type"),
				contentLength: response.headers.get("content-length"),
			});

			if (!response.ok) {
				const body = await response.text().catch(() => "");
				logAudioLinkage("tts.response.error-body", {
					status: response.status,
					statusText: response.statusText,
					body: body.slice(0, 1000),
				});
				throw new Error(
					`TTS request failed: ${response.status} ${response.statusText} ${body}`,
				);
			}

			const audioBytes = await response.arrayBuffer();
			const contentType = response.headers.get("content-type") ?? "audio/mpeg";
			logAudioLinkage("tts.response.audio-bytes", {
				byteLength: audioBytes.byteLength,
				contentType,
			});
			return new Blob([audioBytes], { type: contentType });
		} catch (error) {
			const message = formatAudioLogError(error);
			logAudioLinkage("tts.request.error", { endpoint, message });
			throw error;
		} finally {
			window.clearTimeout(timeout);
		}
	}
}

export function normalizeSpeechEndpoint(endpoint: string): string {
	const trimmed = endpoint.trim().replace(/\/+$/, "");
	if (!trimmed) return "/v1/audio/speech";
	if (trimmed.endsWith("/v1/audio/speech")) return trimmed;
	if (trimmed.endsWith("/audio/speech")) return trimmed;
	if (trimmed.endsWith("/v1")) return `${trimmed}/audio/speech`;
	return `${trimmed}/v1/audio/speech`;
}
