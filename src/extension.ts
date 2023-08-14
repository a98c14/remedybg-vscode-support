import * as vscode from "vscode";
import * as remedybg from "./remedybg";

export function activate(context: vscode.ExtensionContext) {
    let startSessionCommand = vscode.commands.registerCommand("remedybg-support.start_session", () => {
        remedybg.startSession();
    });

    context.subscriptions.push(startSessionCommand);
}

// This method is called when your extension is deactivated
export function deactivate() {}
