import { AudioMouthAnalyzer } from "./avatar/audio-mouth-analyzer";
import {
	formatAudioLogError,
	logAudioLinkage,
} from "./avatar/audio-linkage-logger";
import { AvatarView } from "./avatar/avatar-view";
import { AvatarMessageController } from "./avatar/message-controller";
import { mergeMouthConfig } from "./avatar/mouth";
import { AvatarSettingsRepository } from "./avatar/settings-repository";
import { OpenAiSpeechRepository } from "./avatar/tts-repository";
import type {
	AvatarRuntimeState,
	MouthConfig,
	TtsSettings,
} from "./avatar/types";

export class KokoroTalkAvatar {
	private readonly settingsRepository = new AvatarSettingsRepository();
	private readonly speechRepository = new OpenAiSpeechRepository();
	private readonly mouthAnalyzer = new AudioMouthAnalyzer();
	private readonly view: AvatarView;
	private settings: TtsSettings;
	private state: AvatarRuntimeState;
	private lastSpeechBlob: Blob | null = null;
	private animationFrame = 0;
	private readonly status: HTMLElement | null;

	constructor(mount: HTMLElement, status: HTMLElement | null = null) {
		this.status = status;
		this.settings = this.settingsRepository.getTtsSettings();
		this.state = {
			expression: "neutral",
			mouthConfig: this.settingsRepository.getMouthConfig(),
			isSpeaking: false,
			lastError: null,
		};
		this.view = new AvatarView(mount, this.state.mouthConfig, (message) => {
			if (status) status.textContent = message;
		});
	}

	async init(): Promise<void> {
		logAudioLinkage("avatar.init.start", {
			characterUrl: this.settings.characterUrl,
			ttsEndpoint: this.settings.ttsEndpoint,
			ttsModel: this.settings.ttsModel,
			voice: this.settings.voice,
			responseFormat: this.settings.responseFormat,
		});
		await this.view.init(this.settings.characterUrl);
		const controller = new AvatarMessageController(
			this,
			this.settings.allowedOrigins,
		);
		controller.start();
		this.startMouthLoop();
		this.setStatus("Ready");
		logAudioLinkage("avatar.init.ready");
	}

	async speak(text: string): Promise<void> {
		const input = text.trim();
		if (!input) return;

		logAudioLinkage("avatar.speak.request", {
			textLength: input.length,
			ttsEndpoint: this.settings.ttsEndpoint,
			ttsModel: this.settings.ttsModel,
			voice: this.settings.voice,
			responseFormat: this.settings.responseFormat,
		});
		this.stop();
		this.setStatus("Synthesizing speech...");

		try {
			const blob = await this.speechRepository.synthesize(input, this.settings);
			this.lastSpeechBlob = blob;
			logAudioLinkage("avatar.speak.blob-ready", {
				size: blob.size,
				type: blob.type,
			});
			this.setStatus(`Preparing audio (${formatBytes(blob.size)})...`);
			await this.playSpeechBlob(blob);
		} catch (error) {
			const message = formatAudioLogError(error);
			logAudioLinkage("avatar.speak.error", { message });
			this.state.lastError = message;
			this.state.isSpeaking = false;
			this.view.setMouthLevel(0);
			this.setStatus(`TTS error: ${message}`);
			throw error;
		}
	}

	stop(): void {
		logAudioLinkage("avatar.stop", { wasSpeaking: this.state.isSpeaking });
		this.mouthAnalyzer.stop();
		this.state.isSpeaking = false;
		this.view.setMouthLevel(0);
		document.body.classList.remove("audio-pending");
		this.setStatus("Stopped");
	}

	unlockAudio(): void {
		logAudioLinkage("avatar.unlock-audio");
		this.mouthAnalyzer.unlock();
		this.setStatus("Voice enabled");
		document.body.classList.add("audio-unlocked");
	}

	async replayLastSpeech(): Promise<void> {
		if (!this.lastSpeechBlob) {
			logAudioLinkage("avatar.replay.no-audio");
			this.setStatus("No speech audio is ready.");
			return;
		}

		logAudioLinkage("avatar.replay.start", {
			size: this.lastSpeechBlob.size,
			type: this.lastSpeechBlob.type,
		});
		this.stop();
		this.setStatus("Starting saved speech...");
		await this.playSpeechBlob(this.lastSpeechBlob);
	}

	setExpression(name: string): void {
		this.state.expression = name;
		this.view.setExpression(name);
	}

	setMouthConfig(config: Partial<MouthConfig>): void {
		this.state.mouthConfig = mergeMouthConfig(this.state.mouthConfig, config);
		this.state.mouthConfig = this.view.setMouthConfig(this.state.mouthConfig);
		this.settingsRepository.saveMouthConfig(this.state.mouthConfig);
	}

	private startMouthLoop(): void {
		const step = () => {
			const level = this.state.isSpeaking ? this.mouthAnalyzer.readLevel() : 0;
			this.view.setMouthLevel(level);
			this.animationFrame = window.requestAnimationFrame(step);
		};
		if (this.animationFrame === 0) {
			this.animationFrame = window.requestAnimationFrame(step);
		}
	}

	private setStatus(message: string): void {
		document.body.dataset.avatarStatus = message;
		logAudioLinkage("avatar.status", { message });
		if (this.status) {
			this.status.textContent = message;
		}
		if (window.parent !== window) {
			window.parent.postMessage(
				{ type: "kokoro:status", status: message },
				"*",
			);
		}
	}

	private async playSpeechBlob(blob: Blob): Promise<void> {
		logAudioLinkage("avatar.play.start", {
			size: blob.size,
			type: blob.type,
		});
		document.body.classList.add("audio-pending");
		const { audio, playback } = await this.mouthAnalyzer.play(blob);
		this.setStatus("Starting audio...");

		void playback
			.then(() => {
				logAudioLinkage("avatar.playback.resolved", {
					duration: audio.duration,
					readyState: audio.readyState,
					networkState: audio.networkState,
				});
				document.body.classList.remove("audio-pending");
				this.state.isSpeaking = true;
				this.setStatus("Speaking");
			})
			.catch((error) => {
				const message = formatAudioLogError(error);
				logAudioLinkage("avatar.playback.error", {
					message,
					readyState: audio.readyState,
					networkState: audio.networkState,
				});
				this.state.lastError = message;
				this.state.isSpeaking = false;
				this.view.setMouthLevel(0);
				this.setStatus(`Audio playback error: ${message}`);
			});

		audio.addEventListener(
			"ended",
			() => {
				logAudioLinkage("avatar.audio.ended", {
					duration: audio.duration,
					currentTime: audio.currentTime,
				});
				this.state.isSpeaking = false;
				this.view.setMouthLevel(0);
				document.body.classList.remove("audio-pending");
				this.setStatus("Ready");
			},
			{ once: true },
		);
		audio.addEventListener(
			"error",
			() => {
				logAudioLinkage("avatar.audio.element-error", {
					code: audio.error?.code ?? null,
					message: audio.error?.message ?? null,
					readyState: audio.readyState,
					networkState: audio.networkState,
				});
			},
			{ once: true },
		);
	}
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KiB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

const mount = document.getElementById("avatar-root") ?? document.body;
const status = document.getElementById("status");
const audioUnlock = document.getElementById("audio-unlock");
const audioReplay = document.getElementById("audio-replay");
const avatar = new KokoroTalkAvatar(mount, status);

void avatar.init().catch((error) => {
	const message = formatAudioLogError(error);
	logAudioLinkage("avatar.init.error", { message });
	if (status) status.textContent = `Failed to initialize: ${message}`;
	console.error(error);
});

audioUnlock?.addEventListener("click", () => {
	avatar.unlockAudio();
});

audioReplay?.addEventListener("click", () => {
	void avatar.replayLastSpeech();
});

Object.assign(window, { KokoroTalkAvatar: avatar });
