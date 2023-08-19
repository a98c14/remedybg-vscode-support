import { ChildProcess, exec, spawn } from "child_process";
import * as net from "net";
import { TextDecoder, TextEncoder } from "util";
import * as vscode from "vscode";
import { CommandArgs, CommandType, CommandResult, BreakpointKind, EventType, DebuggingTargetBehavior, ModifiedSessionBehavior } from "./remedybg";

const PIPE_PREFIX = "\\\\.\\pipe\\";
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const writeBuffer = Buffer.alloc(4096);

let client: net.Socket | undefined = undefined;
let eventClient: net.Socket | undefined = undefined;
let childProcess: ChildProcess | undefined = undefined;

function writeString(str: string, buffer: Buffer, offset: number): number {
    buffer.writeUInt16LE(str.length, offset);
    const { written } = encoder.encodeInto(str, buffer.subarray(offset + 2));
    return offset + written + 2;
}

function generateRandomString(): string {
    return (Math.random() + 1).toString(36).substring(7);
}

const breakpoints: Map<number, string> = new Map();
const breakpointsVsCode: Map<string, number> = new Map();

let commandQueue: CommandArgs[] = [];

export function sendCommand(command: CommandArgs) {
    if (!client || client.destroyed) {
        vscode.window.showInformationMessage(`RemedyBG connection is not live. Would you like to start a new session?`, "Yes", "No").then((option) => {
            if (option === "Yes") {
                vscode.commands.executeCommand("remedybg-support.start_session");
            }
        });
        return;
    }

    let offset = writeBuffer.writeUInt16LE(command.type);
    switch (command.type) {
        case CommandType.CommandExitDebugger:
            {
                offset = writeBuffer.writeUInt8(command.debugBehaviour, offset);
                offset = writeBuffer.writeUInt8(command.sessionBehaviour, offset);
                // NOTE: If the child process is not killed, exiting RemedyBG closes the VS Code instance.
                childProcess?.kill();
            }
            break;
        case CommandType.GetBreakpoint:
            {
                offset += writeBuffer.writeUInt32LE(command.breakpointId, offset);
            }
            break;
        case CommandType.AddBreakpointAtFilenameLine:
            {
                if (breakpointsVsCode.has(command.vscodeId)) {
                    return;
                }

                offset = writeString(command.filename, writeBuffer, offset);
                offset = writeBuffer.writeUInt32LE(command.lineNumber, offset);
                offset = writeBuffer.writeUInt16LE(0, offset);
            }
            break;
        case CommandType.DeleteBreakpoint:
            {
                const breakpointId = breakpointsVsCode.get(command.vscodeId);
                if (!breakpointId) {
                    return;
                }

                breakpoints.delete(breakpointId);
                breakpointsVsCode.delete(command.vscodeId);

                offset = writeBuffer.writeUInt32LE(breakpointId, offset);
                offset = writeBuffer.writeUInt16LE(0, offset);
            }
            break;
        case CommandType.GotoFileAtLine:
            {
                offset = writeString(command.filename, writeBuffer, offset);
                offset = writeBuffer.writeUInt32LE(command.lineNumber, offset);
                offset = writeBuffer.writeUInt16LE(0, offset);
            }
            break;
        case CommandType.StartDebugging:
            {
                offset = writeBuffer.writeUInt8(0, offset);
            }
            break;
    }

    console.log(`Sent Command: ${CommandType[command.type]}`);
    client.write(writeBuffer.subarray(0, offset), (error) => {
        if (error) {
            vscode.window.showErrorMessage(`Received error message from RemedyBG. Error: ${error.name} ${error.message}`);
            return;
        }
    });
    commandQueue.push(command);
}

function processResponseCommand(buffer: Buffer, offset: number, command: CommandArgs): number {
    switch (command.type) {
        case CommandType.StartDebugging:
        case CommandType.StopDebugging:
            break;
        case CommandType.GotoFileAtLine:
            const fileId = buffer.readUInt32LE(offset);
            offset += 4;
            break;
        case CommandType.GetBreakpoint:
            {
                const breakpointId = buffer.readInt32LE(offset);
                offset += 4;

                const enabled = buffer.readUInt8(offset);
                offset += 1;
                const moduleNameLength = buffer.readUInt16LE(offset);
                offset += 2;
                const moduleName = decoder.decode(buffer.subarray(offset, offset + moduleNameLength));
                offset += moduleNameLength;
                const conditionExprLength = buffer.readUInt16LE(offset);
                offset += 2;
                const conditionExpr = decoder.decode(buffer.subarray(offset, offset + conditionExprLength));
                offset += conditionExprLength;

                const kind: BreakpointKind = buffer.readInt8(offset);
                offset += 1;
                switch (kind) {
                    case BreakpointKind.FunctionName:
                        const functionNameLength = buffer.readInt16LE(offset);
                        offset += 2;
                        const functionName = decoder.decode(buffer.subarray(offset, offset + functionNameLength));
                        offset += functionNameLength;
                        const overloadId = buffer.readUInt32LE(offset);
                        offset += 4;
                        break;
                    case BreakpointKind.FilenameLine:
                        {
                            const filenameLength = buffer.readInt16LE(offset);
                            offset += 2;
                            const filename = decoder.decode(buffer.subarray(offset, offset + filenameLength));
                            offset += filenameLength;
                            const line = buffer.readUInt32LE(offset);
                            offset += 4;

                            if (!breakpoints.has(breakpointId)) {
                                const existingBreakpoints = vscode.debug.breakpoints;
                                for (let i = 0; i < existingBreakpoints.length; i++) {
                                    const sourceBreakpoint = existingBreakpoints[i] as vscode.SourceBreakpoint;
                                    if (sourceBreakpoint && sourceBreakpoint.location.uri.fsPath === filename && sourceBreakpoint.location.range.start.line === line - 1) {
                                        return offset;
                                    }
                                }

                                const breakpoint: vscode.SourceBreakpoint = new vscode.SourceBreakpoint({ uri: vscode.Uri.file(filename), range: new vscode.Range(line - 1, 0, line - 1, 0) }, true);
                                breakpoints.set(breakpointId, breakpoint.id);
                                breakpointsVsCode.set(breakpoint.id, breakpointId);
                                vscode.debug.addBreakpoints([breakpoint]);
                            }
                        }
                        break;
                    case BreakpointKind.Address:
                        const address = buffer.readBigUint64LE(offset);
                        offset += 8;
                        break;
                    case BreakpointKind.Processor:
                        const addressExprLength = buffer.readInt16LE(offset);
                        offset += 2;
                        const addressExpr = decoder.decode(buffer.subarray(offset, offset + addressExprLength));
                        offset += addressExprLength;
                        const numBytes = buffer.readUint8(offset);
                        offset += 1;
                        const accessKind = buffer.readUint8(offset);
                        offset += 1;
                        break;
                }
            }
            break;
        case CommandType.AddBreakpointAtFilenameLine:
            {
                if (!command.vscodeId) {
                    vscode.window.showErrorMessage("RemedyBG: Invalid command!");
                    return offset;
                }
                const breakpointId = buffer.readInt32LE(offset);
                offset += 4;
                breakpoints.set(breakpointId, command.vscodeId);
                breakpointsVsCode.set(command.vscodeId, breakpointId);
            }
            break;
        case CommandType.DeleteBreakpoint:
            break;
    }

    return offset;
}

function processResponseMessage(buffer: Buffer, offset: number): number {
    const command = commandQueue.shift();
    if (!command) {
        vscode.window.showErrorMessage("RemedyBG: Critical Error! Received response for a command that is not set!");
        // HACK: Temporary workaround
        return 4096;
    }

    console.log(`Processed Response: ${CommandType[command.type]}`);
    const code: CommandResult = buffer.readUInt16LE(offset);
    offset += 2;

    switch (code) {
        case CommandResult.Ok:
            offset = processResponseCommand(buffer, offset, command);
            command.onSuccess?.();
            break;
        case CommandResult.InvalidCommand:
            {
                vscode.window.showErrorMessage("RemedyBG: Invalid command!");
            }
            break;
        case CommandResult.FailedOpeningFile:
            {
                vscode.window.showErrorMessage("RemedyBG: Can not open file!");
            }
            break;
        case CommandResult.BufferTooSmall:
            {
                vscode.window.showErrorMessage("RemedyBG: Buffer too small!");
            }
            break;
        case CommandResult.InvalidId:
            {
                vscode.window.showErrorMessage("RemedyBG: Invalid Id!");
            }
            break;
        case CommandResult.FailedSavingSession:
            {
                vscode.window.showErrorMessage("RemedyBG: Failed saving session!");
            }
            break;
        case CommandResult.FailedNoActiveConfig:
            {
                vscode.window.showErrorMessage("RemedyBG: No active config!");
            }
            break;
        case CommandResult.Fail:
            {
                vscode.window.showErrorMessage("RemedyBG: Failed command!");
            }
            break;
        case CommandResult.Aborted:
            {
                vscode.window.showErrorMessage("RemedyBG: Aborted!");
            }
            break;
        case CommandResult.InvalidTargetState:
            {
                vscode.window.showErrorMessage("RemedyBG: Invalid target state!");
            }
            break;
        case CommandResult.InvalidBreakpointKind:
            {
                vscode.window.showErrorMessage("RemedyBG: Invalid breakpoint kind!");
            }
            break;
        case CommandResult.Unknown:
            {
                vscode.window.showErrorMessage("RemedyBG: Unknown error!");
            }
            break;
    }

    return offset;
}

export function startSession(onConnect: () => void, onDisconnect: () => void) {
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
            callback: (bytesWritten, readBuffer: Buffer) => {
                let offset = 0;
                console.log(`Received Response: Bytes(${bytesWritten})`);
                while (bytesWritten > offset) {
                    offset = processResponseMessage(readBuffer, offset);
                }

                if (bytesWritten !== offset) {
                    console.log(`Invalid Response: No command found, bytes written(${bytesWritten}) \n${readBuffer.subarray(0, bytesWritten)}`);
                }
                return true;
            },
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
            onConnect();
        });

        client.on("data", (data) => {
            vscode.window.showInformationMessage("RECEIVED DATA MESSAGE. SHOULD NOT HAPPEN!");
        });

        client.on("end", () => {
            client?.destroy();
            onDisconnect();
        });
    }, 500);

    setTimeout(() => {
        const onReadOpts: net.OnReadOpts = {
            buffer: Buffer.alloc(1024),
            callback: (bytesWritten, readBuffer: Buffer) => {
                let offset = 0;
                const code: EventType = readBuffer.readInt16LE();
                console.log(`Received Event: ${EventType[code]}`);
                offset += 2;
                switch (code) {
                    case EventType.BreakpointAdded:
                        {
                            const breakpointId = readBuffer.readInt32LE(offset);
                            offset += 4;
                            if (breakpoints.has(breakpointId)) {
                                return true;
                            }

                            sendCommand({ type: CommandType.GetBreakpoint, breakpointId: breakpointId });
                        }
                        break;
                    case EventType.BreakpointRemoved:
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
            },
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
}

export function stopSession() {
    sendCommand({
        type: CommandType.CommandExitDebugger,
        debugBehaviour: DebuggingTargetBehavior.IfDebuggingTargetStopDebugging,
        sessionBehaviour: ModifiedSessionBehavior.IfSessionIsModifiedSaveAndContinue,
    });
}
