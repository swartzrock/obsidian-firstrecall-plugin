import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { Readable, Writable } from "node:stream";
import { ProviderError } from "./types";

const DEFAULT_TIMEOUT_MS = 60_000;
const STDERR_EXCERPT_CHARS = 400;
const COMMON_CLI_PATHS = [
	"/opt/homebrew/bin",
	"/usr/local/bin",
	"/usr/bin",
	"/bin",
	"/usr/sbin",
	"/sbin",
];

export interface LocalCommandRequest {
	command: string;
	args?: string[];
	stdin?: string;
	cwd?: string;
	env?: NodeJS.ProcessEnv;
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
	options: { cwd?: string; shell: false; env?: NodeJS.ProcessEnv }
) => LocalProcess;

type LocalCommandLogger = Pick<Console, "warn">;

function defaultSpawner(
	command: string,
	args: string[],
	options: { cwd?: string; shell: false; env?: NodeJS.ProcessEnv }
): LocalProcess {
	return spawn(command, args, {
		cwd: options.cwd,
		env: options.env,
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

function isBareCommand(command: string): boolean {
	return !command.includes("/") && !command.includes("\\");
}

export function buildLocalCliPath(basePath = ""): string {
	const separator = process.platform === "win32" ? ";" : ":";
	const entries = basePath
		.split(separator)
		.map((entry) => entry.trim())
		.filter(Boolean);
	const seen = new Set(entries);
	for (const entry of COMMON_CLI_PATHS) {
		if (!seen.has(entry)) {
			seen.add(entry);
			entries.push(entry);
		}
	}
	return entries.join(separator);
}

export class LocalCommandRunner {
	constructor(
		private readonly spawnProcess: LocalProcessSpawner = defaultSpawner,
		private readonly env: NodeJS.ProcessEnv = process.env,
		private readonly logger: LocalCommandLogger = console
	) {}

	run(request: LocalCommandRequest): Promise<LocalCommandResult> {
		const args = request.args ?? [];
		const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		const basePath = request.env?.PATH ?? this.env.PATH ?? "";
		const commandEnv: NodeJS.ProcessEnv = {
			...this.env,
			...request.env,
			PATH: isBareCommand(request.command)
				? buildLocalCliPath(basePath)
				: basePath,
		};
		if (request.signal?.aborted) {
			return Promise.reject(
				new ProviderError(`CueCraft: ${commandLabel(request.command)} was cancelled.`)
			);
		}

		return new Promise((resolve, reject) => {
			const child = this.spawnProcess(request.command, args, {
				cwd: request.cwd,
				env: commandEnv,
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
					() => {
						this.logger.warn("CueCraft local CLI failed to start", {
							command: request.command,
							code: error.code,
							PATH: commandEnv.PATH ?? "",
						});
						reject(new ProviderError(errorMessageForSpawn(request.command, error)));
					},
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
