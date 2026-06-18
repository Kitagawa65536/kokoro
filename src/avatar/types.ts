export type MouthSpriteState = "closed" | "half" | "open";

export interface MouthConfig {
	x: number;
	y: number;
	scale: number;
	halfThreshold: number;
	openThreshold: number;
	closedSrc: string;
	halfSrc: string;
	openSrc: string;
}

export interface TtsSettings {
	ttsEndpoint: string;
	apiKey: string;
	ttsModel: string;
	voice: string;
	allowedOrigins: string[];
	characterUrl: string;
}

export interface AvatarRuntimeState {
	expression: string;
	mouthConfig: MouthConfig;
	isSpeaking: boolean;
	lastError: string | null;
}

export interface KokoroMessage {
	type: string;
	text?: unknown;
	expression?: unknown;
	config?: unknown;
}
