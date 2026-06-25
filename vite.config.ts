import type { IncomingMessage } from "node:http";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { defineConfig, type PluginOption } from "vite";

const IRODORI_PROXY_PREFIX = "/irodori-tts";
const AUDIO_LOG_PATH = resolve(
	import.meta.dirname,
	"logs",
	"audio-linkage.log",
);
const AUDIO_LOG_ENDPOINTS = new Set(["/__audio-log", "/kokoro/__audio-log"]);

function irodoriTtsProxy(): PluginOption {
	return {
		name: "irodori-tts-proxy",
		configureServer(server) {
			server.middlewares.use(IRODORI_PROXY_PREFIX, async (req, res) => {
				try {
					const body = await readRequestBody(req);
					const targetPath = req.url ?? "/";
					const upstream = await fetch(`http://127.0.0.1:8088${targetPath}`, {
						method: req.method,
						headers: copyRequestHeaders(req),
						body: body.length > 0 ? body : undefined,
					});
					const buffer = Buffer.from(await upstream.arrayBuffer());
					res.statusCode = upstream.status;
					res.statusMessage = upstream.statusText;
					const contentType = upstream.headers.get("content-type");
					if (contentType) res.setHeader("content-type", contentType);
					res.setHeader("content-length", String(buffer.byteLength));
					res.end(buffer);
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error);
					res.statusCode = 502;
					res.setHeader("content-type", "application/json");
					res.end(JSON.stringify({ error: { message } }));
				}
			});
		},
	};
}

function audioLinkageLogWriter(): PluginOption {
	return {
		name: "audio-linkage-log-writer",
		configureServer(server) {
			server.middlewares.use(async (req, res, next) => {
				const path = new URL(req.url ?? "/", "http://localhost").pathname;
				if (!AUDIO_LOG_ENDPOINTS.has(path)) {
					next();
					return;
				}

				if (req.method !== "POST") {
					res.statusCode = 405;
					res.setHeader("allow", "POST");
					res.end("Method Not Allowed");
					return;
				}

				try {
					const body = await readRequestBody(req);
					const raw = body.toString("utf8");
					const entry = JSON.parse(raw) as Record<string, unknown>;
					await mkdir(dirname(AUDIO_LOG_PATH), { recursive: true });
					await appendFile(AUDIO_LOG_PATH, `${JSON.stringify(entry)}\n`, "utf8");
					res.statusCode = 204;
					res.end();
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error);
					server.config.logger.warn(`Failed to write audio linkage log: ${message}`);
					res.statusCode = 500;
					res.setHeader("content-type", "application/json");
					res.end(JSON.stringify({ error: { message } }));
				}
			});
		},
	};
}

async function readRequestBody(req: IncomingMessage): Promise<Buffer> {
	const chunks: Buffer[] = [];
	for await (const chunk of req) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	return Buffer.concat(chunks);
}

function copyRequestHeaders(req: IncomingMessage): Headers {
	const headers = new Headers();
	for (const [key, value] of Object.entries(req.headers)) {
		if (!value || key.toLowerCase() === "host") continue;
		if (Array.isArray(value)) {
			for (const item of value) headers.append(key, item);
		} else {
			headers.set(key, value);
		}
	}
	return headers;
}

export default defineConfig({
	base: "/kokoro/",
	plugins: [audioLinkageLogWriter(), irodoriTtsProxy()],
	server: {
		headers: {
			"Cross-Origin-Opener-Policy": "same-origin",
			"Cross-Origin-Embedder-Policy": "require-corp",
		},
	},
	preview: {
		headers: {
			"Cross-Origin-Opener-Policy": "same-origin",
			"Cross-Origin-Embedder-Policy": "require-corp",
		},
	},
	build: {
		rollupOptions: {
			input: {
				main: resolve(import.meta.dirname, "index.html"),
				audio: resolve(import.meta.dirname, "audio.html"),
				template: resolve(import.meta.dirname, "template.html"),
				depth: resolve(import.meta.dirname, "depth.html"),
				avatar: resolve(import.meta.dirname, "avatar.html"),
				demoAvatarController: resolve(
					import.meta.dirname,
					"demo-avatar-controller.html",
				),
			},
		},
	},
});
