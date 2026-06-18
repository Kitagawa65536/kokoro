import { drawPNG, lerpPose, type Pose, Rig, setupCanvas } from "@kokoro/rig";
import { DEPTH_TEMPLATE, getDepth } from "@kokoro/rig/depth";
import gsap from "gsap";
import * as PIXI from "pixi.js";
import { Viewport } from "pixi-viewport";
import { mergeMouthConfig, mouthStateFromLevel } from "./mouth";
import type { MouthConfig, MouthSpriteState } from "./types";

export class AvatarView {
	private app: PIXI.Application | null = null;
	private viewport: Viewport | null = null;
	private root: Rig | null = null;
	private depthTemplate: {
		left: Pose;
		right: Pose;
		up: Pose;
		down: Pose;
	} | null = null;
	private readonly pointer = { x: 0.5, y: 0.5 };
	private mouthLevel = 0;
	private mouthConfig: MouthConfig;
	private mouthSprites = new Map<MouthSpriteState, PIXI.Sprite>();
	private activeMouthState: MouthSpriteState = "closed";
	private readonly handleResize = () => this.resizeViewport();

	private readonly mount: HTMLElement;
	private readonly onStatus: (message: string) => void;

	constructor(
		mount: HTMLElement,
		mouthConfig: MouthConfig,
		onStatus: (message: string) => void,
	) {
		this.mount = mount;
		this.mouthConfig = mouthConfig;
		this.onStatus = onStatus;
	}

	async init(characterUrl: string): Promise<void> {
		const { container, root, bounds } = await loadCharacter(characterUrl);
		this.root = root;
		this.app = await setupCanvas(this.mount);
		const size = getViewportSize(this.mount);
		this.viewport = new Viewport({
			screenWidth: size.width,
			screenHeight: size.height,
			worldWidth: bounds.width,
			worldHeight: bounds.height,
			events: this.app.renderer.events,
		});

		this.app.stage.addChild(this.viewport);
		this.viewport.drag().pinch().wheel();
		normalizeContainerOrigin(container, bounds);
		this.viewport.addChild(container);
		this.resizeViewport();
		window.addEventListener("resize", this.handleResize);

		const { sampleDepth } = await getDepth(container, this.app.renderer);
		this.depthTemplate = DEPTH_TEMPLATE(sampleDepth, 80, 80);
		await this.loadMouthSprites();
		this.registerPointer();
		this.app.ticker.add(() => this.tick());
	}

	setMouthConfig(config: Partial<MouthConfig>): MouthConfig {
		this.mouthConfig = mergeMouthConfig(this.mouthConfig, config);
		for (const sprite of this.mouthSprites.values()) {
			applyMouthConfig(sprite, this.mouthConfig);
		}
		return this.mouthConfig;
	}

	setMouthLevel(level: number): void {
		this.mouthLevel = Math.max(0, Math.min(1, level));
	}

	setExpression(name: string): void {
		this.onStatus(`Expression: ${name}`);
	}

	private async loadMouthSprites(): Promise<void> {
		if (!this.viewport) return;

		const sources: Record<MouthSpriteState, string> = {
			closed: this.mouthConfig.closedSrc,
			half: this.mouthConfig.halfSrc,
			open: this.mouthConfig.openSrc,
		};

		for (const [state, src] of Object.entries(sources) as Array<
			[MouthSpriteState, string]
		>) {
			try {
				const texture = await PIXI.Assets.load<PIXI.Texture>(src);
				const sprite = new PIXI.Sprite(texture);
				sprite.anchor.set(0.5);
				applyMouthConfig(sprite, this.mouthConfig);
				sprite.visible = state === "closed";
				this.viewport.addChild(sprite);
				this.mouthSprites.set(state, sprite);
			} catch (error) {
				console.warn(`Mouth sprite is unavailable: ${src}`, error);
				const sprite = createFallbackMouthSprite(state);
				applyMouthConfig(sprite, this.mouthConfig);
				sprite.visible = state === "closed";
				this.viewport.addChild(sprite);
				this.mouthSprites.set(state, sprite);
			}
		}
	}

	private registerPointer(): void {
		window.addEventListener("mousemove", (event) => {
			gsap.to(this.pointer, {
				x: event.clientX / window.innerWidth,
				y: event.clientY / window.innerHeight,
				duration: 0.5,
				ease: "sine.out",
			});
		});
	}

	private tick(): void {
		if (!this.root || !this.depthTemplate) return;

		const rootPoses = [
			lerpPose(
				this.depthTemplate.left,
				this.depthTemplate.right,
				this.pointer.x,
			),
			lerpPose(this.depthTemplate.up, this.depthTemplate.down, this.pointer.y),
		];
		this.root.apply(rootPoses);
		this.syncMouth();
	}

	private syncMouth(): void {
		const state = mouthStateFromLevel(this.mouthLevel, this.mouthConfig);
		if (state === this.activeMouthState) return;

		this.activeMouthState = state;
		for (const [spriteState, sprite] of this.mouthSprites) {
			sprite.visible = spriteState === state;
		}
	}

	private resizeViewport(): void {
		if (!this.viewport) return;

		const size = getViewportSize(this.mount);
		this.viewport.resize(size.width, size.height);
		this.viewport.fitWorld(false);
		this.viewport.moveCenter(
			this.viewport.worldWidth / 2,
			this.viewport.worldHeight / 2,
		);
	}
}

async function loadCharacter(characterUrl: string) {
	try {
		const nodes = await drawPNG(characterUrl);
		const container = new PIXI.Container();
		for (const node of nodes) container.addChild(node.container);
		return {
			container,
			root: new Rig(nodes),
			bounds: container.getLocalBounds(),
		};
	} catch (error) {
		console.warn(
			`Character image could not be loaded from ${characterUrl}. Falling back to a generated placeholder.`,
			error,
		);
		const nodes = await drawPNG(createFallbackCharacterUrl());
		const container = new PIXI.Container();
		for (const node of nodes) container.addChild(node.container);
		return {
			container,
			root: new Rig(nodes),
			bounds: container.getLocalBounds(),
		};
	}
}

function normalizeContainerOrigin(
	container: PIXI.Container,
	bounds: PIXI.Bounds,
): void {
	container.x = -bounds.x;
	container.y = -bounds.y;
}

function applyMouthConfig(sprite: PIXI.Sprite, config: MouthConfig): void {
	sprite.x = config.x;
	sprite.y = config.y;
	sprite.scale.set(config.scale);
}

function createFallbackMouthSprite(state: MouthSpriteState): PIXI.Sprite {
	const canvas = document.createElement("canvas");
	canvas.width = 320;
	canvas.height = 180;
	const ctx = canvas.getContext("2d");
	if (ctx) {
		ctx.fillStyle = state === "closed" ? "rgba(43, 20, 20, 0.8)" : "#2b1414";
		ctx.beginPath();
		ctx.ellipse(160, 90, 110, fallbackMouthHeight(state), 0, 0, Math.PI * 2);
		ctx.fill();
	}
	const texture = PIXI.Texture.from(canvas);
	const sprite = new PIXI.Sprite(texture);
	sprite.anchor.set(0.5);
	return sprite;
}

function fallbackMouthHeight(state: MouthSpriteState): number {
	switch (state) {
		case "open":
			return 48;
		case "half":
			return 26;
		case "closed":
			return 7;
	}
}

function getViewportSize(mount: HTMLElement): {
	width: number;
	height: number;
} {
	const rect = mount.getBoundingClientRect();
	return {
		width: Math.max(1, Math.round(rect.width || window.innerWidth)),
		height: Math.max(1, Math.round(rect.height || window.innerHeight)),
	};
}

function createFallbackCharacterUrl(): string {
	const canvas = document.createElement("canvas");
	canvas.width = 700;
	canvas.height = 900;
	const ctx = canvas.getContext("2d");
	if (!ctx) return "";

	ctx.clearRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = "#f4d9c8";
	ctx.beginPath();
	ctx.arc(350, 280, 170, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillStyle = "#6b4a3a";
	ctx.beginPath();
	ctx.arc(350, 270, 190, Math.PI, Math.PI * 2);
	ctx.fill();
	ctx.fillStyle = "#2f2523";
	ctx.beginPath();
	ctx.arc(295, 270, 16, 0, Math.PI * 2);
	ctx.arc(405, 270, 16, 0, Math.PI * 2);
	ctx.fill();
	ctx.strokeStyle = "#9c5d5d";
	ctx.lineWidth = 8;
	ctx.beginPath();
	ctx.moveTo(310, 365);
	ctx.quadraticCurveTo(350, 390, 390, 365);
	ctx.stroke();
	ctx.fillStyle = "#c6d4f0";
	ctx.beginPath();
	ctx.roundRect(200, 470, 300, 360, 80);
	ctx.fill();

	return canvas.toDataURL("image/png");
}
