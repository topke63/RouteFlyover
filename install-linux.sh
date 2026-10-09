#!/usr/bin/env bash
# Route Flyover installer for Linux (Debian/Ubuntu and derivatives, Fedora, Arch and derivatives).
#
# Automates docs/INSTALL-LINUX.md:
#   1. installs Node.js (nvm on Debian/Ubuntu, the distribution package on Fedora and Arch),
#      ffmpeg (from RPM Fusion on Fedora) and Git; steps that are already done are skipped,
#   2. gets Route Flyover (uses the folder this script is in, or clones it with Git, or
#      downloads the archive when Git isn't available),
#   3. runs npm install (skipped when node_modules is up to date),
#   4. creates start-route-flyover.sh and a "Route Flyover" entry in the app menu,
#   5. starts Route Flyover and opens it in the browser.
#
# It is safe to run again: finished steps are skipped. On a Git checkout a rerun also updates
# Route Flyover to the newest version. Run it as your normal user, not with sudo; it asks for
# your password when it installs system packages.
#
# Without downloading anything first:
#   curl -fsSL https://raw.githubusercontent.com/topke63/RouteFlyover/main/install-linux.sh | bash
# With options:
#   curl -fsSL https://raw.githubusercontent.com/topke63/RouteFlyover/main/install-linux.sh | bash -s -- --no-launch
# From a downloaded copy:
#   bash install-linux.sh [options]
#
# Options:
#   --dir DIR       where to put Route Flyover when the script isn't run from inside a
#                   Route Flyover folder (default: ~/RouteFlyover)
#   --skip-ffmpeg   don't install ffmpeg (videos are then saved as WebM, or converted to MP4
#                   by Chrome/Chromium itself)
#   --no-launch     install only; don't start Route Flyover at the end
#   --help          show this help

# shellcheck disable=SC1091  # /etc/os-release and nvm.sh only exist at run time

# Everything runs inside main(), called on the last line, so "curl ... | bash" only starts
# once the whole script has been downloaded.

REPO_URL='https://github.com/topke63/RouteFlyover.git'
TARBALL_URL='https://github.com/topke63/RouteFlyover/archive/refs/heads/main.tar.gz'
GUIDE='https://github.com/topke63/RouteFlyover/blob/main/docs/INSTALL-LINUX.md'
NVM_INSTALL_URL='https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh'

if [ -t 1 ]; then
    C_STEP=$'\e[1;36m' C_OK=$'\e[32m' C_WARN=$'\e[33m' C_ERR=$'\e[1;31m' C_BOLD=$'\e[1m' C_OFF=$'\e[0m'
else
    C_STEP='' C_OK='' C_WARN='' C_ERR='' C_BOLD='' C_OFF=''
fi

step() { printf '\n%s==> %s%s\n' "$C_STEP" "$1" "$C_OFF"; }
ok()   { printf '    %sOK:%s %s\n' "$C_OK" "$C_OFF" "$1"; }
note() { printf '    %s\n' "$1"; }
warn() { printf '    %sWARNING:%s %s\n' "$C_WARN" "$C_OFF" "$1"; }
die() {
    printf '\n%sERROR:%s %s\n' "$C_ERR" "$C_OFF" "$1" >&2
    printf 'See the step-by-step guide: %s\n' "$GUIDE" >&2
    exit 1
}

have() { command -v "$1" >/dev/null 2>&1; }

usage() {
    cat <<'EOF'
Usage: bash install-linux.sh [options]
   or: curl -fsSL https://raw.githubusercontent.com/topke63/RouteFlyover/main/install-linux.sh | bash -s -- [options]

  --dir DIR       where to put Route Flyover (default: ~/RouteFlyover)
  --skip-ffmpeg   don't install ffmpeg (videos are saved as WebM)
  --no-launch     install only; don't start Route Flyover at the end
  --help          show this help
EOF
}

# Downloads $1 to stdout.
fetch() {
    if have curl; then curl -fsSL "$1"
    elif have wget; then wget -qO- "$1"
    else return 1
    fi
}

# --- Distribution and package manager -----------------------------------------
# Sets DISTRO to debian, fedora, arch or other.
detect_distro() {
    local id='' like=''
    if [ -r /etc/os-release ]; then
        id=$(. /etc/os-release && printf '%s' "${ID:-}")
        like=$(. /etc/os-release && printf '%s' "${ID_LIKE:-}")
    fi
    DISTRO=other
    case " $id $like " in
        *' arch '*)                          have pacman  && DISTRO=arch ;;
        *' debian '* | *' ubuntu '*)         have apt-get && DISTRO=debian ;;
    esac
    # Only Fedora itself: RPM Fusion's Fedora packages don't fit RHEL, CentOS & co.
    [ "$id" = fedora ] && have dnf && DISTRO=fedora
    DISTRO_NAME=$(. /etc/os-release 2>/dev/null && printf '%s' "${PRETTY_NAME:-}")
    DISTRO_NAME=${DISTRO_NAME:-$(uname -s)}
}

as_root() {
    if [ "$(id -u)" -eq 0 ]; then "$@"
    else sudo "$@"
    fi
}

SUDO_NOTED=
APT_UPDATED=
# Installs distribution packages; returns non-zero on failure.
pkg_install() {
    if [ -z "$SUDO_NOTED" ] && [ "$(id -u)" -ne 0 ]; then
        have sudo || die "sudo isn't available, so packages can't be installed. Install $* as root and run this script again."
        note 'Installing system packages: enter your own password if asked (nothing is shown while you type).'
        SUDO_NOTED=1
    fi
    case $DISTRO in
        debian)
            if [ -z "$APT_UPDATED" ]; then
                as_root apt-get update </dev/null || return 1
                APT_UPDATED=1
            fi
            as_root env DEBIAN_FRONTEND=noninteractive apt-get install -y "$@" </dev/null ;;
        fedora) as_root dnf install -y "$@" </dev/null ;;
        arch)   as_root pacman -S --needed --noconfirm "$@" </dev/null ;;
        *)      return 1 ;;
    esac
}

# --- Node.js ------------------------------------------------------------------
# Route Flyover needs Node.js ^20.19.0 || >=22.12.0 (package.json "engines").
node_version() { have node && node -p 'process.versions.node' 2>/dev/null; }

node_ok() {
    local major minor
    IFS=. read -r major minor _ <<<"$1"
    [[ $major =~ ^[0-9]+$ && $minor =~ ^[0-9]+$ ]] || return 1
    { [ "$major" -eq 20 ] && [ "$minor" -ge 19 ]; } ||
        { [ "$major" -eq 22 ] && [ "$minor" -ge 12 ]; } ||
        [ "$major" -ge 23 ]
}

load_nvm() {
    export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
    # shellcheck source=/dev/null
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1
    return 0
}

install_node_nvm() {
    export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
    if [ ! -s "$NVM_DIR/nvm.sh" ]; then
        note 'Installing nvm (installs Node.js into your home folder, no sudo needed)...'
        have curl || have wget || pkg_install curl ca-certificates ||
            die "Neither curl nor wget is installed. Install curl and run this script again."
        local nvm_script
        nvm_script=$(fetch "$NVM_INSTALL_URL")
        if [ -z "$nvm_script" ] || ! bash -c "$nvm_script" </dev/null; then
            die 'Installing nvm failed. Check your internet connection and try again.'
        fi
    fi
    load_nvm
    have nvm || die "nvm was installed but can't be loaded from $NVM_DIR/nvm.sh."
    note 'Installing the current Node.js LTS with nvm...'
    nvm install --lts </dev/null || die 'nvm install --lts failed. Check your internet connection and try again.'
    # New terminals and the app-menu launcher use nvm's default version.
    nvm alias default 'lts/*' >/dev/null
    nvm use default >/dev/null
    hash -r
}

# --- ffmpeg ---------------------------------------------------------------------
has_libx264() { have ffmpeg && ffmpeg -hide_banner -encoders 2>/dev/null | grep -q libx264; }

install_ffmpeg_fedora() {
    if ! rpm -q rpmfusion-free-release >/dev/null 2>&1; then
        note 'Enabling RPM Fusion (Fedora'"'"'s own ffmpeg-free has no libx264)...'
        pkg_install "https://mirrors.rpmfusion.org/free/fedora/rpmfusion-free-release-$(rpm -E %fedora).noarch.rpm" ||
            return 1
    fi
    if rpm -q ffmpeg-free >/dev/null 2>&1; then
        note 'Swapping ffmpeg-free for the full ffmpeg from RPM Fusion...'
        as_root dnf swap -y ffmpeg-free ffmpeg --allowerasing </dev/null
    else
        note 'Installing ffmpeg from RPM Fusion...'
        pkg_install ffmpeg
    fi
}

# --- Route Flyover --------------------------------------------------------------
is_rf_dir() {
    [ -n "$1" ] && [ -f "$1/package.json" ] &&
        grep -q '"name"[[:space:]]*:[[:space:]]*"route-flyover"' "$1/package.json"
}

download_tarball() {
    local dir=$1 tmp
    tmp=$(mktemp -d) || die "Couldn't create a temporary folder."
    if ! fetch "$TARBALL_URL" | tar -xz -C "$tmp"; then
        rm -rf "$tmp"
        die 'Downloading Route Flyover failed. Check your internet connection and try again.'
    fi
    mkdir -p "$(dirname "$dir")" && mv "$tmp/RouteFlyover-main" "$dir"
    local status=$?
    rm -rf "$tmp"
    [ $status -eq 0 ] || die "Couldn't move Route Flyover to $dir."
}

write_launcher() {
    local app_dir=$1 launcher="$1/start-route-flyover.sh"
    local desktop_dir="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
    local desktop="$desktop_dir/route-flyover.desktop"

    if [ -f "$launcher" ]; then
        ok "Already there: $launcher"
    else
        cat >"$launcher" <<'EOF'
#!/usr/bin/env bash
# Starts Route Flyover and opens it in the browser. Created by install-linux.sh.
# Makes Node.js installed with nvm available outside an interactive terminal
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
cd "$(dirname "$(readlink -f "$0")")" || exit 1
echo 'Route Flyover is starting; your browser opens http://localhost:5173 in a few seconds.'
echo 'Keep this window open while you use the app; press Ctrl+C to stop it.'
npm run dev -- --open
status=$?
if [ $status -ne 0 ] && [ $status -ne 130 ]; then
    read -r -p 'Route Flyover stopped with an error. Press Enter to close this window.' _
fi
EOF
        chmod +x "$launcher" || die "Couldn't make $launcher executable."
        ok "Created $launcher"
    fi

    # Rewritten every time so it follows the folder if Route Flyover was moved.
    mkdir -p "$desktop_dir" || { warn "Couldn't create $desktop_dir; no app-menu entry."; return; }
    # Exec= quoting from the desktop entry spec; spaces in the path are fine inside the quotes
    local quoted=${launcher//\"/\\\"}
    quoted=${quoted//\`/\\\`}
    quoted=${quoted//\$/\\\$}
    quoted=${quoted//%/%%}
    cat >"$desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Route Flyover
Comment=Turn a GPX track, photos and music into a 3D fly-over video
Exec="$quoted"
Path=$app_dir
Icon=$app_dir/public/logo.svg
Terminal=true
Categories=AudioVideo;Video;
EOF
    have update-desktop-database && update-desktop-database "$desktop_dir" >/dev/null 2>&1
    ok "App-menu entry: search for \"Route Flyover\" in your app menu ($desktop)"
}

main() {
    local install_dir="$HOME/RouteFlyover" skip_ffmpeg='' no_launch=''
    while [ $# -gt 0 ]; do
        case $1 in
            --dir) [ -n "${2:-}" ] || die '--dir needs a folder, e.g. --dir ~/Apps/RouteFlyover'
                   install_dir=$2; shift ;;
            --dir=*) install_dir=${1#--dir=} ;;
            --skip-ffmpeg) skip_ffmpeg=1 ;;
            --no-launch) no_launch=1 ;;
            -h | --help) usage; exit 0 ;;
            *) die "Unknown option: $1 (options: --dir DIR, --skip-ffmpeg, --no-launch)" ;;
        esac
        shift
    done
    # shellcheck disable=SC2088  # a literal ~ the shell didn't expand (e.g. --dir=~/x)
    case $install_dir in
        '~') install_dir=$HOME ;;
        '~/'*) install_dir="$HOME/${install_dir#'~/'}" ;;
    esac
    case $install_dir in /*) ;; *) install_dir="$PWD/$install_dir" ;; esac

    printf '%sRoute Flyover installer for Linux%s\n' "$C_BOLD" "$C_OFF"

    [ "$(id -u)" -ne 0 ] || die "Don't run this installer as root or with sudo. Run it as your normal user; it asks for your password when it needs to install system packages."

    detect_distro
    step "Checking your system"
    case $DISTRO in
        other) note "$DISTRO_NAME: packages aren't installed automatically on this distribution; Node.js comes from nvm if needed." ;;
        *) ok "$DISTRO_NAME" ;;
    esac

    # --- Node.js ----------------------------------------------------------------
    step 'Node.js (22.12 or newer, or 20.19 or newer)'
    load_nvm
    local nv
    nv=$(node_version)
    if node_ok "$nv"; then
        ok "Node.js $nv is already installed"
    else
        if [ -n "$nv" ]; then
            note "Node.js $nv is too old (22.0 to 22.11 don't work). Installing a current version..."
        fi
        case $DISTRO in
            arch)   note 'Installing Node.js and npm...'; pkg_install nodejs npm || die 'Installing Node.js with pacman failed.' ;;
            fedora) note 'Installing Node.js and npm...'; pkg_install nodejs npm || die 'Installing Node.js with dnf failed.' ;;
        esac
        hash -r
        nv=$(node_version)
        # Debian/Ubuntu ship Node.js 18; anywhere the distribution's version is too old, use nvm.
        node_ok "$nv" || install_node_nvm
        nv=$(node_version)
        node_ok "$nv" || die "Node.js ${nv:-was not found} after installing. Open a new terminal and run this script again."
        ok "Node.js $nv installed"
    fi
    have npm || die "npm isn't installed. Install it (it usually comes with Node.js) and run this script again."

    # --- ffmpeg -----------------------------------------------------------------
    step 'ffmpeg (for MP4 videos)'
    if [ -n "$skip_ffmpeg" ]; then
        note 'Skipped (--skip-ffmpeg). Videos are saved as WebM, or converted to MP4 by Chrome/Chromium.'
    elif has_libx264; then
        ok 'ffmpeg is already installed'
    else
        local tried=1
        case $DISTRO in
            debian) note 'Installing ffmpeg...'; pkg_install ffmpeg ;;
            arch)   note 'Installing ffmpeg...'; pkg_install ffmpeg ;;
            fedora) install_ffmpeg_fedora ;;
            *)      tried= ;;
        esac
        hash -r
        if has_libx264; then
            ok 'ffmpeg installed'
        elif [ -z "$tried" ] && have ffmpeg; then
            warn "This ffmpeg has no libx264 encoder, so MP4 conversion will fail. Install the full ffmpeg from your package manager (openSUSE: from Packman)."
        elif [ -z "$tried" ]; then
            warn "ffmpeg isn't installed. Route Flyover works without it (videos are saved as WebM); for MP4 install ffmpeg with libx264 from your package manager and run this script again."
        else
            warn "ffmpeg didn't install. Route Flyover still works (videos are saved as WebM); you can install ffmpeg later and run this script again."
        fi
    fi
    if [ -z "$skip_ffmpeg" ] && have ffmpeg &&
        ffmpeg -hide_banner -encoders 2>/dev/null | grep -q h264_nvenc; then
        note 'NVIDIA encoder (h264_nvenc) found: MP4 conversion will use the GPU when possible.'
    fi

    # --- Route Flyover itself -----------------------------------------------------
    step 'Getting Route Flyover'
    local script_dir='' app_dir
    if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
        script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
    fi
    if is_rf_dir "$script_dir"; then
        app_dir=$script_dir
        ok "Using this folder: $app_dir"
    elif is_rf_dir "$install_dir"; then
        app_dir=$install_dir
        ok "Already downloaded: $app_dir"
    elif [ -e "$install_dir" ]; then
        die "$install_dir already exists but isn't a Route Flyover folder. Move it out of the way, or choose another folder: --dir ~/Apps/RouteFlyover"
    else
        if ! have git && [ "$DISTRO" != other ]; then
            note 'Installing Git...'
            pkg_install git || warn "Git didn't install; downloading the archive instead."
            hash -r
        fi
        if have git; then
            note "Downloading with Git to $install_dir..."
            git clone "$REPO_URL" "$install_dir" </dev/null ||
                die 'git clone failed. Check your internet connection and try again.'
        else
            note "Git isn't installed, downloading the archive to $install_dir..."
            download_tarball "$install_dir"
        fi
        app_dir=$install_dir
        ok "Downloaded to $app_dir"
    fi
    cd "$app_dir" || die "Couldn't open $app_dir."

    if [ -d "$app_dir/.git" ] && have git; then
        note 'Checking for updates...'
        git -C "$app_dir" pull --ff-only </dev/null ||
            warn 'Updating with git pull failed; continuing with the version you have.'
    fi

    # --- npm install --------------------------------------------------------------
    step "Installing Route Flyover's components (npm install)"
    local installed_lock="$app_dir/node_modules/.package-lock.json"
    if [ -f "$installed_lock" ] && [ -d "$app_dir/node_modules/vite" ] &&
        ! [ "$app_dir/package-lock.json" -nt "$installed_lock" ]; then
        ok 'Components are already installed'
    else
        note 'This takes a minute or two. Warnings (npm warn ...) are normal.'
        npm install </dev/null ||
            die "npm install failed. Common causes: no internet connection, a company proxy, or files owned by root from an earlier 'sudo npm' (fix: sudo chown -R \"\$USER\": \"$app_dir\" ~/.npm)."
        ok 'Components installed'
    fi

    # --- Launcher -----------------------------------------------------------------
    step 'Creating the launcher and app-menu entry'
    write_launcher "$app_dir"

    # --- Done -----------------------------------------------------------------------
    printf '\n%sRoute Flyover is installed.%s\n' "$C_OK" "$C_OFF"
    note "Folder:   $app_dir"
    note "Start it: open \"Route Flyover\" from your app menu, or run $app_dir/start-route-flyover.sh"
    note "Demo:     drag all files from $app_dir/samples onto the app page."

    [ -z "$no_launch" ] || exit 0

    step 'Starting Route Flyover'
    local open=(-- --open)
    if [ -z "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then
        open=()
        note 'No desktop session found; open http://localhost:5173 in your browser yourself.'
    else
        note 'Your browser opens http://localhost:5173 in a few seconds.'
    fi
    note 'Keep this terminal open while you use the app; press Ctrl+C to stop it.'
    # Give the dev server the keyboard, also when this script came through "curl | bash".
    if [ ! -t 0 ] && { : </dev/tty; } 2>/dev/null; then
        exec npm run dev "${open[@]}" </dev/tty
    fi
    exec npm run dev "${open[@]}"
}

main "$@"
