// Kickoff prompts for the planning column.
//
// When a card enters the planning column, its agent runs a planning-only
// session that writes the plan to PLAN.md in the task worktree. When the card
// later moves to in progress, the implementation session is told to use that
// plan as its guide.

export const PLANNING_DOC_FILE_NAME = "PLAN.md";

export function buildPlanningKickoffPrompt(taskPrompt: string): string {
	return [
		`You are in a PLANNING session for the following task. Do NOT implement anything yet.`,
		`Analyze the codebase and produce a concrete implementation plan covering the goal, approach, files to change, ordered steps, and risks.`,
		`Write the complete plan to ${PLANNING_DOC_FILE_NAME} at the repository root (create or overwrite the file).`,
		`Once the plan is written, stop and briefly summarize it. Do not start implementation.`,
		``,
		`Task:`,
		taskPrompt.trim(),
	].join("\n");
}

export function buildPlannedImplementationKickoffPrompt(taskPrompt: string): string {
	return [
		`Implement the following task.`,
		`A plan from an earlier planning session may exist in ${PLANNING_DOC_FILE_NAME} at the repository root.`,
		`Read it first and follow it as your guide. If the plan is outdated or wrong, adapt it, note the changes in ${PLANNING_DOC_FILE_NAME}, and proceed.`,
		``,
		`Task:`,
		taskPrompt.trim(),
	].join("\n");
}
