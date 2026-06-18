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

	async play(blob: Blob): Promise<{
		audio: HTMLAudioElement;
		playback: Promise<void>;
	}> {
		this.stop();
		await this.audioContext.resume();

		const objectUrl = URL.createObjectURL(blob);
		const audio = new Audio(objectUrl);
		audio.crossOrigin = "anonymous";
		this.mediaSource = this.audioContext.createMediaElementSource(audio);
		this.mediaSource.connect(this.analyser);
		this.analyser.connect(this.audioContext.destination);
		this.currentAudio = audio;

		audio.addEventListener(
			"ended",
			() => {
				URL.revokeObjectURL(objectUrl);
			},
			{ once: true },
		);

		const playback = audio.play();
		return { audio, playback };
	}

	stop(): void {
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
}
