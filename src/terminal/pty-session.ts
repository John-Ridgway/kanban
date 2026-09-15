import * as pty from "node-pty";

import {
	buildWindowsCmdArgsCommandLine,
	resolveWindowsComSpec,
	shouldUseWindowsCmdLaunch,
} from "../core/windows-cmd-launch";

export interface PtyExitEvent {
	exitCode: number;
	signal?: number;
}

export interface SpawnPtySessionRequest {
	binary: string;
	args?: string[] | string;
	cwd: string;
	env?: Record<string, string | undefined>;
	cols: number;
	rows: number;
	onData?: (chunk: Buffer) => void;
	onExit?: (event: PtyExitEvent) => void;
}

type PtyOutputChunk = string | Buffer | Uint8Array;

function normalizeOutputChunk(data: PtyOutputChunk): Buffer {
	if (typeof data === "string") {
		return Buffer.from(data, "utf8");
	}
	return Buffer.isBuffer(data) ? data : Buffer.from(data);
}

function isIgnorablePtyWriteError(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false;
	}
	const code = (error as NodeJS.ErrnoException).code;
	return code === "EIO" || code === "EBADF";
}

function isIgnorablePtyResizeError(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false;
	}
	const code = (error as NodeJS.ErrnoException).code;
	if (code === "EIO" || code === "EBADF") {
		return true;
	}
	return error.message.toLowerCase().includes("already exited");
}

function terminatePtyProcess(ptyProcess: pty.IPty): void {
	const pid = ptyProcess.pid;
	ptyProcess.kill();
	if (process.platform !== "win32" && Number.isFinite(pid) && pid > 0) {
		try {
			process.kill(-pid, "SIGTERM");
		} catch {
			// Best effort: process group may already be gone or inaccessible.
		}
	}
}

// Graceful signals (SIGHUP/SIGTERM on Unix) can be ignored or outlived by a stuck agent
// process. If a stop does not produce a real exit within this window we escalate to a hard
// kill so callers awaiting the exit are never blocked indefinitely.
const STOP_KILL_ESCALATION_TIMEOUT_MS = 1_500;

function forceKillPtyProcess(ptyProcess: pty.IPty): void {
	const pid = ptyProcess.pid;
	if (process.platform === "win32") {
		// node-pty's Windows kill already hard-terminates the console process tree; reissue it.
		try {
			ptyProcess.kill();
		} catch {
			// Best effort: the process may already be gone.
		}
		return;
	}
	if (Number.isFinite(pid) && pid > 0) {
		try {
			process.kill(-pid, "SIGKILL");
		} catch {
			// Best effort: process group may already be gone or inaccessible.
		}
		try {
			process.kill(pid, "SIGKILL");
		} catch {
			// Best effort: the process may already be gone.
		}
	}
}

export class PtySession {
	private readonly ptyProcess: pty.IPty;
	private interrupted = false;
	private exited = false;
	private exitResolve: (() => void) | null = null;
	private readonly exitPromise: Promise<void>;

	private constructor(
		ptyProcess: pty.IPty,
		private readonly onDataCallback?: (chunk: Buffer) => void,
		private readonly onExitCallback?: (event: PtyExitEvent) => void,
	) {
		this.ptyProcess = ptyProcess;
		this.exitPromise = new Promise<void>((resolve) => {
			this.exitResolve = resolve;
		});
		(this.ptyProcess.onData as unknown as (listener: (data: PtyOutputChunk) => void) => void)((data) => {
			const chunk = normalizeOutputChunk(data);
			this.onDataCallback?.(chunk);
		});
		this.ptyProcess.onExit((event) => {
			this.exited = true;
			// Notify the session manager first so anyone awaiting the exit only resumes after
			// the manager has fully handled it.
			this.onExitCallback?.(event);
			this.exitResolve?.();
		});
	}

	static spawn({ binary, args = [], cwd, env, cols, rows, onData, onExit }: SpawnPtySessionRequest): PtySession {
		const normalizedArgs = typeof args === "string" ? [args] : args;
		const terminalName = env?.TERM?.trim() || process.env.TERM?.trim() || "xterm-256color";
		const launchEnv: NodeJS.ProcessEnv = env ? { ...process.env, ...env } : process.env;
		const useWindowsShellLaunch = shouldUseWindowsCmdLaunch(binary, process.platform, launchEnv);
		const spawnBinary = useWindowsShellLaunch ? resolveWindowsComSpec(launchEnv) : binary;
		const spawnArgs = useWindowsShellLaunch ? buildWindowsCmdArgsCommandLine(binary, normalizedArgs) : normalizedArgs;
		const ptyOptions: pty.IPtyForkOptions = {
			name: terminalName,
			cwd,
			env,
			cols,
			rows,
			encoding: null,
		};

		const ptyProcess = pty.spawn(spawnBinary, spawnArgs, ptyOptions);
		return new PtySession(ptyProcess, onData, onExit);
	}

	get pid(): number {
		return this.ptyProcess.pid;
	}

	write(data: string | Buffer): void {
		try {
			this.ptyProcess.write(typeof data === "string" ? data : data.toString("utf8"));
		} catch (error) {
			if (isIgnorablePtyWriteError(error)) {
				return;
			}
			throw error;
		}
	}

	resize(cols: number, rows: number, pixelWidth?: number, pixelHeight?: number): void {
		if (this.exited) {
			return;
		}
		try {
			if (pixelWidth !== undefined && pixelHeight !== undefined) {
				this.ptyProcess.resize(cols, rows, {
					width: pixelWidth,
					height: pixelHeight,
				});
				return;
			}
			this.ptyProcess.resize(cols, rows);
		} catch (error) {
			if (isIgnorablePtyResizeError(error)) {
				this.exited = true;
				return;
			}
			throw error;
		}
	}

	pause(): void {
		this.ptyProcess.pause();
	}

	resume(): void {
		this.ptyProcess.resume();
	}

	stop(options?: { interrupted?: boolean }): void {
		if (options?.interrupted) {
			this.interrupted = true;
		}
		terminatePtyProcess(this.ptyProcess);
	}

	/**
	 * Resolves once the underlying PTY process has fully exited. Pair with {@link stop} so a
	 * replacement session is never spawned while the previous process is still alive.
	 */
	async waitForExit(): Promise<void> {
		if (this.exited) {
			return;
		}
		const escalation = setTimeout(() => {
			if (!this.exited) {
				forceKillPtyProcess(this.ptyProcess);
			}
		}, STOP_KILL_ESCALATION_TIMEOUT_MS);
		try {
			await this.exitPromise;
		} finally {
			clearTimeout(escalation);
		}
	}

	wasInterrupted(): boolean {
		return this.interrupted;
	}
}
