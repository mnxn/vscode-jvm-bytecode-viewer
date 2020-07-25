import * as vscode from "vscode";
import * as AdmZip from "adm-zip";
import * as path from "path";

import * as utils from "./utils";

export class JarNode implements JarNode, vscode.TreeItem {
	children: JarNode[] = [];

	constructor(
		public jarUri: vscode.Uri,
		public fileUri: vscode.Uri = vscode.Uri.file("/"),
		private zip: AdmZip = new AdmZip(jarUri.fsPath),
		files: string[] = utils.zipEntries(zip)
	) {
		const groups: Record<string, string[]> = {};
		for (const file of files) {
			const key = file.match(/^[^/]*\/?/);
			if (key) {
				const collection = groups[key.toString()];
				if (collection) collection.push(file);
				else groups[key.toString()] = [file];
			}
		}

		this.children = Object.keys(groups)
			.map(
				(childName) =>
					new JarNode(
						jarUri,
						utils.uriJoin(this.fileUri.path, childName),
						this.zip,
						groups[childName]
							// Remove parent directory from file paths
							.map((node: string) => node.substr(childName.length))
							// Skip the empty path
							.filter((node: string) => node)
					)
			)
			.sort(JarNode.compare);
	}

	async getText(uri: vscode.Uri): Promise<string> {
		return new Promise((resolve, reject) => {
			try {
				const localPath = uri.path.substr(uri.path.indexOf("!") + 1);
				this.zip?.readAsTextAsync(localPath, resolve);
			} catch (error) {
				reject(error.toString());
			}
		});
	}

	get contextValue(): string {
		if (this.fileUri.path === "/") return "jar";
		else if (this.fileUri.path.endsWith("/")) return "folder";
		else if (this.fileUri.path.endsWith(".class")) return "class";
		else return "file";
	}

	get label(): string {
		if (this.contextValue == "jar") return path.basename(this.jarUri.path);
		return path.basename(this.fileUri.path);
	}

	get resourceUri(): vscode.Uri {
		return vscode.Uri.parse(utils.pathJoin(this.jarUri.path + "!", this.fileUri));
	}

	get collapsibleState(): vscode.TreeItemCollapsibleState {
		switch (this.contextValue) {
			case "folder":
			case "jar":
				return vscode.TreeItemCollapsibleState.Collapsed;
			default:
				return vscode.TreeItemCollapsibleState.None;
		}
	}

	get command(): vscode.Command | undefined {
		const open = (scheme: string, path: string) => ({
			command: "vscode.open",
			arguments: [vscode.Uri.parse(path).with({ scheme })],
			title: "Open Jar Resource",
		});

		switch (this.contextValue) {
			case "file":
				return open("jar-file", this.resourceUri.path);
			case "class":
				const verbose = vscode.workspace
					.getConfiguration("jvm-bytecode-viewer")
					.get("defaultToVerboseOutput") as boolean;
				return open("javap", utils.bytecodeFile(this.resourceUri.path, { verbose }));
			default:
				return undefined;
		}
	}

	static compare(l: JarNode, r: JarNode): number {
		// show folders before other files
		if (l.contextValue !== r.contextValue) {
			if (l.contextValue == "folder") return -1;
			if (r.contextValue == "folder") return 1;
		}
		return l.label.localeCompare(r.label);
	}
}

export class JarTreeDataProvider implements vscode.TreeDataProvider<JarNode>, vscode.TextDocumentContentProvider {
	readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<void>();
	readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

	jarRoots: JarNode[] = [];

	openJar(fileUri: vscode.Uri) {
		this.jarRoots = this.jarRoots.filter((jar) => jar.jarUri.path !== fileUri.path);
		this.jarRoots.push(new JarNode(fileUri));
		this.onDidChangeTreeDataEmitter.fire();
	}

	closeJar(targetJar: vscode.Uri) {
		this.jarRoots = this.jarRoots.filter((jar) => jar.jarUri.path !== targetJar.path);
		this.onDidChangeTreeDataEmitter.fire();
	}

	getTreeItem(element: JarNode) {
		return element;
	}

	getChildren(element?: JarNode) {
		return element?.children ?? this.jarRoots;
	}

	provideTextDocumentContent(uri: vscode.Uri, _token: vscode.CancellationToken): Promise<string> {
		return new Promise((resolve, _reject) => {
			for (const jar of this.jarRoots) {
				if (uri.fsPath.startsWith(jar.jarUri.fsPath)) {
					resolve(jar.getText(uri));
				}
			}
		});
	}
}
