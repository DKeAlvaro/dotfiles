/**
 * vault-memory — Álvaro's memory hook for Pi.
 *
 * Replaces pi-memory (removed from settings.json packages). His system:
 * the only source of truth is the git vault /root/pocket-vault-2/memory/.
 * Rules live in memorysetup.md (symlink to the vault's SETUP.md).
 *
 * This extension does exactly one thing: inject MEMORY.md into the system
 * prompt (byte-stable, no instructions, no daily log, no scratchpad).
 *
 * No memory tools: the agent reads/searches the vault with its normal
 * read/grep/bash tools — it knows the paths from MEMORY.md itself.
 *
 * Writing = edit the vault file directly (follow its format rules, see
 * memorysetup.md), then `git -C /root/pocket-vault-2` commit + push.
 */
import fs from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const VAULT = "/root/pocket-vault-2/memory";
const MEMORY_MD = `${VAULT}/MEMORY.md`;

export default function vaultMemory(pi: ExtensionAPI) {
	pi.on("before_agent_start", async (event) => {
		let memory = "";
		try {
			memory = fs.readFileSync(MEMORY_MD, "utf8");
		} catch {
			return;
		}
		if (!memory.trim()) return;
		return {
			systemPrompt:
				event.systemPrompt +
				"\n\n## Memory (always-on index)\n\n" +
				memory +
				"\n\nAll files referenced above live in " +
				VAULT +
				"/ — read them with your normal file tools when a trigger matches. To persist something: edit the vault file directly (follow its own format rules, see memorysetup.md), then `git -C /root/pocket-vault-2` commit + push.\n",
		};
	});
}
