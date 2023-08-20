import * as vscode from "vscode";

export const EXTENSION_ID = "remedybg";

export const STATUS_BAR_MESSAGE = {
    DISCONNECTED: "RemedyBG: Disconnected",
    IDLE: "RemedyBG: Idle",
    DEBUGGING: "RemedyBG: Debugging",
};

export const COMMAND_ID = {
    ASK_START_SESSION: "remedybg.ask_start_session",
    ASK_STOP_SESSION: "remedybg.ask_stop_session",
    START_SESSION: "remedybg.start_session",
    STOP_SESSION: "remedybg.stop_session",
    START_DEBUGGING: "remedybg.start_debugging",
    STOP_DEBUGGING: "remedybg.stop_debugging",
    STEP_INTO: "remedybg.step_into",
    STEP_OVER: "remedybg.step_over",
    STEP_OUT: "remedybg.step_out",
    CONTINUE_EXECUTION: "remedybg.continue_execution",
    GO_TO_FILE_AT_LINE: "remedybg.go_to_file_at_line",
    EXIT: "remedybg.exit",
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
