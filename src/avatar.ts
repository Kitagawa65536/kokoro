import { AudioMouthAnalyzer } from "./avatar/audio-mouth-analyzer";
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
	private activeAudio: HTMLAudioElement | null = null;
	private animationFrame = 0;

	constructor(mount: HTMLElement, status: HTMLElement | null = null) {
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
		await this.view.init(this.settings.characterUrl);
		const controller = new AvatarMessageController(
			this,
			this.settings.allowedOrigins,
		);
		controller.start();
		this.startMouthLoop();
		this.setStatus("Ready");
	}

	async speak(text: string): Promise<void> {
		const input = text.trim();
		if (!input) return;

		this.stop();
		this.setStatus("Synthesizing speech...");

		try {
			const blob = await this.speechRepository.synthesize(input, this.settings);
			this.activeAudio = await this.mouthAnalyzer.play(blob);
			this.state.isSpeaking = true;
			this.setStatus("Speaking");
			this.activeAudio.addEventListener(
				"ended",
				() => {
					this.state.isSpeaking = false;
					this.view.setMouthLevel(0);
					this.setStatus("Ready");
				},
				{ once: true },
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.state.lastError = message;
			this.state.isSpeaking = false;
			this.view.setMouthLevel(0);
			this.setStatus(`TTS error: ${message}`);
			throw error;
		}
	}

	stop(): void {
		this.mouthAnalyzer.stop();
		this.activeAudio = null;
		this.state.isSpeaking = false;
		this.view.setMouthLevel(0);
		this.setStatus("Stopped");
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
	}
}

const mount = document.getElementById("avatar-root") ?? document.body;
const status = document.getElementById("status");
const avatar = new KokoroTalkAvatar(mount, status);

void avatar.init().catch((error) => {
	const message = error instanceof Error ? error.message : String(error);
	if (status) status.textContent = `Failed to initialize: ${message}`;
	console.error(error);
});

Object.assign(window, { KokoroTalkAvatar: avatar });
