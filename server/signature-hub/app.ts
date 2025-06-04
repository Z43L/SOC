import express from 'express';
import type { Request, Response } from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import axios from 'axios';
import simpleGit from 'simple-git';
import crypto from 'crypto';
import cors from 'cors';
import cron from 'node-cron';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const FEED_DIR = path.resolve(__dirname, 'feeds');

app.use(cors());
app.use(express.json());

// Compute SHA-256 for a file
function fileHash(filePath: string): Promise<string> {
  return new Promise((res, rej) => {
    const hash = crypto.createHash('sha256');
    const rs = fs.createReadStream(filePath);
    rs.on('data', (d: Buffer) => hash.update(d));
    rs.on('end', () => res(hash.digest('hex')));
    rs.on('error', rej);
  });
}

// ETag endpoint
app.get('/feeds/etag', async (req: Request, res: Response) => {
  // For simplicity, use git HEAD as version
  const git = simpleGit(FEED_DIR);
  const rev = await git.revparse(['HEAD']);
  res.json({ etag: rev.trim() });
});

// Download feed
app.get('/feeds/:name', async (req: Request, res: Response) => {
  const name = req.params.name;
  const filePath = path.join(FEED_DIR, name);
  try {
    const hash = await fileHash(filePath);
    res.set('ETag', hash);
    res.sendFile(filePath);
  } catch (err) {
    res.status(404).json({ message: 'Feed not found' });
  }
});

// Ensure feed directory exists
async function ensureFeedDir(): Promise<void> {
  try {
    await fsPromises.mkdir(FEED_DIR, { recursive: true });
  } catch (err) {
    console.error('Error creating feed directory:', err);
  }
}

// Download remote file to local path
async function download(url: string, dest: string): Promise<void> {
  const resp = await axios.get<ArrayBuffer>(url, { responseType: 'arraybuffer' });
  await fsPromises.writeFile(dest, Buffer.from(resp.data));
  console.log(`Downloaded ${url} -> ${dest}`);
}

// Update feeds: ClamAV, YARA rules
async function updateFeeds() {
  await ensureFeedDir();
  try {
    // ClamAV feeds
    const clamUrls = [
      'https://database.clamav.net/main.cvd',
      'https://database.clamav.net/daily.cvd'
    ];
    for (const url of clamUrls) {
      const name = url.split('/').pop()!;
      const dest = path.join(FEED_DIR, name);
      await download(url, dest);
    }

    // YARA rules from git repo
    const yaraDir = path.join(FEED_DIR, 'yara-rules');
    if (!fs.existsSync(yaraDir)) {
      console.log('Cloning YARA rules repo...');
      await simpleGit().clone('https://github.com/your-org/yara-rules.git', yaraDir);
    } else {
      console.log('Updating YARA rules repo...');
      await simpleGit(yaraDir).pull();
    }

    console.log('Feeds updated');
  } catch (err) {
    console.error('Error updating feeds:', err);
  }
}

// Schedule daily update at midnight UTC
cron.schedule('0 0 * * *', () => {
  console.log('Starting scheduled feed update');
  updateFeeds();
});

// Initial feed update on startup
updateFeeds();

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Signature Hub running on ${port}`));
