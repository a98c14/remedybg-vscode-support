import * as vscode from "vscode";
import * as command from "./command";
import { COMMAND_ID, configStore, EXTENSION_ID, loadConfiguration } from "./configuration";
import { CommandType, DebuggingTargetBehavior, ModifiedSessionBehavior } from "./remedybg";

export function activate(context: vscode.ExtensionContext) {
    loadConfiguration();
    vscode.workspace.onDidChangeConfiguration((e) => {
        if (!e.affectsConfiguration(EXTENSION_ID)) {
            return;
        }
        loadConfiguration();
    });

    const askStartSessionCommand = vscode.commands.registerCommand(COMMAND_ID.ASK_START_SESSION, () => {
        vscode.window.showInformationMessage("RemedyBG session is not alive. Would you like to start a new session?", "Yes, start a new session").then(() => {
            vscode.commands.executeCommand(COMMAND_ID.START_SESSION);
        });
    });

    const askStopSessionCommand = vscode.commands.registerCommand(COMMAND_ID.ASK_STOP_SESSION, () => {
        vscode.window.showInformationMessage("Are you sure you want to stop the existing RemedyBG session?", "Yes, stop the session").then(() => {
            vscode.commands.executeCommand(COMMAND_ID.STOP_SESSION);
        });
    });

    const startSessionCommand = vscode.commands.registerCommand(COMMAND_ID.START_SESSION, () => {
        command.startSession();
    });

    const stopSessionCommand = vscode.commands.registerCommand(COMMAND_ID.STOP_SESSION, () => {
        command.stopSession();
    });

    const startDebuggingCommand = vscode.commands.registerCommand(COMMAND_ID.START_DEBUGGING, () => {
        command.sendCommand({ type: CommandType.StartDebugging });
    });

    const exitCommand = vscode.commands.registerCommand(COMMAND_ID.EXIT, () => {
        command.sendCommand({ type: CommandType.CommandExitDebugger, debugBehaviour: DebuggingTargetBehavior.IfDebuggingTargetStopDebugging, sessionBehaviour: ModifiedSessionBehavior.IfSessionIsModifiedSaveAndContinue });
    });

    const stopDebuggingCommand = vscode.commands.registerCommand(COMMAND_ID.STOP_DEBUGGING, () => {
        command.sendCommand({ type: CommandType.StopDebugging });
    });

    const stepIntoCommand = vscode.commands.registerCommand(COMMAND_ID.STEP_INTO, () => {
        command.sendCommand({ type: CommandType.StepIntoByLine });
    });

    const stepOverCommand = vscode.commands.registerCommand(COMMAND_ID.STEP_OVER, () => {
        command.sendCommand({ type: CommandType.StepOverByLine });
    });

    const stepOutCommand = vscode.commands.registerCommand(COMMAND_ID.STEP_OUT, () => {
        command.sendCommand({ type: CommandType.StepOut });
    });

    const continueExecutionCommand = vscode.commands.registerCommand(COMMAND_ID.CONTINUE_EXECUTION, () => {
        command.sendCommand({ type: CommandType.ContinueExecution });
    });

    const goToFileAtLineCommand = vscode.commands.registerCommand(COMMAND_ID.GO_TO_FILE_AT_LINE, () => {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            return;
        }

        command.sendCommand({ type: CommandType.GotoFileAtLine, filename: activeEditor.document.uri.fsPath, lineNumber: activeEditor.selection.start.line + 1 });
    });

    vscode.debug.onDidChangeBreakpoints((e) => {
        for (let i = 0; i < e.added.length; i++) {
            const breakpoint = e.added[i] as vscode.SourceBreakpoint;
            const breakpointPath = breakpoint.location.uri.fsPath;
            const breakpointLine = breakpoint.location.range.start.line + 1;
            command.addBreakpointAtFilenameLine(breakpoint.id, breakpointPath, breakpointLine);
            if (configStore.goToLineWhenBreakpointUpdated) {
                command.sendCommand({ type: CommandType.GotoFileAtLine, filename: breakpointPath, lineNumber: breakpointLine });
            }
        }

        for (let i = 0; i < e.removed.length; i++) {
            const breakpoint = e.removed[i] as vscode.SourceBreakpoint;
            command.deleteBreakpoint(breakpoint.id);
        }
    });

    context.subscriptions.push(askStartSessionCommand);
    context.subscriptions.push(askStopSessionCommand);
    context.subscriptions.push(startSessionCommand);
    context.subscriptions.push(stopSessionCommand);
    context.subscriptions.push(startDebuggingCommand);
    context.subscriptions.push(stopDebuggingCommand);
    context.subscriptions.push(goToFileAtLineCommand);
    context.subscriptions.push(stepIntoCommand);
    context.subscriptions.push(stepOverCommand);
    context.subscriptions.push(stepOutCommand);
    context.subscriptions.push(continueExecutionCommand);
    context.subscriptions.push(exitCommand);
}

// This method is called when your extension is deactivated
export function deactivate() {
    command.stopSession();
}
