/* eslint-disable @typescript-eslint/naming-convention */

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
    AddBreakpointAtFilenameLine = 604,
    UpdateBreakpointLine = 608,
    DeleteBreakpoint = 610,
    GetBreakpoint = 612,
    DeleteAllBreakpoints = 611,
    AddWatch = 701,
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
    KindBreakpointHit = 600,
    KindBreakpointResolved = 601,
    OutputDebugString = 800,
    BreakpointAdded = 602,
    BreakpointModified = 603,
    BreakpointRemoved = 604,
    SourceLocationChanged = 200,
}

type AddBreakpointAtFilenameLineCommandArg = {
    type: CommandType.AddBreakpointAtFilenameLine;
    filename: string;
    lineNumber: number;
    vscodeId: string;
};

type RemoveBreakpointAtFilenameLineCommandArg = {
    type: CommandType.DeleteBreakpoint;
    vscodeId: string;
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

type GotoFileAtLineCommandArg = {
    type: CommandType.GotoFileAtLine;
    filename: string;
    lineNumber: number;
};

type GetBreakpoint = {
    type: CommandType.GetBreakpoint;
    breakpointId: number;
};

export type CommandArgs =
    | RemoveBreakpointAtFilenameLineCommandArg
    | AddBreakpointAtFilenameLineCommandArg
    | StartDebuggingCommandArg
    | StopDebuggingCommandArg
    | GotoFileAtLineCommandArg
    | StepIntoByLineCommandArg
    | StepOverByLineCommandArg
    | StepOutCommandArg
    | ContinueExecutionCommandArg
    | GetBreakpoint;
