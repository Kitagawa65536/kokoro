import {
	formatAudioLogError,
	logAudioLinkage,
} from "./audio-linkage-logger";

export class AudioMouthAnalyzer {
	private readonly audioContext = new AudioContext();
	private readonly analyser = this.audioContext.createAnalyser();
	private readonly samples: Uint8Array<ArrayBuffer>;
	private mediaSource: MediaElementAudioSourceNode | null = null;
	private currentAudio: HTMLAudioElement | null = null;

	constructor() {
		this.analyser.fftSize = 512;
		this.samples = new Uint8Array(
			new ArrayBuffer(this.analyser.frequencyBinCount),
		);
	}

	unlock(): void {
		logAudioLinkage("audio-context.unlock.request", {
			state: this.audioContext.state,
		});
		if (this.audioContext.state === "closed") return;
		void this.audioContext
			.resume()
			.then(() => {
				logAudioLinkage("audio-context.unlock.resolved", {
					state: this.audioContext.state,
				});
			})
			.catch((error) => {
				const message = formatAudioLogError(error);
				logAudioLinkage("audio-context.unlock.error", { message });
				console.warn("AudioContext unlock failed.", error);
			});
	}

	async play(blob: Blob): Promise<{
		audio: HTMLAudioElement;
		playback: Promise<void>;
	}> {
		logAudioLinkage("audio.play.prepare", {
			size: blob.size,
			type: blob.type,
			audioContextState: this.audioContext.state,
		});
		this.stop();
		this.resumeAudioContext();

		const objectUrl = URL.createObjectURL(blob);
		const audio = new Audio(objectUrl);
		audio.crossOrigin = "anonymous";
		audio.preload = "auto";
		this.mediaSource = this.audioContext.createMediaElementSource(audio);
		this.mediaSource.connect(this.analyser);
		this.analyser.connect(this.audioContext.destination);
		this.currentAudio = audio;
		logAudioLinkage("audio.play.element-created", {
			readyState: audio.readyState,
			networkState: audio.networkState,
			audioContextState: this.audioContext.state,
		});

		const revokeObjectUrl = () => URL.revokeObjectURL(objectUrl);
		audio.addEventListener("ended", revokeObjectUrl, { once: true });
		audio.addEventListener("error", revokeObjectUrl, { once: true });

		const playback = audio.play();
		return { audio, playback };
	}

	stop(): void {
		if (this.currentAudio || this.mediaSource) {
			logAudioLinkage("audio.stop", {
				hadAudio: this.currentAudio !== null,
				hadMediaSource: this.mediaSource !== null,
				audioContextState: this.audioContext.state,
			});
		}
		if (this.currentAudio) {
			this.currentAudio.pause();
			this.currentAudio.currentTime = 0;
			this.currentAudio = null;
		}

		if (this.mediaSource) {
			this.mediaSource.disconnect();
			this.mediaSource = null;
		}
	}

	readLevel(): number {
		if (
			!this.currentAudio ||
			this.currentAudio.paused ||
			this.currentAudio.ended
		) {
			return 0;
		}

		this.analyser.getByteTimeDomainData(this.samples);
		let sum = 0;
		for (const sample of this.samples) {
			const centered = (sample - 128) / 128;
			sum += centered * centered;
		}

		return Math.min(1, Math.sqrt(sum / this.samples.length) * 4);
	}

	private resumeAudioContext(): void {
		logAudioLinkage("audio-context.resume.check", {
			state: this.audioContext.state,
		});
		if (this.audioContext.state !== "suspended") return;

		void this.audioContext
			.resume()
			.then(() => {
				logAudioLinkage("audio-context.resume.resolved", {
					state: this.audioContext.state,
				});
			})
			.catch((error) => {
				const message = formatAudioLogError(error);
				logAudioLinkage("audio-context.resume.error", { message });
				console.warn("AudioContext resume failed.", error);
			});
	}
}
