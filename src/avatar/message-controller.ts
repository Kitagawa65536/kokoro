import type { KokoroTalkAvatar } from "../avatar";
import type { KokoroMessage } from "./types";

export class AvatarMessageController {
	private readonly avatar: KokoroTalkAvatar;
	private readonly allowedOrigins: string[];

	constructor(avatar: KokoroTalkAvatar, allowedOrigins: string[]) {
		this.avatar = avatar;
		this.allowedOrigins = allowedOrigins;
	}

	start(): void {
		window.addEventListener("message", (event) => {
			if (!this.isAllowed(event.origin)) {
				console.warn(`Blocked kokoro avatar message from ${event.origin}`);
				return;
			}

			const data = event.data as KokoroMessage;
			void this.handle(data);
		});
	}

	private async handle(message: KokoroMessage): Promise<void> {
		switch (message.type) {
			case "kokoro:speak":
				if (typeof message.text === "string" && message.text.trim()) {
					await this.avatar.speak(message.text);
				}
				break;
			case "kokoro:stop":
				this.avatar.stop();
				break;
			case "kokoro:setExpression":
				if (typeof message.expression === "string") {
					this.avatar.setExpression(message.expression);
				}
				break;
			case "kokoro:setMouthConfig":
				if (isRecord(message.config)) {
					this.avatar.setMouthConfig(message.config);
				}
				break;
			default:
				break;
		}
	}

	private isAllowed(origin: string): boolean {
		return (
			this.allowedOrigins.length === 0 ||
			this.allowedOrigins.includes("*") ||
			this.allowedOrigins.includes(origin)
		);
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
