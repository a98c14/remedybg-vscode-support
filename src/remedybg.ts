import { TextDecoder, TextEncoder } from "util";

export enum TargetState {
    None = 1,
    Suspended = 2,
    Executing = 3,
}

export enum CommandType {
    None = 0,
    BringDebuggerToForeground = 50,
    SetWindowPos = 51,
    GetWindowPos = 52,
    SetBringToForegroundOnSuspended = 53,
    CommandExitDebugger = 75,
    GetIsSessionModified = 100,
    GetSessionFilename = 101,
    NewSession = 102,
    OpenSession = 103,
    SaveSession = 104,
    SaveAsSession = 105,
    GotoFileAtLine = 200,
    CloseFile = 201,
    CloseAllFiles = 202,
    GetCurrentFile = 203,
    GetTargetState = 300,
    StartDebugging = 301,
    StopDebugging = 302,
    RestartDebugging = 303,
    StepIntoByLine = 307,
    StepOverByLine = 309,
    StepOut = 311,
    ContinueExecution = 312,
    RunToFileAtLine = 313,
    BreakExecution = 314,
    GetBreakpoints = 600,
    AddBreakpointAtFunction = 603,
    AddBreakpointAtFilenameLine = 604,
    UpdateBreakpointLine = 608,
    EnableBreakpoint = 609,
    DeleteBreakpoint = 610,
    GetBreakpoint = 612,
    DeleteAllBreakpoints = 611,
    AddWatch = 701,
}

export enum ModifiedSessionBehavior {
    IfSessionIsModifiedSaveAndContinue = 1,
    IfSessionIsModifiedContinueWithoutSaving = 2,
    IfSessionIsModifiedAbortCommand = 3,
}

export enum DebuggingTargetBehavior {
    IfDebuggingTargetStopDebugging = 1,
    IfDebuggingTargetAbortCommand = 2,
}

export enum BreakpointKind {
    FunctionName = 1,
    FilenameLine = 2,
    Address = 3,
    Processor = 4,
}

export enum CommandResult {
    Unknown = 0,
    Ok = 1,
    Fail = 2,
    Aborted = 3,
    InvalidCommand = 4,
    BufferTooSmall = 5,
    FailedOpeningFile = 6,
    FailedSavingSession = 7,
    InvalidId = 8,
    InvalidTargetState = 9,
    FailedNoActiveConfig = 10,
    InvalidBreakpointKind = 11,
}

export enum SourceLocChangeReason {
    Unspecified = 0,
    CommandLine = 1,
    Driver = 2,
    BreakpointSelected = 3,
    CurrentFrameChanged = 4,
    ThreadChanged = 5,
    BreakpointHit = 6,
    ExceptionHit = 7,
    StepOver = 8,
    StepIn = 9,
    StepOut = 10,
    NonUserBreakpoint = 11,
    DebugBreak = 12,
}

export enum EventType {
    ExitProcess = 100,
    TargetStarted = 101,
    TargetAttached = 102,
    TargetDetached = 103,
    TargetContinued = 104,
    SourceLocationChanged = 200,
    BreakpointHit = 600,
    BreakpointResolved = 601,
    BreakpointAdded = 602,
    BreakpointModified = 603,
    BreakpointRemoved = 604,
    OutputDebugString = 800,
}

/* Breakpoint Types */
type BreakpointFunction = {
    kind: BreakpointKind.FunctionName;
    functionName: string;
    overloadId: number;
};

type BreakpointFilenameLine = {
    kind: BreakpointKind.FilenameLine;
    fileName: string;
    line: number;
};

type BreakpointAddress = {
    kind: BreakpointKind.Address;
    address: BigInt;
};

type BreakpointProcessor = {
    kind: BreakpointKind.Processor;
};

type RemedyBreakpointKindData = BreakpointFunction | BreakpointFilenameLine | BreakpointAddress | BreakpointProcessor;

type RemedyBreakpoint = {
    id: number;
    enabled: boolean;
    moduleName: string;
    conditionExpr: string;
    kindData: RemedyBreakpointKindData | null;
};

/* Command Args */
type AddBreakpointAtFilenameLineCommandArg = {
    type: CommandType.AddBreakpointAtFilenameLine;
    filename: string;
    lineNumber: number;
    vscodeId: string;
};

type DeleteBreakpointCommandArg = {
    type: CommandType.DeleteBreakpoint;
    breakpointId: number;
    vscodeId: string;
};

type DeleteAllBreakpointsCommandArg = {
    type: CommandType.DeleteAllBreakpoints;
};

type StartDebuggingCommandArg = {
    type: CommandType.StartDebugging;
};

type StopDebuggingCommandArg = {
    type: CommandType.StopDebugging;
};

type StepIntoByLineCommandArg = {
    type: CommandType.StepIntoByLine;
};

type StepOverByLineCommandArg = {
    type: CommandType.StepOverByLine;
};

type StepOutCommandArg = {
    type: CommandType.StepOut;
};

type ContinueExecutionCommandArg = {
    type: CommandType.ContinueExecution;
};

type BreakExecutionCommandArg = {
    type: CommandType.BreakExecution;
};

type GetBreakpointsCommandArg = {
    type: CommandType.GetBreakpoints;
};

type GotoFileAtLineCommandArg = {
    type: CommandType.GotoFileAtLine;
    filename: string;
    lineNumber: number;
};

type GetBreakpointCommandArg = {
    type: CommandType.GetBreakpoint;
    breakpointId: number;
};

type CommandExitDebuggerCommandArg = {
    type: CommandType.CommandExitDebugger;
    debugBehaviour: DebuggingTargetBehavior;
    sessionBehaviour: ModifiedSessionBehavior;
};

type EnableBreakpointCommandArg = {
    type: CommandType.EnableBreakpoint;
    breakpointId: number;
    enabled: boolean;
};

type SetBringToForegroundOnSuspendedCommandArg = {
    type: CommandType.SetBringToForegroundOnSuspended;
    enabled: boolean;
};

export type CommandArgs =
    | DeleteBreakpointCommandArg
    | AddBreakpointAtFilenameLineCommandArg
    | StartDebuggingCommandArg
    | StopDebuggingCommandArg
    | GotoFileAtLineCommandArg
    | StepIntoByLineCommandArg
    | StepOverByLineCommandArg
    | StepOutCommandArg
    | ContinueExecutionCommandArg
    | GetBreakpointCommandArg
    | CommandExitDebuggerCommandArg
    | EnableBreakpointCommandArg
    | BreakExecutionCommandArg
    | DeleteAllBreakpointsCommandArg
    | GetBreakpointsCommandArg
    | SetBringToForegroundOnSuspendedCommandArg;

/* Command Return */
export type AddBreakpointAtFilenameLineCommandReturn = {
    breakpointId: number;
};

export type GetBreakpointCommandReturn = {
    breakpoint: RemedyBreakpoint;
};

export type GetBreakpointsCommandReturn = {
    count: number;
    breakpoints: RemedyBreakpoint[];
};

export type CommandReturn = AddBreakpointAtFilenameLineCommandReturn | GetBreakpointCommandReturn | GetBreakpointsCommandReturn;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function writeString(str: string, buffer: Buffer, offset: number): number {
    buffer.writeUInt16LE(str.length, offset);
    const { written } = encoder.encodeInto(str, buffer.subarray(offset + 2));
    return offset + written + 2;
}

export function readString(buffer: Buffer, offset: number): [str: string, offset: number] {
    const length = buffer.readUInt16LE(offset);
    offset += 2;
    const str = decoder.decode(buffer.subarray(offset, offset + length));
    offset += length;
    return [str, offset];
}

export function writeCommand(args: CommandArgs, buffer: Buffer): number {
    let offset = buffer.writeUInt16LE(args.type);
    switch (args.type) {
        case CommandType.SetBringToForegroundOnSuspended:
            {
                offset = buffer.writeUInt8(args.enabled ? 1 : 0, offset);
            }
            break;
        case CommandType.CommandExitDebugger:
            {
                offset = buffer.writeUInt8(args.debugBehaviour, offset);
                offset = buffer.writeUInt8(args.sessionBehaviour, offset);
            }
            break;
        case CommandType.GetBreakpoint:
            {
                offset = buffer.writeUInt32LE(args.breakpointId, offset);
            }
            break;
        case CommandType.EnableBreakpoint:
            {
                offset = buffer.writeUInt32LE(args.breakpointId, offset);
                offset = buffer.writeUInt8(args.enabled ? 0 : 1, offset);
            }
            break;
        case CommandType.AddBreakpointAtFilenameLine:
            {
                offset = writeString(args.filename, buffer, offset);
                offset = buffer.writeUInt32LE(args.lineNumber, offset);
                offset = buffer.writeUInt16LE(0, offset);
            }
            break;
        case CommandType.DeleteBreakpoint:
            {
                offset = buffer.writeUInt32LE(args.breakpointId, offset);
                offset = buffer.writeUInt16LE(0, offset);
            }
            break;
        case CommandType.GotoFileAtLine:
            {
                offset = writeString(args.filename, buffer, offset);
                offset = buffer.writeUInt32LE(args.lineNumber, offset);
                offset = buffer.writeUInt16LE(0, offset);
            }
            break;
        case CommandType.StartDebugging:
            {
                offset = buffer.writeUInt8(0, offset);
            }
            break;
    }
    return offset;
}

function readBreakpointKindData(buffer: Buffer, offset: number): [breakpointKind: RemedyBreakpointKindData | null, offset: number] {
    let breakpointKind: RemedyBreakpointKindData | null;

    const kind: BreakpointKind = buffer.readInt8(offset);
    offset += 1;
    switch (kind) {
        case BreakpointKind.FunctionName:
            {
                let functionName;
                [functionName, offset] = readString(buffer, offset);
                const overloadId = buffer.readUInt32LE(offset);
                offset += 4;
                breakpointKind = { kind: BreakpointKind.FunctionName, functionName: functionName, overloadId: overloadId };
            }
            break;
        case BreakpointKind.FilenameLine:
            {
                let filename;
                [filename, offset] = readString(buffer, offset);
                const line = buffer.readUInt32LE(offset);
                offset += 4;
                breakpointKind = { kind: BreakpointKind.FilenameLine, fileName: filename, line: line };
            }
            break;
        case BreakpointKind.Address:
            {
                const address = buffer.readBigUint64LE(offset);
                offset += 8;
                breakpointKind = { kind: BreakpointKind.Address, address: address };
            }
            break;
        case BreakpointKind.Processor:
            {
                let addressExpr;
                [addressExpr, offset] = readString(buffer, offset);
                const numBytes = buffer.readUint8(offset);
                offset += 1;
                const accessKind = buffer.readUint8(offset);
                offset += 1;
                breakpointKind = { kind: BreakpointKind.Processor };
            }
            break;
        default:
            breakpointKind = null;
    }

    return [breakpointKind, offset];
}

function readBreakpoint(buffer: Buffer, offset: number): [breakpoint: RemedyBreakpoint, offset: number] {
    const breakpointId = buffer.readInt32LE(offset);
    offset += 4;

    const enabled = buffer.readUInt8(offset);
    offset += 1;

    let moduleName;
    [moduleName, offset] = readString(buffer, offset);

    let conditionExpr;
    [conditionExpr, offset] = readString(buffer, offset);

    let breakpointKind;
    [breakpointKind, offset] = readBreakpointKindData(buffer, offset);

    const breakpoint: RemedyBreakpoint = {
        id: breakpointId,
        conditionExpr: conditionExpr,
        enabled: enabled > 0,
        moduleName: moduleName,
        kindData: breakpointKind,
    };

    return [breakpoint, offset];
}

export function readCommand(type: CommandType, buffer: Buffer, offset: number): [result: CommandResult, data: CommandReturn | null, offset: number] {
    const result: CommandResult = buffer.readUInt16LE(offset);
    offset += 2;
    let data: CommandReturn | null;
    switch (type) {
        case CommandType.GotoFileAtLine:
            {
                const fileId = buffer.readUInt32LE(offset);
                offset += 4;
                data = null;
            }
            break;
        case CommandType.GetBreakpoint:
            {
                let breakpoint;
                [breakpoint, offset] = readBreakpoint(buffer, offset);
                data = {
                    breakpoint: breakpoint,
                };
            }
            break;
        case CommandType.GetBreakpoints:
            {
                const count = buffer.readUInt16LE(offset);
                offset += 2;
                const breakpoints: RemedyBreakpoint[] = [];
                for (let i = 0; i < count; i++) {
                    let breakpoint;
                    [breakpoint, offset] = readBreakpoint(buffer, offset);
                    breakpoints.push(breakpoint);
                }

                data = {
                    count: count,
                    breakpoints: breakpoints,
                };
            }
            break;
        case CommandType.AddBreakpointAtFilenameLine:
            {
                const breakpointId = buffer.readInt32LE(offset);
                offset += 4;
                data = {
                    breakpointId: breakpointId,
                };
            }
            break;
        default:
            data = null;
    }

    return [result, data, offset];
}
