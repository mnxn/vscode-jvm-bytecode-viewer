import * as vscode from "vscode";
import * as fs from "fs";
import * as child_process from "child_process";

const output = vscode.window.createOutputChannel("JVM Bytecode Viewer");

export function activate(context: vscode.ExtensionContext) {
	output.appendLine("Activated.");

	const provider = new JavapContentProvider();
	context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider("javap", provider));

	async function showBytecode(fileUri: vscode.Uri, { verbose = false }: { verbose?: boolean } = {}) {
		const currentFile = await getCurrentFile(fileUri);
		const currentClassFile = classFile(currentFile.fsPath);
		const bytecodePath = bytecodeFile(currentClassFile, { verbose });
		const bytecodeUri = vscode.Uri.file(bytecodePath).with({ scheme: "javap" });

		const textDocument = await vscode.workspace.openTextDocument(bytecodeUri);
		vscode.window.showTextDocument(textDocument);

		const fsWatcher = fs.watch(currentClassFile, () => {
			output.appendLine(`Updated: ${bytecodePath}`);
			provider.onDidChangeEmitter.fire(bytecodeUri);
		});
		context.subscriptions.push({ dispose: () => fsWatcher.close() });
	}

	context.subscriptions.push(
		vscode.commands.registerCommand("jvm-bytecode-viewer.show-bytecode", async (fileUri: vscode.Uri) => {
			await showBytecode(fileUri);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand("jvm-bytecode-viewer.show-bytecode-verbose", async (fileUri: vscode.Uri) => {
			await showBytecode(fileUri, { verbose: true });
		})
	);
}

class JavapContentProvider implements vscode.TextDocumentContentProvider {
	onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
	onDidChange = this.onDidChangeEmitter.event;

	public provideTextDocumentContent(uri: vscode.Uri): Thenable<string> {
		return new Promise((resolve, reject) => {
			let javapArgs = [];

			if (/\.bytecode\.verbose$/.test(uri.fsPath)) {
				javapArgs.push("-verbose");
			} else if (/\.bytecode$/.test(uri.fsPath)) {
				javapArgs.push("-c", "-private");
			} else {
				reject("invalid file extension");
			}

			javapArgs.push("-constants", classFile(uri.fsPath));

			output.appendLine(["Command:", "javap", ...javapArgs].join(" "));
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
					output.appendLine("Command Failed:");
					output.appendLine(stderr.replace(/^/gm, "\t")); // indent stderr
					reject(stderr);
				}
			});

			command.on("error", (error) => {
				output.appendLine(`Command Failed: ${error.message}`);
				throw reject(error.message);
			});
		});
	}
}

async function getCurrentFile(fileUri: vscode.Uri): Promise<vscode.Uri> {
	if (fileUri !== undefined && fileUri !== null) return fileUri;

	const editor = vscode.window.activeTextEditor;
	if (editor !== undefined && editor !== null) return editor.document.uri;

	throw "no .class file provided.";
}

function classFile(bytecodeFile: string): string {
	return bytecodeFile.replace(/\.bytecode(\.verbose)?$/, ".class");
}

function bytecodeFile(classFile: string, { verbose = false }: { verbose?: boolean } = {}): string {
	return verbose === true
		? classFile.replace(/\.class$/, ".bytecode.verbose")
		: classFile.replace(/\.class$/, ".bytecode");
}
