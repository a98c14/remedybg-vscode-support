import { exec } from "child_process";
import * as net from "net";
import { TextEncoder } from "util";
import * as vscode from "vscode";
import { CommandArgs, CommandType, CommandResult } from "./remedybg";
import { read } from "fs";

const PIPE_PREFIX = "\\\\.\\pipe\\";
const encoder = new TextEncoder();
const writeBuffer = Buffer.alloc(1024);

let client: net.Socket | undefined = undefined;
let eventClient: net.Socket | undefined = undefined;

function writeString(str: string, buffer: Buffer, offset: number): number {
    buffer.writeUInt16LE(str.length, offset);
    const { written } = encoder.encodeInto(str, buffer.subarray(offset + 2));
    return written + 2;
}

const breakpoints: Map<number, string> = new Map();
const breakpointsVsCode: Map<string, number> = new Map();

type CommandContext = {
    type: CommandType;
    breakpointVsCodeId?: string;
};

const COMMAND_CONTEXT_EMPTY = { type: CommandType.None };

let lastCommandContext: CommandContext = COMMAND_CONTEXT_EMPTY;

export function sendCommand(command: CommandArgs) {
    if (!client || client.destroyed) {
        vscode.window.showErrorMessage("RemedyBG connection is not live, can't send command!");
        return;
    }

    lastCommandContext = COMMAND_CONTEXT_EMPTY;
    let offset = 0;
    offset += writeBuffer.writeUInt16LE(command.type);
    switch (command.type) {
        case CommandType.AddBreakpointAtFilenameLine:
            {
                offset += writeString(command.filename, writeBuffer, offset);
                offset += writeBuffer.writeUInt32LE(command.lineNumber, offset);
                offset += writeBuffer.writeUInt16LE(0, offset);

                lastCommandContext.type = command.type;
                lastCommandContext.breakpointVsCodeId = command.vscodeId;
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

                lastCommandContext.type = command.type;
                lastCommandContext.breakpointVsCodeId = command.vscodeId;
            }
            break;
    }

    client.write(writeBuffer.subarray(0, offset), (error) => {
        if (error) {
            vscode.window.showErrorMessage(`Received error message from RemedyBG. Error: ${error.name} ${error.message}`);
            return;
        }
    });
}

function processResponseMessage(buffer: Buffer, offset: number) {
    switch (lastCommandContext.type) {
        case CommandType.None:
            {
                vscode.window.showErrorMessage("RemedyBG: Critical error! Returned command has no command context");
            }
            break;
        case CommandType.BringDebuggerToForeground:
        case CommandType.SetWindowPos:
        case CommandType.GetWindowPos:
        case CommandType.CommandExitDebugger:
        case CommandType.GetIsSessionModified:
        case CommandType.GetSessionFilename:
        case CommandType.NewSession:
        case CommandType.OpenSession:
        case CommandType.SaveSession:
        case CommandType.SaveAsSession:
        case CommandType.GotoFileAtLine:
        case CommandType.CloseFile:
        case CommandType.CloseAllFiles:
        case CommandType.GetCurrentFile:
        case CommandType.GetTargetState:
        case CommandType.StartDebugging:
        case CommandType.StopDebugging:
        case CommandType.RestartDebugging:
        case CommandType.StepIntoByLine:
        case CommandType.StepOverByLine:
        case CommandType.StepOut:
        case CommandType.ContinueExecution:
        case CommandType.RunToFileAtLine:
        case CommandType.AddBreakpointAtFilenameLine:
            {
                if (!lastCommandContext.breakpointVsCodeId) {
                    vscode.window.showErrorMessage("RemedyBG: Invalid command!");
                    return;
                }
                const breakpointId = buffer.readInt32LE(offset);
                offset += 4;
                breakpoints.set(breakpointId, lastCommandContext.breakpointVsCodeId);
                breakpointsVsCode.set(lastCommandContext.breakpointVsCodeId, breakpointId);
            }
            break;
        case CommandType.UpdateBreakpointLine:
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
        case CommandType.GetBreakpoint:
        case CommandType.DeleteAllBreakpoints:
        case CommandType.AddWatch:
    }
}

export function startSession(context: vscode.ExtensionContext) {
    const name = vscode.workspace.name;
    vscode.window.showInformationMessage("Starting RemedyBG session");
    const commandPipePath = PIPE_PREFIX + name;
    const eventPipePath = PIPE_PREFIX + name + "-events";

    exec(`remedybg --servername ${name}`, (error, stdout, stderr) => {
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
            buffer: Buffer.alloc(1024),
            callback: (bytesWritten, readBuffer: Buffer) => {
                let offset = 0;
                const code: CommandResult = readBuffer.readUInt16LE(offset);
                offset += 2;

                switch (code) {
                    case CommandResult.Ok:
                        processResponseMessage(readBuffer, offset);
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
                            console.log(`Received bytes (${bytesWritten}). Code: ${code}`);
                            console.log(readBuffer);
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
            vscode.window.showInformationMessage("RemedyBG connection established successfully.");
        });

        client.on("data", (data) => {
            vscode.window.showInformationMessage("RECEIVED DATA MESSAGE. SHOULD NOT HAPPEN!");
        });

        client.on("end", () => {
            vscode.window.showInformationMessage("RemedyBG has been shut down. Closing the connection.");
            client?.destroy();
        });
    }, 500);

    setTimeout(() => {
        const onReadOpts: net.OnReadOpts = {
            buffer: Buffer.alloc(1024),
            callback: (bytesWritten, readBuffer: Buffer) => {
                const code = readBuffer.readUInt16LE();
                console.log(`Received event bytes (${bytesWritten}). Code: ${code}`);
                console.log(readBuffer);
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
