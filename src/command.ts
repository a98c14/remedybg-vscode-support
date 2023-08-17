import { ChildProcess, exec } from "child_process";
import * as net from "net";
import { TextDecoder, TextEncoder } from "util";
import * as vscode from "vscode";
import { CommandArgs, CommandType, CommandResult, BreakpointKind, EventType } from "./remedybg";

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
    return written + 2;
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

    let offset = 0;
    offset += writeBuffer.writeUInt16LE(command.type);
    switch (command.type) {
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

                offset += writeString(command.filename, writeBuffer, offset);
                offset += writeBuffer.writeUInt32LE(command.lineNumber, offset);
                offset += writeBuffer.writeUInt16LE(0, offset);
            }
            break;
        case CommandType.DeleteBreakpoint:
            {
                const breakpointId = breakpointsVsCode.get(command.vscodeId);
                if (!breakpointId) {
                    return;
                }

                offset += writeBuffer.writeUInt32LE(breakpointId, offset);
                offset += writeBuffer.writeUInt16LE(0, offset);
            }
            break;
        case CommandType.GotoFileAtLine:
            {
                offset += writeString(command.filename, writeBuffer, offset);
                offset += writeBuffer.writeUInt32LE(command.lineNumber, offset);
                offset += writeBuffer.writeUInt16LE(0, offset);
            }
            break;
        case CommandType.StartDebugging:
            {
                offset += writeBuffer.writeUInt8(0, offset);
            }
            break;
    }

    commandQueue.push(command);
    client.write(writeBuffer.subarray(0, offset), (error) => {
        if (error) {
            vscode.window.showErrorMessage(`Received error message from RemedyBG. Error: ${error.name} ${error.message}`);
            return;
        }
    });
}

function processResponseMessage(buffer: Buffer, offset: number, command: CommandArgs) {
    switch (command.type) {
        case CommandType.StartDebugging:
        case CommandType.StopDebugging:
            break;
        case CommandType.GetBreakpoint:
            {
                const breakpointId = buffer.readInt32LE(offset);
                offset += 4;

                if (breakpoints.has(breakpointId)) {
                    return;
                }

                const enabled = buffer.readInt8(offset);
                offset += 1;
                const moduleNameLength = buffer.readInt16LE(offset);
                offset += 2;
                const moduleName = decoder.decode(buffer.subarray(offset, offset + moduleNameLength));
                offset += moduleNameLength;
                const conditionExprLength = buffer.readInt16LE(offset);
                offset += 2;
                const conditionExpr = decoder.decode(buffer.subarray(offset, offset + conditionExprLength));
                offset += conditionExprLength;

                const kind: BreakpointKind = buffer.readInt8(offset);
                offset += 1;
                switch (kind) {
                    case BreakpointKind.FunctionName:
                        break;
                    case BreakpointKind.FilenameLine:
                        {
                            const filenameLength = buffer.readInt16LE(offset);
                            offset += 2;
                            const filename = decoder.decode(buffer.subarray(offset, offset + filenameLength));
                            offset += filenameLength;
                            const line = buffer.readInt32LE(offset);
                            offset += 4;
                            const breakpoint: vscode.SourceBreakpoint = new vscode.SourceBreakpoint({ uri: vscode.Uri.file(filename), range: new vscode.Range(line - 1, 0, line - 1, 0) }, true);
                            breakpoints.set(breakpointId, breakpoint.id);
                            breakpointsVsCode.set(breakpoint.id, breakpointId);
                            vscode.debug.addBreakpoints([breakpoint]);
                        }
                        break;
                    case BreakpointKind.Address:
                        break;
                    case BreakpointKind.Processor:
                        break;
                }
            }
            break;
        case CommandType.AddBreakpointAtFilenameLine:
            {
                if (!command.vscodeId) {
                    vscode.window.showErrorMessage("RemedyBG: Invalid command!");
                    return;
                }
                const breakpointId = buffer.readInt32LE(offset);
                offset += 4;
                breakpoints.set(breakpointId, command.vscodeId);
                breakpointsVsCode.set(command.vscodeId, breakpointId);
            }
            break;
        case CommandType.DeleteBreakpoint:
            {
                const breakpointId = buffer.readInt32LE(offset);
                offset += 4;
                const vscodeId = breakpoints.get(breakpointId);
                if (vscodeId) {
                    breakpointsVsCode.delete(vscodeId);
                }
                breakpoints.delete(breakpointId);
            }
            break;
    }
}

export function startSession(onConnect: () => void, onDisconnect: () => void) {
    const name = vscode.workspace.name + "_" + generateRandomString();
    const commandPipePath = PIPE_PREFIX + name;
    const eventPipePath = PIPE_PREFIX + name + "-events";

    childProcess = exec(`remedybg --servername ${name}`, (error, stdout, stderr) => {
        if (error) {
            vscode.window.showErrorMessage("Received error while launching `remedybg.exe`. Error: " + error.message);
            return;
        }

        if (stderr) {
            vscode.window.showErrorMessage("Received error while launching `remedybg.exe`. Error: " + stderr);
            return;
        }
    });

    setTimeout(() => {
        const onReadOpts: net.OnReadOpts = {
            buffer: Buffer.alloc(4096),
            callback: (bytesWritten, readBuffer: Buffer) => {
                const command = commandQueue.shift();
                if (!command) {
                    vscode.window.showErrorMessage("RemedyBG: Critical Error! Received response for a command that is not set!");
                    return false;
                }

                let offset = 0;
                const code: CommandResult = readBuffer.readUInt16LE(offset);
                offset += 2;

                switch (code) {
                    case CommandResult.Ok:
                        processResponseMessage(readBuffer, offset, command);
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
    client?.destroy();
    eventClient?.destroy();
    if (childProcess?.pid) {
        process.kill(childProcess.pid);
    }
    childProcess?.kill("SIGKILL");
    client = undefined;
    eventClient = undefined;
    client = undefined;
}
