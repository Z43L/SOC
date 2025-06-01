# Build Agent System Documentation

## Overview

The Build Agent System is a comprehensive solution for compiling, packaging, and distributing SOC agent binaries with embedded configuration and digital signatures. The system provides automated builds, queued processing, and secure artifact distribution.

## Key Features

### 1. Automated Binary Compilation with pkg
- **Multi-platform support**: Linux, Windows, macOS
- **Multi-architecture support**: x64, ARM64, universal binaries
- **Self-contained executables**: No Node.js runtime required on target systems
- **Configuration embedding**: Agent configuration baked into binaries at build time

### 2. Build Queue System
- **Concurrent builds**: Support for multiple simultaneous builds
- **Job management**: Track build status, logs, and results
- **Real-time notifications**: WebSocket-based status updates
- **Auto-cleanup**: Automatic removal of old jobs and files

### 3. Secure Artifact Management
- **Temporary download URLs**: Time-limited access tokens
- **User-based access control**: Users can only access their own builds
- **Download tracking**: Monitor download counts and limits
- **Automatic cleanup**: Remove expired tokens and orphaned files

### 4. Code Signing and Integrity
- **Platform-specific signing**: Windows (signtool), macOS (codesign), Linux (GPG)
- **SHA256 checksums**: Integrity verification for all binaries
- **Certificate management**: Environment-based certificate configuration

## API Endpoints

### Build Management

#### `POST /api/agents/build`
Start a new agent build (queued by default).

**Request Body:**
```json
{
  "os": "linux|windows|macos",
  "architecture": "x64|arm64|universal",
  "customName": "my-agent",
  "capabilities": {
    "fileSystemMonitoring": true,
    "processMonitoring": true,
    "networkMonitoring": false
  },
  "useQueue": true
}
```

**Response:**
```json
{
  "success": true,
  "jobId": "uuid-here",
  "agentId": "123",
  "message": "Build job queued successfully",
  "estimatedTime": "3-5 minutes",
  "registrationKey": "key-here",
  "buildInfo": {
    "platform": "linux",
    "architecture": "x64",
    "timestamp": "2025-06-01T05:46:46.437Z",
    "queued": true
  }
}
```

#### `GET /api/agents/build/jobs`
List build jobs for the authenticated user.

#### `GET /api/agents/build/jobs/:jobId`
Get detailed status of a specific build job.

#### `POST /api/agents/build/jobs/:jobId/cancel`
Cancel a pending build job.

#### `GET /api/agents/build/stats` (Admin only)
Get build queue statistics.

### Artifact Management

#### `GET /api/artifacts/download/:token`
Download a built agent using a secure token.

#### `GET /api/artifacts/downloads`
List available download tokens for the user.

#### `DELETE /api/artifacts/downloads/:token`
Revoke a download token.

#### `GET /api/artifacts/stats` (Admin only)
Get artifact storage statistics.

## Build Process

### 1. Configuration Generation
The system generates a comprehensive configuration file that includes:
- Server connection details
- Registration keys
- Agent capabilities
- Build metadata (timestamp, platform, architecture)
- Network and security settings

### 2. Binary Compilation
Using `pkg`, the system compiles TypeScript agent code into self-contained binaries:
- Supports multiple architectures per platform
- Embeds configuration at build time
- Creates platform-specific executables

### 3. Package Creation
Creates installation packages with:
- Compiled binary
- Installation scripts (platform-specific)
- Service configuration files
- Documentation

### 4. Code Signing
Applies digital signatures based on platform:
- **Windows**: Uses `signtool` with .pfx certificates
- **macOS**: Uses `codesign` with Apple certificates
- **Linux**: Uses GPG signatures

### 5. Secure Distribution
Generates time-limited download tokens and URLs for secure access.

## Architecture Support

| Platform | x64 | ARM64 | Universal |
|----------|-----|-------|-----------|
| Windows  | ✓   | ❌    | ❌        |
| macOS    | ✓   | ✓     | ✓         |
| Linux    | ✓   | ✓     | ✓         |

**Note**: Universal builds create separate binaries for each architecture.

## Real-time Notifications

The system provides WebSocket-based notifications for build status updates:

### Events
- `buildJobAdded`: New job queued
- `buildJobStarted`: Build process started
- `buildJobCompleted`: Build finished successfully
- `buildJobFailed`: Build failed with error
- `buildJobCancelled`: Build cancelled by user

### Client Integration
```javascript
// Connect to Socket.IO
const socket = io();

// Authenticate for notifications
socket.emit('authenticate', { userId: currentUserId });

// Subscribe to build updates
socket.emit('subscribeBuildUpdates', { userId: currentUserId });

// Listen for build events
socket.on('buildJobCompleted', (data) => {
  console.log('Build completed:', data.downloadUrl);
});
```

## Security Features

### Certificate Management
Configure signing certificates through environment variables:

```bash
# Windows Code Signing
WINDOWS_CERT_PATH=/path/to/certificate.pfx
WINDOWS_CERT_PASSWORD=your_password

# macOS Code Signing
MACOS_SIGNING_IDENTITY="Developer ID Application: Your Name"

# Linux GPG Signing
LINUX_GPG_KEY=your_gpg_key_id
```

### Access Control
- **User-based isolation**: Users can only access their own builds and downloads
- **Token-based downloads**: Time-limited, revocable access tokens
- **Admin endpoints**: Statistics and management require admin role

### File Security
- **Automatic cleanup**: Old files and expired tokens are automatically removed
- **Integrity verification**: SHA256 checksums for all binaries
- **Secure storage**: Files stored in controlled directories with proper permissions

## Configuration

### Environment Variables
```bash
# Server Configuration
SERVER_URL=https://your-soc-server.com

# Build Settings
MAX_CONCURRENT_BUILDS=2
BUILD_TOKEN_VALIDITY_HOURS=24

# Signing Certificates (see Security section above)
```

### Directory Structure
```
dist/
├── public/
│   └── downloads/          # Built agent packages
└── agents/
    ├── dist/              # Compiled agent code
    └── tmp/               # Temporary build files
```

## Monitoring and Logging

### Build Logs
Each build job maintains detailed logs accessible through the API:
- Compilation progress
- Package creation steps
- Signing operations
- Error messages

### System Metrics
Admin endpoints provide statistics on:
- Build queue status
- Storage usage
- Download activity
- Error rates

## Troubleshooting

### Common Issues

1. **Build Failures**
   - Check agent source code compilation
   - Verify pkg installation and version
   - Review build logs for specific errors

2. **Signing Failures**
   - Verify certificate paths and passwords
   - Check certificate validity and permissions
   - Ensure signing tools are installed

3. **Download Issues**
   - Check token validity and expiration
   - Verify user permissions
   - Ensure file exists on disk

### Debug Mode
Enable verbose logging by setting:
```bash
NODE_ENV=development
DEBUG=agent-builder:*
```

## Future Enhancements

- **Build caching**: Cache common build artifacts
- **Distributed builds**: Support for multiple build servers
- **Enhanced metrics**: Detailed performance monitoring
- **Custom build scripts**: User-defined build steps
- **Automated testing**: Integration with test suites