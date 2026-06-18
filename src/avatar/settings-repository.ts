import { DEFAULT_MOUTH_CONFIG, normalizeMouthConfig } from "./mouth";
import type { MouthConfig, TtsSettings } from "./types";

const SETTINGS_KEY = "kokoro.avatar.settings";
const MOUTH_KEY = "kokoro.avatar.mouthConfig";

const DEFAULT_TTS_SETTINGS: TtsSettings = {
	ttsEndpoint: "/irodori-tts/v1/audio/speech",
	apiKey: "",
	ttsModel: "irodori-tts",
	voice: "codex_test_calm_girl",
	responseFormat: "wav",
	allowedOrigins: [],
	characterUrl: "/kokoro/models/character.png",
};

export class AvatarSettingsRepository {
	private readonly storage: Storage;
	private readonly locationSearch: string;

	constructor(
		storage: Storage = window.localStorage,
		locationSearch: string = window.location.search,
	) {
		this.storage = storage;
		this.locationSearch = locationSearch;
	}

	getTtsSettings(): TtsSettings {
		const stored = this.readJson<Partial<TtsSettings>>(SETTINGS_KEY) ?? {};
		const query = new URLSearchParams(this.locationSearch);
		const merged: TtsSettings = {
			...DEFAULT_TTS_SETTINGS,
			...stored,
			ttsEndpoint:
				query.get("ttsEndpoint") ??
				stored.ttsEndpoint ??
				DEFAULT_TTS_SETTINGS.ttsEndpoint,
			apiKey: query.get("apiKey") ?? stored.apiKey ?? "",
			ttsModel:
				query.get("ttsModel") ??
				stored.ttsModel ??
				DEFAULT_TTS_SETTINGS.ttsModel,
			voice: query.get("voice") ?? stored.voice ?? DEFAULT_TTS_SETTINGS.voice,
			responseFormat:
				query.get("responseFormat") ??
				stored.responseFormat ??
				DEFAULT_TTS_SETTINGS.responseFormat,
			characterUrl:
				query.get("characterUrl") ??
				stored.characterUrl ??
				DEFAULT_TTS_SETTINGS.characterUrl,
			allowedOrigins: parseOrigins(
				query.get("allowedOrigins"),
				stored.allowedOrigins,
			),
		};

		this.saveTtsSettings(merged);
		return merged;
	}

	saveTtsSettings(settings: TtsSettings): void {
		this.storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
	}

	getMouthConfig(): MouthConfig {
		const stored = this.readJson<Partial<MouthConfig>>(MOUTH_KEY) ?? {};
		const query = new URLSearchParams(this.locationSearch);
		return normalizeMouthConfig({
			...DEFAULT_MOUTH_CONFIG,
			...stored,
			x: numberParam(query, "mouthX", stored.x ?? DEFAULT_MOUTH_CONFIG.x),
			y: numberParam(query, "mouthY", stored.y ?? DEFAULT_MOUTH_CONFIG.y),
			scale: numberParam(
				query,
				"mouthScale",
				stored.scale ?? DEFAULT_MOUTH_CONFIG.scale,
			),
			halfThreshold: numberParam(
				query,
				"halfThreshold",
				stored.halfThreshold ?? DEFAULT_MOUTH_CONFIG.halfThreshold,
			),
			openThreshold: numberParam(
				query,
				"openThreshold",
				stored.openThreshold ?? DEFAULT_MOUTH_CONFIG.openThreshold,
			),
		});
	}

	saveMouthConfig(config: MouthConfig): void {
		this.storage.setItem(MOUTH_KEY, JSON.stringify(config));
	}

	private readJson<T>(key: string): T | null {
		const value = this.storage.getItem(key);
		if (!value) return null;

		try {
			return JSON.parse(value) as T;
		} catch (error) {
			console.warn(`Failed to parse ${key}; ignoring stored value.`, error);
			return null;
		}
	}
}

function numberParam(
	params: URLSearchParams,
	name: string,
	fallback: number,
): number {
	const value = params.get(name);
	if (value === null) return fallback;

	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function parseOrigins(
	queryValue: string | null,
	storedValue: unknown,
): string[] {
	if (queryValue !== null) {
		return queryValue
			.split(",")
			.map((origin) => origin.trim())
			.filter(Boolean);
	}

	if (Array.isArray(storedValue)) {
		return storedValue.filter(
			(origin): origin is string => typeof origin === "string",
		);
	}

	return [];
}
