import { ChildProcess, spawn } from "child_process";
import * as net from "net";
import * as vscode from "vscode";
import * as rbg from "./remedybg";
import { COMMAND_ID, STATUS_BAR_MESSAGE } from "./configuration";

const PIPE_PREFIX = "\\\\.\\pipe\\";
const writeBuffer = Buffer.alloc(4096);

let client: net.Socket | undefined = undefined;
let eventClient: net.Socket | undefined = undefined;
let childProcess: ChildProcess | undefined = undefined;
let remedybgStatusBar: vscode.StatusBarItem;
let targetState: rbg.TargetState = rbg.TargetState.None;

function generateRandomString(): string {
    return (Math.random() + 1).toString(36).substring(7);
}

const breakpoints: Map<number, string> = new Map();
const breakpointsVsCode: Map<string, number> = new Map();

let commandQueue: rbg.CommandArgs[] = [];

export function addBreakpointAtFilenameLine(vscodeId: string, filename: string, lineNumber: number) {
    if (breakpointsVsCode.has(vscodeId)) {
        return;
    }

    sendCommand({ type: rbg.CommandType.AddBreakpointAtFilenameLine, filename, lineNumber, vscodeId });
}

export function deleteBreakpoint(vscodeId: string) {
    const breakpointId = breakpointsVsCode.get(vscodeId);
    if (!breakpointId) {
        return;
    }

    breakpoints.delete(breakpointId);
    breakpointsVsCode.delete(vscodeId);
    sendCommand({ type: rbg.CommandType.DeleteBreakpoint, breakpointId, vscodeId });
}

export function sendCommand(command: rbg.CommandArgs) {
    if (!client || client.destroyed) {
        vscode.window.showInformationMessage(`RemedyBG connection is not live. Would you like to start a new session?`, "Yes", "No").then((option) => {
            if (option === "Yes") {
                vscode.commands.executeCommand("remedybg.start_session");
            }
        });
        return;
    }

    const offset = rbg.writeCommand(command, writeBuffer);
    console.log(`Sent Command: ${rbg.CommandType[command.type]}`);
    client.write(writeBuffer.subarray(0, offset), (error) => {
        if (error) {
            vscode.window.showErrorMessage(`Received error message from RemedyBG. Error: ${error.name} ${error.message}`);
            return;
        }
    });
    commandQueue.push(command);
}

const ERROR_MESSAGES = {
    [rbg.CommandResult.InvalidCommand]: "RemedyBG: Invalid command!",
    [rbg.CommandResult.FailedOpeningFile]: "RemedyBG: Can not open file!",
    [rbg.CommandResult.BufferTooSmall]: "RemedyBG: Buffer too small!",
    [rbg.CommandResult.InvalidId]: "RemedyBG: Invalid Id!",
    [rbg.CommandResult.FailedSavingSession]: "RemedyBG: Failed saving session!",
    [rbg.CommandResult.FailedNoActiveConfig]: "RemedyBG: No active config!",
    [rbg.CommandResult.Fail]: "RemedyBG: Failed command!",
    [rbg.CommandResult.Aborted]: "RemedyBG: Aborted!",
    [rbg.CommandResult.InvalidTargetState]: "RemedyBG: Invalid target state!",
    [rbg.CommandResult.InvalidBreakpointKind]: "RemedyBG: Invalid breakpoint kind!",
    [rbg.CommandResult.Unknown]: "RemedyBG: Unknown error!",
};

function hasBreakpointAt(filename: string, line: number): boolean {
    const existingBreakpoints = vscode.debug.breakpoints;
    for (let i = 0; i < existingBreakpoints.length; i++) {
        const sourceBreakpoint = existingBreakpoints[i] as vscode.SourceBreakpoint;
        if (sourceBreakpoint && sourceBreakpoint.location.uri.fsPath === filename && sourceBreakpoint.location.range.start.line === line - 1) {
            return true;
        }
    }
    return false;
}

function processResponse(bytesWritten: number, readBuffer: Buffer): boolean {
    let offset = 0;
    console.log(`Received Response: Bytes(${bytesWritten})`);
    while (bytesWritten > offset) {
        const command = commandQueue.shift();
        if (!command) {
            vscode.window.showErrorMessage("RemedyBG: Critical Error! Command undefined.");
            break;
        }

        let data: rbg.CommandReturn | null;
        let result: rbg.CommandResult;
        [result, data, offset] = rbg.readCommand(command.type, readBuffer, offset);
        console.log(`Processed Response: ${rbg.CommandType[command.type]}. Result: ${rbg.CommandResult[result]}`);
        if (result !== rbg.CommandResult.Ok) {
            vscode.window.showErrorMessage(ERROR_MESSAGES[result]);
            continue;
        }

        if (!data) {
            continue;
        }

        switch (command.type) {
            case rbg.CommandType.AddBreakpointAtFilenameLine:
                {
                    const { breakpointId } = data as rbg.AddBreakpointAtFilenameLineCommandReturn;
                    breakpoints.set(breakpointId, command.vscodeId);
                    breakpointsVsCode.set(command.vscodeId, breakpointId);
                }
                break;
            case rbg.CommandType.GetBreakpoint:
                {
                    const { breakpoint } = data as rbg.GetBreakpointCommandReturn;

                    if (breakpoints.has(breakpoint.id)) {
                        continue;
                    }

                    switch (breakpoint.kindData?.kind) {
                        case rbg.BreakpointKind.FilenameLine:
                            {
                                const filename = breakpoint.kindData.fileName;
                                const line = breakpoint.kindData.line;
                                if (hasBreakpointAt(filename, line)) {
                                    continue;
                                }

                                const vscodeBP: vscode.SourceBreakpoint = new vscode.SourceBreakpoint({ uri: vscode.Uri.file(filename), range: new vscode.Range(line - 1, 0, line - 1, 0) }, true);
                                breakpoints.set(breakpoint.id, vscodeBP.id);
                                breakpointsVsCode.set(vscodeBP.id, breakpoint.id);
                                vscode.debug.addBreakpoints([vscodeBP]);
                            }
                            break;
                    }
                }
                break;
        }
    }

    if (bytesWritten !== offset) {
        console.log(`Invalid Response: Could not read all of the response buffer. Bytes written(${bytesWritten}), bytes read(${offset}) \n${readBuffer.subarray(0, bytesWritten)}`);
    }

    return true;
}

function processEvent(bytesWritten: number, readBuffer: Buffer): boolean {
    let offset = 0;
    const code: rbg.EventType = readBuffer.readInt16LE();
    console.log(`Received Event: ${rbg.EventType[code]}. Bytes written: (${bytesWritten})`);
    offset += 2;
    switch (code) {
        case rbg.EventType.TargetStarted:
            remedybgStatusBar.text = STATUS_BAR_MESSAGE.DEBUGGING;
            break;
        case rbg.EventType.ExitProcess:
            remedybgStatusBar.text = STATUS_BAR_MESSAGE.IDLE;
            break;
        case rbg.EventType.BreakpointAdded:
            {
                const breakpointId = readBuffer.readInt32LE(offset);
                offset += 4;
                if (breakpoints.has(breakpointId)) {
                    return true;
                }

                sendCommand({ type: rbg.CommandType.GetBreakpoint, breakpointId: breakpointId });
            }
            break;
        case rbg.EventType.BreakpointRemoved:
            {
                const breakpointId = readBuffer.readInt32LE(offset);
                offset += 4;
                const breakpointVsCodeId = breakpoints.get(breakpointId);
                if (!breakpointVsCodeId) {
                    return true;
                }

                breakpoints.delete(breakpointId);
                breakpointsVsCode.delete(breakpointVsCodeId);
                const breakpoint = vscode.debug.breakpoints.find((x) => x.id === breakpointVsCodeId);
                if (breakpoint) {
                    vscode.debug.removeBreakpoints([breakpoint]);
                }
            }
            break;
    }
    return true;
}

export function startSession() {
    const name = vscode.workspace.name + "_" + generateRandomString();
    const commandPipePath = PIPE_PREFIX + name;
    const eventPipePath = PIPE_PREFIX + name + "-events";

    childProcess = spawn(`remedybg.exe`, ["--servername", name], { detached: true });
    if (!childProcess) {
        vscode.window.showErrorMessage("Could not start RemedyBG! Make sure installation path is correct or `remedybg.exe` is set in PATH.");
    }
    childProcess?.stdout?.on("data", (data) => {
        console.log(`stdout: ${data}`);
    });

    childProcess?.stderr?.on("data", (data) => {
        console.error(`stderr: ${data}`);
    });

    childProcess?.on("exit", (code) => {
        console.log(`Child process exited with code ${code}`);
    });
    childProcess.unref();

    setTimeout(() => {
        const onReadOpts: net.OnReadOpts = {
            buffer: Buffer.alloc(4096),
            callback: processResponse,
        };

        const options: net.NetConnectOpts = {
            path: commandPipePath,
            writable: true,
            readable: true,
            keepAlive: true,
            onread: onReadOpts,
        };

        client = net.createConnection(options, () => {
            console.log(`RemedyBG connection established successfully.`);
            vscode.window.showInformationMessage("Established connection with RemedyBG");
            remedybgStatusBar.text = STATUS_BAR_MESSAGE.IDLE;
            remedybgStatusBar.command = COMMAND_ID.ASK_STOP_SESSION;
        });

        client.on("data", (data) => {
            vscode.window.showInformationMessage("RECEIVED DATA MESSAGE. SHOULD NOT HAPPEN!");
        });

        client.on("end", () => {
            client?.destroy();
            vscode.window.showInformationMessage("RemedyBG has been shut down. Closing the connection.");
            remedybgStatusBar.text = STATUS_BAR_MESSAGE.DISCONNECTED;
            remedybgStatusBar.command = COMMAND_ID.ASK_START_SESSION;
        });
    }, 500);

    setTimeout(() => {
        const onReadOpts: net.OnReadOpts = {
            buffer: Buffer.alloc(1024),
            callback: processEvent,
        };

        const options: net.NetConnectOpts = {
            path: eventPipePath,
            writable: false,
            readable: true,
            keepAlive: true,
            onread: onReadOpts,
        };

        eventClient = net.createConnection(options, () => {
            console.log(`RemedyBG event connection established successfully.`);
        });

        eventClient.on("data", (data) => {
            vscode.window.showInformationMessage("RECEIVED DATA MESSAGE. SHOULD NOT HAPPEN!");
        });

        eventClient.on("end", () => {
            console.log(`RemedyBG event has been shut down. Closing the connection.`);
            eventClient?.destroy();
        });
    }, 500);

    remedybgStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    remedybgStatusBar.command = COMMAND_ID.ASK_START_SESSION;
    remedybgStatusBar.text = STATUS_BAR_MESSAGE.DISCONNECTED;
    remedybgStatusBar.show();
}

export function stopSession() {
    childProcess?.kill();
    sendCommand({
        type: rbg.CommandType.CommandExitDebugger,
        debugBehaviour: rbg.DebuggingTargetBehavior.IfDebuggingTargetStopDebugging,
        sessionBehaviour: rbg.ModifiedSessionBehavior.IfSessionIsModifiedSaveAndContinue,
    });
}
