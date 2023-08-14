import * as vscode from "vscode";
import { CommandType } from "./remedybg";
import * as command from "./command";

export function activate(context: vscode.ExtensionContext) {
    let startSessionCommand = vscode.commands.registerCommand("remedybg-support.start_session", () => {
        command.startSession(context);
    });

    vscode.debug.onDidChangeBreakpoints((e) => {
        for (let i = 0; i < e.added.length; i++) {
            const breakpoint = e.added[i] as vscode.SourceBreakpoint;
            command.sendCommand({ type: CommandType.AddBreakpointAtFilenameLine, filename: breakpoint.location.uri.fsPath, lineNumber: breakpoint.location.range.start.line + 1, vscodeId: breakpoint.id });
        }

        for (let i = 0; i < e.removed.length; i++) {
            const breakpoint = e.removed[i] as vscode.SourceBreakpoint;
            command.sendCommand({ type: CommandType.DeleteBreakpoint, vscodeId: breakpoint.id });
        }
    });

    context.subscriptions.push(startSessionCommand);
}

// This method is called when your extension is deactivated
export function deactivate() {}
