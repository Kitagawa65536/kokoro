import {
	type DepthEstimationPipeline,
	pipeline,
} from "@huggingface/transformers";

type ModelSize = "small" | "base" | "large";

const MODEL_IDS: Record<ModelSize, string> = {
	small: "onnx-community/depth-anything-v2-small",
	base: "onnx-community/depth-anything-v2-base",
	large: "onnx-community/depth-anything-v2-large",
};

let estimator: DepthEstimationPipeline;

self.onmessage = async (
	e: MessageEvent<{ dataURL: string; model: ModelSize }>,
) => {
	const { dataURL, model } = e.data;

	try {
		estimator ??= await pipeline("depth-estimation", MODEL_IDS[model], {
			progress_callback: (p) => console.log(p),
		});

		const { depth } = await estimator(dataURL);

		self.postMessage({
			depth: depth.data,
			width: depth.width,
			height: depth.height,
		});
	} catch (err) {
		console.error("inference failed", err);
		self.postMessage({
			error: formatWorkerError(err),
			model,
			modelId: MODEL_IDS[model],
		});
	}
};

function formatWorkerError(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (error instanceof Event) return `${error.type || "event"} event`;
	return String(error);
}
