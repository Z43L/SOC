import WebSocket from 'ws';
import os from 'os';
import path from 'path';
import fs from 'fs/promises';

// ---------- basic configurable settings ----------
const CONFIG_FILE = path.resolve(__dirname, '../agent.yml');
const DEFAULT_URL = 'ws://localhost:5000/api/ws/agents';
const HEARTBEAT_INTERVAL = 30_000; // 30 s
//--------------------------------------------------

// Small helper to read an optional YAML config file
async function loadWsUrl(): Promise<string> {
	try {
		const yaml = await import('js-yaml');
		const raw = await fs.readFile(CONFIG_FILE, 'utf8');
		const cfg = yaml.load(raw) as { server?: string };
		return cfg?.server ?? DEFAULT_URL;
	} catch {
		return DEFAULT_URL;
	}
}

// Helper to build WebSocket URL with token
function buildWebSocketUrl(baseUrl: string): string {
	try {
		const url = new URL(baseUrl);
		// Add token if not already present
		if (!url.searchParams.has('token')) {
			url.searchParams.set('token', 'development-agent-token');
		}
		return url.toString();
	} catch {
		// Fallback for simple URLs
		const separator = baseUrl.includes('?') ? '&' : '?';
		return `${baseUrl}${separator}token=development-agent-token`;
	}
}

(async () => {
	const baseUrl = await loadWsUrl();
	const serverUrl = buildWebSocketUrl(baseUrl);
	const socket = new WebSocket(serverUrl);

	const agentId = `${os.hostname()}-${process.pid}`;

	socket.on('open', () => {
		// Register agent
		socket.send(
			JSON.stringify({
				type: 'register',
				id: agentId,
				hostname: os.hostname(),
				pid: process.pid
			})
		);

		// Immediately mark it as online
		socket.send(JSON.stringify({ type: 'status', id: agentId, state: 'online' }));

		// Heartbeat timer
		setInterval(() => {
			if (socket.readyState === WebSocket.OPEN) {
				socket.send(JSON.stringify({ type: 'heartbeat', id: agentId, ts: Date.now() }));
			}
		}, HEARTBEAT_INTERVAL);
	});

	// Handle incoming messages (e.g. ping or commands)
	socket.on('message', async raw => {
		let msg: any;
		try {
			msg = JSON.parse(raw.toString());
		} catch {
			return;
		}

		switch (msg.type) {
			case 'ping':
				socket.send(JSON.stringify({ type: 'pong', id: agentId, ts: Date.now() }));
				break;

			// Add further cases here: “command”, “config”, …
			default:
				break;
		}
	});

	socket.on('close', code => {
		console.error(`Socket closed (${code}). Will exit so supervisor can restart.`);
		process.exit(1);
	});

	socket.on('error', err => console.error('WebSocket error:', err));
})();
