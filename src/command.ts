import { ChildProcess, spawn } from "child_process";
import * as net from "net";
import * as vscode from "vscode";
import { COMMAND_ID, STATUS_BAR_MESSAGE, configStore } from "./configuration";
import * as rbg from "./remedybg";

const PIPE_PREFIX = "\\\\.\\pipe\\";
const writeBuffer = Buffer.alloc(4096);

let client: net.Socket | undefined = undefined;
let eventClient: net.Socket | undefined = undefined;
let childProcess: ChildProcess | undefined = undefined;
let remedybgStatusBar: vscode.StatusBarItem;
let targetState: rbg.TargetState = rbg.TargetState.None;

const breakHighlight = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor("editor.focusedStackFrameHighlightBackground"),
});

function generateRandomString(): string {
    return (Math.random() + 1).toString(36).substring(7);
}

const breakpointIds_RBG_VSC: Map<number, string> = new Map();
const breakpointIds_VSC_RBG: Map<string, number> = new Map();

let commandQueue: rbg.CommandArgs[] = [];

export function addBreakpointAtFilenameLine(vscodeId: string, filename: string, lineNumber: number): boolean {
    if (breakpointIds_VSC_RBG.has(vscodeId)) {
        return false;
    }

    sendCommand({ type: rbg.CommandType.AddBreakpointAtFilenameLine, filename, lineNumber, vscodeId });
    return true;
}

export function modifyBreakpoint(vscodeId: string, enabled: boolean) {
    const breakpointId = breakpointIds_VSC_RBG.get(vscodeId);
    if (!breakpointId) {
        console.warn("Modified breakpoint doesn't exist in RemedyBG!");
        return;
    }

    sendCommand({ type: rbg.CommandType.EnableBreakpoint, breakpointId, enabled });
}

export function deleteBreakpoint(vscodeId: string) {
    const breakpointId = breakpointIds_VSC_RBG.get(vscodeId);
    if (!breakpointId) {
        return;
    }

    breakpointIds_RBG_VSC.delete(breakpointId);
    breakpointIds_VSC_RBG.delete(vscodeId);
    sendCommand({ type: rbg.CommandType.DeleteBreakpoint, breakpointId, vscodeId });
}

export function deleteAllBreakpoints() {
    breakpointIds_RBG_VSC.clear();
    breakpointIds_VSC_RBG.clear();
    sendCommand({ type: rbg.CommandType.DeleteAllBreakpoints });
}

export function getAllBreakpoints() {
    sendCommand({ type: rbg.CommandType.GetBreakpoints });
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
    const bps = vscode.debug.breakpoints;
    for (let i = 0; i < bps.length; i++) {
        const bp = bps[i];
        if (bp instanceof vscode.SourceBreakpoint && bp.location.uri.fsPath === filename && bp.location.range.start.line === line - 1) {
            return true;
        }
    }

    return false;
}

function getBreakpointLocation(vscodeId: string): vscode.Location | null {
    const bps = vscode.debug.breakpoints;
    for (let i = 0; i < bps.length; i++) {
        const bp = bps[i];
        if (bp instanceof vscode.SourceBreakpoint && bp.id === vscodeId) {
            return bp.location;
        }
    }
    return null;
}

function getBreakpointIdAt(filename: string, line: number): string | null {
    const bps = vscode.debug.breakpoints;
    for (let i = 0; i < bps.length; i++) {
        const bp = bps[i];
        if (bp instanceof vscode.SourceBreakpoint && bp.location.uri.fsPath === filename && bp.location.range.start.line === line) {
            return bp.id;
        }
    }

    return null;
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
            case rbg.CommandType.StopDebugging: {
                vscode.window.activeTextEditor?.setDecorations(breakHighlight, []);
                break;
            }
            case rbg.CommandType.AddBreakpointAtFilenameLine:
                {
                    const { breakpointId } = data as rbg.AddBreakpointAtFilenameLineCommandReturn;
                    breakpointIds_RBG_VSC.set(breakpointId, command.vscodeId);
                    breakpointIds_VSC_RBG.set(command.vscodeId, breakpointId);
                }
                break;
            case rbg.CommandType.GetBreakpoints:
                {
                    const { count, breakpoints } = data as rbg.GetBreakpointsCommandReturn;
                    breakpointIds_RBG_VSC.clear();
                    breakpointIds_VSC_RBG.clear();
                    const breakpointsToAdd: vscode.Breakpoint[] = [];
                    for (let i = 0; i < count; i++) {
                        const breakpoint = breakpoints[i];
                        if (breakpointIds_RBG_VSC.has(breakpoint.id)) {
                            continue;
                        }

                        switch (breakpoint.kindData?.kind) {
                            case rbg.BreakpointKind.FilenameLine:
                                {
                                    const filename = breakpoint.kindData.fileName;
                                    const line = breakpoint.kindData.line - 1;
                                    const existingBreakpoint = getBreakpointIdAt(filename, line);
                                    if (existingBreakpoint) {
                                        breakpointIds_RBG_VSC.set(breakpoint.id, existingBreakpoint);
                                        breakpointIds_VSC_RBG.set(existingBreakpoint, breakpoint.id);
                                    } else {
                                        const vscodeBP: vscode.SourceBreakpoint = new vscode.SourceBreakpoint({ uri: vscode.Uri.file(filename), range: new vscode.Range(line, 0, line, 0) }, true);
                                        breakpointIds_RBG_VSC.set(breakpoint.id, vscodeBP.id);
                                        breakpointIds_VSC_RBG.set(vscodeBP.id, breakpoint.id);
                                        breakpointsToAdd.push(vscodeBP);
                                    }
                                }
                                break;
                        }
                    }

                    const breakpointsToRemove = vscode.debug.breakpoints.filter((x) => !breakpointIds_VSC_RBG.has(x.id));
                    vscode.debug.addBreakpoints(breakpointsToAdd);
                    vscode.debug.removeBreakpoints(breakpointsToRemove);
                }
                break;
            case rbg.CommandType.GetBreakpoint:
                {
                    const { breakpoint } = data as rbg.GetBreakpointCommandReturn;

                    if (breakpointIds_RBG_VSC.has(breakpoint.id)) {
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
                                breakpointIds_RBG_VSC.set(breakpoint.id, vscodeBP.id);
                                breakpointIds_VSC_RBG.set(vscodeBP.id, breakpoint.id);
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
        case rbg.EventType.TargetContinued:
            {
                const editor = vscode.window.activeTextEditor;
                editor?.setDecorations(breakHighlight, []);
            }
            break;
        case rbg.EventType.ExitProcess:
            {
                const editor = vscode.window.activeTextEditor;
                editor?.setDecorations(breakHighlight, []);
                remedybgStatusBar.text = STATUS_BAR_MESSAGE.IDLE;
            }
            break;
        case rbg.EventType.BreakpointModified:
        case rbg.EventType.BreakpointAdded:
            {
                const breakpointId = readBuffer.readInt32LE(offset);
                offset += 4;
                if (breakpointIds_RBG_VSC.has(breakpointId)) {
                    return true;
                }

                sendCommand({ type: rbg.CommandType.GetBreakpoint, breakpointId: breakpointId });
            }
            break;
        case rbg.EventType.SourceLocationChanged:
            {
                let filename;
                [filename, offset] = rbg.readString(readBuffer, offset);
                const line = readBuffer.readUInt32LE(offset);
                offset += 4;
                const reason: rbg.SourceLocChangeReason = readBuffer.readUInt16LE(offset);
                offset += 2;

                switch (reason) {
                    case rbg.SourceLocChangeReason.BreakpointHit:
                    case rbg.SourceLocChangeReason.StepOut:
                    case rbg.SourceLocChangeReason.StepOver:
                    case rbg.SourceLocChangeReason.StepIn:
                    case rbg.SourceLocChangeReason.ExceptionHit:
                    case rbg.SourceLocChangeReason.DebugBreak:
                        {
                            const location = new vscode.Location(vscode.Uri.file(filename), new vscode.Range(line - 1, 0, line - 1, Number.MAX_VALUE));

                            vscode.workspace.openTextDocument(location.uri).then(async (document) => {
                                const editor = await vscode.window.showTextDocument(document, {
                                    selection: location.range,
                                    preserveFocus: false,
                                });
                                editor.setDecorations(breakHighlight, [location]);
                            });
                        }
                        break;
                }
            }
            break;
        case rbg.EventType.BreakpointHit:
            {
                const breakpointId = readBuffer.readInt32LE(offset);
                const breakpointVsCodeId = breakpointIds_RBG_VSC.get(breakpointId);
                if (!breakpointVsCodeId) {
                    console.log("RemedyBG: Hit breakpoint doesn't exist in VS Code, ignoring.");
                    return true;
                }

                const location = getBreakpointLocation(breakpointVsCodeId);
                if (!location) {
                    console.error("Could not find breakpoint location despite having breakpoint in id map! Should never happen.");
                    return true;
                }

                vscode.workspace.openTextDocument(location.uri).then(async (document) => {
                    const editor = await vscode.window.showTextDocument(document);
                    editor.revealRange(location.range);
                });
            }
            break;
        case rbg.EventType.BreakpointRemoved:
            {
                const breakpointId = readBuffer.readInt32LE(offset);
                offset += 4;
                const breakpointVsCodeId = breakpointIds_RBG_VSC.get(breakpointId);
                if (!breakpointVsCodeId) {
                    return true;
                }

                breakpointIds_RBG_VSC.delete(breakpointId);
                breakpointIds_VSC_RBG.delete(breakpointVsCodeId);
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
    if (client && !client.destroyed) {
        vscode.window.showInformationMessage("RemedyBG: Session is already active. Close the existing session before starting a new one.");
        return;
    }

    if (!remedybgStatusBar) {
        remedybgStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    }
    remedybgStatusBar.command = COMMAND_ID.ASK_START_SESSION;
    remedybgStatusBar.text = STATUS_BAR_MESSAGE.DISCONNECTED;
    remedybgStatusBar.show();

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
            if (configStore.syncBreakpointsAtSessionStart) {
                getAllBreakpoints();
            }

            setTimeout(() => sendCommand({ type: rbg.CommandType.SetBringToForegroundOnSuspended, enabled: false }), 100);
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

        eventClient.on("end", () => {
            console.log(`RemedyBG event has been shut down. Closing the connection.`);
            eventClient?.destroy();
        });
    }, 500);
}

export function stopSession() {
    if (!client || client.destroyed) {
        vscode.window.showInformationMessage("RemedyBG: Session is not active.");
        return;
    }

    const editor = vscode.window.activeTextEditor;
    editor?.setDecorations(breakHighlight, []);

    childProcess?.kill();
    sendCommand({
        type: rbg.CommandType.CommandExitDebugger,
        debugBehaviour: rbg.DebuggingTargetBehavior.IfDebuggingTargetStopDebugging,
        sessionBehaviour: rbg.ModifiedSessionBehavior.IfSessionIsModifiedSaveAndContinue,
    });
}
