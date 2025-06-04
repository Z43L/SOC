#!/bin/bash
#
# SOC Agent Installation Script
# Usage: curl -s https://downloads.soccloud.com/install.sh | sudo bash -s -- --org ORG_KEY --token TOKEN
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
DOWNLOAD_URL="https://downloads.soccloud.com"
ORG_KEY=""
TOKEN=""
FORCE=""
SKIP_SERVICE=""

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to detect Linux distribution
detect_distro() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        DISTRO=$ID
        VERSION=$VERSION_ID
    elif [ -f /etc/redhat-release ]; then
        DISTRO="rhel"
    elif [ -f /etc/debian_version ]; then
        DISTRO="debian"
    else
        DISTRO="unknown"
    fi
    
    print_status "Detected distribution: $DISTRO"
}

# Function to detect architecture
detect_arch() {
    ARCH=$(uname -m)
    case $ARCH in
        x86_64)
            ARCH="amd64"
            ;;
        aarch64)
            ARCH="arm64"
            ;;
        armv7l)
            ARCH="arm"
            ;;
        *)
            print_error "Unsupported architecture: $ARCH"
            exit 1
            ;;
    esac
    
    print_status "Detected architecture: $ARCH"
}

# Function to install on Debian/Ubuntu
install_debian() {
    print_status "Installing SOC Agent on Debian/Ubuntu..."
    
    # Download and install package
    PACKAGE_URL="$DOWNLOAD_URL/packages/soc-agent_latest_${ARCH}.deb"
    TEMP_DEB="/tmp/soc-agent.deb"
    
    print_status "Downloading package from $PACKAGE_URL"
    curl -L -o "$TEMP_DEB" "$PACKAGE_URL"
    
    print_status "Installing package..."
    dpkg -i "$TEMP_DEB" || {
        print_status "Fixing dependencies..."
        apt-get update
        apt-get install -f -y
    }
    
    rm -f "$TEMP_DEB"
}

# Function to install on CentOS/RHEL/Fedora
install_redhat() {
    print_status "Installing SOC Agent on Red Hat-based distribution..."
    
    # Download and install package
    PACKAGE_URL="$DOWNLOAD_URL/packages/soc-agent-latest.${ARCH}.rpm"
    TEMP_RPM="/tmp/soc-agent.rpm"
    
    print_status "Downloading package from $PACKAGE_URL"
    curl -L -o "$TEMP_RPM" "$PACKAGE_URL"
    
    print_status "Installing package..."
    if command -v dnf >/dev/null 2>&1; then
        dnf install -y "$TEMP_RPM"
    elif command -v yum >/dev/null 2>&1; then
        yum install -y "$TEMP_RPM"
    else
        rpm -i "$TEMP_RPM"
    fi
    
    rm -f "$TEMP_RPM"
}

# Function to configure the agent
configure_agent() {
    print_status "Configuring SOC Agent..."
    
    if [ ! -f /etc/soc-agent/agent.yaml ]; then
        print_error "Configuration file not found"
        exit 1
    fi
    
    # Set organization key and server URL
    if [ -n "$ORG_KEY" ]; then
        print_status "Setting organization key..."
        sed -i "s/organizationKey: \"\"/organizationKey: \"$ORG_KEY\"/" /etc/soc-agent/agent.yaml
    fi
    
    if [ -n "$TOKEN" ]; then
        print_status "Setting registration token..."
        # For now, we use the token as organizationKey, but in the future
        # this could be separated for registration vs authentication
        sed -i "s/organizationKey: \"\"/organizationKey: \"$TOKEN\"/" /etc/soc-agent/agent.yaml
    fi
    
    # Set server URL if provided
    if [ -n "$SERVER_URL" ]; then
        print_status "Setting server URL to $SERVER_URL"
        sed -i "s|serverUrl: \".*\"|serverUrl: \"$SERVER_URL\"|" /etc/soc-agent/agent.yaml
    fi
}

# Function to start the service
start_service() {
    if [ "$SKIP_SERVICE" = "1" ]; then
        print_warning "Skipping service start (--skip-service specified)"
        return
    fi
    
    print_status "Starting SOC Agent service..."
    systemctl daemon-reload
    systemctl enable soc-agent
    systemctl start soc-agent
    
    # Check if service started successfully
    if systemctl is-active --quiet soc-agent; then
        print_status "SOC Agent started successfully!"
        print_status "Service status:"
        systemctl status soc-agent --no-pager --lines=5
    else
        print_error "Failed to start SOC Agent service"
        print_error "Check logs with: journalctl -u soc-agent"
        exit 1
    fi
}

# Function to show usage
show_usage() {
    cat << EOF
SOC Agent Installation Script

Usage: $0 [OPTIONS]

OPTIONS:
    --org ORG_KEY         Organization key for agent registration
    --token TOKEN         Registration token (alternative to org key)
    --server-url URL      SOC server URL (default: https://soc.example.com)
    --download-url URL    Base URL for package downloads
    --force               Force reinstallation even if already installed
    --skip-service        Don't start the service after installation
    --help                Show this help message

Examples:
    # Install with organization key
    curl -s https://downloads.soccloud.com/install.sh | sudo bash -s -- --org "your-org-key"
    
    # Install with custom server
    curl -s https://downloads.soccloud.com/install.sh | sudo bash -s -- --org "your-org-key" --server-url "https://your-soc-server.com"

EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --org)
            ORG_KEY="$2"
            shift 2
            ;;
        --token)
            TOKEN="$2"
            shift 2
            ;;
        --server-url)
            SERVER_URL="$2"
            shift 2
            ;;
        --download-url)
            DOWNLOAD_URL="$2"
            shift 2
            ;;
        --force)
            FORCE="1"
            shift
            ;;
        --skip-service)
            SKIP_SERVICE="1"
            shift
            ;;
        --help)
            show_usage
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Main installation flow
main() {
    print_status "SOC Agent Installation Script"
    print_status "============================="
    
    # Check if running as root
    if [ "$EUID" -ne 0 ]; then
        print_error "This script must be run as root"
        exit 1
    fi
    
    # Check if agent is already installed (unless forced)
    if [ "$FORCE" != "1" ] && [ -f /opt/soc-agent/soc-agent ]; then
        print_warning "SOC Agent is already installed. Use --force to reinstall."
        exit 0
    fi
    
    # Validate required parameters
    if [ -z "$ORG_KEY" ] && [ -z "$TOKEN" ]; then
        print_error "Either --org or --token must be specified"
        show_usage
        exit 1
    fi
    
    # Detect system
    detect_distro
    detect_arch
    
    # Install based on distribution
    case $DISTRO in
        ubuntu|debian)
            install_debian
            ;;
        centos|rhel|fedora|rocky|almalinux)
            install_redhat
            ;;
        *)
            print_error "Unsupported distribution: $DISTRO"
            exit 1
            ;;
    esac
    
    # Configure the agent
    configure_agent
    
    # Start the service
    start_service
    
    print_status "Installation completed successfully!"
    print_status ""
    print_status "Configuration file: /etc/soc-agent/agent.yaml"
    print_status "Log file: /var/log/soc-agent.log"
    print_status ""
    print_status "Useful commands:"
    print_status "  Check status: sudo systemctl status soc-agent"
    print_status "  View logs:    sudo journalctl -u soc-agent -f"
    print_status "  Restart:      sudo systemctl restart soc-agent"
}

# Run main function
main "$@"