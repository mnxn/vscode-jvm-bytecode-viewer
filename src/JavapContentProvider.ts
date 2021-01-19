import * as vscode from "vscode";
import * as child_process from "child_process";

import * as utils from "./utils";

export default class JavapContentProvider implements vscode.TextDocumentContentProvider {
	readonly onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
	readonly onDidChange = this.onDidChangeEmitter.event;

	provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
		return new Promise((resolve, _reject) => {
			let javapArgs: string[] = ["-c", "-constants", "-private"];
			if (/\.bytecode\.verbose$/.test(uri.fsPath)) {
				javapArgs.push("-verbose", "-l");
			} else if (!/\.bytecode$/.test(uri.fsPath)) {
				throw new Error("invalid file extension");
			}

			if (utils.isInJar(uri.fsPath)) {
				javapArgs.push(utils.classFile("jar:file:" + uri.path.replace(/ /g, "%20")));
			} else {
				javapArgs.push(utils.classFile(uri.fsPath));
			}

			utils.output.appendLine(["Command:", "javap", ...javapArgs].join(" "));
			const command = child_process.execFile("javap", javapArgs);

			let stdout = "";
			let stderr = "";

			command.stdout?.on("data", (data: { toString(): string }) => {
				stdout += data.toString();
			});

			command.stderr?.on("data", (data: { toString(): string }) => {
				stderr += data.toString();
			});

			command.on("close", (code: number) => {
				if (code === 0) resolve(stdout);
				else {
					utils.output.appendLine("Command Failed:");
					utils.output.appendLine(stderr.replace(/^/gm, "\t")); // indent stderr
					throw new Error(stderr);
				}
			});

			command.on("error", (error) => {
				utils.output.appendLine(`Command Failed: ${error.message}`);
				throw new Error(error.message);
			});
		});
	}
}
