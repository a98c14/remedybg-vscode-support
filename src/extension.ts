import * as vscode from "vscode";
import { CommandType } from "./remedybg";
import * as command from "./command";

let remedybgStatusBar: vscode.StatusBarItem;
const remedybgDisconnectedStatusText = "RemedyBG: Disconnected";
const remedybgConnectedStatusText = "RemedyBG: Connected";

/* Command Ids */
const askStartSessionCommandId = "remedybg-support.ask_start_session";
const askStopSessionCommandId = "remedybg-support.ask_stop_session";
const startSessionCommandId = "remedybg-support.start_session";
const stopSessionCommandId = "remedybg-support.stop_session";
const startDebuggingCommandId = "remedybg-support.start_debugging";
const stopDebuggingCommandId = "remedybg-support.stop_debugging";
const stepIntoCommandId = "remedybg-support.step_into";
const stepOverCommandId = "remedybg-support.step_over";
const stepOutCommandId = "remedybg-support.step_out";
const continueExecutionCommandId = "remedybg-support.continue_execution";
const goToFileAtLineCommandId = "remedybg-support.go_to_file_at_line";

export function activate(context: vscode.ExtensionContext) {
    remedybgStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    remedybgStatusBar.command = askStartSessionCommandId;
    remedybgStatusBar.text = remedybgDisconnectedStatusText;
    remedybgStatusBar.show();

    const askStartSessionCommand = vscode.commands.registerCommand(askStartSessionCommandId, () => {
        vscode.window.showInformationMessage("RemedyBG session is not alive. Would you like to start a new session?", "Yes, start a new session").then(() => {
            vscode.commands.executeCommand(startSessionCommandId);
        });
    });

    const askStopSessionCommand = vscode.commands.registerCommand(askStopSessionCommandId, () => {
        vscode.window.showInformationMessage("Are you sure you want to stop the existing RemedyBG session?", "Yes, stop the session").then(() => {
            vscode.commands.executeCommand(stopSessionCommandId);
        });
    });

    const startSessionCommand = vscode.commands.registerCommand(startSessionCommandId, () => {
        command.startSession(
            context,
            () => {
                vscode.window.showInformationMessage("Established connection with RemedyBG");
                remedybgStatusBar.text = remedybgConnectedStatusText;
                remedybgStatusBar.command = askStopSessionCommandId;
            },
            () => {
                vscode.window.showInformationMessage("RemedyBG has been shut down. Closing the connection.");
                remedybgStatusBar.text = remedybgDisconnectedStatusText;
                remedybgStatusBar.command = askStartSessionCommandId;
            }
        );
    });

    const stopSessionCommand = vscode.commands.registerCommand(stopSessionCommandId, () => {
        command.stopSession();
    });

    const startDebuggingCommand = vscode.commands.registerCommand(startDebuggingCommandId, () => {
        command.sendCommand({ type: CommandType.StartDebugging });
    });

    const stopDebuggingCommand = vscode.commands.registerCommand(stopDebuggingCommandId, () => {
        command.sendCommand({ type: CommandType.StopDebugging });
    });

    const stepIntoCommand = vscode.commands.registerCommand(stepIntoCommandId, () => {
        command.sendCommand({ type: CommandType.StepIntoByLine });
    });

    const stepOverCommand = vscode.commands.registerCommand(stepOverCommandId, () => {
        command.sendCommand({ type: CommandType.StepOverByLine });
    });

    const stepOutCommand = vscode.commands.registerCommand(stepOutCommandId, () => {
        command.sendCommand({ type: CommandType.StepOut });
    });

    const continueExecutionCommand = vscode.commands.registerCommand(continueExecutionCommandId, () => {
        command.sendCommand({ type: CommandType.ContinueExecution });
    });

    const goToFileAtLineCommand = vscode.commands.registerCommand(goToFileAtLineCommandId, () => {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            return;
        }

        command.sendCommand({ type: CommandType.GotoFileAtLine, filename: activeEditor.document.uri.fsPath, lineNumber: activeEditor.selection.start.line + 1 });
    });

    // TODO(selim): pull this from config
    const goToLineWhenBreakpointUpdated = true;
    vscode.debug.onDidChangeBreakpoints((e) => {
        for (let i = 0; i < e.added.length; i++) {
            const breakpoint = e.added[i] as vscode.SourceBreakpoint;
            const breakpointPath = breakpoint.location.uri.fsPath;
            const breakpointLine = breakpoint.location.range.start.line + 1;
            command.sendCommand({ type: CommandType.AddBreakpointAtFilenameLine, filename: breakpointPath, lineNumber: breakpointLine, vscodeId: breakpoint.id });

            if (goToLineWhenBreakpointUpdated) {
                setTimeout(() => {
                    command.sendCommand({ type: CommandType.GotoFileAtLine, filename: breakpointPath, lineNumber: breakpointLine });
                }, 100);
            }
        }

        for (let i = 0; i < e.removed.length; i++) {
            const breakpoint = e.removed[i] as vscode.SourceBreakpoint;
            command.sendCommand({ type: CommandType.DeleteBreakpoint, vscodeId: breakpoint.id });
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
}

// This method is called when your extension is deactivated
export function deactivate() {
    vscode.commands.executeCommand(stopSessionCommandId);
}
