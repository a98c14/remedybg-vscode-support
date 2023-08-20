import * as vscode from "vscode";

export const EXTENSION_ID = "remedybg-support";

export const STATUS_BAR_MESSAGE = {
    DISCONNECTED: "RemedyBG: Disconnected",
    IDLE: "RemedyBG: Idle",
    DEBUGGING: "RemedyBG: Debugging",
};

export const COMMAND_ID = {
    ASK_START_SESSION: "remedybg-support.ask_start_session",
    ASK_STOP_SESSION: "remedybg-support.ask_stop_session",
    START_SESSION: "remedybg-support.start_session",
    STOP_SESSION: "remedybg-support.stop_session",
    START_DEBUGGING: "remedybg-support.start_debugging",
    STOP_DEBUGGING: "remedybg-support.stop_debugging",
    STEP_INTO: "remedybg-support.step_into",
    STEP_OVER: "remedybg-support.step_over",
    STEP_OUT: "remedybg-support.step_out",
    CONTINUE_EXECUTION: "remedybg-support.continue_execution",
    GO_TO_FILE_AT_LINE: "remedybg-support.go_to_file_at_line",
    EXIT: "remedybg-support.exit",
};

const CONFIG_ID = {
    GO_TO_LINE_ON_NEW_BREAKPOINT: "goToLineOnNewBreakpoint",
};

type ConfigStore = {
    goToLineWhenBreakpointUpdated: boolean;
};

export let configStore: ConfigStore = {
    goToLineWhenBreakpointUpdated: false,
};

export function loadConfiguration() {
    const configuration = vscode.workspace.getConfiguration(EXTENSION_ID);
    configStore.goToLineWhenBreakpointUpdated = configuration.get(CONFIG_ID.GO_TO_LINE_ON_NEW_BREAKPOINT) ?? false;
}
