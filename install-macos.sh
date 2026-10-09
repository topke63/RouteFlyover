#!/bin/bash
# Route Flyover installer for macOS (Apple Silicon and Intel, macOS 13 or newer).
#
# Automates docs/INSTALL-MAC.md:
#   1. installs Homebrew, then Node.js and ffmpeg with it; steps that are already done are
#      skipped,
#   2. gets Route Flyover (uses the folder this script is in, or clones it with Git, or
#      downloads the archive when Git isn't available),
#   3. runs npm install (skipped when node_modules is up to date),
#   4. creates "Start Route Flyover.command", a launcher you can double-click in Finder,
#   5. starts Route Flyover and opens it in the browser.
#
# It is safe to run again: finished steps are skipped. On a Git checkout a rerun also updates
# Route Flyover to the newest version. Run it as your normal user, not with sudo; Homebrew asks
# for your password when it needs it.
#
# Without downloading anything first:
#   curl -fsSL https://raw.githubusercontent.com/topke63/RouteFlyover/main/install-macos.sh | bash
# With options:
#   curl -fsSL https://raw.githubusercontent.com/topke63/RouteFlyover/main/install-macos.sh | bash -s -- --no-launch
# From a downloaded copy:
#   bash install-macos.sh [options]
#
# Options:
#   --dir DIR       where to put Route Flyover when the script isn't run from inside a
#                   Route Flyover folder (default: ~/RouteFlyover)
#   --skip-ffmpeg   don't install ffmpeg (videos are then saved as WebM, or converted to MP4
#                   by Chrome itself)
#   --no-launch     install only; don't start Route Flyover at the end
#   --help          show this help
#
# Written for the bash 3.2 that comes with macOS.

# Everything runs inside main(), called on the last line, so "curl ... | bash" only starts
# once the whole script has been downloaded.

REPO_URL='https://github.com/topke63/RouteFlyover.git'
TARBALL_URL='https://github.com/topke63/RouteFlyover/archive/refs/heads/main.tar.gz'
GUIDE='https://github.com/topke63/RouteFlyover/blob/main/docs/INSTALL-MAC.md'
BREW_INSTALL_URL='https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh'
LAUNCHER_NAME='Start Route Flyover.command'

if [ -t 1 ]; then
    C_STEP=$'\033[1;36m' C_OK=$'\033[32m' C_WARN=$'\033[33m' C_ERR=$'\033[1;31m' C_BOLD=$'\033[1m' C_OFF=$'\033[0m'
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

# True when there is a terminal to ask questions on, also under "curl | bash".
have_tty() { { : </dev/tty; } 2>/dev/null; }

usage() {
    cat <<'EOF'
Usage: bash install-macos.sh [options]
   or: curl -fsSL https://raw.githubusercontent.com/topke63/RouteFlyover/main/install-macos.sh | bash -s -- [options]

  --dir DIR       where to put Route Flyover (default: ~/RouteFlyover)
  --skip-ffmpeg   don't install ffmpeg (videos are saved as WebM)
  --no-launch     install only; don't start Route Flyover at the end
  --help          show this help
EOF
}

# --- Homebrew -------------------------------------------------------------------
find_brew() {
    local candidate
    for candidate in /opt/homebrew/bin/brew /usr/local/bin/brew; do
        if [ -x "$candidate" ]; then BREW=$candidate; return 0; fi
    done
    return 1
}

install_brew() {
    note 'Installing Homebrew. It asks for your password (nothing appears while you type it)'
    note 'and may install Apple'"'"'s Command Line Tools first, which takes a few minutes.'
    have_tty || die "Homebrew's installer needs a terminal to ask for your password. Open Terminal and run this script there."
    /bin/bash -c "$(curl -fsSL "$BREW_INSTALL_URL")" </dev/tty ||
        die 'Installing Homebrew failed. Check your internet connection and try again.'
}

# Adds Homebrew to new Terminal windows, as Homebrew's installer tells you to do by hand.
add_brew_to_profile() {
    local profile
    case $(basename "${SHELL:-/bin/zsh}") in
        bash) profile="$HOME/.bash_profile" ;;
        *)    profile="$HOME/.zprofile" ;;
    esac
    if grep -qsF "$BREW shellenv" "$profile"; then
        return
    fi
    printf '\neval "$(%s shellenv)"\n' "$BREW" >>"$profile" ||
        { warn "Couldn't write to $profile; new Terminal windows may not find brew, node and ffmpeg."; return; }
    ok "Added Homebrew to $profile, so new Terminal windows find it"
}

# --- Node.js --------------------------------------------------------------------
node_version() { have node && node --version 2>/dev/null | sed 's/^v//'; }

# Same range as "engines" in package.json: ^20.19.0 || >=22.12.0
node_ok() {
    local major minor
    [ -n "$1" ] || return 1
    major=${1%%.*}
    minor=${1#*.}; minor=${minor%%.*}
    [ "$major" -gt 22 ] || { [ "$major" -eq 22 ] && [ "$minor" -ge 12 ]; } ||
        { [ "$major" -eq 20 ] && [ "$minor" -ge 19 ]; }
}

# --- ffmpeg ---------------------------------------------------------------------
has_libx264() { have ffmpeg && ffmpeg -hide_banner -encoders 2>/dev/null | grep -q libx264; }

# --- Route Flyover --------------------------------------------------------------
is_rf_dir() {
    [ -n "$1" ] && [ -f "$1/package.json" ] &&
        grep -q '"name"[[:space:]]*:[[:space:]]*"route-flyover"' "$1/package.json"
}

# On a Mac without the Command Line Tools, /usr/bin/git is only a stub that pops up an
# installation dialog, so check for the tools rather than for git.
have_git() { have git && xcode-select -p >/dev/null 2>&1; }

download_tarball() {
    local dir=$1 tmp
    tmp=$(mktemp -d) || die "Couldn't create a temporary folder."
    if ! curl -fsSL "$TARBALL_URL" | tar -xz -C "$tmp"; then
        rm -rf "$tmp"
        die 'Downloading Route Flyover failed. Check your internet connection and try again.'
    fi
    mkdir -p "$(dirname "$dir")" && mv "$tmp/RouteFlyover-main" "$dir"
    local status=$?
    rm -rf "$tmp"
    [ $status -eq 0 ] || die "Couldn't move Route Flyover to $dir."
}

write_launcher() {
    local launcher="$1/$LAUNCHER_NAME"
    if [ -f "$launcher" ]; then
        ok "Already there: $launcher"
        return
    fi
    cat >"$launcher" <<'EOF'
#!/bin/zsh
# Starts Route Flyover and opens it in the browser. Created by install-macos.sh.
# Makes Homebrew's programs available when started from Finder
[ -x /opt/homebrew/bin/brew ] && eval "$(/opt/homebrew/bin/brew shellenv)"
[ -x /usr/local/bin/brew ] && eval "$(/usr/local/bin/brew shellenv)"
cd "$(dirname "$0")" || exit 1
echo 'Route Flyover is starting; your browser opens http://localhost:5173 in a few seconds.'
echo 'Keep this window open while you use the app; press Ctrl+C to stop it.'
npm run dev -- --open
status=$?
if [ $status -ne 0 ] && [ $status -ne 130 ]; then
    read -r '?Route Flyover stopped with an error. Press Return to close this window.'
fi
EOF
    chmod +x "$launcher" || die "Couldn't make $launcher executable."
    ok "Created $launcher"
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

    printf '%sRoute Flyover installer for macOS%s\n' "$C_BOLD" "$C_OFF"

    [ "$(uname -s)" = Darwin ] || die 'This installer is for macOS. On Linux use install-linux.sh, on Windows install-windows.ps1.'
    [ "$(id -u)" -ne 0 ] || die "Don't run this installer as root or with sudo. Run it as your normal user; Homebrew asks for your password when it needs it."

    step 'Checking your system'
    ok "macOS $(sw_vers -productVersion) on $(uname -m)"

    # --- Homebrew -----------------------------------------------------------------
    step 'Homebrew'
    BREW=''
    if find_brew; then
        ok "Homebrew is already installed ($BREW)"
    else
        install_brew
        find_brew || die "Homebrew was installed but brew wasn't found in /opt/homebrew or /usr/local. Open a new Terminal window and run this script again."
        ok "Homebrew installed ($BREW)"
    fi
    eval "$("$BREW" shellenv)"
    add_brew_to_profile

    # --- Node.js ------------------------------------------------------------------
    step 'Node.js (22.12 or newer, or 20.19 or newer)'
    local nv
    nv=$(node_version)
    if node_ok "$nv"; then
        ok "Node.js $nv is already installed"
    else
        if [ -n "$nv" ]; then
            note "Node.js $nv is too old (22.0 to 22.11 don't work). Installing a current version..."
        else
            note 'Installing Node.js...'
        fi
        if "$BREW" list --formula node >/dev/null 2>&1; then
            "$BREW" upgrade node </dev/null || die 'brew upgrade node failed.'
        else
            "$BREW" install node </dev/null || die 'brew install node failed.'
        fi
        hash -r
        nv=$(node_version)
        node_ok "$nv" ||
            die "Node.js ${nv:-was not found} after installing ($(command -v node || echo 'not on PATH')). An older Node.js from nodejs.org may come first on your PATH; uninstall it, open a new Terminal window and run this script again."
        ok "Node.js $nv installed"
    fi
    have npm || die "npm isn't installed. Run 'brew reinstall node' and this script again."

    # --- ffmpeg -------------------------------------------------------------------
    step 'ffmpeg (for MP4 videos)'
    if [ -n "$skip_ffmpeg" ]; then
        note 'Skipped (--skip-ffmpeg). Videos are saved as WebM, or converted to MP4 by Chrome.'
    elif has_libx264; then
        ok 'ffmpeg is already installed'
    else
        note 'Installing ffmpeg (a few minutes the first time)...'
        "$BREW" install ffmpeg </dev/null
        hash -r
        if has_libx264; then
            ok 'ffmpeg installed'
        else
            warn "ffmpeg didn't install. Route Flyover still works (videos are saved as WebM, or converted by Chrome); you can run 'brew install ffmpeg' later."
        fi
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
        if have_git; then
            note "Downloading with Git to $install_dir..."
            git clone "$REPO_URL" "$install_dir" </dev/null ||
                die 'git clone failed. Check your internet connection and try again.'
        else
            note "Git isn't available, downloading the archive to $install_dir..."
            download_tarball "$install_dir"
        fi
        app_dir=$install_dir
        ok "Downloaded to $app_dir"
    fi
    cd "$app_dir" || die "Couldn't open $app_dir."

    if [ -d "$app_dir/.git" ] && have_git; then
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
            die "npm install failed. Common causes: no internet connection, a company proxy, or files owned by root from an earlier 'sudo npm' (fix: sudo chown -R \"\$USER\" \"$app_dir\" ~/.npm)."
        ok 'Components installed'
    fi

    # --- Launcher -----------------------------------------------------------------
    step 'Creating the launcher'
    write_launcher "$app_dir"

    # --- Done -----------------------------------------------------------------------
    printf '\n%sRoute Flyover is installed.%s\n' "$C_OK" "$C_OFF"
    note "Folder:   $app_dir"
    note "Start it: double-click \"$LAUNCHER_NAME\" in that folder (drag it to the Dock to keep it handy)"
    note "Demo:     drag all files from $app_dir/samples onto the app page."

    [ -z "$no_launch" ] || exit 0

    step 'Starting Route Flyover'
    note 'Your browser opens http://localhost:5173 in a few seconds.'
    note 'Keep this Terminal window open while you use the app; press Ctrl+C to stop it.'
    # Give the dev server the keyboard, also when this script came through "curl | bash".
    if [ ! -t 0 ] && have_tty; then
        exec npm run dev -- --open </dev/tty
    fi
    exec npm run dev -- --open
}

main "$@"
