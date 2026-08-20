/**
 * ActionRunner — executes file writes, shell commands, and dev server starts
 * inside a WebContainer instance.
 * Adapted from bolt.diy's action-runner.ts.
 */

import type { WebContainer, WebContainerProcess } from "@webcontainer/api";
import { getWebContainer } from "./index";

export type ActionStatus = "pending" | "running" | "complete" | "failed";

export interface ActionState {
  id: string;
  type: "file" | "shell" | "start";
  filePath?: string;
  content: string;
  status: ActionStatus;
}

type TerminalOutput = (data: string) => void;

export class ActionRunner {
  #currentExecutionPromise: Promise<void> = Promise.resolve();
  #actions = new Map<string, ActionState>();
  #onTerminalOutput?: TerminalOutput;
  #devServerProcess?: WebContainerProcess;

  constructor(onTerminalOutput?: TerminalOutput) {
    this.#onTerminalOutput = onTerminalOutput;
  }

  get actions(): Map<string, ActionState> {
    return this.#actions;
  }

  setTerminalOutput(callback: TerminalOutput) {
    this.#onTerminalOutput = callback;
  }

  /**
   * Register an action with pending status.
   */
  addAction(actionId: string, type: "file" | "shell" | "start", filePath?: string) {
    if (this.#actions.has(actionId)) return;

    this.#actions.set(actionId, {
      id: actionId,
      type,
      filePath,
      content: "",
      status: "pending",
    });
  }

  /**
   * Execute an action. For file actions, supports streaming (partial content).
   * For shell/start, executes the command.
   */
  async runAction(
    actionId: string,
    type: "file" | "shell" | "start",
    content: string,
    filePath?: string,
    isStreaming = false,
  ) {
    const action = this.#actions.get(actionId);
    if (action) {
      action.content = content;
      action.status = "running";
    }

    this.#currentExecutionPromise = this.#currentExecutionPromise
      .then(async () => {
        switch (type) {
          case "file":
            await this.#runFileAction(filePath!, content);
            break;
          case "shell":
            if (!isStreaming) {
              await this.#runShellAction(content);
            }
            break;
          case "start":
            if (!isStreaming) {
              await this.#runStartAction(content);
            }
            break;
        }

        if (!isStreaming && action) {
          action.status = "complete";
        }
      })
      .catch((error) => {
        console.error("[ActionRunner] Action failed:", error);
        if (action) {
          action.status = "failed";
        }
      });

    return this.#currentExecutionPromise;
  }

  async #runFileAction(filePath: string, content: string) {
    const webcontainer = await getWebContainer();
    const relativePath = filePath.startsWith("/home/project/")
      ? filePath.replace("/home/project/", "")
      : filePath;

    // Create directories
    const dir = relativePath.split("/").slice(0, -1).join("/");
    if (dir) {
      try {
        await webcontainer.fs.mkdir(dir, { recursive: true });
      } catch {
        // Directory may already exist
      }
    }

    // Write file
    try {
      await webcontainer.fs.writeFile(relativePath, content);
    } catch (error) {
      console.error(`[ActionRunner] Failed to write file ${relativePath}:`, error);
    }
  }

  async #runShellAction(command: string) {
    const webcontainer = await getWebContainer();
    const args = command.split(" ");
    const cmd = args[0];
    const cmdArgs = args.slice(1);

    this.#onTerminalOutput?.(`\r\n$ ${command}\r\n`);

    const process = await webcontainer.spawn(cmd, cmdArgs);

    process.output.pipeTo(
      new WritableStream({
        write: (data) => {
          this.#onTerminalOutput?.(data);
        },
      }),
    );

    const exitCode = await process.exit;

    if (exitCode !== 0) {
      throw new Error(`Command "${command}" exited with code ${exitCode}`);
    }
  }

  async #runStartAction(command: string) {
    const webcontainer = await getWebContainer();
    const args = command.split(" ");
    const cmd = args[0];
    const cmdArgs = args.slice(1);

    this.#onTerminalOutput?.(`\r\n$ ${command}\r\n`);

    // Kill previous dev server if any
    if (this.#devServerProcess) {
      this.#devServerProcess.kill();
    }

    this.#devServerProcess = await webcontainer.spawn(cmd, cmdArgs);

    // Non-blocking: pipe output but don't await exit
    this.#devServerProcess.output.pipeTo(
      new WritableStream({
        write: (data) => {
          this.#onTerminalOutput?.(data);
        },
      }),
    );
  }

  /**
   * Kill the dev server process if running.
   */
  killDevServer() {
    if (this.#devServerProcess) {
      this.#devServerProcess.kill();
      this.#devServerProcess = undefined;
    }
  }
}
