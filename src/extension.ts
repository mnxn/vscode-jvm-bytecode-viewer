import * as vscode from "vscode";
import * as fs from "fs";

import JavapContentProvider from "./JavapContentProvider";
import { JarTreeDataProvider, JarNode } from "./JarTreeDataProvider";
import * as utils from "./utils";

export function activate(context: vscode.ExtensionContext) {
	utils.output.appendLine("Activated.");

	const javapProvider = new JavapContentProvider();
	const jarProvider = new JarTreeDataProvider();

	context.subscriptions.push(
		utils.output,

		vscode.workspace.registerTextDocumentContentProvider("javap", javapProvider),
		vscode.commands.registerCommand("jvm-bytecode-viewer.show-bytecode", async (fileUri: vscode.Uri) => {
			await showBytecode(fileUri);
		}),
		vscode.commands.registerCommand("jvm-bytecode-viewer.show-bytecode-verbose", async (fileUri: vscode.Uri) => {
			await showBytecode(fileUri, { verbose: true });
		}),

		vscode.window.registerTreeDataProvider("jarExplorer", jarProvider),
		vscode.workspace.registerTextDocumentContentProvider("jar-file", jarProvider),
		vscode.commands.registerCommand("jvm-bytecode-viewer.explore-jar-file", (uri: vscode.Uri | null) => {
			if (uri instanceof vscode.Uri) {
				jarProvider.openJar(uri);
			} else if (vscode.window.activeTextEditor) {
				jarProvider.openJar(vscode.window.activeTextEditor.document.uri);
			} else {
				throw new Error("no jar file provided");
			}
		}),
		vscode.commands.registerCommand("jvm-bytecode-viewer.close-jar-file", (jar: JarNode) => {
			jarProvider.closeJar(jar.jarUri);
		})
	);

	async function showBytecode(arg: vscode.Uri | JarNode | null, { verbose = false }: { verbose?: boolean } = {}) {
		let currentFilePath;
		if (arg instanceof JarNode && arg.command) {
			currentFilePath = arg.resourceUri.path;
		} else if (arg instanceof vscode.Uri) {
			currentFilePath = arg.fsPath;
		} else if (vscode.window.activeTextEditor) {
			currentFilePath = vscode.window.activeTextEditor.document.uri.fsPath;
		} else {
			throw new Error("no bytecode file provided");
		}

		const currentClassFile = utils.classFile(currentFilePath);
		const bytecodePath = utils.bytecodeFile(currentClassFile, { verbose });
		const bytecodeUri = vscode.Uri.file(bytecodePath).with({ scheme: "javap" });

		await vscode.window.showTextDocument(bytecodeUri);

		if (!utils.isInJar(currentFilePath)) {
			const fsWatcher = fs.watch(currentClassFile, () => {
				utils.output.appendLine(`Updated: ${bytecodePath}`);
				javapProvider.onDidChangeEmitter.fire(bytecodeUri);
			});
			context.subscriptions.push({ dispose: () => fsWatcher.close() });
		}
	}
}
