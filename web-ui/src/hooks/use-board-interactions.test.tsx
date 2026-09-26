import { act, type Dispatch, type SetStateAction, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useBoardInteractions } from "@/hooks/use-board-interactions";
import type { UseTaskSessionsResult } from "@/hooks/use-task-sessions";
import type { RuntimeTaskSessionSummary } from "@/runtime/types";
import { moveTaskToColumn } from "@/state/board-state";
import type { BoardCard, BoardColumnId, BoardData } from "@/types";

const notifyErrorMock = vi.hoisted(() => vi.fn());
const showAppToastMock = vi.hoisted(() => vi.fn());
const useLinkedBacklogTaskActionsMock = vi.hoisted(() => vi.fn());
const useProgrammaticCardMovesMock = vi.hoisted(() => vi.fn());

vi.mock("@/components/app-toaster", () => ({
	notifyError: notifyErrorMock,
	showAppToast: showAppToastMock,
}));

vi.mock("@/hooks/use-linked-backlog-task-actions", () => ({
	useLinkedBacklogTaskActions: useLinkedBacklogTaskActionsMock,
}));

vi.mock("@/hooks/use-programmatic-card-moves", () => ({
	useProgrammaticCardMoves: useProgrammaticCardMovesMock,
}));

vi.mock("@/hooks/use-review-auto-actions", () => ({
	useReviewAutoActions: () => ({}) as ReturnType<typeof useBoardInteractions>,
}));

function createTask(taskId: string, prompt: string, createdAt: number): BoardCard {
	return {
		id: taskId,
		title: prompt,
		prompt,
		startInPlanMode: false,
		autoReviewEnabled: false,
		autoReviewMode: "commit",
		baseRef: "main",
		tagIds: [],
		createdAt,
		updatedAt: createdAt,
	};
}

function createBoard(overrides?: Partial<Record<BoardColumnId, BoardCard[]>>): BoardData {
	return {
		columns: [
			{
				id: "backlog",
				title: "Backlog",
				cards: overrides?.backlog ?? [createTask("task-1", "Backlog task", 1)],
			},
			{ id: "planning", title: "Planning", cards: overrides?.planning ?? [] },
			{ id: "in_progress", title: "In Progress", cards: overrides?.in_progress ?? [] },
			{ id: "review", title: "Review", cards: overrides?.review ?? [] },
			{ id: "trash", title: "Done", cards: overrides?.trash ?? [] },
		],
		dependencies: [],
		tags: [],
	};
}

function createSession(
	taskId: string,
	state: RuntimeTaskSessionSummary["state"],
	updatedAt: number,
): RuntimeTaskSessionSummary {
	return {
		taskId,
		state,
		mode: null,
		agentId: "pi",
		workspacePath: null,
		pid: null,
		startedAt: null,
		updatedAt,
		lastOutputAt: null,
		reviewReason: state === "awaiting_review" ? "hook" : null,
		exitCode: null,
		lastHookAt: null,
		latestHookActivity: null,
	};
}

const NOOP_STOP_SESSION = async (): Promise<void> => {};
const NOOP_CLEANUP_WORKSPACE = async (): Promise<null> => null;
const NOOP_FETCH_WORKSPACE_INFO = async (): Promise<null> => null;
const NOOP_SEND_TASK_INPUT = async (): Promise<{ ok: boolean }> => ({ ok: true });
const NOOP_RUN_AUTO_REVIEW = async (): Promise<boolean> => false;

interface HookSnapshot {
	handleRestoreTaskFromTrash: (taskId: string) => void;
	handleStartTask: (taskId: string) => void;
	handleCardSelect: (taskId: string) => void;
	handleConfirmClearTrash: () => void;
	setSessions: Dispatch<SetStateAction<Record<string, RuntimeTaskSessionSummary>>>;
}

function createRect(width: number, height: number): DOMRect {
	return {
		x: 0,
		y: 0,
		left: 0,
		top: 0,
		width,
		height,
		right: width,
		bottom: height,
		toJSON: () => ({}),
	} as DOMRect;
}

function HookHarness({
	board,
	setBoard,
	ensureTaskWorkspace,
	startTaskSession,
	stopTaskSession = NOOP_STOP_SESSION,
	cleanupTaskWorkspace = NOOP_CLEANUP_WORKSPACE,
	selectedCard = null,
	setSelectedTaskIdOverride,
	onSnapshot,
}: {
	board: BoardData;
	setBoard: Dispatch<SetStateAction<BoardData>>;
	ensureTaskWorkspace: UseTaskSessionsResult["ensureTaskWorkspace"];
	startTaskSession: UseTaskSessionsResult["startTaskSession"];
	stopTaskSession?: (taskId: string) => Promise<void>;
	cleanupTaskWorkspace?: (taskId: string) => Promise<unknown>;
	selectedCard?: { card: BoardCard; column: { id: "backlog" | "in_progress" | "review" | "trash" } } | null;
	setSelectedTaskIdOverride?: Dispatch<SetStateAction<string | null>>;
	onSnapshot?: (snapshot: HookSnapshot) => void;
}): null {
	const [sessions, setSessions] = useState<Record<string, RuntimeTaskSessionSummary>>({});
	const [, setSelectedTaskId] = useState<string | null>(null);
	const [, setIsClearTrashDialogOpen] = useState(false);
	const [, setIsGitHistoryOpen] = useState(false);

	const actions = useBoardInteractions({
		board,
		setBoard,
		sessions,
		setSessions,
		selectedCard,
		selectedTaskId: null,
		currentProjectId: "project-1",
		setSelectedTaskId: setSelectedTaskIdOverride ?? setSelectedTaskId,
		setIsClearTrashDialogOpen,
		setIsGitHistoryOpen,
		stopTaskSession,
		cleanupTaskWorkspace,
		ensureTaskWorkspace,
		startTaskSession,
		fetchTaskWorkspaceInfo: NOOP_FETCH_WORKSPACE_INFO,
		sendTaskSessionInput: NOOP_SEND_TASK_INPUT,
		readyForReviewNotificationsEnabled: false,
		taskGitActionLoadingByTaskId: {},
		runAutoReviewGitAction: NOOP_RUN_AUTO_REVIEW,
	});

	useEffect(() => {
		onSnapshot?.({
			handleRestoreTaskFromTrash: actions.handleRestoreTaskFromTrash,
			handleStartTask: actions.handleStartTask,
			handleCardSelect: actions.handleCardSelect,
			handleConfirmClearTrash: actions.handleConfirmClearTrash,
			setSessions,
		});
	}, [
		actions.handleCardSelect,
		actions.handleConfirmClearTrash,
		actions.handleRestoreTaskFromTrash,
		actions.handleStartTask,
		onSnapshot,
		setSessions,
	]);

	return null;
}

describe("useBoardInteractions", () => {
	let container: HTMLDivElement;
	let root: Root;
	let previousActEnvironment: boolean | undefined;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.spyOn(performance, "now").mockImplementation(() => Date.now());
		vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback: FrameRequestCallback) => {
			return window.setTimeout(() => {
				callback(performance.now());
			}, 16);
		});
		vi.spyOn(window, "cancelAnimationFrame").mockImplementation((handle: number) => {
			window.clearTimeout(handle);
		});
		notifyErrorMock.mockReset();
		showAppToastMock.mockReset();
		useLinkedBacklogTaskActionsMock.mockReset();
		useProgrammaticCardMovesMock.mockReset();
		previousActEnvironment = (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
			.IS_REACT_ACT_ENVIRONMENT;
		(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => {
			root.unmount();
		});
		vi.restoreAllMocks();
		vi.useRealTimers();
		container.remove();
		if (previousActEnvironment === undefined) {
			delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
		} else {
			(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
				previousActEnvironment;
		}
	});

	it("starts dependency-unblocked tasks even when setBoard updater is deferred", async () => {
		let startBacklogTaskWithAnimation: ((task: BoardCard) => Promise<boolean>) | null = null;

		useProgrammaticCardMovesMock.mockReturnValue({
			handleProgrammaticCardMoveReady: () => {},
			setRequestMoveTaskToTrashHandler: () => {},
			tryProgrammaticCardMove: () => "unavailable",
			consumeProgrammaticCardMove: () => ({}),
			resolvePendingProgrammaticTrashMove: () => {},
			waitForProgrammaticCardMoveAvailability: async () => {},
			resetProgrammaticCardMoves: () => {},
			requestMoveTaskToTrashWithAnimation: async () => {},
			programmaticCardMoveCycle: 0,
		});

		useLinkedBacklogTaskActionsMock.mockImplementation(
			(input: { startBacklogTaskWithAnimation?: (task: BoardCard) => Promise<boolean> }) => {
				startBacklogTaskWithAnimation = input.startBacklogTaskWithAnimation ?? null;
				return {
					handleCreateDependency: () => {},
					handleDeleteDependency: () => {},
					confirmMoveTaskToTrash: async () => {},
					requestMoveTaskToTrash: async () => {},
				};
			},
		);

		const board = createBoard();
		const setBoard = vi.fn<Dispatch<SetStateAction<BoardData>>>((_nextBoard) => {
			// Simulate React deferring state updater execution.
		});
		const ensureTaskWorkspace = vi.fn(async () => ({
			ok: true as const,
			response: {
				ok: true as const,
				path: "/tmp/task-1",
				baseRef: "main",
				baseCommit: "abc123",
			},
		}));
		const startTaskSession = vi.fn(async () => ({ ok: true as const }));

		await act(async () => {
			root.render(
				<HookHarness
					board={board}
					setBoard={setBoard}
					ensureTaskWorkspace={ensureTaskWorkspace}
					startTaskSession={startTaskSession}
				/>,
			);
		});

		if (!startBacklogTaskWithAnimation) {
			throw new Error("Expected startBacklogTaskWithAnimation to be provided.");
		}

		const backlogTask = board.columns[0]?.cards[0];
		if (!backlogTask) {
			throw new Error("Expected a backlog task.");
		}

		let started = false;
		await act(async () => {
			started = await startBacklogTaskWithAnimation!(backlogTask);
		});

		expect(started).toBe(true);
		expect(ensureTaskWorkspace).toHaveBeenCalledWith(backlogTask);
		expect(startTaskSession).toHaveBeenCalledWith(backlogTask);
	});

	it("waits for a new backlog card height to settle before starting animation", async () => {
		let latestSnapshot: HookSnapshot | null = null;
		const tryProgrammaticCardMove = vi.fn(() => "unavailable" as const);
		let measurementCount = 0;
		const boardElement = document.createElement("section");
		boardElement.className = "kb-board";
		const taskElement = document.createElement("div");
		taskElement.dataset.taskId = "task-1";
		vi.spyOn(taskElement, "getBoundingClientRect").mockImplementation(() => {
			measurementCount += 1;
			if (measurementCount === 1) {
				return createRect(160, 44);
			}
			return createRect(160, 96);
		});
		boardElement.appendChild(taskElement);
		document.body.appendChild(boardElement);

		useProgrammaticCardMovesMock.mockReturnValue({
			handleProgrammaticCardMoveReady: () => {},
			setRequestMoveTaskToTrashHandler: () => {},
			tryProgrammaticCardMove,
			consumeProgrammaticCardMove: () => ({}),
			resolvePendingProgrammaticTrashMove: () => {},
			waitForProgrammaticCardMoveAvailability: async () => {},
			resetProgrammaticCardMoves: () => {},
			requestMoveTaskToTrashWithAnimation: async () => {},
			programmaticCardMoveCycle: 0,
		});

		useLinkedBacklogTaskActionsMock.mockReturnValue({
			handleCreateDependency: () => {},
			handleDeleteDependency: () => {},
			confirmMoveTaskToTrash: async () => {},
			requestMoveTaskToTrash: async () => {},
		});

		const board = createBoard();
		const setBoard = vi.fn<Dispatch<SetStateAction<BoardData>>>(() => {});
		const ensureTaskWorkspace = vi.fn(async () => ({
			ok: true as const,
			response: {
				ok: true as const,
				path: "/tmp/task-1",
				baseRef: "main",
				baseCommit: "abc123",
			},
		}));
		const startTaskSession = vi.fn(async () => ({ ok: true as const }));

		await act(async () => {
			root.render(
				<HookHarness
					board={board}
					setBoard={setBoard}
					ensureTaskWorkspace={ensureTaskWorkspace}
					startTaskSession={startTaskSession}
					onSnapshot={(snapshot) => {
						latestSnapshot = snapshot;
					}}
				/>,
			);
		});

		if (!latestSnapshot) {
			throw new Error("Expected a hook snapshot.");
		}

		await act(async () => {
			latestSnapshot!.handleStartTask("task-1");
		});

		expect(tryProgrammaticCardMove).not.toHaveBeenCalled();

		await act(async () => {
			vi.advanceTimersByTime(32);
			await Promise.resolve();
		});

		expect(tryProgrammaticCardMove).not.toHaveBeenCalled();

		await act(async () => {
			vi.advanceTimersByTime(16);
			await Promise.resolve();
		});

		expect(tryProgrammaticCardMove).toHaveBeenCalledWith("task-1", "backlog", "in_progress");
		boardElement.remove();
	});

	it("starts backlog tasks immediately from detail view without waiting for card height to settle", async () => {
		let latestSnapshot: HookSnapshot | null = null;
		const tryProgrammaticCardMove = vi.fn(() => "unavailable" as const);
		let measurementCount = 0;
		const boardElement = document.createElement("section");
		boardElement.className = "kb-board";
		const taskElement = document.createElement("div");
		taskElement.dataset.taskId = "task-1";
		vi.spyOn(taskElement, "getBoundingClientRect").mockImplementation(() => {
			measurementCount += 1;
			if (measurementCount === 1) {
				return createRect(160, 44);
			}
			return createRect(160, 96);
		});
		boardElement.appendChild(taskElement);
		document.body.appendChild(boardElement);

		useProgrammaticCardMovesMock.mockReturnValue({
			handleProgrammaticCardMoveReady: () => {},
			setRequestMoveTaskToTrashHandler: () => {},
			tryProgrammaticCardMove,
			consumeProgrammaticCardMove: () => ({}),
			resolvePendingProgrammaticTrashMove: () => {},
			waitForProgrammaticCardMoveAvailability: async () => {},
			resetProgrammaticCardMoves: () => {},
			requestMoveTaskToTrashWithAnimation: async () => {},
			programmaticCardMoveCycle: 0,
		});

		useLinkedBacklogTaskActionsMock.mockReturnValue({
			handleCreateDependency: () => {},
			handleDeleteDependency: () => {},
			confirmMoveTaskToTrash: async () => {},
			requestMoveTaskToTrash: async () => {},
		});

		const board = createBoard();
		const setBoard = vi.fn<Dispatch<SetStateAction<BoardData>>>(() => {});
		const ensureTaskWorkspace = vi.fn(async () => ({
			ok: true as const,
			response: {
				ok: true as const,
				path: "/tmp/task-1",
				baseRef: "main",
				baseCommit: "abc123",
			},
		}));
		const startTaskSession = vi.fn(async () => ({ ok: true as const }));

		await act(async () => {
			root.render(
				<HookHarness
					board={board}
					setBoard={setBoard}
					ensureTaskWorkspace={ensureTaskWorkspace}
					startTaskSession={startTaskSession}
					selectedCard={{ card: board.columns[0]!.cards[0]!, column: { id: "backlog" } }}
					onSnapshot={(snapshot) => {
						latestSnapshot = snapshot;
					}}
				/>,
			);
		});

		if (!latestSnapshot) {
			throw new Error("Expected a hook snapshot.");
		}

		await act(async () => {
			latestSnapshot!.handleStartTask("task-1");
		});

		expect(tryProgrammaticCardMove).not.toHaveBeenCalled();
		expect(measurementCount).toBe(0);
		expect(setBoard).toHaveBeenCalled();
		expect(startTaskSession).toHaveBeenCalledWith(board.columns[0]!.cards[0]!);
		boardElement.remove();
	});

	it("shows a warning toast when restoring a trashed task with a saved patch warning", async () => {
		let latestSnapshot: HookSnapshot | null = null;

		useProgrammaticCardMovesMock.mockReturnValue({
			handleProgrammaticCardMoveReady: () => {},
			setRequestMoveTaskToTrashHandler: () => {},
			tryProgrammaticCardMove: () => "unavailable",
			consumeProgrammaticCardMove: () => ({}),
			resolvePendingProgrammaticTrashMove: () => {},
			waitForProgrammaticCardMoveAvailability: async () => {},
			resetProgrammaticCardMoves: () => {},
			requestMoveTaskToTrashWithAnimation: async () => {},
			programmaticCardMoveCycle: 0,
		});

		useLinkedBacklogTaskActionsMock.mockReturnValue({
			handleCreateDependency: () => {},
			handleDeleteDependency: () => {},
			confirmMoveTaskToTrash: async () => {},
			requestMoveTaskToTrash: async () => {},
		});

		const trashTask = createTask("task-trash", "Trash task", 2);
		const board: BoardData = {
			columns: [
				{ id: "backlog", title: "Backlog", cards: [] },
				{ id: "in_progress", title: "In Progress", cards: [] },
				{ id: "review", title: "Review", cards: [] },
				{ id: "trash", title: "Done", cards: [trashTask] },
			],
			dependencies: [],
			tags: [],
		};
		const setBoard = vi.fn<Dispatch<SetStateAction<BoardData>>>((_nextBoard) => {
			// The optimistic move is not part of this assertion.
		});
		const ensureTaskWorkspace = vi.fn(async () => ({
			ok: true as const,
			response: {
				ok: true as const,
				path: "/tmp/task-trash",
				baseRef: "main",
				baseCommit: "abc123",
				warning: "Saved task changes could not be reapplied automatically.",
			},
		}));
		const startTaskSession = vi.fn(async () => ({ ok: true as const }));

		await act(async () => {
			root.render(
				<HookHarness
					board={board}
					setBoard={setBoard}
					ensureTaskWorkspace={ensureTaskWorkspace}
					startTaskSession={startTaskSession}
					onSnapshot={(snapshot) => {
						latestSnapshot = snapshot;
					}}
				/>,
			);
		});

		if (!latestSnapshot) {
			throw new Error("Expected a hook snapshot.");
		}

		await act(async () => {
			latestSnapshot!.handleRestoreTaskFromTrash("task-trash");
			// resumeTaskFromTrash is fire-and-forget (void), so flush enough
			// microtasks for ensureTaskWorkspace and startTaskSession to resolve.
			for (let i = 0; i < 10; i++) {
				await Promise.resolve();
			}
		});

		// moveTaskToColumn updates updatedAt with Date.now(), so match fields except updatedAt.
		const expectedTask = expect.objectContaining({
			id: trashTask.id,
			prompt: trashTask.prompt,
			baseRef: trashTask.baseRef,
			createdAt: trashTask.createdAt,
		});
		expect(ensureTaskWorkspace).toHaveBeenCalledWith(expectedTask);
		expect(startTaskSession).toHaveBeenCalledWith(expectedTask, { resumeFromTrash: true });
		expect(showAppToastMock).toHaveBeenCalledWith({
			intent: "warning",
			icon: "warning-sign",
			message: "Saved task changes could not be reapplied automatically.",
			timeout: 7000,
		});
	});

	it("preserves model fields when restoring a trashed task", async () => {
		let latestSnapshot: HookSnapshot | null = null;

		useProgrammaticCardMovesMock.mockReturnValue({
			handleProgrammaticCardMoveReady: () => {},
			setRequestMoveTaskToTrashHandler: () => {},
			tryProgrammaticCardMove: () => "unavailable",
			consumeProgrammaticCardMove: () => ({}),
			resolvePendingProgrammaticTrashMove: () => {},
			waitForProgrammaticCardMoveAvailability: async () => {},
			resetProgrammaticCardMoves: () => {},
			requestMoveTaskToTrashWithAnimation: async () => {},
			programmaticCardMoveCycle: 0,
		});

		useLinkedBacklogTaskActionsMock.mockReturnValue({
			handleCreateDependency: () => {},
			handleDeleteDependency: () => {},
			confirmMoveTaskToTrash: async () => {},
			requestMoveTaskToTrash: async () => {},
		});

		const trashTask: BoardCard = {
			id: "task-trash-model",
			title: "Trash task with model title",
			prompt: "Trash task with model",
			startInPlanMode: false,
			autoReviewEnabled: false,
			autoReviewMode: "commit",
			agentId: "codex",
			clineSettings: {
				providerId: "my-provider",
				modelId: "my-model",
			},
			baseRef: "main",
			tagIds: [],
			createdAt: 2,
			updatedAt: 2,
		};
		let currentBoard: BoardData = {
			columns: [
				{ id: "backlog", title: "Backlog", cards: [] },
				{ id: "in_progress", title: "In Progress", cards: [] },
				{ id: "review", title: "Review", cards: [] },
				{ id: "trash", title: "Done", cards: [trashTask] },
			],
			dependencies: [],
			tags: [],
		};
		const setBoard = vi.fn<Dispatch<SetStateAction<BoardData>>>((nextBoard) => {
			if (typeof nextBoard === "function") {
				currentBoard = nextBoard(currentBoard);
			} else {
				currentBoard = nextBoard;
			}
		});
		const ensureTaskWorkspace = vi.fn(async () => ({
			ok: true as const,
			response: {
				ok: true as const,
				path: "/tmp/task-trash-model",
				baseRef: "main",
				baseCommit: "abc123",
			},
		}));
		const startTaskSession = vi.fn(async () => ({ ok: true as const }));

		await act(async () => {
			root.render(
				<HookHarness
					board={currentBoard}
					setBoard={setBoard}
					ensureTaskWorkspace={ensureTaskWorkspace}
					startTaskSession={startTaskSession}
					onSnapshot={(snapshot) => {
						latestSnapshot = snapshot;
					}}
				/>,
			);
		});

		if (!latestSnapshot) {
			throw new Error("Expected a hook snapshot.");
		}

		await act(async () => {
			latestSnapshot!.handleRestoreTaskFromTrash("task-trash-model");
			for (let i = 0; i < 10; i++) {
				await Promise.resolve();
			}
		});

		// After restore, disableTaskAutoReview is called via setBoard updater.
		// Verify model fields survived the restore flow.
		const reviewCards = currentBoard.columns.find((col) => col.id === "review")?.cards ?? [];
		const restoredTask = reviewCards.find((card) => card.id === "task-trash-model");
		expect(restoredTask).toBeDefined();
		expect(restoredTask?.clineSettings).toEqual({
			providerId: "my-provider",
			modelId: "my-model",
		});
		expect(restoredTask?.agentId).toBe("codex");
	});

	it("ignores card selection requests for trashed tasks", async () => {
		let latestSnapshot: HookSnapshot | null = null;

		useProgrammaticCardMovesMock.mockReturnValue({
			handleProgrammaticCardMoveReady: () => {},
			setRequestMoveTaskToTrashHandler: () => {},
			tryProgrammaticCardMove: () => "unavailable",
			consumeProgrammaticCardMove: () => ({}),
			resolvePendingProgrammaticTrashMove: () => {},
			waitForProgrammaticCardMoveAvailability: async () => {},
			resetProgrammaticCardMoves: () => {},
			requestMoveTaskToTrashWithAnimation: async () => {},
			programmaticCardMoveCycle: 0,
		});

		useLinkedBacklogTaskActionsMock.mockReturnValue({
			handleCreateDependency: () => {},
			handleDeleteDependency: () => {},
			confirmMoveTaskToTrash: async () => {},
			requestMoveTaskToTrash: async () => {},
		});

		const trashTask = createTask("task-trash", "Trash task", 2);
		const board: BoardData = {
			columns: [
				{ id: "backlog", title: "Backlog", cards: [] },
				{ id: "in_progress", title: "In Progress", cards: [] },
				{ id: "review", title: "Review", cards: [] },
				{ id: "trash", title: "Done", cards: [trashTask] },
			],
			dependencies: [],
			tags: [],
		};
		const setSelectedTaskId = vi.fn<Dispatch<SetStateAction<string | null>>>();

		await act(async () => {
			root.render(
				<HookHarness
					board={board}
					setBoard={() => board}
					ensureTaskWorkspace={async () => ({ ok: true as const })}
					startTaskSession={async () => ({ ok: true as const })}
					setSelectedTaskIdOverride={setSelectedTaskId}
					onSnapshot={(snapshot) => {
						latestSnapshot = snapshot;
					}}
				/>,
			);
		});

		if (!latestSnapshot) {
			throw new Error("Expected a hook snapshot.");
		}

		await act(async () => {
			latestSnapshot!.handleCardSelect("task-trash");
		});

		expect(setSelectedTaskId).not.toHaveBeenCalled();
	});

	it("bounds clear-trash cleanup concurrency while still cleaning up every task", async () => {
		let latestSnapshot: HookSnapshot | null = null;

		useProgrammaticCardMovesMock.mockReturnValue({
			handleProgrammaticCardMoveReady: () => {},
			setRequestMoveTaskToTrashHandler: () => {},
			tryProgrammaticCardMove: () => "unavailable",
			consumeProgrammaticCardMove: () => ({}),
			resolvePendingProgrammaticTrashMove: () => {},
			waitForProgrammaticCardMoveAvailability: async () => {},
			resetProgrammaticCardMoves: () => {},
			requestMoveTaskToTrashWithAnimation: async () => {},
			programmaticCardMoveCycle: 0,
		});

		useLinkedBacklogTaskActionsMock.mockReturnValue({
			handleCreateDependency: () => {},
			handleDeleteDependency: () => {},
			confirmMoveTaskToTrash: async () => {},
			requestMoveTaskToTrash: async () => {},
		});

		const trashTaskCount = 25;
		const trashTasks = Array.from({ length: trashTaskCount }, (_, index) =>
			createTask(`task-trash-${index}`, `Trash task ${index}`, index + 1),
		);
		const board: BoardData = {
			columns: [
				{ id: "backlog", title: "Backlog", cards: [] },
				{ id: "in_progress", title: "In Progress", cards: [] },
				{ id: "review", title: "Review", cards: [] },
				{ id: "trash", title: "Done", cards: trashTasks },
			],
			dependencies: [],
			tags: [],
		};

		// Track how many per-task cleanup chains (stop -> cleanup) run at once.
		let inFlight = 0;
		let maxInFlight = 0;
		const stopTaskSession = vi.fn(async (_taskId: string) => {
			inFlight += 1;
			maxInFlight = Math.max(maxInFlight, inFlight);
			await Promise.resolve();
		});
		const cleanupTaskWorkspace = vi.fn(async (_taskId: string) => {
			await Promise.resolve();
			inFlight -= 1;
			return null;
		});

		await act(async () => {
			root.render(
				<HookHarness
					board={board}
					setBoard={() => board}
					ensureTaskWorkspace={async () => ({ ok: true as const })}
					startTaskSession={async () => ({ ok: true as const })}
					stopTaskSession={stopTaskSession}
					cleanupTaskWorkspace={cleanupTaskWorkspace}
					onSnapshot={(snapshot) => {
						latestSnapshot = snapshot;
					}}
				/>,
			);
		});

		if (!latestSnapshot) {
			throw new Error("Expected a hook snapshot.");
		}

		await act(async () => {
			latestSnapshot!.handleConfirmClearTrash();
		});

		expect(stopTaskSession).toHaveBeenCalledTimes(trashTaskCount);
		expect(cleanupTaskWorkspace).toHaveBeenCalledTimes(trashTaskCount);
		expect(maxInFlight).toBeGreaterThan(0);
		expect(maxInFlight).toBeLessThanOrEqual(4);
		for (const task of trashTasks) {
			expect(stopTaskSession).toHaveBeenCalledWith(task.id);
			expect(cleanupTaskWorkspace).toHaveBeenCalledWith(task.id);
		}
	});

	describe("in-progress -> review auto-advance", () => {
		let latestSnapshot: HookSnapshot | null = null;
		let tryProgrammaticCardMoveMock: ReturnType<typeof vi.fn>;
		let currentBoard: BoardData;
		let setBoard: Dispatch<SetStateAction<BoardData>>;
		let mountedWithInitialSessions = false;

		beforeEach(() => {
			latestSnapshot = null;
			tryProgrammaticCardMoveMock = vi.fn();
			mountedWithInitialSessions = false;
			programmaticCardMovesStub = null;
			currentBoard = createBoard();
		});

		const cardIn = (taskId: string, columnId: BoardColumnId): boolean => {
			const column = currentBoard.columns.find((c) => c.id === columnId);
			return column?.cards.some((card) => card.id === taskId) ?? false;
		};

		function mockProgrammaticCardMoves(options: { cycle?: number }): void {
			useLinkedBacklogTaskActionsMock.mockReturnValue({
				handleCreateDependency: () => {},
				handleDeleteDependency: () => {},
				confirmMoveTaskToTrash: async () => {},
				requestMoveTaskToTrash: async () => {},
			});
			// The stub must be a single stable object: the hook derives stable
			// callback identities from it, and a fresh object per render triggers
			// the project-reset effect (setState) on every render.
			if (!programmaticCardMovesStub) {
				programmaticCardMovesStub = {
					handleProgrammaticCardMoveReady: () => {},
					setRequestMoveTaskToTrashHandler: () => {},
					tryProgrammaticCardMove: tryProgrammaticCardMoveMock,
					consumeProgrammaticCardMove: () => ({}),
					resolvePendingProgrammaticTrashMove: () => {},
					waitForProgrammaticCardMoveAvailability: async () => {},
					resetProgrammaticCardMoves: () => {},
					requestMoveTaskToTrashWithAnimation: async () => {},
					programmaticCardMoveCycle: options.cycle ?? 0,
				};
				useProgrammaticCardMovesMock.mockReturnValue(programmaticCardMovesStub);
			}
			programmaticCardMovesStub.programmaticCardMoveCycle = options.cycle ?? 0;
		}

		let programmaticCardMovesStub: {
			handleProgrammaticCardMoveReady: () => void;
			setRequestMoveTaskToTrashHandler: () => void;
			tryProgrammaticCardMove: ReturnType<typeof vi.fn>;
			consumeProgrammaticCardMove: () => void;
			resolvePendingProgrammaticTrashMove: () => void;
			waitForProgrammaticCardMoveAvailability: () => Promise<void>;
			resetProgrammaticCardMoves: () => void;
			requestMoveTaskToTrashWithAnimation: () => Promise<void>;
			programmaticCardMoveCycle: number;
		} | null = null;

		async function renderHarness(board: BoardData): Promise<void> {
			if (!mountedWithInitialSessions) {
				mountedWithInitialSessions = true;
				currentBoard = board;
				setBoard = vi.fn<Dispatch<SetStateAction<BoardData>>>((nextBoard) => {
					currentBoard = typeof nextBoard === "function" ? (nextBoard(currentBoard) ?? currentBoard) : nextBoard;
				});
			}
			await act(async () => {
				root.render(
					<HookHarness
						board={board}
						setBoard={setBoard}
						ensureTaskWorkspace={async () => ({ ok: true as const })}
						startTaskSession={async () => ({ ok: true as const })}
						onSnapshot={(snapshot) => {
							latestSnapshot = snapshot;
						}}
					/>,
				);
			});
		}

		it("falls back to a direct move when the delegated animation never lands the card", async () => {
			tryProgrammaticCardMoveMock = vi.fn(() => "started" as const);
			mockProgrammaticCardMoves({ cycle: 0 });
			await renderHarness(createBoard({ backlog: [], in_progress: [createTask("task-1", "In progress task", 1)] }));

			// The pi turn settles while the card is in progress.
			if (!latestSnapshot) {
				throw new Error("Expected a hook snapshot.");
			}
			await act(async () => {
				latestSnapshot!.setSessions({ "task-1": createSession("task-1", "awaiting_review", 100) });
			});

			// First pass delegates to the animation; the card is still in progress.
			expect(tryProgrammaticCardMoveMock).toHaveBeenCalledTimes(1);
			expect(tryProgrammaticCardMoveMock).toHaveBeenCalledWith("task-1", "in_progress", "review");
			expect(cardIn("task-1", "in_progress")).toBe(true);

			// The drop settles without moving the card (e.g. stale board snapshot),
			// which bumps the programmatic card-move cycle and re-runs the effect.
			mockProgrammaticCardMoves({ cycle: 1 });
			currentBoard = { ...currentBoard };
			await renderHarness(currentBoard);

			// The verification pass applied the authoritative direct move instead of
			// re-delegating to the animation.
			expect(cardIn("task-1", "review")).toBe(true);
			expect(tryProgrammaticCardMoveMock).toHaveBeenCalledTimes(1);
		});

		it("does not double-move when the delegated animation lands the card", async () => {
			tryProgrammaticCardMoveMock = vi.fn(() => "started" as const);
			mockProgrammaticCardMoves({ cycle: 0 });
			await renderHarness(createBoard({ backlog: [], in_progress: [createTask("task-1", "In progress task", 1)] }));

			if (!latestSnapshot) {
				throw new Error("Expected a hook snapshot.");
			}
			await act(async () => {
				latestSnapshot!.setSessions({ "task-1": createSession("task-1", "awaiting_review", 100) });
			});

			expect(tryProgrammaticCardMoveMock).toHaveBeenCalledTimes(1);
			expect(cardIn("task-1", "in_progress")).toBe(true);

			// Simulate the drop landing: the animation moves the card to review.
			currentBoard = moveTaskToColumn(currentBoard, "task-1", "review", { insertAtTop: true }).board;
			mockProgrammaticCardMoves({ cycle: 1 });
			await renderHarness(currentBoard);

			// Card stays in review and no second animation was requested.
			expect(cardIn("task-1", "review")).toBe(true);
			expect(tryProgrammaticCardMoveMock).toHaveBeenCalledTimes(1);
		});

		it("does not auto-advance a kickoff on a stale awaiting_review summary", async () => {
			tryProgrammaticCardMoveMock = vi.fn(() => "unavailable" as const);
			mockProgrammaticCardMoves({ cycle: 0 });

			// Planning turn already settled: card in planning with an
			// awaiting_review summary, mirroring the state before a
			// planning -> in_progress kickoff.
			await renderHarness(createBoard({ backlog: [], planning: [createTask("task-1", "Planning task", 1)] }));

			if (!latestSnapshot) {
				throw new Error("Expected a hook snapshot.");
			}
			await act(async () => {
				latestSnapshot!.setSessions({ "task-1": createSession("task-1", "awaiting_review", 100) });
			});

			// The planning -> in_progress kickoff moves the card; the sessions
			// stream re-delivers the same (stale) summary.
			currentBoard = createBoard({ backlog: [], in_progress: [createTask("task-1", "Planning task", 1)] });
			await renderHarness(currentBoard);

			expect(tryProgrammaticCardMoveMock).not.toHaveBeenCalled();
			expect(cardIn("task-1", "in_progress")).toBe(true);
			expect(cardIn("task-1", "review")).toBe(false);
		});

		it("advances again for a fresh turn after the card returned to in progress", async () => {
			tryProgrammaticCardMoveMock = vi.fn(() => "unavailable" as const);
			mockProgrammaticCardMoves({ cycle: 0 });
			await renderHarness(createBoard({ backlog: [], in_progress: [createTask("task-1", "In progress task", 1)] }));

			if (!latestSnapshot) {
				throw new Error("Expected a hook snapshot.");
			}
			await act(async () => {
				latestSnapshot!.setSessions({ "task-1": createSession("task-1", "awaiting_review", 100) });
			});

			// Turn 1 advanced straight to review (animation unavailable).
			expect(cardIn("task-1", "review")).toBe(true);

			// User re-starts: the running summary moves the card back to
			// in progress via the existing running-state reconciliation.
			await act(async () => {
				latestSnapshot!.setSessions({ "task-1": createSession("task-1", "running", 150) });
			});
			expect(cardIn("task-1", "in_progress")).toBe(true);

			// Turn 2 settles with a fresh awaiting_review summary.
			await act(async () => {
				latestSnapshot!.setSessions({ "task-1": createSession("task-1", "awaiting_review", 200) });
			});
			expect(cardIn("task-1", "review")).toBe(true);
		});
	});
});
