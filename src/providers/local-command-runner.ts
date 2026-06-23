import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { Readable, Writable } from "node:stream";
import { ProviderError } from "./types";

const DEFAULT_TIMEOUT_MS = 60_000;
const STDERR_EXCERPT_CHARS = 400;

export interface LocalCommandRequest {
	command: string;
	args?: string[];
	stdin?: string;
	cwd?: string;
	timeoutMs?: number;
	signal?: AbortSignal;
}

export interface LocalCommandResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}

export interface LocalProcess {
	stdout: Readable;
	stderr: Readable;
	stdin: Writable;
	once(event: "close", listener: (code: number | null) => void): this;
	once(event: "error", listener: (error: NodeJS.ErrnoException) => void): this;
	kill(signal?: NodeJS.Signals): boolean;
}

export type LocalProcessSpawner = (
	command: string,
	args: string[],
	options: { cwd?: string; shell: false }
) => LocalProcess;

function defaultSpawner(
	command: string,
	args: string[],
	options: { cwd?: string; shell: false }
): LocalProcess {
	return spawn(command, args, {
		cwd: options.cwd,
		shell: options.shell,
		stdio: ["pipe", "pipe", "pipe"],
	}) as ChildProcessWithoutNullStreams;
}

function commandLabel(command: string): string {
	return command.trim() || "local command";
}

function excerpt(value: string): string {
	const cleaned = value.trim().replace(/\s+/g, " ");
	return cleaned.length > STDERR_EXCERPT_CHARS
		? `${cleaned.slice(0, STDERR_EXCERPT_CHARS)}...`
		: cleaned;
}

function errorMessageForExit(
	command: string,
	code: number | null,
	stderr: string
): string {
	const suffix = stderr.trim() ? `: ${excerpt(stderr)}` : ".";
	return `CueCraft: ${commandLabel(command)} exited with code ${code ?? "unknown"}${suffix}`;
}

function errorMessageForSpawn(command: string, error: NodeJS.ErrnoException): string {
	if (error.code === "ENOENT") {
		return `CueCraft: ${commandLabel(command)} was not found. Check the command path in settings.`;
	}
	return error.message
		? `CueCraft: ${commandLabel(command)} failed to start: ${error.message}`
		: `CueCraft: ${commandLabel(command)} failed to start.`;
}

export class LocalCommandRunner {
	constructor(private readonly spawnProcess: LocalProcessSpawner = defaultSpawner) {}

	run(request: LocalCommandRequest): Promise<LocalCommandResult> {
		const args = request.args ?? [];
		const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		if (request.signal?.aborted) {
			return Promise.reject(
				new ProviderError(`CueCraft: ${commandLabel(request.command)} was cancelled.`)
			);
		}

		return new Promise((resolve, reject) => {
			const child = this.spawnProcess(request.command, args, {
				cwd: request.cwd,
				shell: false,
			});
			let stdout = "";
			let stderr = "";
			let settled = false;
			let timeout: ReturnType<typeof setTimeout> | null = null;

			const settle = (
				callback: () => void,
				removeAbortListener: () => void
			): void => {
				if (settled) return;
				settled = true;
				if (timeout) clearTimeout(timeout);
				removeAbortListener();
				callback();
			};

			const onAbort = (): void => {
				child.kill("SIGTERM");
				settle(
					() =>
						reject(
							new ProviderError(
								`CueCraft: ${commandLabel(request.command)} was cancelled.`
							)
						),
					() => request.signal?.removeEventListener("abort", onAbort)
				);
			};

			request.signal?.addEventListener("abort", onAbort, { once: true });
			const removeAbortListener = (): void =>
				request.signal?.removeEventListener("abort", onAbort);

			child.stdout.on("data", (chunk: Buffer | string) => {
				stdout += chunk.toString();
			});
			child.stderr.on("data", (chunk: Buffer | string) => {
				stderr += chunk.toString();
			});
			child.once("error", (error) => {
				settle(
					() => reject(new ProviderError(errorMessageForSpawn(request.command, error))),
					removeAbortListener
				);
			});
			child.once("close", (code) => {
				settle(
					() => {
						if (code === 0) {
							resolve({ stdout, stderr, exitCode: 0 });
							return;
						}
						reject(
							new ProviderError(errorMessageForExit(request.command, code, stderr))
						);
					},
					removeAbortListener
				);
			});

			timeout = setTimeout(() => {
				child.kill("SIGTERM");
				settle(
					() =>
						reject(
							new ProviderError(
								`CueCraft: ${commandLabel(request.command)} timed out after ${timeoutMs}ms.`
							)
						),
					removeAbortListener
				);
			}, timeoutMs);

			child.stdin.end(request.stdin ?? "");
		});
	}
}
