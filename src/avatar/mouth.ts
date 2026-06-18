import type { MouthConfig, MouthSpriteState } from "./types";

export const DEFAULT_MOUTH_CONFIG: MouthConfig = {
	x: 0,
	y: 0,
	scale: 1,
	halfThreshold: 0.15,
	openThreshold: 0.35,
	closedSrc: "/mouth/closed.png",
	halfSrc: "/mouth/half.png",
	openSrc: "/mouth/open.png",
};

export function normalizeMouthConfig(config: Partial<MouthConfig>): MouthConfig {
	return {
		...DEFAULT_MOUTH_CONFIG,
		...config,
		halfThreshold: toFiniteNumber(
			config.halfThreshold,
			DEFAULT_MOUTH_CONFIG.halfThreshold,
		),
		openThreshold: toFiniteNumber(
			config.openThreshold,
			DEFAULT_MOUTH_CONFIG.openThreshold,
		),
		x: toFiniteNumber(config.x, DEFAULT_MOUTH_CONFIG.x),
		y: toFiniteNumber(config.y, DEFAULT_MOUTH_CONFIG.y),
		scale: toFiniteNumber(config.scale, DEFAULT_MOUTH_CONFIG.scale),
	};
}

export function mergeMouthConfig(
	base: MouthConfig,
	patch: Partial<MouthConfig>,
): MouthConfig {
	return normalizeMouthConfig({ ...base, ...patch });
}

export function mouthStateFromLevel(
	level: number,
	config: MouthConfig,
): MouthSpriteState {
	if (level >= config.openThreshold) return "open";
	if (level >= config.halfThreshold) return "half";
	return "closed";
}

function toFiniteNumber(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
